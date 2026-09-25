import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { loadAccount } from "@/lib/profile";

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

  const account = await loadAccount(profile);

  if (!account.ready) {
    return NextResponse.json(
      { error: "Some things are still missing", missing: account.missing },
      { status: 400 },
    );
  }

  // The service key is used on purpose: a normal session cannot change its
  // own status, the database trigger puts it back.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ status: "pending", submitted_at: new Date().toISOString() })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ profile: data });
}
