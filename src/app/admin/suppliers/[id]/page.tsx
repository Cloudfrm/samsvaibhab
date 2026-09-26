import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import type { Profile } from "@/lib/auth";
import { FIELDS, FIELD_LABELS } from "@/lib/identity";
import { DOC_LABELS, ID_DOC_LABELS, loadAccount, withSignedUrls } from "@/lib/profile";
import { can, currentStaff, maskAccountNumber, record } from "@/lib/staff";
import { StatusChip } from "@/components/admin/StatusChip";

/**
 * One supplier, in full. Look only: there are no buttons here yet.
 *
 * What is shown depends on the jobs this staff member holds, and the look
 * itself is written into the activity log.
 */
export default async function SupplierPage(
  props: PageProps<"/admin/suppliers/[id]">,
) {
  const staff = await currentStaff();
  const { id } = await props.params;

  if (!can(staff, "suppliers.read")) {
    return (
      <p className="text-[16px] text-adm-mute">
        Looking at suppliers is not part of your job here.
      </p>
    );
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!row) notFound();

  const profile = row as Profile;
  const account = await loadAccount(profile);

  const { data: reviews } = await admin
    .from("account_reviews")
    .select("decision, summary, issues, rules_version, created_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: false });

  const seesDocuments = can(staff, "documents.view");
  const seesBank = can(staff, "bank.view_full");

  await record(staff!.id, "supplier.viewed", id, {
    documents: seesDocuments,
    bank_in_full: seesBank,
  });

  const documents = seesDocuments
    ? await withSignedUrls(account.documents)
    : account.documents.map((doc) => ({ ...doc, url: null as string | null }));

  const identity = account.identity;

  return (
    <>
      <Link
        href="/admin"
        className="text-[14px] text-adm-mute underline-offset-4 hover:text-adm-ink hover:underline"
      >
        ← All suppliers
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="adm-display text-[38px]">
            {profile.full_name ?? profile.company_name ?? "No name yet"}
          </h1>
          <p className="mt-2 text-[14px] text-adm-mute">
            {profile.email} · {profile.phone ?? "no phone"} ·{" "}
            {profile.account_type ?? "not chosen"}
          </p>
        </div>
        <StatusChip status={profile.status} sentBack={profile.send_back_count} />
      </div>

      {profile.review_summary && (
        <p className="mt-6 whitespace-pre-line rounded-[10px] border border-adm-line bg-adm-bone p-5 text-[15px] leading-[1.6]">
          {profile.review_summary}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card title="Their details">
          <Row label="Account type" value={profile.account_type} />
          <Row label="Full name" value={profile.full_name} />
          <Row label="Company" value={profile.company_name} />
          <Row label="PAN or VAT" value={profile.pan_vat} />
          <Row label="Phone" value={profile.phone} />
          <Row label="Country" value={profile.country} />
          <Row label="District" value={profile.district} />
          <Row label="City" value={profile.city} />
          <Row label="Signed up" value={date(profile.submitted_at)} />
        </Card>

        <Card title="Bank account">
          {account.bank ? (
            <>
              <Row label="Bank" value={account.bank.bank_name} />
              <Row label="Branch" value={account.bank.branch} />
              <Row label="Account holder" value={account.bank.account_name} />
              <Row
                label="Account number"
                value={
                  seesBank
                    ? account.bank.account_number
                    : maskAccountNumber(account.bank.account_number)
                }
              />
              {!seesBank && (
                <p className="pt-3 text-[13px] text-adm-ash">
                  The whole number is not part of your job here.
                </p>
              )}
            </>
          ) : (
            <p className="py-3 text-[15px] text-adm-mute">Nothing given yet.</p>
          )}
        </Card>

        <Card title="Documents">
          {documents.length === 0 && (
            <p className="py-3 text-[15px] text-adm-mute">Nothing uploaded yet.</p>
          )}
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-4 border-b border-adm-line py-3 last:border-0"
            >
              <span className="text-[15px]">
                {DOC_LABELS[doc.doc_type] ?? doc.doc_type}
              </span>
              {doc.url ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-adm-line bg-adm-card px-4 py-1.5 text-[14px] font-semibold transition hover:border-adm-ink"
                >
                  Open
                </a>
              ) : (
                <span className="text-[13px] text-adm-ash">Not your job</span>
              )}
            </div>
          ))}
        </Card>

        <Card
          title={
            identity
              ? `Read off the ${ID_DOC_LABELS[identity.doc_type].toLowerCase()}`
              : "Read off the document"
          }
        >
          {identity ? (
            FIELDS[identity.doc_type]
              .filter((field) => identity[field as keyof typeof identity])
              .map((field) => (
                <Row
                  key={field}
                  label={FIELD_LABELS[field] ?? field}
                  value={String(identity[field as keyof typeof identity])}
                />
              ))
          ) : (
            <p className="py-3 text-[15px] text-adm-mute">
              Nothing read yet.
            </p>
          )}
        </Card>
      </div>

      <h2 className="mt-12 text-[24px] font-semibold tracking-[-0.35px]">
        Every decision
      </h2>

      <div className="mt-4 space-y-3">
        {(reviews ?? []).length === 0 && (
          <p className="text-[15px] text-adm-mute">
            Nothing decided yet. They have not sent it for approval.
          </p>
        )}

        {(reviews ?? []).map((review, index) => (
          <div
            key={index}
            className="rounded-[10px] border border-adm-line bg-adm-card p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[15px] font-semibold">
                {DECISIONS[review.decision] ?? review.decision}
              </span>
              <span className="text-[13px] text-adm-ash">
                {date(review.created_at)}
                {review.rules_version
                  ? ` · rules version ${review.rules_version}`
                  : " · by a person"}
              </span>
            </div>

            <p className="mt-2 whitespace-pre-line text-[15px] leading-[1.6] text-adm-body">
              {review.summary}
            </p>

            {Array.isArray(review.issues) && review.issues.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px] text-adm-body">
                {review.issues.map((issue: string, i: number) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

const DECISIONS: Record<string, string> = {
  approved: "The AI approved it",
  sent_back: "The AI sent it back",
  admin_approved: "Approved by a person",
  admin_rejected: "Not approved, by a person",
  admin_suspended: "Put on hold by a person",
};

function date(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-adm-line bg-adm-card p-6">
      <h2 className="text-[20px] font-semibold tracking-[-0.3px]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-adm-line py-2.5 last:border-0">
      <span className="text-[14px] text-adm-mute">{label}</span>
      <span className="text-right text-[15px]">{value || "—"}</span>
    </div>
  );
}
