import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const profile = await getCurrentProfile();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { slug } = await params;
  const { title, content, is_published } = await request.json();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("pages")
    .select("id, title, content, version")
    .eq("slug", slug)
    .single();

  if (!existing) {
    const { data, error } = await supabase
      .from("pages")
      .insert({ slug, title, content, updated_by: profile.id })
      .select("*")
      .single();

    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json({ page: data, created: true });
  }

  const { data, error } = await supabase
    .from("pages")
    .update({
      title: title ?? existing.title,
      content: content ?? existing.content,
      ...(is_published === undefined ? {} : { is_published }),
      version: existing.version + 1,
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    })
    .eq("slug", slug)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ page: data });
}
