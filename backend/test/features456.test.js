import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const scratch = mkdtempSync(path.join(tmpdir(), "coalsmart-f456-"));
process.env.COALSMART_DB = path.join(scratch, "test.db");
process.env.COALSMART_UPLOADS = path.join(scratch, "uploads");

const { app } = await import("../src/index.js");
const { ocrAvailable, parseCertificate } = await import("../src/lib/ocr.js");

let baseUrl;
let server;
let directorCookie;
let officerCookie;
let regulatorCookie;

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
  regulatorCookie = await login("regulator@coalsmart.gov");
});

test.after(() => server?.close());

// ---------------------------------------------------------------------------
// Feature 4 — role-based dashboards
// ---------------------------------------------------------------------------

test("mine officer sees only their scoped mine in /api/mines", async () => {
  const res = await fetch(`${baseUrl}/api/mines`, { headers: { Cookie: officerCookie } });
  const { items } = await res.json();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "M-001");
});

test("corporate and regulator see the full portfolio", async () => {
  for (const cookie of [directorCookie, regulatorCookie]) {
    const { items } = await (await fetch(`${baseUrl}/api/mines`, { headers: { Cookie: cookie } })).json();
    assert.equal(items.length, 50);
  }
});

test("dashboard overview KPIs are role-scoped", async () => {
  const corp = await (await fetch(`${baseUrl}/api/dashboards/overview`, { headers: { Cookie: directorCookie } })).json();
  assert.equal(corp.total_mines, 50);
  assert.equal(corp.scope, "all");
  assert.ok(corp.high_risk >= 1);
  assert.ok(corp.avg_compliance > 0 && corp.avg_compliance <= 100);
  assert.ok(corp.open_actions >= corp.overdue_actions);

  const officer = await (await fetch(`${baseUrl}/api/dashboards/overview`, { headers: { Cookie: officerCookie } })).json();
  assert.equal(officer.total_mines, 1);
  assert.equal(officer.scope, "M-001");
  assert.equal(officer.role, "Mine Officer");
});

