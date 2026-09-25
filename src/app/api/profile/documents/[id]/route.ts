import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { DOCS_BUCKET } from "@/lib/profile";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: document } = await admin
    .from("verification_documents")
    .select("id, file_path")
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await admin.storage.from(DOCS_BUCKET).remove([document.file_path]);
  await admin.from("verification_documents").delete().eq("id", document.id);

  return NextResponse.json({ deleted: true });
}
