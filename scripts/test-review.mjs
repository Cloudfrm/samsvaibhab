// The whole approval flow, for real: Send for approval -> the AI reads the
// rules and the photos -> approved, or sent back with a note.
//
// This one costs money, about 1.5 cents per check, so it is kept out of the
// free test suite.
//
//   npm run dev         (in one terminal)
//   npm run test:review (in another)
//
// The cases that need a real document are skipped when samples/ is empty.
import { existsSync, readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

const admin = createClient(URL_, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = "Test-passw0rd-!";
const made = [];
let passed = 0;
let failures = 0;

// The real citizenship in samples/, and what it says.
const SAMPLE = {
  front: "samples/citizenship-front.png",
  back: "samples/citizenship-back.png",
  name: "UTSARGA ADHIKARI",
  identity: {
    document_number: "27-01-77-04275",
    full_name_en: "UTSARGA ADHIKARI",
    full_name_np: "उत्सर्ग अधिकारी",
    gender: "Male",
    date_of_birth_bs: "2059-07-21",
    date_of_birth_ad: "2002-11-07",
    date_of_birth_ad_source: "printed",
    permanent_district_en: "Kathmandu",
    permanent_ward: "6",
    citizenship_kind_np: "वंशज",
    issue_date_bs: "2077-09-05",
  },
};

const HAS_SAMPLE = existsSync(SAMPLE.front) && existsSync(SAMPLE.back);

// One white pixel. Nobody can read a document off this.
const BLANK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function ok(name) {
  passed++;
  console.log(`  ok    ${name}`);
}

function fail(name, why) {
  failures++;
  console.log(`  FAIL  ${name}\n        ${why}`);
}

// --- talking to the server as a real signed-in user ------------------------

async function signIn(email) {
  const jar = new Map();
  const client = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) =>
        list.forEach(({ name, value }) =>
          value === "" ? jar.delete(name) : jar.set(name, value),
        ),
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`sign in failed: ${error.message}`);

  const cookie = [...jar]
    .map(([n, v]) => `${n}=${encodeURIComponent(v)}`)
    .join("; ");

  const call = async (path, init = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { cookie, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  };

  return {
    call,
    json: (path, method, payload) =>
      call(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    upload: (docType, fileOrPath) => {
      const bytes =
        typeof fileOrPath === "string" ? readFileSync(fileOrPath) : fileOrPath;
      const form = new FormData();
      form.set("doc_type", docType);
      form.set("file", new Blob([bytes], { type: "image/png" }), `${docType}.png`);
      return call("/api/profile/documents", { method: "POST", body: form });
    },
    submit: () => call("/api/profile/submit", { method: "POST" }),
  };
}

async function makeUser(tag) {
  const email = `review-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "supplier" },
  });
  if (error) throw new Error(error.message);
  made.push(data.user.id);
  return { id: data.user.id, api: await signIn(email) };
}

/** A supplier filled in right up to the point of pressing the button. */
async function readySupplier(tag, { name, bankName, photos, identity }) {
  const user = await makeUser(tag);

  await user.api.json("/api/profile", "PATCH", {
    account_type: "individual",
    full_name: name,
    phone: "9841000000",
    country: "NP",
    district: "Kathmandu",
  });
  await user.api.json("/api/profile/bank", "PUT", {
    bank_name: "Nabil Bank",
    account_name: bankName ?? name,
    account_number: "0123456789012",
  });
  await user.api.json("/api/profile", "PATCH", { id_doc_type: "citizenship" });

  await user.api.upload("citizenship_front", photos.front);
  await user.api.upload("citizenship_back", photos.back);

  // Saved by hand, so the test does not pay to read the photos as well.
  const saved = await user.api.json("/api/profile/identity", "PUT", identity);
  if (saved.status !== 200) {
    throw new Error(`saving the details failed: ${JSON.stringify(saved.body)}`);
  }

  return user;
}

/** Press the button, and say what came back. */
async function sendForApproval(user, label) {
  const started = Date.now();
  const { status, body } = await user.api.submit();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (status !== 200) {
    throw new Error(`${label}: ${status} ${JSON.stringify(body)}`);
  }

  console.log(`  ${label}: ${body.decision} in ${seconds}s`);
  console.log(`        "${body.summary.replace(/\n/g, "\n         ")}"`);
  if (body.issues?.length) {
    body.issues.forEach((i) => console.log(`        - ${i}`));
  }
  return body;
}

// ---------------------------------------------------------------------------

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`No server at ${BASE}. Run "npm run dev" first.`);
    process.exit(1);
  }

  const { data: rules } = await admin
    .from("onboarding_rules")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rules) {
    console.error("No onboarding rules in the database. Run npm run migrate.");
    process.exit(1);
  }
  console.log(`Checking against rules version ${rules.version}.`);

  // --- a company, which uploads nothing -----------------------------------
  console.log("\nA company with everything filled in");
  try {
    const company = await makeUser("company");
    await company.api.json("/api/profile", "PATCH", {
      account_type: "company",
      company_name: "Chitwan Fresh Produce Pvt. Ltd.",
      pan_vat: "600123456",
      phone: "9841000000",
      country: "NP",
      district: "Chitwan",
    });
    await company.api.json("/api/profile/bank", "PUT", {
      bank_name: "Global IME Bank",
      account_name: "Chitwan Fresh Produce Pvt. Ltd.",
      account_number: "9876543210",
    });

    const answer = await sendForApproval(company, "company");
    if (answer.decision === "approve") {
      ok("a complete company is approved, with no documents");
    } else {
      fail("a complete company is approved", `it was sent back: ${answer.summary}`);
    }
  } catch (error) {
    fail("a complete company is approved", error.message);
  }

  // --- photos nobody can read ---------------------------------------------
  console.log("\nA person whose photos cannot be read");
  try {
    const blurred = await readySupplier("blank-photos", {
      name: SAMPLE.name,
      photos: { front: BLANK, back: BLANK },
      // Its own number, so this case can only fail on the photos.
      identity: { ...SAMPLE.identity, document_number: "27-01-77-99999" },
    });

    const first = await sendForApproval(blurred, "try 1");
    if (first.decision === "send_back") {
      ok("an unreadable photo is sent back");
    } else {
      fail("an unreadable photo is sent back", "it was approved");
    }

    // The counter, and the warning when somebody is going round in circles.
    await sendForApproval(blurred, "try 2");
    const third = await sendForApproval(blurred, "try 3");

    if (third.stuck) {
      ok("after three tries the supplier counts as stuck");
    } else {
      fail("after three tries the supplier counts as stuck", "stuck was not set");
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("status, send_back_count, review_summary")
      .eq("id", blurred.id)
      .single();

    if (profile.status === "incomplete") {
      ok("a sent back account goes back to the supplier to fix");
    } else {
      fail("a sent back account goes back", `status is ${profile.status}`);
    }
    if (profile.send_back_count === 3) {
      ok("the send back is counted");
    } else {
      fail("the send back is counted", `count is ${profile.send_back_count}`);
    }
    if (profile.review_summary) {
      ok("the note is kept on the account");
    } else {
      fail("the note is kept on the account", "nothing saved");
    }

    const { data: reviews } = await admin
      .from("account_reviews")
      .select("decision, rules_version")
      .eq("profile_id", blurred.id);

    if (reviews?.length === 3) {
      ok("every decision is written down");
    } else {
      fail("every decision is written down", `${reviews?.length} rows`);
    }
    if (reviews?.every((r) => r.rules_version === rules.version)) {
      ok("each decision says which rules it used");
    } else {
      fail("each decision says which rules it used", "version missing");
    }
  } catch (error) {
    fail("unreadable photos", error.message);
  }

  if (!HAS_SAMPLE) {
    console.log(
      "\nSkipped the real document cases: samples/citizenship-front.png and" +
        "\n  samples/citizenship-back.png are not on this machine.",
    );
  } else {
    // --- the real thing, everything correct -------------------------------
    console.log("\nA person with a real citizenship, everything correct");
    try {
      const good = await readySupplier("good", {
        name: SAMPLE.name,
        photos: { front: SAMPLE.front, back: SAMPLE.back },
        identity: SAMPLE.identity,
      });

      const answer = await sendForApproval(good, "real document");
      if (answer.decision === "approve") {
        ok("a good account is approved with nobody in the loop");
      } else {
        fail("a good account is approved", `sent back: ${answer.summary}`);
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("status, send_back_count")
        .eq("id", good.id)
        .single();

      if (profile.status === "approved") {
        ok("the account is approved in the database");
      } else {
        fail("the account is approved in the database", `status ${profile.status}`);
      }

      // --- the same document on a second account --------------------------
      console.log("\nThe same citizenship used twice");
      const copycat = await readySupplier("duplicate", {
        name: SAMPLE.name,
        photos: { front: SAMPLE.front, back: SAMPLE.back },
        identity: SAMPLE.identity,
      });
      const second = await sendForApproval(copycat, "duplicate");
      if (second.decision === "send_back") {
        ok("a document already used by another account is sent back");
      } else {
        fail("a duplicate document is sent back", "it was approved");
      }
    } catch (error) {
      fail("the real document cases", error.message);
    }

    // --- the bank account is in somebody else's name ----------------------
    console.log("\nA bank account in somebody else's name");
    try {
      const mismatch = await readySupplier("name-mismatch", {
        name: SAMPLE.name,
        bankName: "Sita Kumari Thapa",
        photos: { front: SAMPLE.front, back: SAMPLE.back },
        identity: SAMPLE.identity,
      });

      const answer = await sendForApproval(mismatch, "name mismatch");
      if (answer.decision === "send_back") {
        ok("a bank account in another name is sent back");
      } else {
        fail("a bank account in another name is sent back", "it was approved");
      }
    } catch (error) {
      fail("the name mismatch case", error.message);
    }
  }

  // -------------------------------------------------------------------------
  console.log("\nCleaning up test users");
  for (const id of made) {
    const { data: files } = await admin.storage.from("verification-docs").list(id);
    if (files?.length) {
      await admin.storage
        .from("verification-docs")
        .remove(files.map((f) => `${id}/${f.name}`));
    }
    await admin.auth.admin.deleteUser(id);
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

await main();
