// Reads the real sample documents in samples/ through the whole stack:
// upload -> Claude -> fields back. This one costs money (about 1.5 cents a
// document), so it is kept out of the free test suite.
//
//   npm run dev       (in one terminal)
//   npm run test:read (in another)
import { readFileSync } from "node:fs";
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
let failures = 0;

// What each sample really says. The read has to match this.
const CASES = [
  {
    docType: "citizenship",
    files: [
      ["citizenship_front", "samples/citizenship-front.png"],
      ["citizenship_back", "samples/citizenship-back.png"],
    ],
    expect: {
      document_number: "27-01-77-04275",
      full_name_en: "UTSARGA ADHIKARI",
      gender: "Male",
      date_of_birth_ad: "2002-11-07",
      date_of_birth_bs: "2059-07-21",
      permanent_district_en: "Kathmandu",
      permanent_ward: "6",
    },
  },
  {
    docType: "nid_card",
    files: [
      ["nid_card_front", "samples/nid-card-front.png"],
      ["nid_card_back", "samples/nid-card-back.png"],
    ],
    expect: {
      document_number: "023-456-2130",
      surname_en: "Koirala Pokhrel",
      given_name_en: "Bhagawati Kumari",
      date_of_birth_ad: "1978-02-05",
      date_of_birth_bs: "2034-10-22",
      nationality: "Nepalese",
    },
  },
];

async function signIn(email, password) {
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

  const { error } = await client.auth.signInWithPassword({ email, password });
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
    upload: (docType, path) => {
      const form = new FormData();
      form.set("doc_type", docType);
      form.set(
        "file",
        new Blob([readFileSync(path)], { type: "image/png" }),
        path.split("/").pop(),
      );
      return call("/api/profile/documents", { method: "POST", body: form });
    },
  };
}

async function makeUser(tag) {
  const email = `read-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: "supplier", full_name: `Test ${tag}` },
  });
  if (error) throw new Error(error.message);
  made.push(data.user.id);
  return { id: data.user.id, api: await signIn(email, PASSWORD) };
}

async function runCase(test) {
  console.log(`\n${test.docType}`);

  const user = await makeUser(test.docType);
  await user.api.json("/api/profile", "PATCH", { account_type: "individual" });
  await user.api.json("/api/profile", "PATCH", { id_doc_type: test.docType });

  for (const [docType, path] of test.files) {
    const { status, body } = await user.api.upload(docType, path);
    if (status !== 201) throw new Error(`upload ${docType}: ${JSON.stringify(body)}`);
  }

  const started = Date.now();
  const { status, body } = await user.api.call("/api/profile/identity", {
    method: "POST",
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (status !== 200) {
    console.log(`  FAIL  read failed (${status}): ${JSON.stringify(body)}`);
    failures++;
    return user;
  }

  console.log(`  read in ${seconds}s`);

  for (const [field, wanted] of Object.entries(test.expect)) {
    const got = body.fields[field];
    if (got === wanted) {
      console.log(`  ok    ${field} = ${got}`);
    } else {
      console.log(`  FAIL  ${field}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(wanted)}`);
      failures++;
    }
  }

  // Everything else it found, to eyeball once and then confirm the field list.
  const extra = Object.entries(body.fields)
    .filter(([field, value]) => value !== null && !(field in test.expect))
    .map(([field, value]) => `        ${field} = ${value}`);
  if (extra.length) console.log("  also read:\n" + extra.join("\n"));

  // Reading the same photos twice should be refused.
  const again = await user.api.call("/api/profile/identity", { method: "POST" });
  if (again.status === 409) {
    console.log("  ok    a second read of the same photos is refused");
  } else {
    console.log(`  FAIL  second read gave ${again.status}, wanted 409`);
    failures++;
  }

  return user;
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`No server at ${BASE}. Run "npm run dev" first.`);
    process.exit(1);
  }

  for (const test of CASES) {
    try {
      await runCase(test);
    } catch (error) {
      console.log(`  FAIL  ${error.message}`);
      failures++;
    }
  }

  console.log("\nCleaning up");
  for (const id of made) {
    const { data: files } = await admin.storage.from("verification-docs").list(id);
    if (files?.length) {
      await admin.storage
        .from("verification-docs")
        .remove(files.map((f) => `${id}/${f.name}`));
    }
    await admin.auth.admin.deleteUser(id);
  }

  console.log(failures === 0 ? "\nAll good" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
