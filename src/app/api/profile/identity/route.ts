import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { cleanFields } from "@/lib/identity";
import { readDocument } from "@/lib/read-document";
import { DOCS_BUCKET, requiredDocs, type DocumentRow } from "@/lib/profile";

// Reading the photos takes 5 to 15 seconds, so the default limit is too short.
export const maxDuration = 60;

/**
 * POST — read the uploaded photos and give back the details. Nothing is saved.
 * PUT  — save the details the supplier has checked and corrected.
 */

/** The photos this supplier has uploaded, in the order we ask for them. */
async function loadPhotos(profileId: string, needed: string[]) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("verification_documents")
    .select("doc_type, file_path, mime_type")
    .eq("profile_id", profileId)
    .in("doc_type", needed);

  const rows = (data ?? []) as Pick<
    DocumentRow,
    "doc_type" | "file_path" | "mime_type"
  >[];

  const missing = needed.filter((t) => !rows.some((r) => r.doc_type === t));
  if (missing.length > 0) return { missing, photos: [] };

  const byType = new Map(rows.map((r) => [r.doc_type, r]));

  const photos = await Promise.all(
    needed.map(async (docType) => {
      const row = byType.get(docType)!;
      const { data: file } = await admin.storage
        .from(DOCS_BUCKET)
        .download(row.file_path);

      const bytes = Buffer.from(await file!.arrayBuffer());
      return {
        mimeType: row.mime_type ?? "image/jpeg",
        base64: bytes.toString("base64"),
      };
    }),
  );

  return { missing: [], photos };
}

export async function POST() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  if (profile.account_type !== "individual" || !profile.id_doc_type) {
    return NextResponse.json(
      { error: "Choose which ID document you have first" },
      { status: 400 },
    );
  }

  const needed = requiredDocs(profile.account_type, profile.id_doc_type);
  const { missing, photos } = await loadPhotos(profile.id, needed);

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Upload every photo first", missing },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // One read per set of photos. Reading the same photos again costs money and
  // gives the same answer, so we only allow it after a new photo comes in.
  const { data: newest } = await admin
    .from("verification_documents")
    .select("created_at")
    .eq("profile_id", profile.id)
    .in("doc_type", needed)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profile.id_read_at && newest && newest.created_at <= profile.id_read_at) {
    return NextResponse.json(
      {
        error: "We have already read these photos. Fill the form in by hand, or upload a clearer photo.",
        already_read: true,
      },
      { status: 409 },
    );
  }

  await admin
    .from("profiles")
    .update({ id_read_at: new Date().toISOString() })
    .eq("id", profile.id);

  let result;
  try {
    result = await readDocument(profile.id_doc_type, photos);
  } catch (error) {
    console.error("reading the document failed:", error);
    return NextResponse.json(
      { error: "We could not read the document. Please fill the form in by hand." },
      { status: 502 },
    );
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 422 });
  }

  // Given back to be checked, not saved. Saving happens in PUT.
  return NextResponse.json({ fields: result.fields });
}

export async function PUT(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  if (profile.account_type !== "individual" || !profile.id_doc_type) {
    return NextResponse.json(
      { error: "Choose which ID document you have first" },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const needed = requiredDocs(profile.account_type, profile.id_doc_type);
  const { missing } = await loadPhotos(profile.id, needed);

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Upload every photo first", missing },
      { status: 400 },
    );
  }

  const fields = cleanFields(profile.id_doc_type, body);

  if (!fields.document_number) {
    return NextResponse.json(
      { error: "The document number is needed", errors: { document_number: "Fill this in" } },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("identity_details")
    .upsert(
      {
        ...fields,
        profile_id: profile.id,
        doc_type: profile.id_doc_type,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ identity: data });
}

export async function GET() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("identity_details")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return NextResponse.json({ identity: data ?? null });
}
