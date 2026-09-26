import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile, type Profile } from "@/lib/auth";
import { currentRules } from "@/lib/onboarding-rules";
import { loadAccount, loadPhotos, requiredDocs } from "@/lib/profile";
import { REVIEW_MODEL, reviewAccount } from "@/lib/review-account";

// The AI looks at the photos as well, so this takes longer than a normal
// request. Same allowance as reading the document.
export const maxDuration = 60;

// After this many send-backs in a row, the supplier is stuck and the admin is
// told, so somebody can help them. The AI still does not approve.
const STUCK_AFTER = 3;

/**
 * Send the account for approval.
 *
 * There is no human in the loop. The AI checks the account against the
 * onboarding rules and either approves it, or sends it back with a note
 * saying what to fix.
 */
export async function POST() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  if (profile.status === "approved") {
    return NextResponse.json(
      { error: "Your account is already approved" },
      { status: 400 },
    );
  }

  if (profile.status === "suspended") {
    return NextResponse.json(
      { error: "Your account is on hold. Please get in touch with us." },
      { status: 400 },
    );
  }

  const account = await loadAccount(profile);

  if (!account.ready) {
    return NextResponse.json(
      { error: "Some things are still missing", missing: account.missing },
      { status: 400 },
    );
  }

  const rules = await currentRules();

  if (!rules) {
    console.error("no onboarding rules in the database");
    return NextResponse.json(
      { error: "We cannot check accounts right now. Please try again later." },
      { status: 503 },
    );
  }

  const needed = requiredDocs(profile.account_type, profile.id_doc_type);
  const { photos } = await loadPhotos(profile.id, needed);

  let answer;
  try {
    answer = await reviewAccount({
      rules: rules.content,
      facts: await gatherFacts(profile, account),
      photos,
    });
  } catch (error) {
    console.error("checking the account failed:", error);
    return NextResponse.json(
      { error: "We could not check your account. Please try again." },
      { status: 502 },
    );
  }

  const admin = createAdminClient();
  const approved = answer.decision === "approve";
  const sentBackCount = approved ? 0 : profile.send_back_count + 1;

  await admin.from("account_reviews").insert({
    profile_id: profile.id,
    decision: approved ? "approved" : "sent_back",
    summary: answer.summary,
    issues: answer.issues,
    rules_version: rules.version,
    model: REVIEW_MODEL,
  });

  // The service key is used on purpose: a normal session cannot change its
  // own status, the database trigger puts it back.
  const { data, error } = await admin
    .from("profiles")
    .update({
      // Sent back means the account is theirs to fix again.
      status: approved ? "approved" : "incomplete",
      submitted_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      review_summary: answer.summary,
      send_back_count: sentBackCount,
    })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // TODO email: when approved, a short welcome to the supplier. When sent
  // back, the note above to the supplier. Waiting on the Resend key.
  // TODO email: at STUCK_AFTER send-backs in a row, tell the admin this
  // supplier is stuck, with the history.

  return NextResponse.json({
    profile: data,
    decision: answer.decision,
    summary: answer.summary,
    issues: answer.issues,
    stuck: !approved && sentBackCount >= STUCK_AFTER,
  });
}

/** Everything the AI is told about this account, and nothing else. */
async function gatherFacts(
  profile: Profile,
  account: Awaited<ReturnType<typeof loadAccount>>,
) {
  return {
    today: new Date().toISOString().slice(0, 10),
    role: profile.role,
    account_type: profile.account_type,
    account_name: profile.full_name,
    company_name: profile.company_name,
    pan_vat: profile.pan_vat,
    phone: profile.phone,
    country: profile.country,
    district: profile.district,
    city: profile.city,
    bank_account: account.bank,
    id_document_type: profile.id_doc_type,
    details_read_off_the_document: account.identity,
    document_number_already_used_by_another_account:
      await documentNumberUsedElsewhere(profile.id, account.identity?.document_number),
    times_sent_back_before: profile.send_back_count,
  };
}

/**
 * One document, one account. The same number twice means something is wrong.
 *
 * Only accounts that got somewhere count. A half-finished account that was
 * abandoned must not lock the real owner of the document out for good.
 */
async function documentNumberUsedElsewhere(
  profileId: string,
  documentNumber: string | null | undefined,
) {
  if (!documentNumber) return false;

  const admin = createAdminClient();
  const { data: others } = await admin
    .from("identity_details")
    .select("profile_id")
    .eq("document_number", documentNumber)
    .neq("profile_id", profileId);

  const ids = (others ?? []).map((row) => row.profile_id);
  if (ids.length === 0) return false;

  const { data: live } = await admin
    .from("profiles")
    .select("id")
    .in("id", ids)
    .in("status", ["pending", "approved", "suspended"])
    .limit(1);

  return (live ?? []).length > 0;
}
