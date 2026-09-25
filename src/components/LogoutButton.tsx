"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="rounded-sm border border-hairline px-4 py-2 text-[14px] font-medium hover:border-ink disabled:text-ink-faint"
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
