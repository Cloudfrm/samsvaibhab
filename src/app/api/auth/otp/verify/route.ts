import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { recordTermsAcceptance } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { phone, code, role, accepted } = await request.json();

  if (role !== "supplier" && role !== "buyer") {
    return NextResponse.json(
      { error: "Choose supplier or buyer first" },
      { status: 400 },
    );
  }

  if (typeof phone !== "string" || typeof code !== "string") {
    return NextResponse.json({ error: "Enter the code we sent" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: code,
    type: "sms",
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "That code did not work" },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profile && !profile.role) {
    await admin.from("profiles").update({ role, phone }).eq("id", data.user.id);
  }

  if (accepted) {
    await recordTermsAcceptance(
      admin,
      data.user.id,
      role,
      request.headers.get("x-forwarded-for"),
    );
  }

  return NextResponse.json({ loggedIn: true });
}
