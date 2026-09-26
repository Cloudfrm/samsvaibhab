import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import {
  ACCOUNT_TYPES,
  ID_DOC_TYPES,
  clearIdDocuments,
  isValidPhone,
  loadAccount,
  normalisePhone,
  withSignedUrls,
  type AccountType,
  type IdDocType,
} from "@/lib/profile";

const TEXT_FIELDS = [
  "full_name",
  "company_name",
  "registration_number",
  "pan_vat",
  "id_number",
  "city",
  "delivery_location",
  "state",
  "pin_code",
  "special_requirement",
] as const;

// These belong to the buyer form only.
const BUYER_FIELDS = [
  "city",
  "delivery_location",
  "state",
  "pin_code",
  "special_requirement",
] as const;

const MAX_LENGTH = 200;

export async function GET() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const account = await loadAccount(profile);

  return NextResponse.json({
    ...account,
    documents: await withSignedUrls(account.documents),
  });
}

export async function PATCH(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  const errors: Record<string, string> = {};

  // An empty box means "clear this", not "save an empty string".
  const text = (value: unknown) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  if ("account_type" in body) {
    const value = text(body.account_type);
    if (value && !ACCOUNT_TYPES.includes(value as AccountType)) {
      errors.account_type = "Choose individual or company";
    } else {
      update.account_type = value;
    }
  }

  // Step 4: which ID document the supplier says they have.
  let idDocTypeChanged = false;

  if ("id_doc_type" in body) {
    const value = text(body.id_doc_type);
    if (value && !ID_DOC_TYPES.includes(value as IdDocType)) {
      errors.id_doc_type = "Choose citizenship or national identity";
    } else {
      update.id_doc_type = value;
      idDocTypeChanged = value !== profile.id_doc_type;
    }
  }

  for (const field of TEXT_FIELDS) {
    if (!(field in body)) continue;
    const value = text(body[field]);
    if (value && value.length > MAX_LENGTH) {
      errors[field] = `Keep this under ${MAX_LENGTH} characters`;
    } else {
      update[field] = value;
    }
  }

  if ("phone" in body) {
    const value = text(body.phone);
    if (value && !isValidPhone(value)) {
      errors.phone = "Enter a phone number with 7 to 15 digits";
    } else {
      update.phone = value ? normalisePhone(value) : null;
    }
  }

  const role = profile.role;
  const admin = createAdminClient();

  if ("country" in body) {
    const value = text(body.country)?.toUpperCase() ?? null;

    if (value) {
      const { data: country } = await admin
        .from("countries")
        .select("code")
        .eq("code", value)
        .maybeSingle();

      if (!country) {
        errors.country = "Not a country we know";
      } else if (role === "supplier" && value !== "NP") {
        errors.country = "Suppliers must be in Nepal";
      } else {
        update.country = value;
      }
    } else {
      update.country = null;
    }
  }

  if ("district" in body) {
    const value = text(body.district);

    if (role !== "supplier") {
      errors.district = "District is only for suppliers";
    } else if (value) {
      const { data: district } = await admin
        .from("districts")
        .select("name")
        .eq("name", value)
        .maybeSingle();

      if (!district) {
        errors.district = "Not a district of Nepal";
      } else {
        update.district = value;
      }
    } else {
      update.district = null;
    }
  }

  for (const field of BUYER_FIELDS) {
    if (field in body && role === "supplier") {
      delete update[field];
      errors[field] = "This is only for buyers";
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { error: "Some details are not right", errors },
      { status: 400 },
    );
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Old photos belong to the old document, so they go before the swap.
  if (idDocTypeChanged) {
    await clearIdDocuments(profile.id);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const account = await loadAccount(data);

  return NextResponse.json({
    profile: account.profile,
    missing: account.missing,
    ready: account.ready,
  });
}
