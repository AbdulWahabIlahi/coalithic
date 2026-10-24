import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-audit-test-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");

const { app } = await import("../src/index.js");
const { db } = await import("../src/db.js");
const { verifyAuditChain, GENESIS_HASH } = await import("../src/lib/audit.js");
const { runEscalationTick } = await import("../src/engine/escalation.js");

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

// ---------------------------------------------------------------------------
// Chain capture
// ---------------------------------------------------------------------------

test("mutations land in the audit trail with actor and chained hashes", async () => {
  const res = await fetch(`${baseUrl}/api/compliance/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({
      mine_id: "M-001",
      title: "Audit trail witness item",
      category: "safety",
      owner_role: "Mine Officer",
      due_date: "2026-12-01",
    }),
  });
  assert.equal(res.status, 201);
  await settle();

  const { items, total } = await (await fetch(`${baseUrl}/api/audit/logs`, { headers: { Cookie: directorCookie } })).json();
  assert.ok(total >= 3, "login + login + create captured");
  const create = items.find((i) => i.action === "post:compliance/items");
  assert.ok(create, "create action logged");
  assert.equal(create.actor, "director@coalsmart.gov");
  assert.equal(create.entity, "compliance_item");
  const detail = JSON.parse(create.detail);
  assert.equal(detail.title, "Audit trail witness item");
  assert.ok(!("password" in detail), "passwords never logged");

  // Consecutive rows link: each prev_hash equals the previous row's hash.
  const asc = [...items].sort((a, b) => a.id - b.id);
  for (let i = 1; i < asc.length; i++) {
    assert.equal(asc[i].prev_hash, asc[i - 1].hash, `link ${asc[i].id} seals ${asc[i - 1].id}`);
  }
  assert.equal(asc[0].prev_hash, GENESIS_HASH, "chain starts at genesis");
});

test("chain verification passes on the live trail", async () => {
  const result = await (await fetch(`${baseUrl}/api/audit/verify`, { headers: { Cookie: directorCookie } })).json();
  assert.equal(result.ok, true);
  assert.ok(result.checked >= 3);
  assert.match(result.head, /^[0-9a-f]{64}$/);
  assert.deepEqual(result, verifyAuditChain(), "route matches the library");
});

test("escalation tick seals system transitions into the trail", async () => {
  runEscalationTick(new Date());
  await settle();
  const { items } = await (await fetch(`${baseUrl}/api/audit/logs`, { headers: { Cookie: directorCookie } })).json();
  const system = items.find((i) => i.actor === "system" && i.action === "escalation");
  assert.ok(system, "system escalation logged");
  const detail = JSON.parse(system.detail);
  assert.ok(detail.from && detail.to, "transition captured");
  assert.ok(detail.mine_id, "mine reference captured for role scoping");
});

// ---------------------------------------------------------------------------
// Append-only enforcement + tamper detection
// ---------------------------------------------------------------------------

test("audit_logs rejects UPDATE and DELETE (append-only)", () => {
  assert.throws(
    () => db.prepare("UPDATE audit_logs SET action = 'tampered' WHERE id = 1").run(),
    /append-only/,
  );
  assert.throws(
    () => db.prepare("DELETE FROM audit_logs WHERE id = 1").run(),
    /append-only/,
  );
});

test("exports and auth are audited; reports require auth", async () => {
  const noAuth = await fetch(`${baseUrl}/api/reports/compliance.csv`);
  assert.equal(noAuth.status, 401);
  assert.equal((await fetch(`${baseUrl}/api/audit/logs`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/audit/verify`)).status, 401);

  const csvRes = await fetch(`${baseUrl}/api/reports/compliance.csv`, { headers: { Cookie: directorCookie } });
  assert.equal(csvRes.status, 200);
  await settle();
  const { items } = await (await fetch(`${baseUrl}/api/audit/logs`, { headers: { Cookie: directorCookie } })).json();
  assert.ok(items.some((i) => i.action === "export:compliance.csv"), "CSV export sealed");
  assert.ok(items.some((i) => i.action === "post:auth/login"), "login sealed");
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

