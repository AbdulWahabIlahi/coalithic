import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-attendance-test-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");

const { app } = await import("../src/index.js");

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

// ---------------------------------------------------------------------------
// Feature 11 — Worker Attendance Module
// ---------------------------------------------------------------------------

test("attendance seeds 14 days of history for M-001", async () => {
  const { status, json } = await get("/api/attendance/M-001?days=14", directorCookie);
  assert.equal(status, 200);
  assert.equal(json.mine_id, "M-001");
  assert.ok(json.items.length >= 14, `expected >=14 seeded days, got ${json.items.length}`);
  for (const row of json.items) {
    assert.equal(row.mine_id, "M-001");
    assert.ok(row.headcount > 0, "headcount should be positive");
    assert.ok(row.work_date, "work_date present");
  }
  // Most recent first.
  const dates = json.items.map((r) => r.work_date);
  const sorted = [...dates].sort().reverse();
  assert.deepEqual(dates, sorted, "history should be newest first");
});

test("attendance latest returns one row per seeded mine", async () => {
  const { status, json } = await get("/api/attendance", directorCookie);
  assert.equal(status, 200);
  assert.ok(json.items.length >= 5, "at least the 5 seeded mines");
  for (const row of json.items) {
    assert.ok(row.mine_name, "mine name joined");
    assert.ok(row.headcount >= 0);
  }
});

test("attendance history is role-scoped for the mine officer", async () => {
  const ok = await get("/api/attendance/M-001?days=7", officerCookie);
  assert.equal(ok.status, 200);
  const denied = await get("/api/attendance/M-002?days=7", officerCookie);
  assert.equal(denied.status, 403);
  const latest = await get("/api/attendance", officerCookie);
  assert.equal(latest.status, 200);
  for (const row of latest.json.items) {
    assert.equal(row.mine_id, "M-001", "officer latest strip must only show their mine");
  }
});

test("POST /api/attendance records and upserts the daily muster", async () => {
  const today = "2099-12-31"; // future date so the seed (which covers today) cannot collide
  const first = await fetch(`${baseUrl}/api/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: officerCookie },
    body: JSON.stringify({ mine_id: "M-001", work_date: today, workers_in: 190, workers_out: 184, headcount: 186 }),
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.item.workers_in, 190);
  assert.equal(firstBody.item.recorded_by, "officer@coalsmart.gov");

  const second = await fetch(`${baseUrl}/api/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: officerCookie },
    body: JSON.stringify({ mine_id: "M-001", work_date: today, workers_in: 192, workers_out: 185, headcount: 188 }),
  });
  assert.equal(second.status, 200, "same (mine, date) upserts instead of duplicating");
  const secondBody = await second.json();
  assert.equal(secondBody.item.id, firstBody.item.id, "same row id after upsert");
  assert.equal(secondBody.item.headcount, 188);

  const history = await get("/api/attendance/M-001?days=1", officerCookie);
  assert.equal(history.json.items[0].work_date, today);
  assert.equal(history.json.items[0].headcount, 188);
});

test("officer cannot record attendance for another mine", async () => {
  const res = await fetch(`${baseUrl}/api/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: officerCookie },
    body: JSON.stringify({ mine_id: "M-002", work_date: "2026-01-01", workers_in: 10, headcount: 10 }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/attendance validates the mine id", async () => {
  const res = await fetch(`${baseUrl}/api/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({ mine_id: "M-999", work_date: "2026-01-01", headcount: 5 }),
  });
  assert.equal(res.status, 404);
});

test("attendance mutations are sealed in the audit trail", async () => {
  const { status, json } = await get("/api/audit/logs?limit=50", directorCookie);
  assert.equal(status, 200);
  const logged = json.items.some(
    (a) => a.entity === "attendance" || (a.path ?? "").includes("/api/attendance"),
  );
  assert.ok(logged, "expected an audit entry for the attendance POST");
});
