import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";

/**
 * Someone who signed in without going through /join has no role yet. The form
 * asks them once. It can only ever be set when it is still empty.
 */
export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  if (profile.role) {
    return NextResponse.json(
      { error: "Your account type is already set" },
      { status: 400 },
    );
  }

  const { role } = await request.json().catch(() => ({ role: null }));

  if (role !== "supplier" && role !== "buyer") {
    return NextResponse.json(
      { error: "Choose supplier or buyer" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", profile.id)
    .is("role", null)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ profile: data });
}
