import type { Profile } from "@/lib/auth";
import { createAdminClient } from "@/utils/supabase/admin";

export type Role = "supplier" | "buyer";
export type AccountType = "individual" | "company";

export const ACCOUNT_TYPES: AccountType[] = ["individual", "company"];

// Files we need before an account can go for review.
export const REQUIRED_DOCS: Record<AccountType, string[]> = {
  individual: ["id_front", "id_back"],
  company: ["registration_certificate", "pan_vat_certificate"],
};

export const DOC_LABELS: Record<string, string> = {
  id_front: "Citizenship or passport (front)",
  id_back: "Citizenship or passport (back)",
  registration_certificate: "Company registration certificate",
  pan_vat_certificate: "PAN or VAT certificate",
};

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

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
  if (!profile.account_type) return [...missing, "account_type"];

  if (profile.account_type === "individual") {
    if (!has(profile.full_name)) missing.push("full_name");
    if (!has(profile.id_number)) missing.push("id_number");
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
  uploaded: string[],
): string[] {
  if (!accountType) return [];
  return REQUIRED_DOCS[accountType].filter((doc) => !uploaded.includes(doc));
}

/** Everything that still blocks this account from going for review. */
export function whatIsMissing(
  profile: Profile,
  bank: BankAccount | null,
  uploadedDocs: string[],
) {
  return {
    details: missingFromProfile(profile),
    // Only suppliers are paid out, so only they need a bank account.
    bank: profile.role === "supplier" ? missingFromBank(bank) : [],
    documents: missingDocs(profile.account_type, uploadedDocs),
  };
}

export function isReadyToSubmit(missing: ReturnType<typeof whatIsMissing>) {
  return (
    missing.details.length === 0 &&
    missing.bank.length === 0 &&
    missing.documents.length === 0
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

  const [{ data: bank }, { data: documents }] = await Promise.all([
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
  ]);

  const docs = (documents ?? []) as DocumentRow[];
  const missing = whatIsMissing(
    profile,
    (bank ?? null) as BankAccount | null,
    docs.map((d) => d.doc_type),
  );

  return {
    profile,
    bank: (bank ?? null) as BankAccount | null,
    documents: docs,
    missing,
    ready: isReadyToSubmit(missing),
  };
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
