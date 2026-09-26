"use client";

import { useState } from "react";
import { useChat } from "./chat-store";

/** Left sidebar for the admin chat assistant: the agent button, and history below it. */
export function ChatSidebar() {
  const [open, setOpen] = useState(true);
  const { messages } = useChat();

  return (
    <aside
      className={`flex h-screen flex-col border-r border-adm-line bg-adm-card transition-[width] duration-200 ${
        open ? "w-[260px]" : "w-[56px]"
      }`}
    >
      <div className="flex h-[60px] items-center justify-between border-b border-adm-line px-4">
        {open && <span className="text-[14px] font-semibold">Assistant</span>}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          className="rounded-full p-1.5 text-adm-mute transition hover:bg-adm-bone hover:text-adm-ink"
        >
          {open ? "‹" : "›"}
        </button>
      </div>

      {open && (
        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
          <button
            type="button"
            className="rounded-full bg-adm-orange px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-adm-orange-deep"
          >
            Kick off an agent
          </button>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-adm-ash">
              History
            </p>
            {messages.length === 0 ? (
              <p className="text-[13px] text-adm-ash">Nothing yet.</p>
            ) : (
              messages.map((m) => (
                <p key={m.id} className="truncate text-[13px] text-adm-body">
                  {m.text}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
