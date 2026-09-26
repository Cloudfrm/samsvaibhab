"use client";

import { useChat } from "./chat-store";

/** The running thread. Just your own messages for now, no replies. */
export function MessageThread({ compact = false }: { compact?: boolean }) {
  const { messages } = useChat();

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className={compact ? "text-[13px] text-adm-ash" : "text-[15px] text-adm-ash"}>
          What can I do for you?
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`self-end rounded-2xl bg-adm-dark text-white ${
            compact ? "max-w-[85%] px-3 py-1.5 text-[13px]" : "max-w-[70%] px-4 py-2 text-[15px]"
          }`}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