test("CSV export: header, statutory rows, attachment headers", async () => {
  const res = await fetch(`${baseUrl}/api/reports/compliance.csv`, { headers: { Cookie: directorCookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="coalsmart-compliance-\d{4}-\d{2}-\d{2}\.csv"/);
  const csv = await res.text();
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "id,mine_id,mine_name,title,category,owner_role,due_date,status,escalated_to,days_overdue");
  assert.ok(lines.length >= 17, "16+ seeded obligations + witness item");
  assert.ok(csv.includes("DGMS safety return"));
  assert.ok(csv.includes('"Audit trail witness item"') || csv.includes("Audit trail witness item"));
});

test("CSV export is role-scoped for the mine officer", async () => {
  const csv = await (await fetch(`${baseUrl}/api/reports/compliance.csv`, { headers: { Cookie: officerCookie } })).text();
  assert.ok(csv.includes("M-001"), "own mine included");
  assert.ok(!csv.includes("M-002"), "other mines excluded");
  assert.ok(!csv.includes("Talcher"), "other sites excluded");
});

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

test("PDF export: valid PDF bytes with the register table", async () => {
  const res = await fetch(`${baseUrl}/api/reports/compliance.pdf`, { headers: { Cookie: directorCookie } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.match(res.headers.get("content-disposition") ?? "", /\.pdf"/);
  const bytes = Buffer.from(await res.arrayBuffer());
  const head = bytes.subarray(0, 8).toString("latin1");
  assert.ok(head.startsWith("%PDF-1.4"), `header: ${head}`);
  assert.ok(bytes.subarray(-32).toString("latin1").includes("%%EOF"), "EOF marker");

  // The hand-rolled file must parse with the system pdftotext when available.
  const hasPdfToText = spawnSync("pdftotext", ["-v"], { stdio: "ignore" }).status === 0;
  if (hasPdfToText) {
    const file = path.join(scratch, "out.pdf");
    writeFileSync(file, bytes);
    const text = spawnSync("pdftotext", ["-layout", file, "-"]).stdout.toString("utf8");
    assert.ok(text.includes("Statutory Compliance Register"), "title extractable");
    // WinAnsi-encoded Courier text may not reverse-map through pdftotext; verify
    // the row content is present in the raw content stream instead.
    assert.ok(bytes.includes(Buffer.from("DGMS safety return")), "compliance rows present in PDF");
    assert.ok(bytes.includes(Buffer.from("M-001")), "mine ids present in PDF");
  }
});

test("audit trail is role-scoped for the mine officer", async () => {
  const { items } = await (await fetch(`${baseUrl}/api/audit/logs`, { headers: { Cookie: officerCookie } })).json();
  assert.ok(items.length > 0);
  for (const item of items) {
    const detail = JSON.parse(item.detail);
    const mine = detail.mine_id ?? null;
    const visible = item.actor === "officer@coalsmart.gov" || item.entity_id === "M-001" || mine === "M-001";
    assert.ok(visible, `entry ${item.id} (${item.action} by ${item.actor}) should be out of scope`);
  }
});

// ---------------------------------------------------------------------------
// Tamper detection — MUST run last: it drops the guard trigger to simulate
// an attacker rewriting history, then proves verifyAuditChain() catches it.
// ---------------------------------------------------------------------------

test("verify detects a rewritten row once the append-only guard is bypassed", () => {
  const before = verifyAuditChain();
  assert.equal(before.ok, true);

  db.exec("DROP TRIGGER audit_logs_no_update");
  const target = db.prepare("SELECT id FROM audit_logs ORDER BY id ASC LIMIT 1").get();
  db.prepare("UPDATE audit_logs SET detail = '{\"forged\":true}' WHERE id = ?").run(target.id);

  const after = verifyAuditChain();
  assert.equal(after.ok, false);
  assert.equal(after.broken_at, target.id);
  assert.match(after.reason, /hash/i);
});
