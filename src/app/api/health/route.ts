import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase.auth.getUser();

  if (error && error.status !== 400 && error.status !== 401) {
    return NextResponse.json(
      { connected: false, message: error.message },
      { status: 500 },
    );
  }

  // Which database changes this site is actually running on. If this is older
  // than the newest file in supabase/migrations, the database is behind.
  const { data } = await createAdminClient()
    .from("schema_migrations")
    .select("name")
    .order("name", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    connected: true,
    database: data?.name ?? "no migrations applied",
  });
}
