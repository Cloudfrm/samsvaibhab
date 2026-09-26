import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { record, requireStaff } from "@/lib/staff";

/**
 * Change somebody's jobs, or switch them off. Switching off is how somebody
 * leaves: their history stays, their way in does not.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { staff, error, status } = await requireStaff("staff.manage");
  if (!staff) return NextResponse.json({ error }, { status });

  const { id } = await params;

  let body: { jobs?: unknown; is_active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: person } = await admin
    .from("staff")
    .select("id, email")
    .eq("id", id)
    .maybeSingle();

  if (!person) {
    return NextResponse.json({ error: "No such staff member" }, { status: 404 });
  }

  const turningOff = body.is_active === false;
  const jobs = Array.isArray(body.jobs)
    ? body.jobs.filter((j): j is string => typeof j === "string")
    : null;

  // There is always at least one owner. Otherwise nobody can let anybody in.
  const losingOwner = turningOff || (jobs !== null && !jobs.includes("owner"));

  if (losingOwner && (await isLastOwner(id))) {
    return NextResponse.json(
      { error: "This is the last owner. Make somebody else an owner first." },
      { status: 400 },
    );
  }

  if (jobs !== null) {
    if (jobs.length === 0) {
      return NextResponse.json(
        { error: "Give them at least one job, or switch them off" },
        { status: 400 },
      );
    }

    const { data: real } = await admin.from("jobs").select("key").in("key", jobs);
    const known = (real ?? []).map((j) => j.key);
    const unknown = jobs.filter((j) => !known.includes(j));

    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `No such job: ${unknown.join(", ")}` },
        { status: 400 },
      );
    }

    await admin.from("staff_jobs").delete().eq("staff_id", id);
    await admin
      .from("staff_jobs")
      .insert(known.map((job_key) => ({ staff_id: id, job_key })));
  }

  if (typeof body.is_active === "boolean") {
    await admin
      .from("staff")
      .update({ is_active: body.is_active })
      .eq("id", id);
  }

  await record(staff.id, "staff.changed", id, {
    email: person.email,
    jobs,
    is_active: body.is_active,
  });

  const { data: after } = await admin
    .from("staff")
    .select("id, email, full_name, is_active, staff_jobs (job_key)")
    .eq("id", id)
    .single();

  return NextResponse.json({ staff: after });
}

/** True when this person is the only owner still switched on. */
async function isLastOwner(id: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("staff_jobs")
    .select("staff_id, staff!inner (is_active)")
    .eq("job_key", "owner");

  const owners = (data ?? []) as unknown as {
    staff_id: string;
    staff: { is_active: boolean }[] | { is_active: boolean };
  }[];

  const active = owners.filter((o) =>
    Array.isArray(o.staff) ? o.staff.some((s) => s.is_active) : o.staff.is_active,
  );

  return active.length === 1 && active[0].staff_id === id;
}
