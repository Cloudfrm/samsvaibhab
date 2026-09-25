import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { recordTermsAcceptance } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const providerError = params.get("error_description") ?? params.get("error");

  if (providerError) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(providerError)}`, request.nextUrl.origin),
    );
  }

  const code = params.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "Login failed" },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  // First login: save the role they picked before going to Google.
  const chosenRole = request.cookies.get("sv_signup_role")?.value;
  let current = profile;

  if (profile && !profile.role && (chosenRole === "supplier" || chosenRole === "buyer")) {
    const { data: updated } = await admin
      .from("profiles")
      .update({ role: chosenRole, full_name: profile.full_name ?? data.user.user_metadata?.name })
      .eq("id", data.user.id)
      .select("*")
      .single();
    current = updated ?? profile;
  }

  if (
    request.cookies.get("sv_accepted_terms")?.value === "1" &&
    (current?.role === "supplier" || current?.role === "buyer")
  ) {
    await recordTermsAcceptance(
      admin,
      data.user.id,
      current.role,
      request.headers.get("x-forwarded-for"),
    );
  }

  const response = NextResponse.redirect(new URL("/account", request.nextUrl.origin));
  response.cookies.delete("sv_signup_role");
  response.cookies.delete("sv_accepted_terms");

  return response;
}
