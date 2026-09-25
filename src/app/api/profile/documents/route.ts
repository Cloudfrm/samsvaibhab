import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import {
  ALLOWED_MIME,
  DOC_LABELS,
  DOCS_BUCKET,
  ID_DOC_MIME,
  MAX_FILE_BYTES,
  isIdDoc,
  requiredDocs,
  withSignedUrls,
  type DocumentRow,
} from "@/lib/profile";

const SELECT =
  "id, doc_type, file_path, file_name, mime_type, size_bytes, status, notes, created_at";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function GET() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("verification_documents")
    .select(SELECT)
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: true });

  const documents = (data ?? []) as DocumentRow[];
  const needed = requiredDocs(profile.account_type, profile.id_doc_type);

  return NextResponse.json({
    documents: await withSignedUrls(documents),
    needed: needed.map((doc_type) => ({
      doc_type,
      label: DOC_LABELS[doc_type],
      uploaded: documents.some((d) => d.doc_type === doc_type),
    })),
  });
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  if (!profile.account_type) {
    return NextResponse.json(
      { error: "Choose individual or company first" },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Send the file as form data" },
      { status: 400 },
    );
  }

  const docType = String(form.get("doc_type") ?? "");
  const file = form.get("file");
  const allowed = requiredDocs(profile.account_type, profile.id_doc_type);

  if (profile.account_type === "individual" && !profile.id_doc_type) {
    return NextResponse.json(
      { error: "Choose which ID document you have first" },
      { status: 400 },
    );
  }

  if (!allowed.includes(docType)) {
    return NextResponse.json(
      { error: "Not a document we ask for", allowed },
      { status: 400 },
    );
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file sent" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File is too big. Keep it under 5 MB." },
      { status: 400 },
    );
  }

  // The AI has to look at an ID document, so those must be pictures.
  if (isIdDoc(docType)) {
    if (!ID_DOC_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: "Send a photo of the document: JPG, PNG or WEBP" },
        { status: 400 },
      );
    }
  } else if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, WEBP or PDF files are allowed" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const path = `${profile.id}/${docType}-${Date.now()}.${EXTENSIONS[file.type]}`;

  const { error: uploadError } = await admin.storage
    .from(DOCS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  // Re-uploading replaces the old file of the same type.
  const { data: old } = await admin
    .from("verification_documents")
    .select("file_path")
    .eq("profile_id", profile.id)
    .eq("doc_type", docType)
    .maybeSingle();

  const { data, error } = await admin
    .from("verification_documents")
    .upsert(
      {
        profile_id: profile.id,
        doc_type: docType,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        status: "pending",
        reviewed_at: null,
        reviewed_by: null,
      },
      { onConflict: "profile_id,doc_type" },
    )
    .select(SELECT)
    .single();

  if (error) {
    await admin.storage.from(DOCS_BUCKET).remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (old?.file_path && old.file_path !== path) {
    await admin.storage.from(DOCS_BUCKET).remove([old.file_path]);
  }

  const [document] = await withSignedUrls([data as DocumentRow]);

  return NextResponse.json({ document }, { status: 201 });
}
