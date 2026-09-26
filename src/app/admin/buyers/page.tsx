import { createAdminClient } from "@/utils/supabase/admin";
import { can, currentStaff } from "@/lib/staff";
import { StatusChip } from "@/components/admin/StatusChip";

type Row = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

/** The buyer list. Name, phone, email. Same shape as the supplier list. */
export default async function BuyersPage(props: PageProps<"/admin/buyers">) {
  const staff = await currentStaff();
  const { q } = await props.searchParams;
  const search = typeof q === "string" ? q.trim() : "";

  if (!can(staff, "buyers.read")) {
    return (
      <p className="text-[16px] text-adm-mute">
        Looking at buyers is not part of your job here.
      </p>
    );
  }

  const admin = createAdminClient();
  let query = admin
    .from("profiles")
    .select("id, full_name, company_name, email, phone, status")
    .eq("role", "buyer")
    .order("created_at", { ascending: false });

  if (search) {
    const like = `%${search.replace(/[%,]/g, "")}%`;
    query = query.or(
      `full_name.ilike.${like},company_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
    );
  }

  const { data } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="adm-display text-[38px]">Buyers</h1>
          <p className="mt-2 text-[14px] text-adm-mute">
            {rows.length} {rows.length === 1 ? "person" : "people"}
            {search ? ` matching “${search}”` : ""}
          </p>
        </div>

        <form className="flex items-center gap-2">
          <input
            name="q"
            defaultValue={search}
            placeholder="Name, phone or email"
            className="h-11 w-[260px] rounded-full border border-adm-line bg-adm-card px-5 text-[15px] outline-none placeholder:text-adm-ash focus:border-adm-ink"
          />
          <button
            type="submit"
            className="h-11 rounded-full bg-adm-dark px-6 text-[15px] font-semibold text-white transition hover:opacity-90"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-8 overflow-hidden rounded-[10px] border border-adm-line bg-adm-card">
        <table className="w-full text-left text-[15px]">
          <thead>
            <tr className="border-b border-adm-line text-[12px] uppercase tracking-wide text-adm-ash">
              <th className="px-5 py-3 font-normal">Name</th>
              <th className="px-5 py-3 font-normal">Phone</th>
              <th className="px-5 py-3 font-normal">Email</th>
              <th className="px-5 py-3 font-normal">Where they are</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-adm-line last:border-0 hover:bg-adm-bone"
              >
                <td className="px-5 py-4 font-medium">
                  {row.full_name ?? row.company_name ?? "No name yet"}
                </td>
                <td className="px-5 py-4 text-adm-body">{row.phone ?? "—"}</td>
                <td className="px-5 py-4 text-adm-body">{row.email ?? "—"}</td>
                <td className="px-5 py-4">
                  <StatusChip status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="px-5 py-10 text-center text-[15px] text-adm-mute">
            {search ? "Nobody matches that." : "No buyers yet."}
          </p>
        )}
      </div>
    </>
  );
}
