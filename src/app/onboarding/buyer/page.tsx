import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { homeFor } from "@/lib/profile";
import { BuyerOnboardingForm } from "@/components/BuyerOnboardingForm";
import { LogoutButton } from "@/components/LogoutButton";

export default async function BuyerOnboardingPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/");
  if (profile.role !== "buyer") redirect(homeFor(profile));
  if (profile.status !== "incomplete") redirect("/buyer");

  return (
    <>
      <header className="flex items-center justify-between px-6 py-6 sm:px-8 sm:py-7">
        <span className="text-[15px] font-medium tracking-tight">
          Sams<span className="text-primary-deep">Vaibhab</span>
        </span>
        <LogoutButton />
      </header>

      <BuyerOnboardingForm profile={profile} />

      <footer className="px-6 py-8 text-center text-[12px] text-ink-faint">
        Stuck? Email{" "}
        <a
          href="mailto:tech@cloudfrm.ai"
          className="underline hover:text-ink-mute"
        >
          tech@cloudfrm.ai
        </a>
      </footer>
    </>
  );
}
