import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireStaff } from "@/lib/staff";

/** Who looked at what, and who changed what. Newest first. */
export async function GET(request: NextRequest) {
  const { staff, error, status } = await requireStaff("activity.read");
  if (!staff) return NextResponse.json({ error }, { status });

  const { searchParams } = request.nextUrl;
  const admin = createAdminClient();

  let query = admin
    .from("activity_log")
    .select("id, action, subject_id, details, created_at, staff (email, full_name)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(searchParams.get("limit") ?? 100), 500));

  const subject = searchParams.get("subject_id");
  const action = searchParams.get("action");
  if (subject) query = query.eq("subject_id", subject);
  if (action) query = query.eq("action", action);

  const { data, error: failed } = await query;

  if (failed) {
    return NextResponse.json({ error: failed.message }, { status: 400 });
  }

  return NextResponse.json({ activity: data });
}
