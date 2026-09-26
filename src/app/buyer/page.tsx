import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { homeFor } from "@/lib/profile";
import { LogoutButton } from "@/components/LogoutButton";

// Placeholder home screen for a buyer. There is no real buyer dashboard yet,
// that is separate, later work.
export default async function BuyerHomePage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/");
  if (profile.role !== "buyer") redirect(homeFor(profile));
  if (profile.status === "incomplete") redirect("/onboarding/buyer");

  return (
    <>
      <header className="flex items-center justify-between px-6 py-6 sm:px-8 sm:py-7">
        <span className="text-[15px] font-medium tracking-tight">
          Sams<span className="text-primary-deep">Vaibhab</span>
        </span>
        <LogoutButton />
      </header>

      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-start justify-center px-6 py-20">
        <h1 className="text-[24px] font-medium tracking-[-0.02em]">
          You&apos;re all set, {profile.full_name}
        </h1>
        <p className="mt-2 text-[14px] text-ink-mute">
          Your buyer dashboard is coming soon.
        </p>
      </main>
    </>
  );
}
