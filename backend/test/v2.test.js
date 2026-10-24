import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-v2-test-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");

const { app } = await import("../src/index.js");
const { db } = await import("../src/db.js");

let baseUrl;
let server;
let directorCookie;
let officerCookie;

const settle = () => new Promise((r) => setTimeout(r, 30));

async function login(email) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "CoalSmart2025!" }),
  });
  assert.equal(res.status, 200, `login as ${email}`);
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
  officerCookie = await login("officer@coalsmart.gov");
});

test.after(() => server?.close());

async function get(path, cookie) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  assert.ok(res.status < 500, `GET ${path} -> ${res.status}`);
  return { status: res.status, json: await res.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// Feature 5 — AI depth: explain + root-cause
// ---------------------------------------------------------------------------

test("risk explain returns score band and factor breakdown", async () => {
  await (await fetch(`${baseUrl}/api/risk/recompute`, {
    method: "POST",
    headers: { Cookie: directorCookie },
  })).json();
  const { status, json } = await get("/api/risk/explain/M-001", directorCookie);
  assert.equal(status, 200);
  assert.equal(json.mine_id, "M-001");
  assert.ok(json.score >= 0 && json.score <= 100, `M-001 score should be 0-100, got ${json.score}`);
  assert.ok(["low", "watch", "high"].includes(json.band));
  assert.ok(Array.isArray(json.factors) && json.factors.length > 0, "factor breakdown expected");
  assert.ok(json.factors.some((f) => f.factor === "baseline"), "baseline factor expected");
});

test("risk root-cause groups violations by section and contractor", async () => {
  const { status, json } = await get("/api/risk/root-cause/M-001", directorCookie);
  assert.equal(status, 200);
  assert.equal(json.mine_id, "M-001");
  assert.ok(json.by_section.some((s) => s.section === "Section 4"), "Section 4 cluster expected");
  assert.ok(json.by_section.some((s) => Number(s.n) >= 2), "multi-violation section expected");
  const patterns = json.patterns ?? [];
  assert.ok(patterns.some((p) => p.mine_ids.includes("M-001")), "M-001 belongs to a cross-mine pattern");
});

// ---------------------------------------------------------------------------
// Feature 2 — alert center
// ---------------------------------------------------------------------------

test("GET /api/alerts generates and returns live alerts (director sees all)", async () => {
  const { status, json: first } = await get("/api/alerts", directorCookie);
  assert.equal(status, 200);
  assert.ok(Array.isArray(first.items));
  // With 50 seeded mines, at least some should be high-risk or have overdue items.
  assert.ok(first.items.length > 0, "director should see at least one alert");
  const keys = first.items.map((a) => a.key);
  assert.ok(keys.some((k) => k.startsWith("contract:expiry:")), "expiring cert alert expected");
  assert.ok(keys.some((k) => k.startsWith("compliance:")), "compliance alert expected");
  return first;
});

test("alerts dedupe on re-run (no duplicates)", async () => {
  const { json: first } = await get("/api/alerts", directorCookie);
  const before = first.items.length;
  const { json: second } = await get("/api/alerts", directorCookie);
  assert.equal(second.items.length, before, "re-running generateAlerts must not duplicate");
});

test("alerts are role-scoped for the mine officer", async () => {
  const { json } = await get("/api/alerts", officerCookie);
  for (const a of json.items) {
    const visible = a.mine_id === "M-001" || a.mine_id === null;
    assert.ok(visible, `officer should not see alert ${a.key} for mine ${a.mine_id}`);
  }
  // Officer should not see alerts for other mines.
  const otherMineAlerts = json.items.filter((a) => a.mine_id && a.mine_id !== "M-001");
  assert.equal(otherMineAlerts.length, 0, "officer must not see other mines' alerts");
});

test("PATCH /api/alerts/:id marks an alert as read", async () => {
  const { json } = await get("/api/alerts", directorCookie);
  const target = json.items.find((a) => a.status === "open" && !a.read_at);
  assert.ok(target, "an unread open alert should exist");
  const res = await fetch(`${baseUrl}/api/alerts/${target.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({ read: true }),
  });
  assert.equal(res.status, 200);
  const updated = (await res.json()).item;
  assert.ok(updated.read_at, "read_at should be set");
});

// ---------------------------------------------------------------------------
// Feature 3 — contractor management
// ---------------------------------------------------------------------------

test("GET /api/contractors is role-scoped", async () => {
  const { json: d } = await get("/api/contractors", directorCookie);
  assert.equal(d.items.length, 4, "director sees all 4 seeded contractors");
  const { json: o } = await get("/api/contractors", officerCookie);
  assert.ok(o.items.every((c) => c.mine_id === "M-001"), "officer sees only M-001 contractors");
  assert.ok(o.items.some((c) => c.id === "C-01"), "officer sees C-01");
});

test("POST /api/contractors creates a contractor and is audited", async () => {
  const res = await fetch(`${baseUrl}/api/contractors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({ name: "Test Excavators Pvt Ltd", mine_id: "M-005", contact_name: "K. Rao", compliance: "watch" }),
  });
  assert.equal(res.status, 201);
  const item = (await res.json()).item;
  assert.equal(item.name, "Test Excavators Pvt Ltd");
  assert.equal(item.mine_id, "M-005");
  await settle();
  const { json } = await get("/api/audit/logs", directorCookie);
  const created = json.items.some((a) => a.action === "post:contractors");
  assert.ok(created, "contractor creation sealed in audit trail");
});

