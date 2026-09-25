import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { currentRules, saveRules } from "@/lib/onboarding-rules";

/**
 * The onboarding rules the AI follows. GET reads the current version, PUT
 * saves an edited one as the next version. The old versions are kept.
 */

export async function GET() {
  const profile = await getCurrentProfile();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  return NextResponse.json({ rules: await currentRules() });
}

export async function PUT(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: { content?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (content.length < 100) {
    return NextResponse.json(
      { error: "The rules cannot be this short. Send the whole document." },
      { status: 400 },
    );
  }

  return NextResponse.json({ rules: await saveRules(content, profile.id) });
}
