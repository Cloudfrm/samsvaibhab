"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ChatMessage = {
  id: string;
  text: string;
};

type ChatState = {
  messages: ChatMessage[];
  send: (text: string) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  panelWidth: number;
  setPanelWidth: (width: number) => void;
};

const ChatContext = createContext<ChatState | null>(null);

const STORAGE_KEY = "admin.chat.v1";
const DEFAULT_WIDTH = 380;

/** Holds the one running conversation, shared by the chat page and the side panel. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.messages)) setMessages(saved.messages);
        if (typeof saved.panelOpen === "boolean") setPanelOpen(saved.panelOpen);
        if (typeof saved.panelWidth === "number") setPanelWidth(saved.panelWidth);
      }
    } catch {
      // no saved history, start empty
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ messages, panelOpen, panelWidth }),
      );
    } catch {
      // storage unavailable, history just won't survive a refresh
    }
  }, [messages, panelOpen, panelWidth, loaded]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), text: trimmed }]);
  }

  return (
    <ChatContext.Provider
      value={{ messages, send, panelOpen, setPanelOpen, panelWidth, setPanelWidth }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
}
