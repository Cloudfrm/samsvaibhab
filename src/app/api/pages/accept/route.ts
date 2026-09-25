import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { slug } = await request.json();
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("pages")
    .select("id, version")
    .eq("slug", slug)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("page_acceptances")
    .insert({
      profile_id: profile.id,
      page_id: page.id,
      version: page.version,
      ip: request.headers.get("x-forwarded-for"),
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ accepted: data });
}
