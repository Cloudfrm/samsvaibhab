import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

const PROVIDERS = ["google", "facebook"] as const;
type Provider = (typeof PROVIDERS)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  if (!PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json(
      { error: `Login with ${provider} is not supported` },
      { status: 404 },
    );
  }

  const role = request.nextUrl.searchParams.get("role");

  if (role !== "supplier" && role !== "buyer") {
    return NextResponse.json(
      { error: "Add ?role=supplier or ?role=buyer" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: { redirectTo: `${request.nextUrl.origin}/api/auth/callback` },
  });

  if (error || !data.url) {
    return NextResponse.json(
      { error: error?.message ?? "Could not start login" },
      { status: 500 },
    );
  }

  const response = NextResponse.redirect(data.url);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 600,
    path: "/",
  };

  response.cookies.set("sv_signup_role", role, cookieOptions);

  if (request.nextUrl.searchParams.get("accepted") === "1") {
    response.cookies.set("sv_accepted_terms", "1", cookieOptions);
  }

  return response;
}
