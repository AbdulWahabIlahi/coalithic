import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-assistant-test-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");
// Empty (not deleted) so loadEnv() cannot resurrect the real upstream URL from
// .env — the route treats "" as unconfigured and uses the local responder.
process.env.LLM_BASE_URL = "";

const realFetch = globalThis.fetch;

const { app } = await import("../src/index.js");

let baseUrl;
let server;
let directorCookie;

async function login(email) {
  const res = await realFetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "CoalSmart2025!" }),
  });
  assert.equal(res.status, 200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  directorCookie = await login("director@coalsmart.gov");
});

test.after(() => {
  globalThis.fetch = realFetch;
  server?.close();
});

// Consume the assistant's SSE response into typed events.
async function readChat(body, cookie = directorCookie) {
  const res = await realFetch(`${baseUrl}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const events = text
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => JSON.parse(l.slice(5).trim()));
  return { status: res.status, events, text };
}

// ---------------------------------------------------------------------------
// Feature 13 — AI Compliance Assistant
// ---------------------------------------------------------------------------

test("chat requires auth", async () => {
  const res = await realFetch(`${baseUrl}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  });
  assert.equal(res.status, 401);
});

test("chat validates the message", async () => {
  const res = await realFetch(`${baseUrl}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({ message: "" }),
  });
  assert.equal(res.status, 400);
});

test("snapshot endpoint returns a grounded control-room digest", async () => {
  const res = await realFetch(`${baseUrl}/api/assistant/snapshot`, { headers: { Cookie: directorCookie } });
  assert.equal(res.status, 200);
  const { snapshot } = await res.json();
  assert.equal(snapshot.portfolio.total_mines, 50);
  assert.ok(snapshot.top_risk_mines.length > 0);
  assert.ok(Array.isArray(snapshot.compliance_overdue));
  assert.ok(Array.isArray(snapshot.grievances_open));
  assert.ok(snapshot.generated_at, "timestamp present");
});

test("without an upstream model the assistant answers locally over SSE with real data", async () => {
  const { status, events } = await readChat({ message: "Which mines are high-risk right now?" });
  assert.equal(status, 200);
  const content = events.filter((e) => e.type === "delta").map((e) => e.content).join("");
  assert.ok(content.length > 0, "delta content expected");
  assert.ok(/M-\d{3}/.test(content), "answer must cite a mine id from the snapshot");
  assert.ok(content.includes("risk_scores"), "source tag expected");
  const done = events.at(-1);
  assert.equal(done.type, "done");
  assert.equal(done.source, "local");
  assert.equal(done.language, "en");
  assert.ok(content.includes("Decision support only"), "disclaimer required");
});

test("Hindi toggle answers in Hindi and keeps mine ids in Latin script", async () => {
  const { events } = await readChat({ message: "अतिदेय अनुपालन सूची दिखाइए", language: "hi" });
  const content = events.filter((e) => e.type === "delta").map((e) => e.content).join("");
  assert.match(content, /[ऀ-ॿ]/, "Devanagari expected");
  assert.ok(/M-00\d|K-\d\d/.test(content), "ids stay Latin for traceability");
  assert.equal(events.at(-1).language, "hi");
});

test("with a key it streams from the upstream model (stubbed Ollama SSE)", async () => {
  const upstreamBody = [
    'data: {"choices":[{"delta":{"content":"Singrauli North "}}]}',
    'data: {"choices":[{"delta":{"content":"is high-risk at 78."}}]}',
    "data: [DONE]",
    "",
  ].join("\n");

  globalThis.fetch = (url, init) => {
    if (String(url).includes("localhost:11434")) {
      assert.equal(init.headers.Authorization, "Bearer test-key");
      const payload = JSON.parse(init.body);
      assert.equal(payload.model, "gemma3:4b");
      assert.equal(payload.stream, true);
      assert.ok(payload.messages[0].role === "system");
      assert.ok(payload.messages[0].content.includes("CONTROL ROOM SNAPSHOT"), "snapshot must ground the prompt");
      assert.equal(payload.messages.at(-1).content, "Why is M-001 high-risk?");
      return Promise.resolve(new Response(upstreamBody, { status: 200 }));
    }
    return realFetch(url, init);
  };
  process.env.LLM_BASE_URL = "http://localhost:11434/v1";
  process.env.LLM_API_KEY = "test-key";

  try {
    const { events } = await readChat({
      message: "Why is M-001 high-risk?",
      history: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
    });
    const content = events.filter((e) => e.type === "delta").map((e) => e.content).join("");
    assert.equal(content, "Singrauli North is high-risk at 78.");
    assert.equal(events.at(-1).source, "ollama");
    assert.equal(events.at(-1).model, "gemma3:4b");
  } finally {
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
  }
});

test("an upstream failure degrades to the local responder instead of dying", async () => {
  globalThis.fetch = (url, init) => {
    if (String(url).includes("localhost:11434")) {
      return Promise.resolve(new Response("upstream exploded", { status: 500 }));
    }
    return realFetch(url, init);
  };
  process.env.LLM_BASE_URL = "http://localhost:11434/v1";

  try {
    const { status, events } = await readChat({ message: "Contractor expiries?" });
    assert.equal(status, 200);
    const content = events.filter((e) => e.type === "delta").map((e) => e.content).join("");
    assert.ok(content.length > 0, "fallback content expected");
    assert.equal(events.at(-1).source, "local");
    assert.equal(events.at(-1).reason, "upstream_500");
  } finally {
    delete process.env.LLM_BASE_URL;
    globalThis.fetch = realFetch;
  }
});
