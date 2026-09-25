import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const supabase = await createClient();
  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });

  const status = searchParams.get("status");
  const role = searchParams.get("role");
  if (status) query = query.eq("status", status);
  if (role) query = query.eq("role", role);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ users: data });
}
