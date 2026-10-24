import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-grievances-test-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");

const { app } = await import("../src/index.js");
const { generateAlerts } = await import("../src/engine/alerts.js");

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
});

test.after(() => server?.close());

async function get(path, cookie) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function post(path, body, cookie) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function patch(path, body, cookie) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// Feature 12 — Grievance Handling Module
// ---------------------------------------------------------------------------

test("grievance seeds exist with varied SLA states", async () => {
  const { status, json } = await get("/api/grievances", directorCookie);
  assert.equal(status, 200);
  assert.ok(json.items.length >= 4, "seeded grievances expected");
  const breached = json.items.find((g) => g.id === "GR-0002");
  assert.ok(breached, "GR-0002 seeded");
  assert.equal(breached.sla_breached, true, "GR-0002 is past its 72h SLA");
  const fresh = json.items.find((g) => g.id === "GR-0001");
  assert.equal(fresh.sla_breached, false);
  assert.ok(fresh.sla_remaining_hours > 0);
  const resolved = json.items.find((g) => g.id === "GR-0004");
  assert.equal(resolved.status, "resolved");
  assert.ok(resolved.resolved_at, "resolved_at set");
});

test("grievances are role-scoped for the mine officer", async () => {
  const { json } = await get("/api/grievances", officerCookie);
  for (const g of json.items) {
    assert.equal(g.mine_id, "M-001", "officer must only see their mine's grievances");
  }
});

test("POST /api/grievances validates input", async () => {
  const bad1 = await post("/api/grievances", { mine_id: "M-001", category: "safety", description: "hi" }, directorCookie);
  assert.equal(bad1.status, 400, "short description rejected");
  const bad2 = await post("/api/grievances", { mine_id: "M-001", category: "nope", description: "long enough description" }, directorCookie);
  assert.equal(bad2.status, 400, "invalid category rejected");
  const bad3 = await post("/api/grievances", { mine_id: "M-999", category: "safety", description: "long enough description" }, directorCookie);
  assert.equal(bad3.status, 404, "unknown mine rejected");
});

test("POST /api/grievances creates an open grievance with a 72h SLA", async () => {
  const { status, json } = await post(
    "/api/grievances",
    { mine_id: "M-001", worker_name: "Test Worker", category: "facilities", description: "Mess hall roof leak during monsoon shift." },
    officerCookie,
  );
  assert.equal(status, 201);
  assert.ok(json.item.id.startsWith("GR-"));
  assert.equal(json.item.status, "open");
  assert.equal(json.item.sla_hours, 72);
  assert.equal(json.item.sla_breached, false);
  assert.ok(json.item.sla_remaining_hours > 70 && json.item.sla_remaining_hours <= 72);
  assert.equal(json.item.mine_name, "Singrauli North");
});

test("PATCH triages open → in_review → resolved", async () => {
  const created = await post(
    "/api/grievances",
    { mine_id: "M-001", category: "wages", description: "Overtime not reflected in latest payslip." },
    officerCookie,
  );
  const id = created.json.item.id;

  const triage = await patch(`/api/grievances/${id}`, { status: "in_review" }, officerCookie);
  assert.equal(triage.status, 200);
  assert.equal(triage.json.item.status, "in_review");

  const resolve = await patch(`/api/grievances/${id}`, { status: "resolved" }, officerCookie);
  assert.equal(resolve.status, 200);
  assert.equal(resolve.json.item.status, "resolved");
  assert.ok(resolve.json.item.resolved_at, "resolved_at stamped");
  assert.equal(resolve.json.item.resolved_by, "officer@coalsmart.gov");

  const again = await patch(`/api/grievances/${id}`, { status: "resolved" }, officerCookie);
  assert.equal(again.status, 400, "double-resolve is refused");
});

test("officer cannot touch another mine's grievance", async () => {
  const res = await fetch(`${baseUrl}/api/grievances/GR-0003`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: officerCookie },
    body: JSON.stringify({ status: "resolved" }),
  });
  assert.equal(res.status, 403, "GR-0003 belongs to M-002");
});

test("breached grievance SLA raises an alert through the shared pipeline", async () => {
  generateAlerts();
  const { json } = await get("/api/alerts", directorCookie);
  const sla = json.items.find((a) => a.key === "grievance:sla:GR-0002");
  assert.ok(sla, "expected grievance:sla:GR-0002 alert");
  assert.equal(sla.category, "grievance");
  assert.equal(sla.severity, "high");
  assert.equal(sla.mine_id, "M-001");
  // Resolved grievance must not raise a SLA alert.
  assert.ok(!json.items.some((a) => a.key === "grievance:sla:GR-0004"), "resolved grievance has no SLA alert");
});

test("grievance mutations are sealed in the audit trail", async () => {
  const { json } = await get("/api/audit/logs?limit=50", directorCookie);
  const actions = json.items.map((a) => a.action);
  assert.ok(actions.some((a) => a.startsWith("post:grievances")), "create audited");
  assert.ok(actions.some((a) => a.startsWith("patch:grievances")), "state change audited");
});
