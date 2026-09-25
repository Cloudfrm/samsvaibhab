import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

const STATUS_COPY = {
  incomplete: {
    title: "Your details are not finished",
    body: "Please fill in your account details and send them for approval.",
  },
  pending: {
    title: "Your account is waiting for approval",
    body: "Our team is checking your details. We will be in touch shortly. You cannot trade until your account is approved.",
  },
  approved: {
    title: "Your account is approved",
    body: "You are all set.",
  },
  rejected: {
    title: "Your account was not approved",
    body: "Please contact us if you think this is a mistake.",
  },
} as const;

export default async function AccountPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <main className="mx-auto w-full max-w-[560px] flex-1 px-6 py-20">
        <h1 className="text-[24px] font-medium tracking-[-0.02em]">
          You are not logged in
        </h1>
        <Link
          href="/"
          className="mt-6 inline-block rounded-sm bg-primary px-4 py-3 text-[14px] font-medium text-ink"
        >
          Go to home
        </Link>
      </main>
    );
  }

  const status = STATUS_COPY[profile.status];

  return (
    <main className="mx-auto w-full max-w-[640px] flex-1 px-6 py-12 sm:py-20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] uppercase tracking-wide text-ink-faint">
            {profile.role ?? "account"}
          </p>
          <h1 className="mt-2 text-[24px] font-medium tracking-[-0.02em]">
            {profile.full_name ?? profile.email}
          </h1>
        </div>
        <LogoutButton />
      </div>

      <div className="mt-8 rounded-lg border border-hairline bg-canvas-soft p-6">
        <h2 className="text-[18px] font-medium">{status.title}</h2>
        <p className="mt-2 text-[14px] leading-[1.6] text-ink-mute">
          {status.body}
        </p>
      </div>

      <dl className="mt-8 divide-y divide-hairline-cool border-y border-hairline-cool text-[14px]">
        <Row label="Email" value={profile.email} />
        <Row label="Account type" value={profile.account_type ?? "Not set"} />
        <Row label="Company" value={profile.company_name ?? "Not set"} />
        <Row label="Phone" value={profile.phone ?? "Not set"} />
        <Row label="Country" value={profile.country ?? "Not set"} />
        <Row label="District" value={profile.district ?? "Not set"} />
      </dl>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-6 py-3">
      <dt className="text-ink-mute">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