test("dashboards require auth", async () => {
  const res = await fetch(`${baseUrl}/api/dashboards/overview`);
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Feature 5 — OCR document auto-fill
// ---------------------------------------------------------------------------

test("parseCertificate extracts structured fields from certificate text", () => {
  const text = `
    DGMS SAFETY CERTIFICATE
    Mine Name: Singrauli North
    Mine ID: M-001
    Contractor Name: ABC Mining Services
    Valid From: 01-04-2025
    Valid Upto: 15-12-2026
  `;
  const p = parseCertificate(text);
  assert.equal(p.document_type, "DGMS certificate");
  assert.equal(p.mine_id, "M-001");
  assert.equal(p.mine_name, "Singrauli North");
  assert.equal(p.contractor_name, "ABC Mining Services");
  assert.equal(p.valid_from, "2025-04-01");
  assert.equal(p.expires_on, "2026-12-15");
  assert.equal(p.category, "safety");
});

test("parseCertificate reads colon-attached 'Contractor: X' labels", () => {
  // Regression: the label regex used to require whitespace before the colon,
  // so the most common certificate form ("Contractor: Bharat Mining Pvt Ltd")
  // silently dropped the contractor name.
  const p = parseCertificate(`
    SAFETY CERTIFICATE
    Contractor: Bharat Mining Pvt Ltd
    Mine: M-004
    Valid from: 01-04-2026
    Valid till: 31-03-2027
  `);
  assert.equal(p.contractor_name, "Bharat Mining Pvt Ltd");
  assert.equal(p.mine_id, "M-004");
  assert.equal(p.valid_from, "2026-04-01");
  assert.equal(p.expires_on, "2027-03-31");
});

test("parseCertificate handles month-name dates and environmental docs", () => {
  const p = parseCertificate(`
    ENVIRONMENTAL COMPLIANCE REPORT
    Mine: Talcher East (M-002)
    Date of issue: 14 March 2025
    Expiry Date: 30 November 2026
  `);
  assert.equal(p.category, "environment");
  assert.equal(p.mine_id, "M-002");
  assert.equal(p.valid_from, "2025-03-14");
  assert.equal(p.expires_on, "2026-11-30");
});

test("extract endpoint accepts pre-extracted text and stores the document", async () => {
  const res = await fetch(`${baseUrl}/api/documents/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({
      filename: "cert.txt",
      text: "CONTRACTOR REGISTRATION CERTIFICATE\nContractor Name: Eastern Haulage Co.\nMine ID: M-003\nValid From: 01-01-2026\nValid Upto: 31-12-2026",
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.prefill.contractor_name, "Eastern Haulage Co.");
  assert.equal(body.prefill.mine_id, "M-003");
  assert.equal(body.prefill.expires_on, "2026-12-31");
  assert.ok(body.document_id.startsWith("DOC-"));

  const list = await (await fetch(`${baseUrl}/api/documents`, { headers: { Cookie: directorCookie } })).json();
  assert.ok(list.items.some((d) => d.id === body.document_id));
});

test("extract endpoint rejects requests with no input", async () => {
  const res = await fetch(`${baseUrl}/api/documents/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test("end-to-end OCR: rendered certificate image → tesseract → prefill", { skip: !ocrAvailable().tesseract }, async () => {
  const pngPath = path.join(scratch, "cert.png");
  execFileSync("magick", [
    "-size", "1000x500", "xc:white",
    "-font", "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "-pointsize", "32", "-fill", "black",
    "-annotate", "+40+70", "DGMS SAFETY CERTIFICATE",
    "-annotate", "+40+130", "Mine Name: Singrauli North",
    "-annotate", "+40+190", "Mine ID: M-001",
    "-annotate", "+40+250", "Contractor Name: ABC Mining Services",
    "-annotate", "+40+310", "Valid Upto: 15-12-2026",
    pngPath,
  ]);
  const dataUrl = `data:image/png;base64,${readFileSync(pngPath).toString("base64")}`;

  const res = await fetch(`${baseUrl}/api/documents/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: directorCookie },
    body: JSON.stringify({ filename: "cert.png", file: dataUrl }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(/dgms/i.test(body.prefill.document_type), `type: ${body.prefill.document_type}`);
  assert.equal(body.prefill.mine_id, "M-001");
  assert.equal(body.prefill.contractor_name, "ABC Mining Services");
  assert.equal(body.prefill.expires_on, "2026-12-15");
});

// ---------------------------------------------------------------------------
// Feature 6 — production & environmental anomalies
// ---------------------------------------------------------------------------

test("active anomalies include the Singrauli production spike and PM10 breach", async () => {
  const res = await fetch(`${baseUrl}/api/anomalies`, { headers: { Cookie: directorCookie } });
  const { items } = await res.json();
  const prod = items.find((a) => a.mine_id === "M-001" && a.kind === "production");
  assert.ok(prod, "M-001 production spike flagged");
  assert.ok(prod.detail.includes("spiked 18%") || prod.data.deviation_pct >= 15);

  const env = items.find((a) => a.mine_id === "M-001" && a.kind === "environment");
  assert.ok(env, "M-001 PM10 breach flagged");
  assert.equal(env.data.metric, "pm10");
});

test("production series returns 30 days with the flagged point", async () => {
  const { items: anomalies } = await (await fetch(`${baseUrl}/api/anomalies`, { headers: { Cookie: directorCookie } })).json();
  const top = anomalies.find((a) => a.kind === "production");
  const bundle = await (await fetch(`${baseUrl}/api/anomalies/production/${top.mine_id}`, { headers: { Cookie: directorCookie } })).json();
  assert.equal(bundle.series.length, 30);
  assert.ok(bundle.anomalies.length >= 1);
  const flagged = bundle.anomalies[0];
  assert.ok(flagged.date && flagged.value > 0 && flagged.baseline > 0);
  assert.ok(Math.abs(flagged.deviation_pct) >= 15);
});

test("anomalies are role-scoped: officer cannot read another mine's series", async () => {
  const list = await (await fetch(`${baseUrl}/api/anomalies`, { headers: { Cookie: officerCookie } })).json();
  assert.ok(list.items.every((a) => a.mine_id === "M-001"));

  const denied = await fetch(`${baseUrl}/api/anomalies/production/M-002`, { headers: { Cookie: officerCookie } });
  assert.equal(denied.status, 403);

  const own = await fetch(`${baseUrl}/api/anomalies/production/M-001`, { headers: { Cookie: officerCookie } });
  assert.equal(own.status, 200);
});

test("the Jharia West production drop is detected too", async () => {
  const bundle = await (await fetch(`${baseUrl}/api/anomalies/production/M-004`, { headers: { Cookie: directorCookie } })).json();
  assert.ok(bundle.anomalies.some((a) => a.direction === "drop"), "M-004 seeded dip flagged");
});
