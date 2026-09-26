import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { record, requireStaff } from "@/lib/staff";

const SELECT = "id, email, full_name, is_active, created_at, staff_jobs (job_key)";

/** Everybody who works in the control room, and the jobs they hold. */
export async function GET() {
  const { staff, error, status } = await requireStaff("staff.manage");
  if (!staff) return NextResponse.json({ error }, { status });

  const admin = createAdminClient();

  const [{ data: people }, { data: jobs }] = await Promise.all([
    admin.from("staff").select(SELECT).order("created_at"),
    admin.from("jobs").select("key, label, description, permissions").order("key"),
  ]);

  return NextResponse.json({ staff: people ?? [], jobs: jobs ?? [] });
}

/**
 * Add somebody. They are added by email, before they have ever logged in;
 * the first time they log in with that email they land in the control room.
 */
export async function POST(request: NextRequest) {
  const { staff, error, status } = await requireStaff("staff.manage");
  if (!staff) return NextResponse.json({ error }, { status });

  let body: { email?: unknown; full_name?: unknown; jobs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const wanted = Array.isArray(body.jobs)
    ? body.jobs.filter((j): j is string => typeof j === "string")
    : [];

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That is not an email" }, { status: 400 });
  }

  if (wanted.length === 0) {
    return NextResponse.json(
      { error: "Give them at least one job" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: real } = await admin.from("jobs").select("key").in("key", wanted);
  const known = (real ?? []).map((j) => j.key);
  const unknown = wanted.filter((j) => !known.includes(j));

  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `No such job: ${unknown.join(", ")}` },
      { status: 400 },
    );
  }

  const { data: person, error: failed } = await admin
    .from("staff")
    .insert({
      email,
      full_name: typeof body.full_name === "string" ? body.full_name : null,
      added_by: staff.id,
    })
    .select("id")
    .single();

  if (failed) {
    const already = failed.code === "23505";
    return NextResponse.json(
      { error: already ? "That person is already staff" : failed.message },
      { status: 400 },
    );
  }

  await admin
    .from("staff_jobs")
    .insert(known.map((job_key) => ({ staff_id: person.id, job_key })));

  await record(staff.id, "staff.added", person.id, { email, jobs: known });

  return NextResponse.json({ staff: { id: person.id, email, jobs: known } }, { status: 201 });
}
