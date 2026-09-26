import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staff";
import { LogoutButton } from "@/components/LogoutButton";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * The control room.
 *
 * Every page under /admin goes through here first, so a customer who guesses
 * the address is sent away before any of it is drawn. The endpoints check
 * again on their own; this is the door, not the lock.
 */
export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  const staff = await currentStaff();

  if (!staff) redirect("/");

  const header = (
    <header className="border-b border-adm-line">
      <div className="mx-auto flex h-[60px] w-full max-w-[1180px] items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-8">
          <Link href="/admin" className="text-[15px] font-semibold tracking-tight">
            Sams<span className="text-adm-orange">Vaibhab</span>
            <span className="ml-2 font-normal text-adm-mute">control room</span>
          </Link>
          <nav className="hidden gap-1 sm:flex">
            <Link
              href="/admin"
              className="rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition hover:bg-adm-bone"
            >
              Chat
            </Link>
            <Link
              href="/admin/suppliers"
              className="rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition hover:bg-adm-bone"
            >
              Suppliers
            </Link>
            <Link
              href="/admin/buyers"
              className="rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition hover:bg-adm-bone"
            >
              Buyers
            </Link>
            <Link
              href="/admin/under-review"
              className="rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition hover:bg-adm-bone"
            >
              Under review
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden text-[12px] text-adm-mute sm:inline">
            {staff.full_name ?? staff.email} · {staff.jobs.join(", ")}
          </span>
          <LogoutButton className="rounded-full border border-adm-line bg-adm-card px-4 py-2 text-[14px] font-semibold transition hover:border-adm-ink" />
        </div>
      </div>
    </header>
  );

  return <AdminShell header={header}>{children}</AdminShell>;
}