test("PATCH /api/contractors/:id updates expiry", async () => {
  const res = await fetch(`${baseUrl}/api/contractors/C-02`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({ safety_cert_expiry: "2026-12-31", compliance: "compliant" }),
  });
  assert.equal(res.status, 200);
  const item = (await res.json()).item;
  assert.equal(item.safety_cert_expiry, "2026-12-31");
  assert.equal(item.compliance, "compliant");
});

test("GET /api/contractors/expiring returns lapsed + soon-expiring certs", async () => {
  const { json } = await get("/api/contractors/expiring?within_days=14", directorCookie);
  const ids = json.items.map((c) => c.id);
  assert.ok(ids.includes("C-01"), "C-01 expires within 14 days");
  assert.ok(ids.includes("C-03"), "C-03 cert already lapsed");
});

// ---------------------------------------------------------------------------
// Feature 4 — environment monitoring
// ---------------------------------------------------------------------------

test("GET /api/environment/:mineId returns latest readings with breach flags", async () => {
  const { status, json } = await get("/api/environment/M-001", directorCookie);
  assert.equal(status, 200);
  assert.equal(json.mine_id, "M-001");
  assert.ok(Array.isArray(json.latest) && json.latest.length > 0);
  const pm10 = json.latest.find((r) => r.metric === "pm10");
  assert.ok(pm10, "pm10 reading present");
  assert.equal(pm10.breach, 1, "pm10 at 168 > 100 limit should be flagged breach");
  assert.ok(Array.isArray(json.history));
});

test("environment is role-scoped: officer cannot view another mine", async () => {
  const res = await fetch(`${baseUrl}/api/environment/M-002`, { headers: { Cookie: officerCookie } });
  assert.equal(res.status, 403, "officer M-001 must not read M-002 environment");
});

test("GET /api/environment limits + PUT update threshold", async () => {
  const { json: g } = await get("/api/environment/limits", directorCookie);
  assert.ok(g.items.some((l) => l.metric === "pm10"), "pm10 limit seeded");
  const res = await fetch(`${baseUrl}/api/environment/limits/pm10`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({ limit_value: 120, unit: "µg/m³", direction: "max" }),
  });
  assert.equal(res.status, 200);
  const updated = (await res.json()).item;
  assert.equal(updated.limit_value, 120);
  // Restore to avoid leaking into other tests.
  await fetch(`${baseUrl}/api/environment/limits/pm10`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({ limit_value: 100, unit: "µg/m³", direction: "max" }),
  });
});

// ---------------------------------------------------------------------------
// Auth + audit coverage
// ---------------------------------------------------------------------------

test("new routes require authentication (401 without cookie)", async () => {
  assert.equal((await fetch(`${baseUrl}/api/alerts`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/contractors`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/environment/M-001`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/environment/limits`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/contractors`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/risk/explain/M-001`)).status, 401);
});
