import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { currentStaff } from "@/lib/staff";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  DOC_LABELS,
  DOC_CHOICES,
  ID_DOC_LABELS,
  loadAccount,
  withSignedUrls,
} from "@/lib/profile";
import { AccountForm } from "@/components/AccountForm";
import { LogoutButton } from "@/components/LogoutButton";

export default async function OnboardingPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/");
  if (await currentStaff()) redirect("/admin");

  const admin = createAdminClient();
  const [account, { data: countries }, { data: districts }] = await Promise.all([
    loadAccount(profile),
    admin.from("countries").select("code, name").order("name"),
    admin.from("districts").select("name, province").order("name"),
  ]);

  return (
    <>
      <header className="flex items-center justify-between px-6 py-6 sm:px-8 sm:py-7">
        <span className="text-[15px] font-medium tracking-tight">
          Sams<span className="text-primary-deep">Vaibhab</span>
        </span>
        <LogoutButton />
      </header>

      <AccountForm
        profile={account.profile}
        bank={account.bank}
        documents={await withSignedUrls(account.documents)}
        countries={countries ?? []}
        districts={districts ?? []}
        requiredDocs={DOC_CHOICES}
        docLabels={DOC_LABELS}
        idDocLabels={ID_DOC_LABELS}
      />

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
