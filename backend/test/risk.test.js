import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-risk-test-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");

const { app } = await import("../src/index.js");

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
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "director@coalsmart.gov", password: "CoalSmart2025!" }),
  });
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
});

test.after(() => server?.close());

test("risk scores exist for every mine with 0-100 scores and explanations", async () => {
  const res = await fetch(`${baseUrl}/api/risk/scores`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const { items } = await res.json();
  assert.equal(items.length, 50);
  for (const item of items) {
    assert.ok(item.score >= 0 && item.score <= 100);
    assert.ok(["low", "watch", "high"].includes(item.band));
    assert.ok(Array.isArray(item.explanation.factors) && item.explanation.factors.length > 0);
    assert.ok(item.computed_at);
  }
});

test("M-001 risk includes baseline, violations and pattern factors", async () => {
  const { items } = await (await fetch(`${baseUrl}/api/risk/scores`, { headers: { Cookie: cookie } })).json();
  const m001 = items.find((i) => i.mine_id === "M-001");
  assert.ok(m001, "M-001 should exist");
  assert.ok(["watch", "high"].includes(m001.band), `M-001 band should be watch or high, got ${m001.band}`);
  const factorNames = m001.explanation.factors.map((f) => f.factor);
  assert.ok(factorNames.includes("baseline"));
  assert.ok(factorNames.includes("open_violations"));
  assert.ok(factorNames.includes("repeat_pattern"));
});

test("Section 4 pattern spans multiple mines and contractors", async () => {
  const res = await fetch(`${baseUrl}/api/risk/patterns`, { headers: { Cookie: cookie } });
  const { items } = await res.json();
  const section4 = items.find((p) => p.section === "Section 4");
  assert.ok(section4, "Section 4 pattern should be detected");
  assert.ok(section4.mine_ids.length >= 3, "Section 4 should span at least 3 mines");
  assert.ok(section4.contractor_ids.length >= 2, "Section 4 should involve at least 2 contractors");
  assert.ok(section4.violation_count >= 3);
});

test("recompute endpoint requires auth and reports a summary", async () => {
  const anon = await fetch(`${baseUrl}/api/risk/recompute`, { method: "POST" });
  assert.equal(anon.status, 401);
  const res = await fetch(`${baseUrl}/api/risk/recompute`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  const body = await res.json();
  assert.equal(body.mine_count, 50);
  assert.ok(body.pattern_count >= 1);
});

test("a synced field violation capture raises that mine's risk and open issues", async () => {
  const before = await (await fetch(`${baseUrl}/api/risk/scores`, { headers: { Cookie: cookie } })).json();
  const beforeScore = before.items.find((i) => i.mine_id === "M-006").score;

  const capture = {
    client_id: "OBS-RISK01",
    mine_id: "M-006",
    kind: "violation",
    note: "Field-captured haul road violation",
    lat: 17.55,
    lng: 80.6,
    captured_at: new Date().toISOString(),
    severity: 3,
    section: "Section 4",
  };
  const sync = await fetch(`${baseUrl}/api/field/captures/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ captures: [capture] }),
  });
  assert.equal(sync.status, 200);
  assert.equal((await sync.json()).rejected.length, 0);

  const after = await (await fetch(`${baseUrl}/api/risk/scores`, { headers: { Cookie: cookie } })).json();
  const afterScore = after.items.find((i) => i.mine_id === "M-006").score;
  assert.ok(afterScore > beforeScore, `M-006 risk should rise (${beforeScore} → ${afterScore})`);

  const mines = await (await fetch(`${baseUrl}/api/mines`, { headers: { Cookie: cookie } })).json();
  const m006 = mines.items.find((m) => m.id === "M-006");
  assert.equal(m006.risk, afterScore, "/api/mines serves the live engine score");
  assert.ok(m006.open_issues >= 1, "open_issues reflects the new violation");
});

test("risk history records each computation", async () => {
  const { app: _a } = await import("../src/index.js");
  const { db } = await import("../src/db.js");
  const rows = db.prepare("SELECT COUNT(*) AS n FROM risk_score_history").get();
  assert.ok(rows.n >= 50, "history has at least one pass per mine");
});
