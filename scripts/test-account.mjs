// End-to-end test of the account endpoints against a running dev server.
//   npm run dev          (in one terminal)
//   npm run test:account (in another)
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

const admin = createClient(URL_, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

function expect(actual, wanted, what) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(wanted);
  if (a !== b) throw new Error(`${what}: got ${a}, wanted ${b}`);
}

function expectHas(list, value, what) {
  if (!list?.includes(value)) {
    throw new Error(`${what}: ${JSON.stringify(list)} should contain "${value}"`);
  }
}

// --- signing in as a real user, then talking to the server as that user -----

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
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);

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

  // Follows nothing, so we can see the redirect itself.
  const page = async (path) => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { cookie },
      redirect: "manual",
    });
    return {
      status: res.status,
      to: res.headers.get("location"),
      html: res.status < 300 ? await res.text() : "",
    };
  };

  const json = (path, method, payload) =>
    call(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  const upload = (docType, file, name, type) => {
    const form = new FormData();
    form.set("doc_type", docType);
    form.set("file", new Blob([file], { type }), name);
    return call("/api/profile/documents", { method: "POST", body: form });
  };

  return { call, json, upload, page };
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

const PASSWORD = "Test-passw0rd-!";
const stamp = Date.now();
const made = [];

async function makeUser(tag, role) {
  const email = `test-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role, full_name: `Test ${tag}` },
  });
  if (error) throw new Error(`could not make ${tag}: ${error.message}`);
  made.push(data.user.id);
  return { id: data.user.id, email, api: await signIn(email, PASSWORD) };
}

// ---------------------------------------------------------------------------

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`No server at ${BASE}. Run "npm run dev" first.`);
    process.exit(1);
  }

  console.log("\nNot logged in");
  await check("GET /api/profile is refused", async () => {
    const res = await fetch(`${BASE}/api/profile`);
    expect(res.status, 401, "status");
  });
  await check("POST /api/profile/submit is refused", async () => {
    const res = await fetch(`${BASE}/api/profile/submit`, { method: "POST" });
    expect(res.status, 401, "status");
  });

  console.log("\nDropdown lists");
  await check("249 countries", async () => {
    const res = await fetch(`${BASE}/api/reference/countries`);
    const body = await res.json();
    expect(body.countries.length, 249, "count");
    if (!body.countries.some((c) => c.code === "NP" && c.name === "Nepal")) {
      throw new Error("Nepal is missing");
    }
  });
  await check("77 districts", async () => {
    const res = await fetch(`${BASE}/api/reference/districts`);
    const body = await res.json();
    expect(body.districts.length, 77, "count");
    if (!body.districts.some((d) => d.name === "Mustang")) {
      throw new Error("Mustang is missing");
    }
  });

  // -------------------------------------------------------------------------
  const supplier = await makeUser("supplier-individual", "supplier");
  console.log("\nSupplier, individual");

  await check("new account starts as incomplete", async () => {
    const { status, body } = await supplier.api.call("/api/profile");
    expect(status, 200, "status");
    expect(body.profile.status, "incomplete", "profile status");
    expect(body.profile.role, "supplier", "role");
    expect(body.ready, false, "ready");
    expectHas(body.missing.details, "account_type", "missing details");
  });

  await check("bad phone is refused", async () => {
    const { status, body } = await supplier.api.json("/api/profile", "PATCH", {
      phone: "123",
    });
    expect(status, 400, "status");
    if (!body.errors?.phone) throw new Error("no phone error given");
  });

  await check("district that does not exist is refused", async () => {
    const { status, body } = await supplier.api.json("/api/profile", "PATCH", {
      district: "Narnia",
    });
    expect(status, 400, "status");
    if (!body.errors?.district) throw new Error("no district error given");
  });

  await check("supplier outside Nepal is refused", async () => {
    const { status, body } = await supplier.api.json("/api/profile", "PATCH", {
      country: "AE",
    });
    expect(status, 400, "status");
    expect(body.errors.country, "Suppliers must be in Nepal", "message");
  });

  await check("supplier cannot set a city", async () => {
    const { status } = await supplier.api.json("/api/profile", "PATCH", {
      city: "Dubai",
    });
    expect(status, 400, "status");
  });

  await check("account type must be individual or company", async () => {
    const { status } = await supplier.api.json("/api/profile", "PATCH", {
      account_type: "partnership",
    });
    expect(status, 400, "status");
  });

  await check("good details are saved", async () => {
    const { status, body } = await supplier.api.json("/api/profile", "PATCH", {
      account_type: "individual",
      full_name: "Hari Bahadur Thapa",
      id_number: "12-34-56-78901",
      phone: "+977 9812345678",
      country: "np",
      district: "Mustang",
    });
    expect(status, 200, "status");
    expect(body.profile.country, "NP", "country saved uppercase");
    expect(body.profile.phone, "+9779812345678", "phone cleaned up");
    expect(body.profile.district, "Mustang", "district");
    expect(body.missing.details, [], "no details missing");
  });

  await check("submit is blocked: no bank, no documents", async () => {
    const { status, body } = await supplier.api.call("/api/profile/submit", {
      method: "POST",
    });
    expect(status, 400, "status");
    expectHas(body.missing.bank, "bank_name", "missing bank");
    expectHas(body.missing.documents, "id_front", "missing documents");
  });

  await check("half-filled bank details are refused", async () => {
    const { status, body } = await supplier.api.json("/api/profile/bank", "PUT", {
      bank_name: "Nabil Bank",
    });
    expect(status, 400, "status");
    expectHas(body.missing, "account_number", "missing");
  });

  await check("bad account number is refused", async () => {
    const { status } = await supplier.api.json("/api/profile/bank", "PUT", {
      bank_name: "Nabil Bank",
      account_name: "Hari Bahadur Thapa",
      account_number: "12",
    });
    expect(status, 400, "status");
  });

  await check("bank details are saved", async () => {
    const { status, body } = await supplier.api.json("/api/profile/bank", "PUT", {
      bank_name: "Nabil Bank",
      branch: "Jomsom",
      account_name: "Hari Bahadur Thapa",
      account_number: "0123456789012",
    });
    expect(status, 200, "status");
    expect(body.bank.branch, "Jomsom", "branch");
  });

  await check("a document we do not ask for is refused", async () => {
    const { status } = await supplier.api.upload(
      "registration_certificate",
      PNG,
      "x.png",
      "image/png",
    );
    expect(status, 400, "status");
  });

  await check("a file type we do not allow is refused", async () => {
    const { status } = await supplier.api.upload(
      "id_front",
      Buffer.from("hello"),
      "notes.txt",
      "text/plain",
    );
    expect(status, 400, "status");
  });

  await check("a file over 5 MB is refused", async () => {
    const { status, body } = await supplier.api.upload(
      "id_front",
      Buffer.alloc(6 * 1024 * 1024, 1),
      "big.png",
      "image/png",
    );
    expect(status, 400, "status");
    if (!String(body.error).includes("5 MB")) {
      throw new Error(`unclear message: ${body.error}`);
    }
  });

  let firstFrontPath = null;
  await check("citizenship front uploads", async () => {
    const { status, body } = await supplier.api.upload(
      "id_front",
      PNG,
      "front.png",
      "image/png",
    );
    expect(status, 201, "status");
    expect(body.document.doc_type, "id_front", "doc type");
    if (!body.document.url) throw new Error("no link to open the file");
    firstFrontPath = body.document.file_path;
  });

  await check("citizenship back uploads", async () => {
    const { status } = await supplier.api.upload(
      "id_back",
      PDF,
      "back.pdf",
      "application/pdf",
    );
    expect(status, 201, "status");
  });

  await check("uploading again replaces the old file", async () => {
    const { status, body } = await supplier.api.upload(
      "id_front",
      PNG,
      "front-v2.png",
      "image/png",
    );
    expect(status, 201, "status");
    expect(body.document.file_name, "front-v2.png", "file name");

    const list = await supplier.api.call("/api/profile/documents");
    expect(list.body.documents.length, 2, "still only two documents");

    const { data } = await admin.storage
      .from("verification-docs")
      .download(firstFrontPath);
    if (data) throw new Error("the old file was left behind in storage");
  });

  await check("the file link works, the bucket is not public", async () => {
    const list = await supplier.api.call("/api/profile/documents");
    const doc = list.body.documents[0];
    const signed = await fetch(doc.url);
    expect(signed.status, 200, "signed link");

    const open = await fetch(
      `${URL_}/storage/v1/object/public/verification-docs/${doc.file_path}`,
    );
    if (open.ok) throw new Error("the file can be opened by anyone");
  });

  await check("submit now works", async () => {
    const { status, body } = await supplier.api.call("/api/profile/submit", {
      method: "POST",
    });
    expect(status, 200, "status");
    expect(body.profile.status, "pending", "status");
    if (!body.profile.submitted_at) throw new Error("no submitted date saved");
  });

  await check("details can still be changed while waiting", async () => {
    const { status, body } = await supplier.api.json("/api/profile", "PATCH", {
      district: "Kaski",
    });
    expect(status, 200, "status");
    expect(body.profile.district, "Kaski", "district");
    expect(body.profile.status, "pending", "status is not reset");
  });

  await check("a user cannot approve themselves", async () => {
    await supplier.api.json("/api/profile", "PATCH", { status: "approved" });
    const { body } = await supplier.api.call("/api/profile");
    expect(body.profile.status, "pending", "status");
  });

  // -------------------------------------------------------------------------
  const company = await makeUser("supplier-company", "supplier");
  console.log("\nSupplier, company");

  await check("company needs a company name and PAN/VAT", async () => {
    const { body } = await company.api.json("/api/profile", "PATCH", {
      account_type: "company",
      phone: "9841000000",
      country: "NP",
      district: "Chitwan",
    });
    expectHas(body.missing.details, "company_name", "missing");
    expectHas(body.missing.details, "pan_vat", "missing");
  });

  await check("registration number is optional", async () => {
    const { status, body } = await company.api.json("/api/profile", "PATCH", {
      company_name: "Chitwan Fresh Produce Pvt. Ltd.",
      pan_vat: "600123456",
    });
    expect(status, 200, "status");
    expect(body.profile.registration_number, null, "registration number");
    expect(body.missing.details, [], "no details missing");
  });

  await check("a company is asked for company documents", async () => {
    const { body } = await company.api.call("/api/profile/documents");
    expect(
      body.needed.map((n) => n.doc_type),
      ["registration_certificate", "pan_vat_certificate"],
      "documents asked for",
    );
  });

  await check("company documents upload and submit works", async () => {
    await company.api.json("/api/profile/bank", "PUT", {
      bank_name: "Global IME Bank",
      account_name: "Chitwan Fresh Produce Pvt. Ltd.",
      account_number: "9876543210",
    });
    await company.api.upload("registration_certificate", PDF, "reg.pdf", "application/pdf");
    await company.api.upload("pan_vat_certificate", PDF, "pan.pdf", "application/pdf");

    const { status, body } = await company.api.call("/api/profile/submit", {
      method: "POST",
    });
    expect(status, 200, "status");
    expect(body.profile.status, "pending", "status");
  });

  // -------------------------------------------------------------------------
  const buyer = await makeUser("buyer", "buyer");
  console.log("\nBuyer");

  await check("a buyer cannot set a district", async () => {
    const { status } = await buyer.api.json("/api/profile", "PATCH", {
      district: "Kathmandu",
    });
    expect(status, 400, "status");
  });

  // No id_number on purpose: it is not asked for in the form yet, so it must
  // not block anyone from finishing.
  await check("a buyer can be in any country and needs a city", async () => {
    const { status, body } = await buyer.api.json("/api/profile", "PATCH", {
      account_type: "individual",
      full_name: "Ahmed Al Mansoori",
      phone: "+971501234567",
      country: "AE",
    });
    expect(status, 200, "status");
    expectHas(body.missing.details, "city", "missing");
  });

  await check("a buyer is not asked for bank details", async () => {
    const { status } = await buyer.api.json("/api/profile/bank", "PUT", {
      bank_name: "Emirates NBD",
      account_name: "Ahmed Al Mansoori",
      account_number: "1234567890",
    });
    expect(status, 403, "status");

    await buyer.api.json("/api/profile", "PATCH", { city: "Dubai" });
    const { body } = await buyer.api.call("/api/profile");
    expect(body.missing.bank, [], "no bank asked for");
  });

  await check("a buyer still needs documents before submit", async () => {
    const blocked = await buyer.api.call("/api/profile/submit", { method: "POST" });
    expect(blocked.status, 400, "status");

    await buyer.api.upload("id_front", PNG, "p1.png", "image/png");
    await buyer.api.upload("id_back", PNG, "p2.png", "image/png");

    const { status, body } = await buyer.api.call("/api/profile/submit", {
      method: "POST",
    });
    expect(status, 200, "status");
    expect(body.profile.status, "pending", "status");
  });

  // -------------------------------------------------------------------------
  console.log("\nOne user cannot touch another");

  await check("a user cannot delete someone else's document", async () => {
    const mine = await buyer.api.call("/api/profile/documents");
    const { status } = await supplier.api.call(
      `/api/profile/documents/${mine.body.documents[0].id}`,
      { method: "DELETE" },
    );
    expect(status, 404, "status");
  });

  await check("a normal user cannot use the admin endpoints", async () => {
    const list = await buyer.api.call("/api/admin/users");
    expect(list.status, 403, "list status");
    const one = await buyer.api.call(`/api/admin/users/${supplier.id}`);
    expect(one.status, 403, "detail status");
  });

  // -------------------------------------------------------------------------
  const staff = await makeUser("admin", "buyer");
  await admin.from("profiles").update({ role: "admin" }).eq("id", staff.id);
  console.log("\nAdmin");

  await check("admin sees people waiting for review", async () => {
    const { status, body } = await staff.api.call("/api/admin/users?status=pending");
    expect(status, 200, "status");
    if (!body.users.some((u) => u.id === supplier.id)) {
      throw new Error("the supplier who submitted is not in the list");
    }
    if (body.users.some((u) => u.status !== "pending")) {
      throw new Error("the list is not filtered");
    }
  });

  await check("admin sees one person in full, with the documents", async () => {
    const { status, body } = await staff.api.call(`/api/admin/users/${supplier.id}`);
    expect(status, 200, "status");
    expect(body.profile.id_number, "12-34-56-78901", "id number");
    expect(body.bank.bank_name, "Nabil Bank", "bank");
    expect(body.documents.length, 2, "documents");
    if (!body.documents.every((d) => d.url)) {
      throw new Error("a document has no link to open it");
    }
  });

  await check("admin approves the account", async () => {
    const { status, body } = await staff.api.json(
      `/api/admin/users/${supplier.id}`,
      "PATCH",
      { status: "approved" },
    );
    expect(status, 200, "status");
    expect(body.profile.status, "approved", "status");
  });

  await check("an approved account cannot be submitted again", async () => {
    const { status } = await supplier.api.call("/api/profile/submit", {
      method: "POST",
    });
    expect(status, 400, "status");
  });

  await check("a document can be deleted by its owner", async () => {
    const list = await buyer.api.call("/api/profile/documents");
    const doc = list.body.documents[0];
    const { status } = await buyer.api.call(`/api/profile/documents/${doc.id}`, {
      method: "DELETE",
    });
    expect(status, 200, "status");

    const after = await buyer.api.call("/api/profile");
    expectHas(after.body.missing.documents, doc.doc_type, "missing again");
  });

  // -------------------------------------------------------------------------
  const fresh = await makeUser("pages", "supplier");
  console.log("\nPages");

  const goesTo = (res, where, what) => {
    if (res.status !== 307 && res.status !== 302) {
      throw new Error(`${what}: got ${res.status}, wanted a redirect`);
    }
    if (!res.to?.endsWith(where)) {
      throw new Error(`${what}: sent to ${res.to}, wanted ${where}`);
    }
  };

  await check("unfinished details: every page sends you to the form", async () => {
    goesTo(await fresh.api.page("/"), "/onboarding", "home");
    goesTo(await fresh.api.page("/account"), "/onboarding", "account");
    goesTo(await fresh.api.page("/join/supplier"), "/onboarding", "join");
  });

  await check("the form page opens on step 1", async () => {
    const { status, html } = await fresh.api.page("/onboarding");
    expect(status, 200, "status");
    for (const text of ["Who are you?", "Step 1 of", "A person", "A company"]) {
      if (!html.includes(text)) throw new Error(`"${text}" is not on the page`);
    }
  });

  await check("the form no longer asks for a citizenship number", async () => {
    const { html } = await fresh.api.page("/onboarding");
    if (html.includes("Citizenship or passport number")) {
      throw new Error("the field is still on the page");
    }
  });

  await check("the form shows the help email", async () => {
    const { html } = await fresh.api.page("/onboarding");
    if (!html.includes("tech@cloudfrm.ai")) {
      throw new Error("the help email is missing");
    }
  });

  await check("waiting for approval: account page opens with Edit details", async () => {
    const { status, html } = await company.api.page("/account");
    expect(status, 200, "status");
    if (!html.includes("waiting for approval")) {
      throw new Error("the waiting message is missing");
    }
    if (!html.includes("Edit details")) {
      throw new Error("the Edit details button is missing");
    }
    if (!html.includes("Chitwan Fresh Produce")) {
      throw new Error("the saved company name is not shown");
    }
  });

  await check("waiting for approval: the form can be reopened", async () => {
    const { status, html } = await company.api.page("/onboarding");
    expect(status, 200, "status");
    if (!html.includes("Chitwan Fresh Produce")) {
      throw new Error("the form did not load the saved details");
    }
  });

  await check("not logged in: home shows the sign-up choice", async () => {
    const res = await fetch(`${BASE}/`, { redirect: "manual" });
    expect(res.status, 200, "status");
    const html = await res.text();
    if (!html.includes("Tell us who you are")) {
      throw new Error("the home page is wrong");
    }
  });

  await check("not logged in: the form sends you home", async () => {
    const res = await fetch(`${BASE}/onboarding`, { redirect: "manual" });
    if (res.status !== 307 && res.status !== 302) {
      throw new Error(`got ${res.status}, wanted a redirect`);
    }
  });

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

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

await main();
