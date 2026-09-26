import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const dryRun = process.argv.includes("--dry-run");

const { data: profiles, error } = await admin
  .from("profiles")
  .select("id, email, role, status")
  .eq("role", "supplier")
  .or("email.ilike.ui-%@example.com,email.ilike.browser-%@example.com");

if (error) {
  console.error(error);
  process.exit(1);
}

console.log(`Found ${profiles.length} test supplier accounts to remove:`);
for (const p of profiles) console.log(" -", p.email, p.role, p.status);

if (dryRun) {
  console.log("\nDry run only, nothing deleted. Re-run without --dry-run to delete.");
  process.exit(0);
}

for (const p of profiles) {
  const { data: docs } = await admin
    .from("verification_documents")
    .select("file_path")
    .eq("profile_id", p.id);

  for (const doc of docs ?? []) {
    await admin.storage.from("verification-docs").remove([doc.file_path]);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(p.id);
  if (delErr) {
    console.error(`  failed to delete ${p.email}:`, delErr.message);
  } else {
    console.log(`  deleted ${p.email} (and ${docs?.length ?? 0} file(s))`);
  }
}

const { data: remaining } = await admin
  .from("profiles")
  .select("id, email, role, status");
console.log("\nRemaining profiles:", remaining);
