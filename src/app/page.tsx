import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentProfile } from "@/lib/auth";
import { homeFor } from "@/lib/profile";

export default async function Home() {
  const profile = await getCurrentProfile();

  // Someone already logged in has nothing to choose here.
  if (profile) redirect(homeFor(profile));

  return (
    <>
      <header className="px-8 py-7">
        <span className="text-[15px] font-medium tracking-tight">
          Sams<span className="text-primary-deep">Vaibhab</span>
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[460px]">
          <p className="text-center text-[14px] font-semibold tracking-[-0.01em]">
            Tell us who you are to get started
          </p>

          <div className="mt-8 flex flex-col gap-4">
            <ChoiceCard
              href="/join/supplier"
              label="Supplier · Nepal"
              labelClass="text-primary-deep"
              title={
                <>
                  I have produce to{" "}
                  <span className="text-primary-deep">sell</span>
                </>
              }
              body="Farmers, cooperatives and traders. List what you grow, get matched with buyers, and get paid."
            />
            <ChoiceCard
              href="/join/buyer"
              label="Buyer · Nepal & abroad"
              labelClass="text-buyer"
              title={
                <>
                  I want to <span className="text-buyer">buy</span> produce
                </>
              }
              body="Importers, wholesalers and local buyers. Tell us what you need and the quantity, and we source it."
            />
          </div>
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6 py-8 text-[12px] text-ink-faint">
        <span>SamsVaibhab Private Limited</span>
        <Link href="/terms/terms-supplier" className="hover:text-ink-mute">
          Supplier terms
        </Link>
        <Link href="/terms/terms-buyer" className="hover:text-ink-mute">
          Buyer terms
        </Link>
        <Link href="/terms/privacy-policy" className="hover:text-ink-mute">
          Privacy
        </Link>
      </footer>
    </>
  );
}

function ChoiceCard({
  href,
  label,
  labelClass,
  title,
  body,
}: {
  href: string;
  label: string;
  labelClass: string;
  title: ReactNode;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group block cursor-pointer rounded-lg border border-hairline-cool bg-canvas p-8 transition duration-200 hover:border-hairline-strong hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-[0.12em] ${labelClass}`}
      >
        {label}
      </p>
      <h2 className="mt-4 text-[20px] font-medium tracking-[-0.01em]">
        {title}
      </h2>
      <p className="mt-3 text-[14px] leading-[1.6] text-ink-mute">{body}</p>
      <span className="mt-7 flex items-center gap-1.5 text-[13px] font-medium text-ink-mute transition-colors group-hover:text-ink">
        Continue
        <span className="transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </Link>
  );
}
