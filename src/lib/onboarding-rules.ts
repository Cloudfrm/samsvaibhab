import { createAdminClient } from "@/utils/supabase/admin";

export type OnboardingRules = {
  version: number;
  content: string;
};

/**
 * The rules the AI follows when it decides on a new account. The newest
 * version wins. Editing the rules takes effect on the very next check, with
 * no code change and no deploy.
 */
export async function currentRules(): Promise<OnboardingRules | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("onboarding_rules")
    .select("version, content")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data ?? null) as OnboardingRules | null;
}

/** Save an edited rules document as the next version. */
export async function saveRules(content: string, editedBy: string | null) {
  const admin = createAdminClient();
  const latest = await currentRules();

  const { data, error } = await admin
    .from("onboarding_rules")
    .insert({
      version: (latest?.version ?? 0) + 1,
      content,
      created_by: editedBy,
    })
    .select("version, content, created_at")
    .single();

  if (error) throw new Error(error.message);

  return data;
}
