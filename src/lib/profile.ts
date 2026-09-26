import type { Profile } from "@/lib/auth";
import type { IdentityDetails } from "@/lib/identity";
import { createAdminClient } from "@/utils/supabase/admin";

export type Role = "supplier" | "buyer";
export type AccountType = "individual" | "company";

export const ACCOUNT_TYPES: AccountType[] = ["individual", "company"];

// Which ID document the supplier says they have, and how many photos it takes.
export type IdDocType = "citizenship" | "nid_card" | "nid_paper";

export const ID_DOC_TYPES: IdDocType[] = ["citizenship", "nid_card", "nid_paper"];

export const ID_DOC_FILES: Record<IdDocType, string[]> = {
  citizenship: ["citizenship_front", "citizenship_back"],
  nid_card: ["nid_card_front", "nid_card_back"],
  nid_paper: ["nid_paper"],
};

export const ID_DOC_LABELS: Record<IdDocType, string> = {
  citizenship: "Citizenship certificate",
  nid_card: "National identity card",
  nid_paper: "National identity paper document",
};

// A company uploads nothing when it signs up. It types its company name and
// its PAN or VAT number, and we ask for the certificates after approval.
export const COMPANY_DOCS: string[] = [];

/** The files this account still has to upload, by name. */
export function requiredDocs(
  accountType: AccountType | null,
  idDocType: IdDocType | null,
): string[] {
  if (accountType === "company") return COMPANY_DOCS;
  if (accountType === "individual") {
    return idDocType ? ID_DOC_FILES[idDocType] : [];
  }
  return [];
}

/**
 * The same lists in one flat map, for the form to read. The form is a client
 * component, so it gets plain data as a prop rather than calling in here.
 */
export const DOC_CHOICES: Record<string, string[]> = {
  company: COMPANY_DOCS,
  ...ID_DOC_FILES,
};

export const DOC_LABELS: Record<string, string> = {
  citizenship_front: "Citizenship certificate (front)",
  citizenship_back: "Citizenship certificate (back)",
  nid_card_front: "National identity card (front)",
  nid_card_back: "National identity card (back)",
  nid_paper: "National identity paper document",
};

