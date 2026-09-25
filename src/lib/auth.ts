import { createClient } from "@/utils/supabase/server";

export type Profile = {
  id: string;
  role: "supplier" | "buyer" | "admin" | null;
  account_type: "individual" | "company" | null;
  status: "incomplete" | "pending" | "approved" | "rejected" | "suspended";
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  registration_number: string | null;
  pan_vat: string | null;
  id_number: string | null;
  id_doc_type: "citizenship" | "nid_card" | "nid_paper" | null;
  id_read_at: string | null;
  phone: string | null;
  country: string | null;
  district: string | null;
  city: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_summary: string | null;
  send_back_count: number;
  details: Record<string, unknown>;
};

export async function getCurrentProfile() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();

  return profile as Profile | null;
}

export async function isAdmin() {
  const profile = await getCurrentProfile();
  return profile?.role === "admin";
}

type AdminClient = ReturnType<typeof import("@/utils/supabase/admin").createAdminClient>;

export async function recordTermsAcceptance(
  admin: AdminClient,
  userId: string,
  role: "supplier" | "buyer",
  ip: string | null,
) {
  const { data: page } = await admin
    .from("pages")
    .select("id, version")
    .eq("slug", `terms-${role}`)
    .single();

  if (!page) return;

  await admin.from("page_acceptances").insert({
    profile_id: userId,
    page_id: page.id,
    version: page.version,
    ip,
  });
}
