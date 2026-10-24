// Feature 13 — Multilingual AI Compliance Assistant client.
// The backend streams Server-Sent Events; this module parses them and the hook
// drives the chat UI state.

import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

export type ChatLanguage = "en" | "hi";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: "ollama" | "local";
  streaming?: boolean;
}

export type ChatEvent =
  | { type: "delta"; content: string }
  | { type: "done"; source: "ollama" | "local"; model: string | null; language: ChatLanguage; reason?: string };

/** Parse one SSE `data:` line into a ChatEvent, or null for keep-alives/frames. */
export function eventFromLine(line: string): ChatEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data) as ChatEvent;
    if (parsed.type !== "delta" && parsed.type !== "done") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Parse a whole SSE payload (for tests and non-streaming fallbacks). */
export function parseSsePayload(text: string): ChatEvent[] {
  const events: ChatEvent[] = [];
  for (const line of text.split("\n")) {
    const event = eventFromLine(line);
    if (event) events.push(event);
  }
  return events;
}

export function assistantContent(events: ChatEvent[]): string {
  return events.filter((e) => e.type === "delta").map((e) => e.content).join("");
}

/** POST the chat and yield typed SSE events as the model streams them. */
export async function* streamChat(body: {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  language?: ChatLanguage;
}): AsyncGenerator<ChatEvent> {
  const res = await fetch("/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = eventFromLine(line);
      if (event) yield event;
    }
  }
}

const uid = () => `m-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export function useAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const send = useCallback(async (text: string, language: ChatLanguage) => {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setBusy(true);

    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", content: question },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);

    let accumulated = "";
    try {
      for await (const event of streamChat({
        message: question,
        history: historyRef.current.slice(-8),
        language,
      })) {
        if (event.type === "delta") {
          accumulated += event.content;
          const snapshot = accumulated;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m)),
          );
        } else {
          const source = event.source;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated, source, streaming: false } : m)),
          );
        }
      }
      historyRef.current = [
        ...historyRef.current.slice(-6),
        { role: "user", content: question },
        { role: "assistant", content: accumulated },
      ];
    } catch (err) {
      const detail =
        (err as ApiError)?.body && typeof (err as ApiError).body === "object"
          ? String(((err as ApiError).body as { detail?: string }).detail ?? "")
          : "";
      setError(detail || "The assistant could not be reached — try again in a moment.");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: accumulated || "…", streaming: false }
            : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    historyRef.current = [];
  }, []);

  return { messages, busy, error, send, reset };
}

export const SUGGESTIONS: Record<ChatLanguage, string[]> = {
  en: [
    "Which mines are high-risk right now?",
    "List overdue compliance items",
    "Contractor certificate expiries",
    "Open grievance SLAs",
    "Environment breaches",
    "Attendance today",
  ],
  hi: [
    "कौन सी खदानें उच्च-जोखिम हैं?",
    "अतिदेय अनुपालन सूची",
    "ठेकेदार प्रमाणपत्र समाप्ति",
    "खुली शिकायत SLA",
    "वातावरण उल्लंघन",
    "आज की उपस्थिति",
  ],
};