/** True for the files the AI reads. Those must be photos, never a PDF. */
export function isIdDoc(docType: string) {
  return Object.values(ID_DOC_FILES).some((files) => files.includes(docType));
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

// The AI reads pictures, so an ID document has to be a photo or a scan.
export const ID_DOC_MIME = ["image/jpeg", "image/png", "image/webp"];

export type BankAccount = {
  bank_name: string | null;
  branch: string | null;
  account_name: string | null;
  account_number: string | null;
};

const PHONE = /^\+?[0-9]{7,15}$/;

export function normalisePhone(value: string) {
  return value.replace(/[^0-9+]/g, "");
}

export function isValidPhone(value: string) {
  return PHONE.test(normalisePhone(value));
}

/**
 * Which details are still missing. An empty list means the form is complete.
 * Bank and documents are only checked when they are given to us, because the
 * details form can be saved on its own.
 */
export function missingFromProfile(profile: Profile): string[] {
  const missing: string[] = [];
  const has = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0;

  if (!profile.role) missing.push("role");

  // A buyer needs no approval and no ID document, so the form is just these
  // fields, individual or company alike.
  if (profile.role === "buyer") {
    if (!has(profile.full_name)) missing.push("full_name");
    if (!has(profile.company_name)) missing.push("company_name");
    if (!has(profile.phone)) missing.push("phone");
    if (!has(profile.pin_code)) missing.push("pin_code");
    return missing;
  }

  if (!profile.account_type) return [...missing, "account_type"];

  if (profile.account_type === "individual") {
    if (!has(profile.full_name)) missing.push("full_name");
    // id_number is still saved and read, it is just not asked for here yet.
  } else {
    if (!has(profile.company_name)) missing.push("company_name");
    if (!has(profile.pan_vat)) missing.push("pan_vat");
  }

  if (!has(profile.phone)) missing.push("phone");

  if (profile.role === "supplier") {
    if (profile.country !== "NP") missing.push("country");
    if (!has(profile.district)) missing.push("district");
  } else {
    if (!has(profile.country)) missing.push("country");
    if (!has(profile.city)) missing.push("city");
  }

  return missing;
}

export function missingFromBank(bank: BankAccount | null): string[] {
  if (!bank) return ["bank_name", "account_name", "account_number"];

  const missing: string[] = [];
  const has = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0;

  if (!has(bank.bank_name)) missing.push("bank_name");
  if (!has(bank.account_name)) missing.push("account_name");
  if (!has(bank.account_number)) missing.push("account_number");

  return missing;
}

export function missingDocs(
  accountType: AccountType | null,
  idDocType: IdDocType | null,
  uploaded: string[],
): string[] {
  if (accountType === "individual" && !idDocType) return ["id_doc_type"];
  return requiredDocs(accountType, idDocType).filter(
    (doc) => !uploaded.includes(doc),
  );
}

/** Everything that still blocks this account from going for review. */
export function whatIsMissing(
  profile: Profile,
  bank: BankAccount | null,
  uploadedDocs: string[],
  identityConfirmed: boolean,
) {
  const documents = missingDocs(
    profile.account_type,
    profile.id_doc_type,
    uploadedDocs,
  );

  // An individual also has to check and save what the AI read off the photos.
  // Nothing to check until the photos are all in, so we only ask once they are.
  const identity =
    profile.account_type === "individual" &&
    documents.length === 0 &&
    !identityConfirmed
      ? ["identity_details"]
      : [];

  return {
    details: missingFromProfile(profile),
    // Only suppliers are paid out, so only they need a bank account.
    bank: profile.role === "supplier" ? missingFromBank(bank) : [],
    documents,
    identity,
  };
}

/** Where a logged-in user lands: their onboarding, or their home screen. */
export function homeFor(profile: Pick<Profile, "role" | "status">): string {
  if (profile.status === "incomplete") {
    return profile.role === "buyer" ? "/onboarding/buyer" : "/onboarding";
  }
  return profile.role === "buyer" ? "/buyer" : "/account";
}

export function isReadyToSubmit(missing: ReturnType<typeof whatIsMissing>) {
  return (
    missing.details.length === 0 &&
    missing.bank.length === 0 &&
    missing.documents.length === 0 &&
    missing.identity.length === 0
  );
}

// ---------------------------------------------------------------------------
// Reading a whole account in one go: details, bank, documents, what is missing.
// ---------------------------------------------------------------------------

export type DocumentRow = {
  id: string;
  doc_type: string;
  file_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: "incomplete" | "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
};

export const DOCS_BUCKET = "verification-docs";

export async function loadAccount(profile: Profile) {
  const admin = createAdminClient();

  const [{ data: bank }, { data: documents }, { data: identity }] = await Promise.all([
    admin
      .from("payment_accounts")
      .select("bank_name, branch, account_name, account_number")
      .eq("profile_id", profile.id)
      .eq("is_primary", true)
      .maybeSingle(),
    admin
      .from("verification_documents")
      .select("id, doc_type, file_path, file_name, mime_type, size_bytes, status, notes, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: true }),
    admin
      .from("identity_details")
      .select("*")
      .eq("profile_id", profile.id)
      .maybeSingle(),
  ]);

  const docs = (documents ?? []) as DocumentRow[];
  const missing = whatIsMissing(
    profile,
    (bank ?? null) as BankAccount | null,
    docs.map((d) => d.doc_type),
    Boolean(identity),
  );

  return {
    profile,
    bank: (bank ?? null) as BankAccount | null,
    documents: docs,
    identity: (identity ?? null) as IdentityDetails | null,
    missing,
    ready: isReadyToSubmit(missing),
  };
}

/**
 * Throw away the ID photos and anything read off them. Used when the supplier
 * changes their mind about which document they have: the old front and back
 * belong to a different document, so keeping them would mix two people's
 * papers together.
 */
export async function clearIdDocuments(profileId: string) {
  const admin = createAdminClient();

  const { data: docs } = await admin
    .from("verification_documents")
    .select("id, file_path, doc_type")
    .eq("profile_id", profileId);

  const idDocs = (docs ?? []).filter((d) => isIdDoc(d.doc_type));
  if (idDocs.length > 0) {
    await admin.storage.from(DOCS_BUCKET).remove(idDocs.map((d) => d.file_path));
    await admin
      .from("verification_documents")
      .delete()
      .in("id", idDocs.map((d) => d.id));
  }

  await admin.from("identity_details").delete().eq("profile_id", profileId);
}

/** Short-lived links so files can be opened without making the bucket public. */
export async function withSignedUrls(documents: DocumentRow[]) {
  const admin = createAdminClient();

  return Promise.all(
    documents.map(async (doc) => {
      const { data } = await admin.storage
        .from(DOCS_BUCKET)
        .createSignedUrl(doc.file_path, 60 * 60);

      return { ...doc, url: data?.signedUrl ?? null };
    }),
  );
}

/**
 * The photos this account has uploaded, in the order we ask for them, ready
 * to send to the AI. `missing` is not empty when something has not been
 * uploaded yet, and then no photos come back.
 */
export async function loadPhotos(profileId: string, needed: string[]) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("verification_documents")
    .select("doc_type, file_path, mime_type")
    .eq("profile_id", profileId)
    .in("doc_type", needed);

  const rows = (data ?? []) as Pick<
    DocumentRow,
    "doc_type" | "file_path" | "mime_type"
  >[];

  const missing = needed.filter((t) => !rows.some((r) => r.doc_type === t));
  if (missing.length > 0) return { missing, photos: [] };

  const byType = new Map(rows.map((r) => [r.doc_type, r]));

  const photos = await Promise.all(
    needed.map(async (docType) => {
      const row = byType.get(docType)!;
      const { data: file } = await admin.storage
        .from(DOCS_BUCKET)
        .download(row.file_path);

      const bytes = Buffer.from(await file!.arrayBuffer());
      return {
        label: DOC_LABELS[docType] ?? docType,
        mimeType: row.mime_type ?? "image/jpeg",
        base64: bytes.toString("base64"),
      };
    }),
  );

  return { missing: [], photos };
}
