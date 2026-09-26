import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Who works in the control room, and what they are allowed to do.
 *
 * A staff member holds one or more jobs. A job carries a list of permissions.
 * Every admin endpoint asks one question: does this person have this
 * permission. Nothing asks "are they an admin" any more.
 */

export type Permission =
  | "staff.manage"
  | "suppliers.read"
  | "suppliers.decide"
  | "documents.view"
  | "bank.view_full"
  | "rules.read"
  | "rules.edit"
  | "pages.edit"
  | "activity.read";

export type Staff = {
  id: string;
  email: string;
  full_name: string | null;
  jobs: string[];
  permissions: string[];
};

/** The owner holds this instead of a list. It opens every door. */
const EVERYTHING = "*";

export function can(staff: Staff | null, permission: Permission) {
  if (!staff) return false;
  return (
    staff.permissions.includes(EVERYTHING) ||
    staff.permissions.includes(permission)
  );
}

/**
 * The staff member making this request, or null.
 *
 * A staff row is added by email, often before that person has ever logged in.
 * The first time they do, their login is joined to the row here.
 */
export async function currentStaff(): Promise<Staff | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user?.email) return null;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("staff")
    .select("id, email, full_name, user_id, is_active")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (!row || !row.is_active) return null;

  if (row.user_id !== user.id) {
    await admin.from("staff").update({ user_id: user.id }).eq("id", row.id);
  }

  const { data: jobs } = await admin
    .from("staff_jobs")
    .select("job_key, jobs (permissions)")
    .eq("staff_id", row.id);

  // The joined job comes back as a list of one.
  const held = (jobs ?? []) as unknown as {
    job_key: string;
    jobs: { permissions: string[] }[] | { permissions: string[] } | null;
  }[];

  const permissionsOf = (job: (typeof held)[number]) => {
    const side = job.jobs;
    if (!side) return [];
    return Array.isArray(side)
      ? side.flatMap((j) => j.permissions)
      : side.permissions;
  };

  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    jobs: held.map((j) => j.job_key),
    permissions: [...new Set(held.flatMap(permissionsOf))],
  };
}

/**
 * The gate every admin endpoint starts with. Gives back the staff member, or
 * the response to send straight back.
 */
export async function requireStaff(permission: Permission) {
  const staff = await currentStaff();

  if (!staff) return { staff: null, error: "Staff only", status: 403 } as const;

  if (!can(staff, permission)) {
    return {
      staff: null,
      error: "That is not part of your job here",
      status: 403,
    } as const;
  }

  return { staff, error: null, status: 200 } as const;
}

/** Write down who did what. Never blocks the request it is recording. */
export async function record(
  staffId: string,
  action: string,
  subjectId: string | null,
  details: Record<string, unknown> = {},
) {
  const admin = createAdminClient();
  const { error } = await admin.from("activity_log").insert({
    staff_id: staffId,
    action,
    subject_id: subjectId,
    details,
  });

  if (error) console.error("could not write the activity log:", error.message);
}

/**
 * A bank account number nobody has the right to see in full. The last four
 * digits are enough to tell two accounts apart.
 */
export function maskAccountNumber(value: string | null) {
  if (!value) return value;
  const tail = value.slice(-4);
  return `${"•".repeat(Math.max(value.length - 4, 0))}${tail}`;
}
