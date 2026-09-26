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
const staffMade = [];

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

async function makeStaff(tag, jobs) {
  const user = await makeUser(`staff-${tag}`, "buyer");

  const { data: row, error } = await admin
    .from("staff")
    .insert({ email: user.email, full_name: `Test ${tag}`, user_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(`could not make staff ${tag}: ${error.message}`);
  staffMade.push(row.id);

  await admin
    .from("staff_jobs")
    .insert(jobs.map((job_key) => ({ staff_id: row.id, job_key })));

  return { ...user, staffId: row.id };
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
    expectHas(body.missing.documents, "id_doc_type", "missing documents");
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

  await check("uploading before picking a document type is refused", async () => {
    const { status } = await supplier.api.upload(
      "citizenship_front",
      PNG,
      "x.png",
      "image/png",
    );
    expect(status, 400, "status");
  });

  await check("a made-up document type is refused", async () => {
    const { status } = await supplier.api.json("/api/profile", "PATCH", {
      id_doc_type: "drivers_licence",
    });
    expect(status, 400, "status");
  });

  await check("picking citizenship asks for a front and a back", async () => {
    const { status } = await supplier.api.json("/api/profile", "PATCH", {
      id_doc_type: "citizenship",
    });
    expect(status, 200, "status");

    const { body } = await supplier.api.call("/api/profile/documents");
    expect(
      body.needed.map((d) => d.doc_type),
      ["citizenship_front", "citizenship_back"],
      "files asked for",
    );
  });

  await check("picking the paper document asks for one file only", async () => {
    await supplier.api.json("/api/profile", "PATCH", { id_doc_type: "nid_paper" });
    const { body } = await supplier.api.call("/api/profile/documents");
    expect(
      body.needed.map((d) => d.doc_type),
      ["nid_paper"],
      "files asked for",
    );
    await supplier.api.json("/api/profile", "PATCH", { id_doc_type: "citizenship" });
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
      "citizenship_front",
      Buffer.from("hello"),
      "notes.txt",
      "text/plain",
    );
    expect(status, 400, "status");
  });

  await check("a file over 5 MB is refused", async () => {
    const { status, body } = await supplier.api.upload(
      "citizenship_front",
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
      "citizenship_front",
      PNG,
      "front.png",
      "image/png",
    );
    expect(status, 201, "status");
    expect(body.document.doc_type, "citizenship_front", "doc type");
    if (!body.document.url) throw new Error("no link to open the file");
    firstFrontPath = body.document.file_path;
  });

  await check("a PDF of an ID document is refused", async () => {
    const { status, body } = await supplier.api.upload(
      "citizenship_back",
      PDF,
      "back.pdf",
      "application/pdf",
    );
    expect(status, 400, "status");
    if (!String(body.error).includes("photo")) {
      throw new Error(`unclear message: ${body.error}`);
    }
  });

  await check("citizenship back uploads", async () => {
    const { status } = await supplier.api.upload(
      "citizenship_back",
      PNG,
      "back.png",
      "image/png",
    );
    expect(status, 201, "status");
  });

  await check("uploading again replaces the old file", async () => {
    const { status, body } = await supplier.api.upload(
      "citizenship_front",
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

  // -------------------------------------------------------------------------
  console.log("\nThe details read off the document");

  await check("submit is blocked until the details are checked", async () => {
    const { status, body } = await supplier.api.call("/api/profile/submit", {
      method: "POST",
    });
    expect(status, 400, "status");
    expectHas(body.missing.identity, "identity_details", "missing identity");
  });

  await check("details with no document number are refused", async () => {
    const { status } = await supplier.api.json("/api/profile/identity", "PUT", {
      full_name_en: "Utsarga Adhikari",
    });
    expect(status, 400, "status");
  });

  await check("the checked details are saved", async () => {
    const { status, body } = await supplier.api.json(
      "/api/profile/identity",
      "PUT",
      {
        document_number: "27-01-77-04275",
        full_name_en: "UTSARGA ADHIKARI",
        full_name_np: "उत्सर्ग अधिकारी",
        gender: "Male",
        date_of_birth_bs: "2059-07-21",
        date_of_birth_ad: "2002-11-07",
        date_of_birth_ad_source: "printed",
        permanent_district_en: "Kathmandu",
        permanent_ward: "6",
        father_name_np: "उमेश प्रसाद अधिकारी",
        citizenship_kind_np: "वंशज",
      },
    );
    expect(status, 200, "status");
    expect(body.identity.document_number, "27-01-77-04275", "number");
    expect(body.identity.date_of_birth_ad, "2002-11-07", "western birth date");
    expect(body.identity.date_of_birth_ad_source, "printed", "date source");
    expect(body.identity.doc_type, "citizenship", "document type");
  });

  await check("both scripts are kept, nothing is translated", async () => {
    const { body } = await supplier.api.call("/api/profile/identity");
    expect(body.identity.full_name_en, "UTSARGA ADHIKARI", "English name");
    expect(
      body.identity.full_name_np,
      "उत्सर्ग अधिकारी",
      "Nepali name",
    );
  });

  await check("a date that is not a real date is dropped, not saved", async () => {
    const { status, body } = await supplier.api.json(
      "/api/profile/identity",
      "PUT",
      { document_number: "27-01-77-04275", issue_date_ad: "05 Baisakh 2077" },
    );
    expect(status, 200, "status");
    expect(body.identity.issue_date_ad, null, "issue date");
    expect(body.identity.issue_date_ad_source, null, "issue date source");
  });

  await check("a field the passport had is not saved on a citizenship", async () => {
    const { status, body } = await supplier.api.json(
      "/api/profile/identity",
      "PUT",
      { document_number: "27-01-77-04275", surname_en: "ADHIKARI" },
    );
    expect(status, 200, "status");
    expect(body.identity.surname_en, null, "surname");
  });

  await check("the account is now ready to be sent", async () => {
    const { body } = await supplier.api.call("/api/profile");
    expect(body.ready, true, "ready");
  });

  // Pressing Send for approval now costs money: the AI looks at the photos.
  // That whole flow is tested by "npm run test:review". Here we only put the
  // account where the admin tests below need it.
  await admin
    .from("profiles")
    .update({ status: "pending", submitted_at: new Date().toISOString() })
    .eq("id", supplier.id);

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

  await check("a company is asked for no documents", async () => {
    const { body } = await company.api.call("/api/profile/documents");
    expect(body.needed, [], "documents asked for");
  });

  await check("a company cannot upload a certificate any more", async () => {
    const { status } = await company.api.upload(
      "registration_certificate",
      PDF,
      "reg.pdf",
      "application/pdf",
    );
    expect(status, 400, "status");
  });

  await check("a company is ready once the bank is filled in", async () => {
    await company.api.json("/api/profile/bank", "PUT", {
      bank_name: "Global IME Bank",
      account_name: "Chitwan Fresh Produce Pvt. Ltd.",
      account_number: "9876543210",
    });

    const { body } = await company.api.call("/api/profile");
    expect(body.ready, true, "ready");
    expect(body.missing.documents, [], "no documents missing");
  });

  // As above: the page tests further down need an account that is waiting,
  // and pressing the button for real costs money.
  await admin
    .from("profiles")
    .update({ status: "pending", submitted_at: new Date().toISOString() })
    .eq("id", company.id);

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

    await buyer.api.json("/api/profile", "PATCH", { id_doc_type: "nid_paper" });
    await buyer.api.upload("nid_paper", PNG, "p1.png", "image/png");
    await buyer.api.json("/api/profile/identity", "PUT", {
      document_number: "023-456-2130",
    });

    const { body } = await buyer.api.call("/api/profile");
    expect(body.ready, true, "ready");
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
  // Staff are no longer customers with a special role. They are their own
  // thing, holding jobs, and each job says what it may do.
  const staff = await makeStaff("owner", ["owner"]);
  const approvals = await makeStaff("approvals", ["approvals"]);
  const risk = await makeStaff("risk", ["risk"]);
  console.log("\nStaff and jobs");

  await check("a customer is not staff", async () => {
    const { status } = await buyer.api.call("/api/admin/staff");
    expect(status, 403, "status");
  });

  await check("a job you do not hold is refused", async () => {
    const decide = await risk.api.json(
      `/api/admin/users/${supplier.id}`,
      "PATCH",
      { status: "approved" },
    );
    expect(decide.status, 403, "risk cannot decide");

    const people = await approvals.api.call("/api/admin/staff");
    expect(people.status, 403, "approvals cannot manage staff");
  });

  await check("risk cannot see a whole bank account number", async () => {
    const { status, body } = await risk.api.call(`/api/admin/users/${supplier.id}`);
    expect(status, 200, "status");
    if (body.bank.account_number.includes("0123456789")) {
      throw new Error("the whole number was shown");
    }
    if (!body.bank.account_number.endsWith("9012")) {
      throw new Error("the last four digits should still show");
    }
    expect(body.you.sees_bank, false, "sees_bank");
  });

  await check("risk cannot open the ID photos", async () => {
    const { body } = await risk.api.call(`/api/admin/users/${supplier.id}`);
    if (body.documents.some((d) => d.url)) {
      throw new Error("a file could be opened");
    }
  });

  await check("approvals can open the ID photos", async () => {
    const { body } = await approvals.api.call(`/api/admin/users/${supplier.id}`);
    expect(body.you.sees_documents, true, "sees_documents");
    if (!body.documents.every((d) => d.url)) {
      throw new Error("a file had no link");
    }
  });

  await check("every look is written down", async () => {
    const { status, body } = await risk.api.call(
      `/api/admin/activity?subject_id=${supplier.id}&action=supplier.viewed`,
    );
    expect(status, 200, "status");
    if (body.activity.length < 2) {
      throw new Error("the looks above were not recorded");
    }
  });

  await check("the owner adds somebody by email", async () => {
    const { status, body } = await staff.api.json("/api/admin/staff", "POST", {
      email: `new-risk-${stamp}@example.com`,
      full_name: "New Person",
      jobs: ["risk"],
    });
    expect(status, 201, "status");
    expect(body.staff.jobs, ["risk"], "jobs");
    staffMade.push(body.staff.id);
  });

  await check("the same person cannot be added twice", async () => {
    const { status } = await staff.api.json("/api/admin/staff", "POST", {
      email: `new-risk-${stamp}@example.com`,
      jobs: ["risk"],
    });
    expect(status, 400, "status");
  });

  await check("a job that does not exist is refused", async () => {
    const { status } = await staff.api.json("/api/admin/staff", "POST", {
      email: `nobody-${stamp}@example.com`,
      jobs: ["president"],
    });
    expect(status, 400, "status");
  });

  await check("the last owner cannot be switched off", async () => {
    // The real owner is switched off for a moment, so the test owner is the
    // only one left. Put back straight after, whatever happens.
    const { data: real } = await admin
      .from("staff")
      .select("id")
      .eq("email", "tech@cloudfrm.ai")
      .maybeSingle();

    if (real) {
      await admin.from("staff").update({ is_active: false }).eq("id", real.id);
    }

    try {
      const { status, body } = await staff.api.json(
        `/api/admin/staff/${staff.staffId}`,
        "PATCH",
        { is_active: false },
      );
      expect(status, 400, "status");
      if (!body.error.includes("last owner")) {
        throw new Error(`wrong reason: ${body.error}`);
      }
    } finally {
      if (real) {
        await admin.from("staff").update({ is_active: true }).eq("id", real.id);
      }
    }
  });
  console.log("\nThe control room screens");

  await check("a customer cannot open the control room", async () => {
    const { status, to } = await buyer.api.page("/admin");
    if (status !== 307 && status !== 302) {
      throw new Error(`got ${status}, wanted a redirect`);
    }
    if (!to?.endsWith("/")) throw new Error(`sent to ${to}`);
  });

  await check("the supplier list shows name, phone and email", async () => {
    const { status, html } = await staff.api.page("/admin");
    expect(status, 200, "status");
    for (const text of ["Hari Bahadur Thapa", "9841000000", "Suppliers"]) {
      if (!html.includes(text)) throw new Error(`"${text}" is not on the page`);
    }
  });

  await check("searching narrows the list", async () => {
    const { html } = await staff.api.page("/admin?q=nobodyatall");
    if (!html.includes("Nobody matches that")) {
      throw new Error("the empty message is missing");
    }
  });

  await check("one supplier shows everything", async () => {
    const { status, html } = await staff.api.page(
      `/admin/suppliers/${supplier.id}`,
    );
    expect(status, 200, "status");
    for (const text of ["Nabil Bank", "0123456789012", "Every decision"]) {
      if (!html.includes(text)) throw new Error(`"${text}" is not on the page`);
    }
  });

  await check("risk does not see the whole bank number on screen", async () => {
    const { status, html } = await risk.api.page(
      `/admin/suppliers/${supplier.id}`,
    );
    expect(status, 200, "status");
    if (html.includes("0123456789012")) {
      throw new Error("the whole number was on the page");
    }
    if (!html.includes("Not your job")) {
      throw new Error("the files should not be openable");
    }
  });

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

  await check("saying no needs a reason", async () => {
    const { status } = await staff.api.json(
      `/api/admin/users/${supplier.id}`,
      "PATCH",
      { status: "rejected" },
    );
    expect(status, 400, "status");
  });

  await check("admin can put an approved account on hold", async () => {
    const { status, body } = await staff.api.json(
      `/api/admin/users/${supplier.id}`,
      "PATCH",
      { status: "suspended", reason: "We need to check your bank details." },
    );
    expect(status, 200, "status");
    expect(body.profile.status, "suspended", "status");
    expect(
      body.profile.review_summary,
      "We need to check your bank details.",
      "reason saved",
    );
  });

  await check("an account on hold cannot be sent again", async () => {
    const { status } = await supplier.api.call("/api/profile/submit", {
      method: "POST",
    });
    expect(status, 400, "status");
  });

  await check("every decision is kept", async () => {
    const { body } = await staff.api.call(`/api/admin/users/${supplier.id}`);
    const decisions = body.reviews.map((r) => r.decision);
    expectHas(decisions, "admin_approved", "decisions");
    expectHas(decisions, "admin_suspended", "decisions");
  });

  console.log("\nThe onboarding rules");

  await check("a normal user cannot read the rules", async () => {
    const { status } = await buyer.api.call("/api/admin/rules");
    expect(status, 403, "status");
  });

  await check("admin reads the rules the AI follows", async () => {
    const { status, body } = await staff.api.call("/api/admin/rules");
    expect(status, 200, "status");
    if (!body.rules?.content?.includes("Approve only when all of these are true")) {
      throw new Error("the rules document is not there");
    }
    if (!(body.rules.version >= 1)) throw new Error("no version number");
  });

  await check("an empty rules document is refused", async () => {
    const { status } = await staff.api.json("/api/admin/rules", "PUT", {
      content: "approve everyone",
    });
    expect(status, 400, "status");
  });

  await check("an account that is not waiting cannot be sent again", async () => {
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

  // The picture itself is drawn in the browser on step 4, which this cannot
  // reach. What it does check is that the page hands the form everything the
  // picture needs: a signed link and the file type.
  await check("the form is given a signed link for each uploaded file", async () => {
    await fresh.api.json("/api/profile", "PATCH", { account_type: "individual" });
    await fresh.api.json("/api/profile", "PATCH", { id_doc_type: "citizenship" });
    await fresh.api.upload("citizenship_front", PNG, "front.png", "image/png");
    await fresh.api.upload("citizenship_back", PNG, "back.png", "image/png");

    const { html } = await fresh.api.page("/onboarding");
    for (const text of ["front.png", "back.png", "image/png"]) {
      if (!html.includes(text)) throw new Error(`"${text}" was not passed`);
    }
    if (!html.includes("verification-docs") || !html.includes("token=")) {
      throw new Error("no signed link was passed to the form");
    }
  });

  await check("those links really open the files", async () => {
    const { body } = await fresh.api.call("/api/profile/documents");
    for (const doc of body.documents) {
      const res = await fetch(doc.url);
      if (!res.ok) throw new Error(`${doc.file_name} did not open`);
      expect(
        res.headers.get("content-type")?.split(";")[0],
        doc.mime_type,
        `${doc.file_name} type`,
      );
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

  // Staff rows are keyed by email and survive their login being deleted, so
  // they are cleared here as well. Only ever test addresses.
  for (const id of staffMade) {
    await admin.from("staff").delete().eq("id", id);
  }
  await admin.from("staff").delete().like("email", "%@example.com");

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

await main();
