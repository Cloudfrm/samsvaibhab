import { MessageThread } from "./MessageThread";
import { Composer } from "./Composer";

/** The main chat page: the full thread, with the floating composer underneath. */
export function ChatWindow() {
  return (
    <div className="flex h-[calc(100vh-220px)] flex-col">
      <MessageThread />
      <Composer />
    </div>
  );
}
