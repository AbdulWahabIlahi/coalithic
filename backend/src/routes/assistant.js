import { Router } from "express";
import { requireAuth } from "./auth.js";
import { buildSnapshot, buildSystemPrompt, localAnswer } from "../engine/assistant_context.js";
import { loadEnv } from "../lib/env.js";

const router = Router();
router.use(requireAuth);
loadEnv();

// Feature 13 — Multilingual AI Compliance Assistant.
// POST /api/assistant/chat streams Server-Sent Events:
//   data: {"type":"delta","content":"…"}   (zero or more)
//   data: {"type":"done","source":"ollama"|"local","model":"…","language":"en"}
// The model is Gemma 3 served by a local Ollama instance (OpenAI-compatible).
// Every turn is grounded by buildSnapshot(); if the model is unreachable the
// deterministic local responder answers instead so the feature never dead-ends.

const LLM_BASE = () => process.env.LLM_BASE_URL ?? "http://localhost:11434/v1";
const LLM_MODEL = () => process.env.LLM_MODEL ?? "gemma3:4b";
const MAX_MESSAGE = 4000;
const HISTORY_TURNS = 8;

router.get("/snapshot", (_req, res) => {
  res.json({ snapshot: buildSnapshot() });
});

router.post("/chat", async (req, res) => {
  const { message, history, language } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ detail: "message is required" });
  }
  if (message.length > MAX_MESSAGE) {
    return res.status(400).json({ detail: `message must be at most ${MAX_MESSAGE} characters` });
  }
  const lang = language === "hi" ? "hi" : "en";

  const safeHistory = Array.isArray(history)
    ? history
        .slice(-HISTORY_TURNS)
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];

  const snapshot = buildSnapshot();
  const systemPrompt = buildSystemPrompt(snapshot, lang);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const base = LLM_BASE();
  const model = LLM_MODEL();
  if (!base) {
    send({ type: "delta", content: localAnswer(message, snapshot, lang) });
    send({ type: "done", source: "local", model: null, language: lang, reason: "no_upstream" });
    return res.end();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  res.on("close", () => controller.abort());

  try {
    // Ollama needs no key; LLM_API_KEY is only sent when configured (e.g. a
    // remote OpenAI-compatible gateway sitting in front of the model).
    const headers = { "Content-Type": "application/json" };
    const apiKey = process.env.LLM_API_KEY;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...safeHistory,
          { role: "user", content: message },
        ],
        temperature: 0.3,
        top_p: 0.95,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("assistant upstream error", upstream.status, detail.slice(0, 300));
      send({ type: "delta", content: localAnswer(message, snapshot, lang) });
      send({ type: "done", source: "local", model, language: lang, reason: `upstream_${upstream.status}` });
      return res.end();
    }

    // Forward content deltas from the OpenAI-compatible SSE stream.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let gotContent = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta ?? {};
          if (typeof delta.content === "string" && delta.content) {
            gotContent = true;
            send({ type: "delta", content: delta.content });
          }
        } catch {
          /* keep-alive or partial frame — skip */
        }
      }
    }

    if (!gotContent) {
      // Model returned nothing usable (e.g. only reasoning) — answer locally.
      send({ type: "delta", content: localAnswer(message, snapshot, lang) });
      send({ type: "done", source: "local", model, language: lang, reason: "empty_completion" });
    } else {
      send({ type: "done", source: "ollama", model, language: lang });
    }
    res.end();
  } catch (err) {
    if (!res.writableEnded) {
      const reason = err?.name === "AbortError" ? "timeout" : "network_error";
      console.error("assistant stream failed", reason, err?.message ?? err);
      send({ type: "delta", content: localAnswer(message, snapshot, lang) });
      send({ type: "done", source: "local", model: null, language: lang, reason });
      res.end();
    }
  } finally {
    clearTimeout(timer);
  }
});

export default router;
