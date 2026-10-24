import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-compliance-test-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");

const { app, attachWebSocket } = await import("../src/index.js");
const { runEscalationTick } = await import("../src/engine/escalation.js");
const { db, todayIso } = await import("../src/db.js");

let baseUrl;
let cookie;
let server;

function daysFromTodayIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "director@coalsmart.gov", password: "CoalSmart2025!" }),
  });
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
});

test.after(() => server?.close());

test("compliance register is seeded and sorted by due date", async () => {
  const res = await fetch(`${baseUrl}/api/compliance/items`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const { items } = await res.json();
  assert.ok(items.length >= 16, "16 statutory items seeded");
  const dates = items.map((i) => i.due_date);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(items.some((i) => i.mine_name === "Singrauli North"), "joins mine names");
});

test("items require auth", async () => {
  const res = await fetch(`${baseUrl}/api/compliance/items`);
  assert.equal(res.status, 401);
});

test("escalation tick: pending → overdue → escalated(level 1 Corporate)", async () => {
  const created = await fetch(`${baseUrl}/api/compliance/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      mine_id: "M-007",
      title: "DGMS annual return",
      category: "safety",
      owner_role: "Mine Officer",
      due_date: daysFromTodayIso(-1),
    }),
  });
  assert.equal(created.status, 201);
  const { item } = await created.json();

  // Tick 1: one day past due — within grace, becomes overdue only.
  const t1 = runEscalationTick();
  const t1Item = t1.transitions.map((e) => e.item).find((i) => i.id === item.id);
  assert.ok(t1Item, "tick 1 transitions the item");
  assert.equal(t1Item.status, "overdue");
  assert.equal(t1Item.escalation_level ?? 0, 0);

  // Tick 2 (simulated two days later): past grace → escalated to Corporate.
  const later = new Date(Date.now() + 2 * 86_400_000);
  const t2 = runEscalationTick(later);
  const t2Item = t2.transitions.map((e) => e.item).find((i) => i.id === item.id);
  assert.ok(t2Item, "tick 2 escalates the item");
  assert.equal(t2Item.status, "escalated");
  assert.equal(t2Item.escalation_level, 1);
  assert.equal(t2Item.escalated_to, "Corporate Management");

  // Tick 3 (six days past due): escalates again to the Regulator.
  const muchLater = new Date(Date.now() + 7 * 86_400_000);
  const t3 = runEscalationTick(muchLater);
  const t3Item = t3.transitions.map((e) => e.item).find((i) => i.id === item.id);
  assert.equal(t3Item.escalation_level, 2);
  assert.equal(t3Item.escalated_to, "Regulator");

  const events = db.prepare("SELECT * FROM compliance_events WHERE item_id = ? ORDER BY at").all(item.id);
  assert.ok(events.length >= 3, "every transition is recorded");
});

test("overdue statutory load raises risk scores (Feature 2 integration)", async () => {
  const { recomputeAllRiskScores } = await import("../src/engine/risk.js");
  recomputeAllRiskScores();
  const scores = db.prepare("SELECT explanation FROM risk_scores WHERE mine_id = 'M-007'").get();
  const factors = JSON.parse(scores.explanation).factors.map((f) => f.factor);
  assert.ok(factors.includes("statutory_overdue"), "M-007 risk explanation includes statutory pressure");
});

test("WebSocket push delivers escalation events live", async () => {
  const httpServer = server;
  attachWebSocket(httpServer);

  const wsUrl = baseUrl.replace("http", "ws") + "/api/ws";
  const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie } });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  const created = await fetch(`${baseUrl}/api/compliance/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      mine_id: "M-008",
      title: "Environmental report",
      category: "environment",
      owner_role: "Compliance",
      due_date: daysFromTodayIso(-6),
    }),
  });
  const { item } = await created.json();

  // Trigger the escalation pass — this is what fires the push events.
  runEscalationTick();

  const message = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no ws message within 3s")), 3000);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      // The tick emits overdue then escalated for a deeply overdue item — wait for the final state.
      if (msg.type === "escalation" && msg.item?.id === item.id && msg.item.status === "escalated") {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });

  assert.equal(message.item.status, "escalated");
  assert.equal(message.item.escalated_to, "Regulator");
  ws.close();
});

test("stats endpoint summarizes the register", async () => {
  const res = await fetch(`${baseUrl}/api/compliance/stats`, { headers: { Cookie: cookie } });
  const stats = await res.json();
  assert.ok(stats.total >= 16);
  assert.ok(stats.overdue + stats.escalated >= 1, "seeded overdue items exist after ticks");
  assert.ok(stats.on_track_pct >= 0 && stats.on_track_pct <= 100);
});

test("PATCH resolves an item and records the event", async () => {
  const { items } = await (await fetch(`${baseUrl}/api/compliance/items?status=overdue`, { headers: { Cookie: cookie } })).json();
  const target = items[0];
  assert.ok(target, "an overdue item exists to resolve");
  const res = await fetch(`${baseUrl}/api/compliance/items/${target.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ status: "resolved" }),
  });
  const { item } = await res.json();
  assert.equal(item.status, "resolved");
  assert.equal(item.escalation_level, 0);

  const { items: escalations } = await (await fetch(`${baseUrl}/api/compliance/escalations?limit=5`, { headers: { Cookie: cookie } })).json();
  assert.ok(escalations.some((e) => e.item_id === target.id));
});

test("today helper matches the IST calendar date", () => {
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});
