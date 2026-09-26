"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChatProvider } from "./chat-store";
import { ChatSidebar } from "./ChatSidebar";
import { ChatPanel } from "./ChatPanel";

/**
 * The chat page keeps the left "kick off an agent" sidebar.
 * Every other admin page swaps it for a Cursor-style chat panel on the right.
 */
export function AdminShell({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isChatHome = pathname === "/admin";

  return (
    <ChatProvider>
      <div className="flex min-h-full flex-1 bg-adm-canvas text-adm-ink">
        {isChatHome && <ChatSidebar />}

        <div className="min-w-0 flex-1">
          {header}
          <main className="mx-auto w-full max-w-[1180px] px-6 py-10">{children}</main>
        </div>

        {!isChatHome && <ChatPanel />}
      </div>
    </ChatProvider>
  );
}
