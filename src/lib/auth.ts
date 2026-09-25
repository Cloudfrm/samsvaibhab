import { createClient } from "@/utils/supabase/server";

export type Profile = {
  id: string;
  role: "supplier" | "buyer" | "admin" | null;
  account_type: "individual" | "company" | null;
  status: "pending" | "approved" | "rejected";
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  registration_number: string | null;
  phone: string | null;
  country: string | null;
  district: string | null;
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
