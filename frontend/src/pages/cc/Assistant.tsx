import { useEffect, useRef, useState } from "react";
import { Bot, Eraser, Send, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SUGGESTIONS,
  useAssistantChat,
  type ChatLanguage,
} from "@/lib/assistant";

// Feature 13 — Multilingual AI Compliance Assistant. Every answer is grounded
// on a live control-room snapshot injected into the model's system prompt; the
// stream arrives as SSE deltas and a local responder covers model outages.
export default function Assistant() {
  const { messages, busy, error, send, reset } = useAssistantChat();
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<ChatLanguage>("en");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    void send(question, language);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const sourceBadge =
    lastAssistant && !lastAssistant.streaming
      ? lastAssistant.source === "ollama"
        ? "Gemma3 · live"
        : "Local fallback"
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI assistant / Decision support"
        title="Ask the control room anything."
        sub="Grounded on the live snapshot — risk, compliance, contractors, environment, grievances, attendance. Bilingual (English / हिंदी)."
        action={
          <div className="flex items-center gap-2">
            {sourceBadge && (
              <span
                data-testid="assistant-source"
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                  lastAssistant?.source === "ollama" ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {sourceBadge}
              </span>
            )}
            <div className="flex overflow-hidden rounded-md border border-border">
              {(["en", "hi"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  data-testid={`assistant-lang-${lang}`}
                  onClick={() => setLanguage(lang)}
                  className={`px-3 py-1.5 font-mono text-[11px] transition-colors ${
                    language === lang
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {lang === "en" ? "EN" : "हिं"}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={reset} disabled={messages.length === 0 || busy}>
              <Eraser className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="flex h-[min(640px,70vh)] flex-col rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
                CoalSmart Assist
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">read-only · cited · decision support</p>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4" data-testid="assistant-messages">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <p className="max-w-sm text-[13px] text-muted-foreground">
                    {language === "hi"
                      ? "लाइव नियंत्रण कक्ष स्नैपशॉट पर आधारित अनुपालन सहायक। नीचे से शुरू करें या एक सुझाव चुनें।"
                      : "Compliance assistant grounded on the live control-room snapshot. Start below or pick a suggestion."}
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    data-testid={m.role === "user" ? "assistant-user-msg" : "assistant-bot-msg"}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-2.5 text-[13px] leading-relaxed ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-secondary text-foreground"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <AssistantBody content={m.content} streaming={m.streaming} />
                      ) : (
                        <span className="whitespace-pre-wrap">{m.content}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
              {error && (
                <p data-testid="assistant-error" className="text-center text-[12px] text-destructive">
                  {error}
                </p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
              className="border-t border-border p-4"
            >
              <div className="flex gap-2">
                <Input
                  data-testid="assistant-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    language === "hi"
                      ? "खदान, जोखिम, अनुपालन, शिकायत… पूछें"
                      : "Ask about mines, risk, compliance, grievances…"
                  }
                  disabled={busy}
                  maxLength={4000}
                />
                <Button type="submit" data-testid="assistant-send" disabled={busy || !input.trim()}>
                  {busy ? (
                    <span className="animate-pulse">…</span>
                  ) : (
                    <>
                      <Send className="mr-1 h-3.5 w-3.5" />
                      Send
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                Decision support only — statutory orders remain with the designated authority.
              </p>
            </form>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              Try asking
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {SUGGESTIONS[language].map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid="assistant-suggestion"
                  onClick={() => submit(s)}
                  disabled={busy}
                  className="rounded-md border border-border bg-background px-3 py-2 text-left text-[12px] text-foreground transition-colors hover:border-primary hover:bg-secondary disabled:opacity-50"
                >
                  <Sparkles className="mr-1.5 inline h-3 w-3 text-primary" />
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              How it works
            </p>
            <ul className="mt-4 space-y-3 text-[12px] text-muted-foreground">
              <li className="flex gap-2">
                <span className="shrink-0 text-primary">1</span>
                Every question is answered from a fresh snapshot of mines, risk,
                compliance, contractors, environment, grievances and attendance.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-primary">2</span>
                Answers cite their source register; the assistant never invents
                figures and stays read-only.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-primary">3</span>
                If the model is unreachable, a deterministic local responder
                answers from the same snapshot — the chat never dead-ends.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Minimal renderer: `**bold**` emphasis, bullets, italic disclaimer line.
// Deliberately tiny — the model is instructed to keep output chat-simple.
// Keys are content-offsets computed by pure helpers, not render indexes.

type ChatRow = { key: string; kind: "hr" | "bullet" | "p"; text: string };

function buildChatRows(content: string): ChatRow[] {
  const rows: ChatRow[] = [];
  let offset = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const key = `L${offset}`;
    offset += line.length + 1;
    if (!trimmed) continue;
    if (trimmed.startsWith("---")) {
      rows.push({ key, kind: "hr", text: "" });
    } else if (trimmed.startsWith("- ")) {
      rows.push({ key, kind: "bullet", text: trimmed.slice(2) });
    } else {
      rows.push({ key, kind: "p", text: trimmed.replace(/^_(.+)_$/, "$1") });
    }
  }
  return rows;
}

function splitEmphasis(text: string, base: number): Array<{ key: string; bold: boolean; text: string }> {
  const out: Array<{ key: string; bold: boolean; text: string }> = [];
  let offset = base;
  for (const part of text.split(/(\*\*[^*]+\*\*)/g)) {
    const bold = part.startsWith("**") && part.endsWith("**");
    out.push({ key: `P${offset}`, bold, text: bold ? part.slice(2, -2) : part });
    offset += part.length;
  }
  return out;
}

function AssistantBody({ content, streaming }: { content: string; streaming?: boolean }) {
  if (!content && streaming) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" />
        consulting the control room…
      </span>
    );
  }
  return (
    <div className="space-y-2" data-testid="assistant-body">
      {buildChatRows(content).map((row) =>
        row.kind === "hr" ? (
          <hr key={row.key} className="border-border" />
        ) : row.kind === "bullet" ? (
          <p key={row.key} className="pl-3 -indent-3">
            <span className="text-primary">- </span>
            <InlineMarkdown text={row.text} />
          </p>
        ) : (
          <p key={row.key}>
            <InlineMarkdown text={row.text} />
          </p>
        ),
      )}
      {streaming && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-primary align-middle" />}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  return (
    <>
      {splitEmphasis(text, text.length).map((part) =>
        part.bold ? (
          <strong key={part.key} className="font-semibold text-foreground">
            {part.text}
          </strong>
        ) : (
          <span key={part.key}>{part.text}</span>
        ),
      )}
    </>
  );
}
