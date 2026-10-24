import { createHash } from "node:crypto";
import type { Connect, Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

// Stand-in for the FastAPI backend (backend/models/*) so the control room runs
// without Python. Serve the real API by running with VITE_NO_MOCK=1 — Vite then
// proxies /api to localhost:8001 instead.

const DEMO_EMAIL = "director@coalsmart.gov";
const DEMO_PASSWORD = "CoalSmart2025!";
const COOKIE = "cs_session=demo-session; Path=/; HttpOnly; SameSite=Lax";

type Seed = {
  id: string;
  name: string;
  state: string;
  risk: number;
  compliance: number;
  lat: number;
  lng: number;
  open_issues: number;
  last_inspection: string;
};

const MINES: Seed[] = [
  { id: "M-001", name: "Singrauli North", state: "Madhya Pradesh", risk: 78, compliance: 72, lat: 24.2, lng: 82.6, open_issues: 9, last_inspection: "2025-10-02" },
  { id: "M-002", name: "Talcher East", state: "Odisha", risk: 64, compliance: 81, lat: 20.95, lng: 85.2, open_issues: 5, last_inspection: "2025-10-06" },
  { id: "M-003", name: "Korba Deep", state: "Chhattisgarh", risk: 71, compliance: 76, lat: 22.35, lng: 82.7, open_issues: 7, last_inspection: "2025-09-28" },
  { id: "M-004", name: "Jharia West", state: "Jharkhand", risk: 58, compliance: 84, lat: 23.75, lng: 86.4, open_issues: 4, last_inspection: "2025-10-09" },
  { id: "M-005", name: "Raniganj South", state: "West Bengal", risk: 47, compliance: 89, lat: 23.6, lng: 87.1, open_issues: 3, last_inspection: "2025-10-11" },
  { id: "M-006", name: "Godavari Kothagudem", state: "Telangana", risk: 41, compliance: 92, lat: 17.55, lng: 80.6, open_issues: 2, last_inspection: "2025-10-12" },
  { id: "M-007", name: "Wardha Valley", state: "Maharashtra", risk: 35, compliance: 94, lat: 20.1, lng: 78.6, open_issues: 1, last_inspection: "2025-10-14" },
  { id: "M-008", name: "Mand-Raigarh", state: "Chhattisgarh", risk: 28, compliance: 96, lat: 22.1, lng: 83.3, open_issues: 0, last_inspection: "2025-10-15" },
  { id: "M-009", name: "Singrauli South", state: "Uttar Pradesh", risk: 52, compliance: 87, lat: 24.1, lng: 82.9, open_issues: 3, last_inspection: "2025-10-08" },
  { id: "M-010", name: "Cherrapunji LUM", state: "Meghalaya", risk: 39, compliance: 90, lat: 25.3, lng: 91.7, open_issues: 2, last_inspection: "2025-10-10" },
  { id: "M-011", name: "Neyveli Lignite", state: "Tamil Nadu", risk: 22, compliance: 97, lat: 11.6, lng: 79.5, open_issues: 0, last_inspection: "2025-10-16" },
  { id: "M-012", name: "Barmer Opencast", state: "Rajasthan", risk: 31, compliance: 93, lat: 25.75, lng: 71.4, open_issues: 1, last_inspection: "2025-10-13" },
];

const USER = {
  email: DEMO_EMAIL,
  name: "Aarav Sharma",
  role: "Corporate Management",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

function serverInfo(now = new Date()) {
  const iso = now.toISOString().slice(0, 10);
  const label = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const short = `${now.getDate()} ${MONTHS[now.getMonth()].slice(0, 3)} ${now.getFullYear()}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} IST`;
  const h = now.getHours();
  const part_of_day = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return { today_iso: iso, today_label: label, today_short: short, time_label: `${short} · ${time}`, part_of_day };
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function handler(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  const url = (req.url ?? "").split("?")[0];
  if (!url.startsWith("/api/")) return next();

  const signedIn = (req.headers.cookie ?? "").includes("cs_session=");
  const plus = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

  if (url === "/api/auth/me" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { user: USER, server: serverInfo() });
  }

  if (url === "/api/auth/login" && req.method === "POST") {
    return void readBody(req).then((body) => {
      if (body.email !== DEMO_EMAIL || body.password !== DEMO_PASSWORD) {
        return send(res, 401, { detail: "invalid credentials" });
      }
      return send(res, 200, { token: "demo-session", user: USER }, { "Set-Cookie": COOKIE });
    });
  }

  if (url === "/api/auth/logout" && req.method === "POST") {
    return send(res, 204, null, { "Set-Cookie": "cs_session=; Path=/; HttpOnly; Max-Age=0" });
  }

  if (url === "/api/mines" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { items: MINES, today: serverInfo().today_iso });
  }

  // Feature 1 — offline field capture sync (stand-in for backend/src/routes/field.js).
  if (url === "/api/field/captures/sync" && req.method === "POST") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((parsed) => {
      const captures = Array.isArray((parsed as { captures?: unknown[] }).captures)
        ? ((parsed as { captures: Record<string, unknown>[] }).captures)
        : [];
      const synced = captures
        .filter((c) => typeof c?.client_id === "string")
        .map((c) => ({
          client_id: c.client_id,
          id: `CAP-${Math.random().toString(16).slice(2, 12).toUpperCase()}`,
          seal_hash: createHash("sha256").update(String(c.client_id)).digest("hex"),
          already_synced: false,
        }));
      return send(res, 200, {
        synced,
        rejected: captures
          .filter((c) => typeof c?.client_id !== "string")
          .map(() => ({ client_id: null, reason: "missing client_id" })),
        server_received_at: new Date().toISOString(),
      });
    });
  }

  if (url === "/api/field/captures/stats" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { total: 0, with_geo: 0, with_photo: 0, latest_sync: null });
  }

  if (url === "/api/field/captures" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { items: [] });
  }

  // Feature 2 — AI risk engine stand-in: the demo's Section 4 story.
  if (url === "/api/risk/patterns" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, {
      items: [
        {
          id: "P-SECTION4",
          section: "Section 4",
          mine_ids: ["M-001", "M-002", "M-003"],
          contractor_ids: ["C-01", "C-02"],
          violation_count: 4,
          first_seen: new Date(Date.now() - 12 * 864e5).toISOString(),
          last_seen: new Date(Date.now() - 3 * 864e5).toISOString(),
        },
      ],
    });
  }

  if (url === "/api/risk/scores" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { items: [] });
  }

  if (url === "/api/risk/recompute" && req.method === "POST") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { computed_at: new Date().toISOString(), mine_count: 12, pattern_count: 1 });
  }

  // B2 — violations with contractor attribution stand-in.
  if (url === "/api/risk/violations" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, {
      items: [
        { id: "V-0001", mine_id: "M-001", mine_name: "Singrauli North", section: "South Ramp", title: "Warning signage missing", severity: 2, status: "open", opened_at: new Date(Date.now() - 3 * 864e5).toISOString(), closed_at: null, contractor_id: "C-01", contractor_name: "Bharat Mining Services" },
        { id: "V-0002", mine_id: "M-001", mine_name: "Singrauli North", section: "Dump Yard", title: "Dust suppression idle", severity: 3, status: "open", opened_at: new Date(Date.now() - 1 * 864e5).toISOString(), closed_at: null, contractor_id: null, contractor_name: null },
        { id: "V-0003", mine_id: "M-002", mine_name: "Talcher East", section: "South Ramp", title: "Bench edge marking faded", severity: 1, status: "open", opened_at: new Date(Date.now() - 6 * 864e5).toISOString(), closed_at: null, contractor_id: "C-02", contractor_name: "Eastern Haulage Co." },
      ],
    });
  }

  // Feature 3 — statutory register stand-in (static demo snapshot).
  if (url === "/api/compliance/items" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, {
      items: [
        { id: "K-01", mine_id: "M-002", mine_name: "Talcher East", title: "Environmental report", category: "environment", owner_role: "Compliance", due_date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), status: "pending", escalation_level: 0, escalated_to: null, days_overdue: 0 },
        { id: "K-02", mine_id: "M-001", mine_name: "Singrauli North", title: "Labour compliance", category: "labour", owner_role: "Mine Officer", due_date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), status: "pending", escalation_level: 0, escalated_to: null, days_overdue: 2 },
        { id: "K-03", mine_id: "M-003", mine_name: "Korba Deep", title: "Safety inspection", category: "safety", owner_role: "Mine Officer", due_date: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), status: "pending", escalation_level: 0, escalated_to: null, days_overdue: 0 },
        { id: "K-04", mine_id: "M-004", mine_name: "Jharia West", title: "Equipment certification", category: "equipment", owner_role: "Mine Officer", due_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), status: "pending", escalation_level: 0, escalated_to: null, days_overdue: 0 },
      ],
    });
  }

  if (url === "/api/compliance/stats" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { total: 14, by_status: { pending: 12, overdue: 2 }, overdue: 2, escalated: 0, pending: 12, resolved: 0, open: 14, on_track_pct: 86 });
  }

  if (url === "/api/compliance/escalations" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { items: [] });
  }

  // Feature 4 — role-scoped KPI strip (demo user is Corporate: full portfolio).
  if (url === "/api/dashboards/overview" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, {
      role: "Corporate Management",
      scope: "all",
      today: serverInfo().today_iso,
      total_mines: 12,
      high_risk: 3,
      watch: 5,
      avg_compliance: 91,
      open_violations: 8,
      overdue_actions: 12,
      pending_actions: 36,
      field_captures: 0,
      open_actions: 48,
    });
  }

  // Feature 6 — anomaly engine stand-in (Singrauli North spike story).
  if (url === "/api/anomalies" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, {
      items: [
        {
          mine_id: "M-001",
          mine_name: "Singrauli North",
          kind: "production",
          severity: "medium",
          at: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10),
          detail: "Singrauli North spiked 18% vs its 30-day baseline (4200 t)",
        },
      ],
    });
  }

  if (url.startsWith("/api/anomalies/production/") && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const mineId = url.split("/").pop();
    const series = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10),
      coal_tons: 4200 * (0.94 + ((i * 37) % 10) / 100),
    }));
    series[27] = { ...series[27], coal_tons: 4200 * 1.18 };
    return send(res, 200, {
      mine_id: mineId,
      mine_name: "Singrauli North",
      series,
      anomalies: [
        {
          date: series[27].date,
          value: Math.round(series[27].coal_tons),
          baseline: 4200,
          deviation_pct: 18,
          z_score: 2.4,
          direction: "spike",
          detail: "Singrauli North spiked 18% vs its 30-day baseline (4200 t)",
        },
      ],
      sensor_breaches: [],
    });
  }

  // Feature 5 — OCR stand-in: parse nothing, echo a friendly demo prefill.
  if (url === "/api/documents/extract" && req.method === "POST") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, {
      document_id: "DOC-DEMO00000",
      raw_text: "(demo mode — run the real backend for live OCR)",
      prefill: {
        document_type: "DGMS certificate",
        category: "safety",
        mine_id: "M-001",
        mine_name: "Singrauli North",
        contractor_name: "ABC Mining Services",
        valid_from: "2025-04-01",
        expires_on: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
        title: "DGMS certificate · ABC Mining Services",
      },
    });
  }

  if (url === "/api/documents" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { items: [] });
  }

  // Feature 7 — audit trail + statutory export stand-ins.
  if (url.startsWith("/api/audit/logs") && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const mk = (id: number, actor: string, action: string, entity: string, detail: object) => ({
      id,
      at: new Date(Date.now() - id * 3600e3).toISOString(),
      actor,
      actor_role: "Corporate Management",
      action,
      entity,
      entity_id: null,
      method: action.split(":")[0].toUpperCase(),
      path: `/api/${action.split(":")[1]}`,
      status: 200,
      detail: JSON.stringify(detail),
      prev_hash: String(id).padStart(64, "0"),
      hash: `${id.toString(16).padStart(2, "f")}${"b".repeat(60)}${id.toString(16).padStart(2, "0")}`.slice(0, 64),
    });
    const items = [
      mk(48, "director@coalsmart.gov", "export:compliance.csv", "report", { rows: 16, scoped_to: "all" }),
      mk(47, "officer@coalsmart.gov", "post:compliance/items", "compliance_item", { mine_id: "M-001", title: "Safety inspection" }),
      mk(46, "system", "escalation", "compliance_item", { mine_id: "M-004", from: "overdue", to: "escalated", escalated_to: "Corporate Management" }),
      mk(45, "director@coalsmart.gov", "post:risk/recompute", "risk_score", { scope: "all" }),
      mk(44, "officer@coalsmart.gov", "post:auth/login", "session", { email: "officer@coalsmart.gov" }),
    ];
    return send(res, 200, { items, total: 48 });
  }

  if (url === "/api/audit/verify" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { ok: true, checked: 48, head: `${"9f".repeat(32)}` });
  }

  if (url === "/api/reports/compliance.csv" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const header = "id,mine_id,mine_name,title,category,owner_role,due_date,status,escalated_to,days_overdue";
    const demoRows = [
      "K-01,M-002,Talcher East,Environmental report,environment,Compliance,2026-10-24,pending,,0",
      "K-04,M-001,Singrauli North,DGMS safety return,safety,Mine Officer,2026-10-16,overdue,,6",
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="coalsmart-compliance-${serverInfo().today_iso}.csv"`);
    res.end(`${[header, ...demoRows].join("\r\n")}\r\n`);
    return;
  }

  if (url === "/api/reports/compliance.pdf" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    // Demo stub — the real backend renders the full table with its own PDF writer.
    const pdf = [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj",
      "trailer << /Root 1 0 R >>",
      "startxref 0",
      "%%EOF",
      "",
    ].join("\n");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="coalsmart-compliance-${serverInfo().today_iso}.pdf"`);
    res.end(Buffer.from(pdf, "latin1"));
    return;
  }

  // B6 — Excel (SpreadsheetML) option for every report type in demo mode.
  if (url.match(/^\/api\/reports\/[a-z]+\.xls$/) && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const type = url.split("/").pop()!.replace(".xls", "");
    const xls = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${type}"><Table>
<Row><Cell ss:StyleID="h"><Data ss:Type="String">id</Data></Cell><Cell><Data ss:Type="String">status</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">DEMO-001</Data></Cell><Cell><Data ss:Type="String">pending</Data></Cell></Row>
</Table></Worksheet></Workbook>`;
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="coalsmart-${type}-${serverInfo().today_iso}.xls"`);
    res.end(xls);
    return;
  }

  // ---------------------------------------------------------------------------
  // Feature 2 — alert center stand-in (demo snapshot).
  // ---------------------------------------------------------------------------
  if (url === "/api/alerts" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const items = [
      {
        id: 1, key: "risk:high:M-001", mine_id: "M-001", category: "risk", severity: "high" as const,
        title: "High risk — M-001", message: "Risk score 78/100 — review contributing factors",
        status: "open", read_at: null, assigned_to: null, created_at: plus(-1), data: { score: 78 },
      },
      {
        id: 2, key: "contract:expiry:C-01", mine_id: "M-001", category: "contract", severity: "medium" as const,
        title: "Certificate expiring — ABC Mining Services", message: "Safety certificate for ABC Mining Services expires soon",
        status: "open", read_at: null, assigned_to: null, created_at: plus(-2), data: { contractor_id: "C-01" },
      },
      {
        id: 3, key: "contract:expiry:C-03", mine_id: "M-003", category: "contract", severity: "high" as const,
        title: "Certificate lapsed — Shakti Industrial Works", message: "Safety certificate for Shakti Industrial Works has lapsed",
        status: "open", read_at: null, assigned_to: null, created_at: plus(-3), data: { contractor_id: "C-03", expired: true },
      },
      {
        id: 4, key: "compliance:overdue:K-04", mine_id: "M-001", category: "compliance", severity: "high" as const,
        title: "Overdue — DGMS safety return", message: "Statutory item K-04 is past its due date",
        status: "open", read_at: plus(-4), assigned_to: null, created_at: plus(-5), data: { item_id: "K-04" },
      },
    ];
    return send(res, 200, { items });
  }

  if (url.match(/^\/api\/alerts\/\d+$/) && req.method === "PATCH") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body) => {
      return send(res, 200, { item: { id: Number(url.split("/").pop()), read_at: body.read ? new Date().toISOString() : null, assigned_to: body.assigned_to ?? null } });
    });
  }

  // ---------------------------------------------------------------------------
  // Feature 3 — contractor management stand-in.
  // ---------------------------------------------------------------------------
  const CONTRACTORS = [
    { id: "C-01", name: "ABC Mining Services", mine_id: "M-001", contact_name: "R. Patel", contact_phone: "+91 98765 00001", safety_cert_expiry: plus(5), compliance: "watch" as const, notes: "Safety cert due for renewal" },
    { id: "C-02", name: "Eastern Haulage Co.", mine_id: "M-002", contact_name: "S. Reddy", contact_phone: "+91 98765 00002", safety_cert_expiry: plus(40), compliance: "compliant" as const, notes: "" },
    { id: "C-03", name: "Shakti Industrial Works", mine_id: "M-003", contact_name: "T. Das", contact_phone: "+91 98765 00003", safety_cert_expiry: plus(-3), compliance: "breach" as const, notes: "Safety certificate lapsed" },
    { id: "C-04", name: "RKS Earth Movers", mine_id: "M-004", contact_name: "V. Singh", contact_phone: "+91 98765 00004", safety_cert_expiry: plus(60), compliance: "compliant" as const, notes: "" },
  ];

  if (url === "/api/contractors" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { items: CONTRACTORS });
  }

  if (url === "/api/contractors/expiring" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const within = Number.parseInt((req.url ?? "").match(/within_days=(\d+)/)?.[1] ?? "14", 10);
    const limit = new Date(Date.now() + within * 864e5).toISOString().slice(0, 10);
    const items = CONTRACTORS.filter((c) => c.safety_cert_expiry && c.safety_cert_expiry <= limit);
    return send(res, 200, { items });
  }

  if (url === "/api/contractors" && req.method === "POST") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body) => {
      const item = { id: `C-${Math.random().toString(16).slice(2, 8).toUpperCase()}`, ...body };
      return send(res, 201, { item });
    });
  }

  if (url.match(/^\/api\/contractors\/.+$/) && req.method === "PATCH") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body) => {
      const item = { ...CONTRACTORS.find((c) => c.id === url.split("/").pop()), ...body };
      return send(res, 200, { item });
    });
  }

  // ---------------------------------------------------------------------------
  // Feature 4 — environment monitoring stand-in.
  // ---------------------------------------------------------------------------
  const SENSOR_LATEST = [
    { mine_id: "M-001", mine_name: "Singrauli North", metric: "pm10", value: 168, unit: "µg/m³", limit_value: 100, breach: 1, recorded_at: new Date().toISOString() },
    { mine_id: "M-001", mine_name: "Singrauli North", metric: "noise", value: 88, unit: "dB", limit_value: 95, breach: 0, recorded_at: new Date().toISOString() },
    { mine_id: "M-002", mine_name: "Talcher East", metric: "water_ph", value: 9.4, unit: "pH", limit_value: 8.5, breach: 1, recorded_at: new Date().toISOString() },
    { mine_id: "M-002", mine_name: "Talcher East", metric: "pm10", value: 76, unit: "µg/m³", limit_value: 100, breach: 0, recorded_at: new Date().toISOString() },
    { mine_id: "M-003", mine_name: "Korba Deep", metric: "pm10", value: 82, unit: "µg/m³", limit_value: 100, breach: 0, recorded_at: new Date().toISOString() },
    { mine_id: "M-004", mine_name: "Jharia West", metric: "noise", value: 91, unit: "dB", limit_value: 95, breach: 0, recorded_at: new Date().toISOString() },
  ];

  if (url === "/api/environment" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { items: SENSOR_LATEST });
  }

  // B6 — breach history stand-in (must precede the generic /:mineId match).
  if (url === "/api/environment/breaches" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, {
      items: SENSOR_LATEST.filter((s) => s.breach === 1).map((s, i) => ({
        id: `SR-${i + 1}`,
        ...s,
        direction: "max",
      })),
      scoped_to: null,
    });
  }

  if (url.match(/^\/api\/environment\/[^/]+$/) && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const mineId = url.split("/").pop()!;
    const latest = SENSOR_LATEST.filter((r) => r.mine_id === mineId);
    return send(res, 200, { mine_id: mineId, latest, history: latest });
  }

  if (url === "/api/environment/limits" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, {
      items: [
        { metric: "pm10", limit_value: 100, unit: "µg/m³", direction: "max" },
        { metric: "noise", limit_value: 95, unit: "dB", direction: "max" },
        { metric: "water_ph", limit_value: 8.5, unit: "pH", direction: "max" },
      ],
    });
  }

  if (url.match(/^\/api\/environment\/limits\/[^/]+$/) && req.method === "PUT") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body) => {
      const metric = url.split("/").pop()!;
      return send(res, 200, { item: { metric, ...body } });
    });
  }

  // ---------------------------------------------------------------------------
  // Feature 5 — AI depth stand-in (explain + root-cause).
  // ---------------------------------------------------------------------------
  if (url.match(/^\/api\/risk\/explain\/[^/]+$/) && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const mineId = url.split("/").pop()!;
    return send(res, 200, {
      mine_id: mineId,
      score: 78,
      band: "high",
      delta: 0,
      factors: [
        { factor: "baseline", delta: 58, detail: "Seeded portfolio baseline for M-001" },
        { factor: "open_violations", delta: 15, detail: "4 open violation(s), 3 in the last 14 days" },
        { factor: "statutory_overdue", delta: 4, detail: "1 overdue, 0 escalated statutory item(s)" },
        { factor: "repeat_pattern", delta: 5, detail: "Member of 1 repeat-violation pattern(s) across the portfolio" },
      ],
      patterns: 1,
      computed_at: new Date().toISOString(),
    });
  }

  if (url.match(/^\/api\/risk\/root-cause\/[^/]+$/) && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const mineId = url.split("/").pop()!;
    return send(res, 200, {
      mine_id: mineId,
      by_section: [
        { section: "Section 4", n: 3, contractors: "C-01,C-02" },
        { section: "Section 22", n: 1, contractors: "C-02" },
      ],
      by_contractor: [
        { contractor_id: "C-01", name: "ABC Mining Services", n: 2 },
        { contractor_id: "C-02", name: "Eastern Haulage Co.", n: 1 },
      ],
      patterns: [
        { id: "P-SECTION4", section: "Section 4", mine_ids: ["M-001", "M-002", "M-003"], contractor_ids: ["C-01", "C-02"], violation_count: 4 },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // Feature 11 — attendance stand-in.
  const ATTENDANCE: Array<{
    id: string; mine_id: string; mine_name: string; work_date: string;
    workers_in: number; workers_out: number; headcount: number;
    recorded_by: string | null; created_at: string;
  }> = (() => {
    const rows = [];
    const base: Record<string, number> = { "M-001": 186, "M-002": 142, "M-003": 164, "M-004": 118, "M-005": 96 };
    const names: Record<string, string> = {
      "M-001": "Singrauli North", "M-002": "Talcher East", "M-003": "Korba Deep",
      "M-004": "Jharia West", "M-005": "Raniganj South",
    };
    for (const [mineId, baseline] of Object.entries(base)) {
      for (let day = 13; day >= 0; day--) {
        const d = new Date(Date.now() - day * 864e5).toISOString().slice(0, 10);
        const headcount = Math.round(baseline * (0.93 + ((day * 37) % 12) / 100));
        rows.push({
          id: `AT-${mineId.slice(2)}-${d.replace(/-/g, "")}`,
          mine_id: mineId, mine_name: names[mineId], work_date: d,
          workers_in: headcount + 3, workers_out: Math.max(0, headcount - 2),
          headcount, recorded_by: "seed", created_at: `${d}T09:00:00.000Z`,
        });
      }
    }
    return rows;
  })();

  if (url === "/api/attendance" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const latest = new Map<string, (typeof ATTENDANCE)[number]>();
    for (const row of ATTENDANCE) {
      const prev = latest.get(row.mine_id);
      if (!prev || row.work_date > prev.work_date) latest.set(row.mine_id, row);
    }
    return send(res, 200, { items: [...latest.values()] });
  }

  if (url.match(/^\/api\/attendance\/[^/]+$/) && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    const mineId = url.split("/").pop();
    const days = Number(new URL(req.url ?? "/", "http://x").searchParams.get("days")) || 14;
    const items = ATTENDANCE.filter((r) => r.mine_id === mineId)
      .sort((a, b) => b.work_date.localeCompare(a.work_date))
      .slice(0, days);
    return send(res, 200, { mine_id: mineId, items });
  }

  if (url === "/api/attendance" && req.method === "POST") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body: any) => {
      const idx = ATTENDANCE.findIndex((r) => r.mine_id === body.mine_id && r.work_date === body.work_date);
      if (idx >= 0) {
        ATTENDANCE[idx] = { ...ATTENDANCE[idx], ...body, mine_name: ATTENDANCE[idx].mine_name, recorded_by: "demo@coalsmart.gov" };
        return send(res, 200, { item: ATTENDANCE[idx] });
      }
      const item = {
        id: `AT-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
        mine_name: "Singrauli North", recorded_by: "demo@coalsmart.gov",
        created_at: new Date().toISOString(), ...body,
      } as (typeof ATTENDANCE)[number];
      ATTENDANCE.push(item);
      return send(res, 201, { item });
    });
  }

  // ---------------------------------------------------------------------------
  // Feature 12 — grievances stand-in.
  const grievanceNow = Date.now();
  const GRIEVANCES: Array<any> = [
    {
      id: "GR-0001", mine_id: "M-001", mine_name: "Singrauli North", worker_name: "Ramesh Kumar",
      category: "safety", description: "Bench edge marking missing near the south ramp.",
      status: "open", sla_hours: 72,
      sla_due_at: new Date(grievanceNow + 40 * 36e5).toISOString(),
      sla_remaining_hours: 40, sla_breached: false,
      created_at: new Date(grievanceNow - 32 * 36e5).toISOString(), updated_at: new Date(grievanceNow - 32 * 36e5).toISOString(),
      resolved_at: null, resolved_by: null,
    },
    {
      id: "GR-0002", mine_id: "M-001", mine_name: "Singrauli North", worker_name: "Anonymous",
      category: "wages", description: "Contractor wage slip shows unexplained deductions.",
      status: "open", sla_hours: 72,
      sla_due_at: new Date(grievanceNow - 10 * 36e5).toISOString(),
      sla_remaining_hours: -10, sla_breached: true,
      created_at: new Date(grievanceNow - 82 * 36e5).toISOString(), updated_at: new Date(grievanceNow - 82 * 36e5).toISOString(),
      resolved_at: null, resolved_by: null,
    },
    {
      id: "GR-0003", mine_id: "M-002", mine_name: "Talcher East", worker_name: "Sunita Devi",
      category: "facilities", description: "Drinking water point at the dump yard has been dry for three days.",
      status: "in_review", sla_hours: 72,
      sla_due_at: new Date(grievanceNow + 12 * 36e5).toISOString(),
      sla_remaining_hours: 12, sla_breached: false,
      created_at: new Date(grievanceNow - 60 * 36e5).toISOString(), updated_at: new Date(grievanceNow - 20 * 36e5).toISOString(),
      resolved_at: null, resolved_by: null,
    },
  ];

  if (url === "/api/grievances" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { items: GRIEVANCES });
  }

  if (url === "/api/grievances" && req.method === "POST") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body: any) => {
      const item = {
        id: `GR-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
        mine_name: "Singrauli North", status: "open", sla_hours: 72,
        sla_due_at: new Date(grievanceNow + 72 * 36e5).toISOString(),
        sla_remaining_hours: 72, sla_breached: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        resolved_at: null, resolved_by: null, worker_name: null, ...body,
      };
      GRIEVANCES.unshift(item);
      return send(res, 201, { item });
    });
  }

  if (url.match(/^\/api\/grievances\/.+$/) && req.method === "PATCH") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body: any) => {
      const idx = GRIEVANCES.findIndex((g) => g.id === url.split("/").pop());
      if (idx === -1) return send(res, 404, { detail: "not found" });
      const prev = GRIEVANCES[idx];
      GRIEVANCES[idx] = {
        ...prev, ...body,
        updated_at: new Date().toISOString(),
        resolved_at: body.status === "resolved" ? new Date().toISOString() : prev.resolved_at,
        resolved_by: body.status === "resolved" ? "demo@coalsmart.gov" : prev.resolved_by,
        sla_breached: body.status === "resolved" ? false : prev.sla_breached,
        sla_remaining_hours: body.status === "resolved" ? null : prev.sla_remaining_hours,
      };
      return send(res, 200, { item: GRIEVANCES[idx] });
    });
  }

  // ---------------------------------------------------------------------------
  // Feature 6 — corrective actions stand-in.
  // ---------------------------------------------------------------------------
  const CORRECTIVE_ACTIONS: Array<{
    id: string; item_id: string; mine_id: string; mine_name: string;
    item_title: string; assignee: string; deadline: string;
    proof_photo_url: string | null; state: "open" | "submitted" | "approved" | "rejected";
    created_at: string; resolved_at: string | null; resolved_by: string | null;
  }> = [
    {
      id: "CA-00000001", item_id: "K-04", mine_id: "M-001", mine_name: "Singrauli North",
      item_title: "DGMS safety return", assignee: "Meera Nair",
      deadline: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
      proof_photo_url: null, state: "open",
      created_at: new Date(Date.now() - 2 * 864e5).toISOString(),
      resolved_at: null, resolved_by: null,
    },
    {
      id: "CA-00000002", item_id: "K-11", mine_id: "M-002", mine_name: "Talcher East",
      item_title: "Safety inspection", assignee: "S. Reddy",
      deadline: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
      proof_photo_url: "/uploads/field/CAP-DEMO.jpg", state: "submitted",
      created_at: new Date(Date.now() - 1 * 864e5).toISOString(),
      resolved_at: null, resolved_by: null,
    },
  ];

  if (url === "/api/corrective_actions" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, { items: CORRECTIVE_ACTIONS });
  }

  if (url === "/api/corrective_actions" && req.method === "POST") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body) => {
      const item = {
        id: `CA-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
        mine_id: "M-001", mine_name: "Singrauli North",
        proof_photo_url: null, state: "open",
        created_at: new Date().toISOString(), resolved_at: null, resolved_by: null,
        ...body,
      } as any;
      CORRECTIVE_ACTIONS.push(item);
      return send(res, 201, { item });
    });
  }

  if (url.match(/^\/api\/corrective_actions\/.+$/) && req.method === "PATCH") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body) => {
      const idx = CORRECTIVE_ACTIONS.findIndex((a) => a.id === url.split("/").pop());
      if (idx === -1) return send(res, 404, { detail: "not found" });
      CORRECTIVE_ACTIONS[idx] = { ...CORRECTIVE_ACTIONS[idx], ...body };
      return send(res, 200, { item: CORRECTIVE_ACTIONS[idx] });
    });
  }

  // ---------------------------------------------------------------------------
  // Feature 13 — AI compliance assistant stand-in (SSE, mirrors backend protocol).
  if (url === "/api/assistant/snapshot" && req.method === "GET") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return send(res, 200, {
      snapshot: {
        generated_at: new Date().toISOString(),
        portfolio: { total_mines: 50, bands: { high: 6, watch: 18, low: 26 }, average_compliance: 71 },
        top_risk_mines: [
          { mine_id: "M-001", name: "Singrauli North", state: "Madhya Pradesh", risk: 78, band: "high", compliance: 61 },
          { mine_id: "M-004", name: "Korba Deep", state: "Chhattisgarh", risk: 71, band: "high", compliance: 66 },
        ],
        compliance_overdue: [{ id: "K-04", mine_id: "M-001", title: "DGMS safety return", category: "statutory", due_date: "2026-10-14", escalation_level: 2, days_overdue: 8 }],
        compliance_due_soon: [], contractors_watch: [], risk_patterns: [],
        alerts_open_by_category: [{ category: "environment", n: 3 }, { category: "compliance", n: 5 }],
        top_open_alerts: [], environment_breaches: [], active_anomalies: [],
        attendance_latest: [], grievances_open: [], corrective_actions_open: [],
      },
    });
  }

  if (url === "/api/assistant/chat" && req.method === "POST") {
    if (!signedIn) return send(res, 401, { detail: "not signed in" });
    return void readBody(req).then((body: any) => {
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!message) return send(res, 400, { detail: "message is required" });
      const hi = body?.language === "hi" || /[ऀ-ॿ]/.test(message);
      const answer = hi
        ? "स्नैपशॉट के अनुसार M-001 (Singrauli North) जोखिम 78 (high) है; अतिदेय वैधानिक आइटम K-04 (risk_scores / compliance_items)।\n\n---\n_Decision support only — statutory orders remain with the designated authority._"
        : "Per the live snapshot, M-001 (Singrauli North) is the top-risk mine at 78 (high band), driven by overdue statutory item K-04 — DGMS safety return, 8 days overdue at escalation L2 (mines / risk_scores / compliance_items).\n\n---\n_Decision support only — statutory orders remain with the designated authority._";
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      const words = answer.split(/(?<=\s)/);
      let i = 0;
      const tick = setInterval(() => {
        if (i >= words.length) {
          clearInterval(tick);
          res.write(`data: ${JSON.stringify({ type: "done", source: "local", model: null, language: hi ? "hi" : "en" })}\n\n`);
          res.end();
          return;
        }
        res.write(`data: ${JSON.stringify({ type: "delta", content: words[i++] })}\n\n`);
      }, 15);
      res.on("close", () => clearInterval(tick));
    });
  }

  return send(res, 404, { detail: `no mock for ${req.method} ${url}` });
}

export function mockApi(): Plugin {
  if (process.env.VITE_NO_MOCK === "1") return { name: "coalsmart-mock-api" };
  return {
    name: "coalsmart-mock-api",
    configureServer(server) {
      server.middlewares.use(handler as Connect.NextHandleFunction);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler as Connect.NextHandleFunction);
    },
  };
}
