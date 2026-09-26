import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { record, requireStaff } from "@/lib/staff";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { staff, error: refused, status } = await requireStaff("pages.edit");
  if (!staff) return NextResponse.json({ error: refused }, { status });

  const { slug } = await params;
  const { title, content, is_published } = await request.json();
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("pages")
    .select("id, title, content, version")
    .eq("slug", slug)
    .single();

  if (!existing) {
    const { data, error } = await supabase
      .from("pages")
      .insert({ slug, title, content })
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
    })
    .eq("slug", slug)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await record(staff.id, "page.updated", null, { slug });

  return NextResponse.json({ page: data });
}
