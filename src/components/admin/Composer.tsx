"use client";

import { useState, type FormEvent } from "react";
import { useChat } from "./chat-store";

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The box you type into. Same behaviour everywhere, just sized differently. */
export function Composer({ compact = false }: { compact?: boolean }) {
  const { send } = useChat();
  const [draft, setDraft] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    send(draft);
    setDraft("");
  }

  if (compact) {
    return (
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-adm-line p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          className="h-9 flex-1 rounded-full bg-adm-canvas px-4 text-[13px] outline-none placeholder:text-adm-ash"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-adm-orange text-white transition hover:bg-adm-orange-deep disabled:bg-adm-line disabled:text-adm-ash"
        >
          <SendIcon />
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex w-full max-w-[640px] items-center gap-2 rounded-[26px] bg-adm-card px-5 py-2.5 shadow-[0_1px_2px_rgba(32,32,32,0.04),0_10px_30px_rgba(32,32,32,0.08)]"
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Type a command…"
        className="h-9 flex-1 bg-transparent text-[15px] outline-none placeholder:text-adm-ash"
      />
      <button
        type="submit"
        disabled={!draft.trim()}
        aria-label="Send"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-adm-orange text-white transition hover:bg-adm-orange-deep disabled:bg-adm-line disabled:text-adm-ash"
      >
        <SendIcon />
      </button>
    </form>
  );
}
