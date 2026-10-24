import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-gaps-test-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");
// Same guard as assistant.test.js — keep the real upstream URL out of the
// process so the assistant never dials Ollama during tests.
process.env.LLM_BASE_URL = "";

const { app } = await import("../src/index.js");
const { db } = await import("../src/db.js");
const { generateAlerts } = await import("../src/engine/alerts.js");
const { notifyLog } = await import("../src/lib/notify.js");

let baseUrl;
let server;
let directorCookie;
let officerCookie;

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
  // Self-warm risk scores so /risk/explain has rows on a fresh database.
  const warm = await fetch(`${baseUrl}/api/risk/scores`, { headers: { Cookie: directorCookie } });
  assert.equal(warm.status, 200);
  // Fixture: a contractor-linked violation on the officer's mine (M-001).
  db.prepare("INSERT OR IGNORE INTO contractors (id, name, mine_id, safety_cert_expiry, compliance) VALUES (?, ?, ?, ?, ?)")
    .run("C-AUDIT", "Audit Haulage Co.", "M-001", "2027-01-31", "compliant");
  db.prepare(`
    INSERT INTO violations (id, mine_id, section, title, severity, status, opened_at, contractor_id)
    VALUES ('V-AUDIT1', 'M-001', 'South Ramp', 'Audit fixture: signage missing', 2, 'open', ?, 'C-AUDIT')
  `).run(new Date(Date.now() - 864e5).toISOString());
});

test.after(() => server?.close());

async function get(path, cookie) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  return { status: res.status, json: await res.json().catch(() => null), res };
}

// ---------------------------------------------------------------------------
// B2 — violations list with contractor attribution + per-mine scope
// ---------------------------------------------------------------------------

test("violations list joins contractor attribution", async () => {
  const { status, json } = await get("/api/risk/violations?mine_id=M-001", directorCookie);
  assert.equal(status, 200);
  const fixture = json.items.find((v) => v.id === "V-AUDIT1");
  assert.ok(fixture, "fixture violation present");
  assert.equal(fixture.contractor_name, "Audit Haulage Co.");
  assert.equal(fixture.mine_name, "Singrauli North");
});

test("mine officer cannot list another mine's violations", async () => {
  const { status } = await get("/api/risk/violations?mine_id=M-002", officerCookie);
  assert.equal(status, 403);
});

test("mine officer violations default to their own mine", async () => {
  const { status, json } = await get("/api/risk/violations", officerCookie);
  assert.equal(status, 200);
  assert.ok(json.items.every((v) => v.mine_id === "M-001"), "scoped to M-001");
});

test("explain and root-cause honour the officer's mine scope", async () => {
  assert.equal((await get("/api/risk/explain/M-002", officerCookie)).status, 403);
  assert.equal((await get("/api/risk/explain/M-001", officerCookie)).status, 200);
  assert.equal((await get("/api/risk/root-cause/M-002", officerCookie)).status, 403);
  assert.equal((await get("/api/risk/root-cause/M-001", officerCookie)).status, 200);
});

// ---------------------------------------------------------------------------
// B3 — field capture list is role-scoped
// ---------------------------------------------------------------------------

test("field captures: officer scoped to own mine, cross-mine denied", async () => {
  const ok = await get("/api/field/captures", officerCookie);
  assert.equal(ok.status, 200);
  assert.ok(ok.json.items.every((c) => c.mine_id === "M-001" || c.mine_id === null));
  const denied = await get("/api/field/captures?mine_id=M-002", officerCookie);
  assert.equal(denied.status, 403);
  const portfolio = await get("/api/field/captures", directorCookie);
  assert.equal(portfolio.status, 200);
});

// ---------------------------------------------------------------------------
// B6 — environment breach history
// ---------------------------------------------------------------------------

test("breach history returns readings over their metric limits", async () => {
  const { status, json } = await get("/api/environment/breaches", directorCookie);
  assert.equal(status, 200);
  assert.ok(json.items.length > 0, "seed guarantees at least one breach");
  for (const b of json.items) {
    if (b.direction === "max") assert.ok(b.value > b.limit_value, `${b.metric} over limit`);
    else assert.ok(b.value < b.limit_value, `${b.metric} under limit`);
  }
});

test("breach history is role-scoped for the mine officer", async () => {
  const { status, json } = await get("/api/environment/breaches", officerCookie);
  assert.equal(status, 200);
  assert.ok(json.items.every((b) => b.mine_id === "M-001"), "scoped to M-001");
  assert.equal(json.scoped_to, "M-001");
});

// ---------------------------------------------------------------------------
// B6 — Excel export
// ---------------------------------------------------------------------------

test("Excel export returns SpreadsheetML and seals the audit trail", async () => {
  const res = await fetch(`${baseUrl}/api/reports/compliance.xls`, { headers: { Cookie: directorCookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /vnd\.ms-excel/);
  const body = await res.text();
  assert.match(body, /<\?mso-application progid="Excel\.Sheet"\?>/);
  assert.match(body, /<Workbook/);
  assert.match(body, /Statutory Compliance/);
  assert.match(body, /K-|M-00/, "at least one register row");

  const audit = await get("/api/audit/logs?limit=10", directorCookie);
  assert.ok(
    audit.json.items.some((a) => a.action === "export:compliance.xls"),
    "export sealed into audit chain",
  );
});

test("unknown report type still 404s on xls", async () => {
  const res = await fetch(`${baseUrl}/api/reports/nope.xls`, { headers: { Cookie: directorCookie } });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// B6 — log-only email/SMS notification stub
// ---------------------------------------------------------------------------

test("new high-severity alerts notify through the log-only transport", async () => {
  notifyLog.length = 0;
  generateAlerts();
  assert.ok(notifyLog.length > 0, "seeded high-risk mines must raise notifications");
  const email = notifyLog.find((n) => n.channel === "email");
  assert.ok(email, "email channel used");
  assert.match(email.subject, /CoalSmart HIGH/);
  assert.equal(email.transport ?? "log", "log");
});
