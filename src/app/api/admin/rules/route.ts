import { NextResponse, type NextRequest } from "next/server";
import { currentRules, saveRules } from "@/lib/onboarding-rules";
import { record, requireStaff } from "@/lib/staff";

/**
 * The onboarding rules the AI follows. GET reads the current version, PUT
 * saves an edited one as the next version. The old versions are kept.
 */

export async function GET() {
  const { staff, error, status } = await requireStaff("rules.read");
  if (!staff) return NextResponse.json({ error }, { status });

  return NextResponse.json({ rules: await currentRules() });
}

export async function PUT(request: NextRequest) {
  const { staff, error, status } = await requireStaff("rules.edit");
  if (!staff) return NextResponse.json({ error }, { status });

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

  const saved = await saveRules(content, null);
  await record(staff.id, "rules.updated", null, { version: saved.version });

  return NextResponse.json({ rules: saved });
}
