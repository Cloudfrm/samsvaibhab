import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile, isAdmin, type Profile } from "@/lib/auth";
import { loadAccount, withSignedUrls } from "@/lib/profile";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

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

  return NextResponse.json({
    ...account,
    documents: await withSignedUrls(account.documents),
    reviews: reviews ?? [],
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentProfile();

  if (me?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { id } = await params;
  const { status, reason } = await request.json();

  // The AI does the normal approvals. These are the admin's own hands:
  // stepping in on a stuck account, or pulling an approval back.
  const allowed = ["approved", "rejected", "suspended"];

  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: "status must be approved, rejected or suspended" },
      { status: 400 },
    );
  }

  const note = typeof reason === "string" ? reason.trim() : "";

  // Saying no to somebody without saying why is not something we do.
  if (status !== "approved" && !note) {
    return NextResponse.json(
      { error: "Say why, so the supplier can be told" },
      { status: 400 },
    );
  }

  const summary = note || "Your account has been approved.";
  const admin = createAdminClient();

  await admin.from("account_reviews").insert({
    profile_id: id,
    decision: `admin_${status}`,
    summary,
    issues: [],
    decided_by: me.id,
  });

  const { data, error } = await admin
    .from("profiles")
    .update({
      status,
      review_summary: summary,
      reviewed_at: new Date().toISOString(),
      send_back_count: 0,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // TODO email: tell the supplier. Waiting on the Resend key.

  return NextResponse.json({ profile: data });
}
