import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { type Profile } from "@/lib/auth";
import { loadAccount, withSignedUrls } from "@/lib/profile";
import { can, maskAccountNumber, record, requireStaff } from "@/lib/staff";

/**
 * One supplier, in full. What comes back depends on the jobs this staff
 * member holds: the ID photos need `documents.view`, and the whole bank
 * account number needs `bank.view_full`. Every look is written down.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { staff, error, status } = await requireStaff("suppliers.read");
  if (!staff) return NextResponse.json({ error }, { status });

  const { id } = await params;
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const account = await loadAccount(profile as Profile);

  const { data: reviews } = await admin
    .from("account_reviews")
    .select("decision, summary, issues, rules_version, created_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: false });

  const seesDocuments = can(staff, "documents.view");
  const seesBank = can(staff, "bank.view_full");

  await record(staff.id, "supplier.viewed", id, {
    documents: seesDocuments,
    bank_in_full: seesBank,
  });

  return NextResponse.json({
    ...account,
    bank: account.bank && {
      ...account.bank,
      account_number: seesBank
        ? account.bank.account_number
        : maskAccountNumber(account.bank.account_number),
    },
    // Without the right job the files are listed but cannot be opened.
    documents: seesDocuments
      ? await withSignedUrls(account.documents)
      : account.documents.map((doc) => ({ ...doc, url: null })),
    reviews: reviews ?? [],
    you: { jobs: staff.jobs, sees_documents: seesDocuments, sees_bank: seesBank },
  });
}

/**
 * The admin's own hands: stepping in on a stuck account, or pulling an
 * approval back. The everyday approvals are the AI's job.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { staff, error, status } = await requireStaff("suppliers.decide");
  if (!staff) return NextResponse.json({ error }, { status });

  const { id } = await params;
  const { status: wanted, reason } = await request.json();

  const allowed = ["approved", "rejected", "suspended"];

  if (!allowed.includes(wanted)) {
    return NextResponse.json(
      { error: "status must be approved, rejected or suspended" },
      { status: 400 },
    );
  }

  const note = typeof reason === "string" ? reason.trim() : "";

  // Saying no to somebody without saying why is not something we do.
  if (wanted !== "approved" && !note) {
    return NextResponse.json(
      { error: "Say why, so the supplier can be told" },
      { status: 400 },
    );
  }

  const summary = note || "Your account has been approved.";
  const admin = createAdminClient();

  await admin.from("account_reviews").insert({
    profile_id: id,
    decision: `admin_${wanted}`,
    summary,
    issues: [],
    decided_by: staff.id,
  });

  const { data, error: failed } = await admin
    .from("profiles")
    .update({
      status: wanted,
      review_summary: summary,
      reviewed_at: new Date().toISOString(),
      send_back_count: 0,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (failed) {
    return NextResponse.json({ error: failed.message }, { status: 400 });
  }

  await record(staff.id, "supplier.decided", id, { decision: wanted });

  // TODO email: tell the supplier. Waiting on the Resend key.

  return NextResponse.json({ profile: data });
}
