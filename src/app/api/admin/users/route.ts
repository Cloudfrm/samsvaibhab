import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireStaff } from "@/lib/staff";

/**
 * The supplier list. Name, phone and email is all the list itself shows; the
 * rest is on the one-person page.
 */
export async function GET(request: NextRequest) {
  const { staff, error, status } = await requireStaff("suppliers.read");
  if (!staff) return NextResponse.json({ error }, { status });

  const { searchParams } = request.nextUrl;
  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select(
      "id, full_name, company_name, email, phone, role, account_type, status, district, send_back_count, review_summary, reviewed_at, created_at",
    )
    .order("created_at", { ascending: false });

  const accountStatus = searchParams.get("status");
  const role = searchParams.get("role");
  const search = searchParams.get("q");

  if (accountStatus) query = query.eq("status", accountStatus);
  if (role) query = query.eq("role", role);

  // One box that looks in the three things the list shows.
  if (search) {
    const like = `%${search.replace(/[%,]/g, "")}%`;
    query = query.or(
      `full_name.ilike.${like},company_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
    );
  }

  const { data, error: failed } = await query;

  if (failed) {
    return NextResponse.json({ error: failed.message }, { status: 400 });
  }

  return NextResponse.json({ users: data });
}
