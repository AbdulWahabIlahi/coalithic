import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-test-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");

// Dynamic import so the scratch env vars above are in place before db.js loads.
const { app } = await import("../src/index.js");

// 1x1 transparent PNG
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function canonical(c) {
  return JSON.stringify({
    client_id: c.client_id,
    mine_id: c.mine_id ?? null,
    kind: c.kind,
    note: c.note ?? "",
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    accuracy_m: c.accuracy_m ?? null,
    captured_at: c.captured_at,
  });
}

let baseUrl;
let cookie;
let server;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  server?.close();
});

test("health check responds", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: "coalsmart-backend" });
});

test("login rejects bad credentials", async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "director@coalsmart.gov", password: "wrong" }),
  });
  assert.equal(res.status, 401);
});

test("login sets cs_session cookie and /auth/me returns the user", async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "director@coalsmart.gov", password: "CoalSmart2025!" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.email, "director@coalsmart.gov");
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /^cs_session=/);
  assert.match(setCookie, /HttpOnly/);
  cookie = setCookie.split(";")[0];
});

test("GET /api/mines matches the frontend MinesResponse contract", async () => {
  const res = await fetch(`${baseUrl}/api/mines`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.items.length, 50);
  assert.match(body.today, /^\d{4}-\d{2}-\d{2}$/);
  const mine = body.items[0];
  assert.deepEqual(Object.keys(mine), [
    "id", "name", "state", "risk", "compliance", "lat", "lng", "open_issues", "last_inspection",
  ]);
});

test("field capture sync requires auth", async () => {
  const res = await fetch(`${baseUrl}/api/field/captures/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ captures: [] }),
  });
  assert.equal(res.status, 401);
});

test("sync stores a geo-tagged capture with photo, seal verified, drift recorded", async () => {
  const capture = {
    client_id: "OBS-TEST01",
    mine_id: "M-001",
    kind: "violation",
    note: "Bench instability near haul road",
    lat: 24.2,
    lng: 82.6,
    accuracy_m: 8.5,
    captured_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 min ago, offline queue
    photo: PNG_1PX,
  };
  const client_seal = createHash("sha256").update(canonical(capture)).digest("hex");

  const res = await fetch(`${baseUrl}/api/field/captures/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ device_id: "dev-test", captures: [{ ...capture, client_seal }] }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.rejected.length, 0);
  assert.equal(body.synced.length, 1);
  assert.equal(body.synced[0].already_synced, false);
  assert.match(body.synced[0].seal_hash, /^[0-9a-f]{64}$/);

  const list = await (await fetch(`${baseUrl}/api/field/captures?mine_id=M-001`, { headers: { Cookie: cookie } })).json();
  const row = list.items.find((r) => r.client_id === "OBS-TEST01");
  assert.ok(row, "capture should appear in the list");
  assert.equal(row.kind, "violation");
  assert.equal(row.lat, 24.2);
  assert.ok(row.drift_seconds >= 1100 && row.drift_seconds <= 1400, `drift ~20min, got ${row.drift_seconds}`);
  assert.ok(row.photo_url?.startsWith("/uploads/field/"));

  const photoPath = path.join(process.env.COALSMART_UPLOADS, path.basename(row.photo_url));
  assert.ok(existsSync(photoPath), "photo file saved to uploads dir");
  assert.equal(readFileSync(photoPath).length > 0, true);

  const stats = await (await fetch(`${baseUrl}/api/field/captures/stats`, { headers: { Cookie: cookie } })).json();
  assert.equal(stats.total, 1);
  assert.equal(stats.with_geo, 1);
  assert.equal(stats.with_photo, 1);
});

test("sync is idempotent on client_id (offline retry safe)", async () => {
  const capture = {
    client_id: "OBS-TEST01",
    kind: "violation",
    captured_at: new Date().toISOString(),
  };
  const res = await fetch(`${baseUrl}/api/field/captures/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ captures: [capture] }), // no seal, no photo — retry
  });
  const body = await res.json();
  assert.equal(body.synced[0].already_synced, true);

  const stats = await (await fetch(`${baseUrl}/api/field/captures/stats`, { headers: { Cookie: cookie } })).json();
  assert.equal(stats.total, 1, "duplicate client_id must not create a second row");
});

test("tampered payload fails seal verification", async () => {
  const capture = {
    client_id: "OBS-TAMPER",
    kind: "inspection",
    note: "all clear",
    captured_at: new Date().toISOString(),
    client_seal: createHash("sha256").update(canonical({ client_id: "OBS-TAMPER", kind: "inspection", note: "tampered", captured_at: captureNow() })).digest("hex"),
  };
  const res = await fetch(`${baseUrl}/api/field/captures/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ captures: [capture] }),
  });
  const body = await res.json();
  assert.equal(body.synced.length, 0);
  assert.match(body.rejected[0].reason, /seal mismatch/);
});

test("future-dated and out-of-range captures are rejected", async () => {
  const res = await fetch(`${baseUrl}/api/field/captures/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      captures: [
        { client_id: "OBS-FUTURE", kind: "inspection", captured_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
        { client_id: "OBS-BADGEO", kind: "inspection", captured_at: new Date().toISOString(), lat: 999, lng: 0 },
      ],
    }),
  });
  const body = await res.json();
  assert.equal(body.synced.length, 0);
  assert.equal(body.rejected.length, 2);
});

test("logout kills the session", async () => {
  const res = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(res.status, 204);
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 401);
});

function captureNow() {
  return new Date().toISOString();
}
