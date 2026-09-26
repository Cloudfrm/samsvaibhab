"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChat } from "./chat-store";
import { MessageThread } from "./MessageThread";
import { Composer } from "./Composer";

const MIN_WIDTH = 280;
const MAX_WIDTH = 640;

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 4.5h14a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cursor-style chat panel on the right: resizable, and can be tucked away. */
export function ChatPanel() {
  const { panelOpen, setPanelOpen, panelWidth, setPanelWidth } = useChat();
  const draggingRef = useRef(false);

  const onHandleDown = useCallback(() => {
    draggingRef.current = true;
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setPanelWidth(next);
    }
    function onUp() {
      draggingRef.current = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [setPanelWidth]);

  if (!panelOpen) {
    return (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        aria-label="Open chat"
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-adm-orange text-white shadow-[0_10px_30px_rgba(32,32,32,0.2)] transition hover:bg-adm-orange-deep"
      >
        <ChatIcon />
      </button>
    );
  }

  return (
    <aside
      style={{ width: panelWidth }}
      className="relative flex h-screen shrink-0 flex-col border-l border-adm-line bg-adm-card"
    >
      <div
        onPointerDown={onHandleDown}
        className="absolute left-0 top-0 h-full w-1.5 -translate-x-1/2 cursor-col-resize"
      />

      <div className="flex h-[60px] items-center justify-between border-b border-adm-line px-4">
        <span className="text-[14px] font-semibold">Assistant</span>
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          aria-label="Close chat"
          className="rounded-full p-1.5 text-adm-mute transition hover:bg-adm-bone hover:text-adm-ink"
        >
          ✕
        </button>
      </div>

      <MessageThread compact />
      <Composer compact />
    </aside>
  );
}
