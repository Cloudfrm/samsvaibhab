import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

const EDITABLE = [
  "account_type",
  "full_name",
  "company_name",
  "registration_number",
  "phone",
  "country",
  "district",
  "details",
] as const;

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await request.json();
  const update: Record<string, unknown> = {};

  for (const field of EDITABLE) {
    if (field in body) update[field] = body[field];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", auth.user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ profile: data });
}
