import { Router } from "express";
import { db, todayIso } from "../db.js";
import { requireAuth } from "./auth.js";
import { appendAudit } from "../lib/audit.js";
import { buildTablePdf } from "../lib/pdf.js";

const router = Router();
router.use(requireAuth);

// Feature 7 — one-click statutory export (CSV/PDF) for compliance, inspections,
// environment, contractors and monthly governance. Every export is sealed into
// the audit trail and role-scoped like the live register.

const REPORT_SPECS = {
  compliance: {
    label: "Statutory Compliance Register",
    sql: `
      SELECT c.id, c.mine_id, m.name AS mine_name, c.title, c.category,
             c.owner_role, c.due_date, c.status, c.escalated_to
      FROM compliance_items c
      LEFT JOIN mines m ON m.id = c.mine_id
    `,
    columns: [
      { key: "id", label: "ID", width: 10 },
      { key: "mine_id", label: "MINE", width: 8 },
      { key: "mine_name", label: "SITE", width: 20 },
      { key: "title", label: "OBLIGATION", width: 26 },
      { key: "category", label: "CATEGORY", width: 12 },
      { key: "owner_role", label: "OWNER", width: 20 },
      { key: "due_date", label: "DUE", width: 12 },
      { key: "status", label: "STATUS", width: 10 },
      { key: "escalated_to", label: "ESCALATED TO", width: 22 },
    ],
    extra: ["days_overdue"],
  },
  inspection: {
    label: "Inspection & Safety Register",
    sql: `
      SELECT v.id, v.mine_id, m.name AS mine_name, v.section, v.title,
             v.severity, v.status, v.opened_at, v.closed_at
      FROM violations v
      LEFT JOIN mines m ON m.id = v.mine_id
    `,
    columns: [
      { key: "id", label: "ID", width: 10 },
      { key: "mine_id", label: "MINE", width: 8 },
      { key: "mine_name", label: "SITE", width: 20 },
      { key: "section", label: "SECTION", width: 14 },
      { key: "title", label: "OBSERVATION", width: 30 },
      { key: "severity", label: "SEV", width: 8 },
      { key: "status", label: "STATUS", width: 12 },
      { key: "opened_at", label: "OPENED", width: 16 },
    ],
    extra: ["closed_at"],
  },
  contractor: {
    label: "Contractor Register",
    sql: `
      SELECT c.id, c.name, c.mine_id, m.name AS mine_name, c.contact_name,
             c.contact_phone, c.safety_cert_expiry, c.compliance
      FROM contractors c
      LEFT JOIN mines m ON m.id = c.mine_id
    `,
    columns: [
      { key: "id", label: "ID", width: 10 },
      { key: "name", label: "CONTRACTOR", width: 26 },
      { key: "mine_id", label: "MINE", width: 8 },
      { key: "mine_name", label: "SITE", width: 20 },
      { key: "contact_name", label: "CONTACT", width: 18 },
      { key: "contact_phone", label: "PHONE", width: 16 },
      { key: "safety_cert_expiry", label: "CERT EXPIRY", width: 14 },
      { key: "compliance", label: "STANDING", width: 14 },
    ],
    extra: [],
  },
  environment: {
    label: "Environment & Sensor Breach Register",
    sql: `
      SELECT s.mine_id, m.name AS mine_name, s.metric, s.value, s.unit,
             s.limit_value, s.recorded_at
      FROM sensor_readings s
      JOIN (
        SELECT mine_id, metric, MAX(recorded_at) AS ra
        FROM sensor_readings GROUP BY mine_id, metric
      ) t ON t.mine_id = s.mine_id AND t.metric = s.metric AND t.ra = s.recorded_at
      LEFT JOIN mines m ON m.id = s.mine_id
    `,
    columns: [
      { key: "mine_id", label: "MINE", width: 8 },
      { key: "mine_name", label: "SITE", width: 20 },
      { key: "metric", label: "METRIC", width: 12 },
      { key: "value", label: "VALUE", width: 10 },
      { key: "unit", label: "UNIT", width: 10 },
      { key: "limit_value", label: "LIMIT", width: 10 },
      { key: "recorded_at", label: "RECORDED", width: 20 },
    ],
    extra: [],
  },
  monthly: {
    label: "Monthly Governance Summary",
    sql: `
      SELECT m.id AS mine_id, m.name AS mine_name, m.state, m.risk, m.compliance,
             m.open_issues, m.last_inspection,
             (SELECT COUNT(*) FROM violations v WHERE v.mine_id = m.id AND v.status = 'open') AS open_violations,
             (SELECT COUNT(*) FROM compliance_items c WHERE c.mine_id = m.id AND c.status IN ('overdue','escalated')) AS overdue_items
      FROM mines m
    `,
    columns: [
      { key: "mine_id", label: "MINE", width: 8 },
      { key: "mine_name", label: "SITE", width: 22 },
      { key: "state", label: "STATE", width: 16 },
      { key: "risk", label: "RISK", width: 8 },
      { key: "compliance", label: "COMPLIANCE", width: 14 },
      { key: "open_issues", label: "OPEN ISSUES", width: 14 },
      { key: "open_violations", label: "OPEN VIOLATIONS", width: 18 },
      { key: "overdue_items", label: "OVERDUE ITEMS", width: 18 },
    ],
    extra: [],
  },
};

function isScoped(req) {
  const { role, mine_id } = req.session.user;
  return role !== "Corporate Management" && role !== "Regulator" && mine_id;
}

function fetchRows(spec, req) {
  let sql = spec.sql;
  const params = [];
  if (isScoped(req)) {
    const whereCol = spec.label.includes("Contractor") ? "c.mine_id" : spec.label.includes("Environment") ? "s.mine_id" : spec.label.includes("Inspection") ? "v.mine_id" : spec.label.includes("Monthly") ? "m.id" : "c.mine_id";
    sql += ` WHERE ${whereCol} = ?`;
    params.push(req.session.user.mine_id);
  }
  sql += " ORDER BY 1";
  return db.prepare(sql).all(...params);
}

function decorate(row, spec) {
  const today = todayIso();
  const out = { ...row };
  if (spec.extra.includes("days_overdue") && row.due_date) {
    out.days_overdue = row.due_date < today
      ? Math.floor((Date.parse(today) - Date.parse(row.due_date)) / 86_400_000)
      : 0;
  }
  return out;
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function buildCsv(spec, rows) {
  const header = [...spec.columns.map((c) => c.key), ...spec.extra].join(",");
  const body = rows.map((row) =>
    [...spec.columns.map((c) => csvCell(row[c.key])), ...spec.extra.map((e) => csvCell(row[e]))].join(","),
  );
  return [header, ...body].join("\r\n") + "\r\n";
}

router.get("/:type.csv", (req, res) => {
  const spec = REPORT_SPECS[req.params.type];
  if (!spec) return res.status(404).json({ detail: "unknown report type" });
  const rows = fetchRows(spec, req).map((r) => decorate(r, spec));
  const csv = buildCsv(spec, rows);

  appendAudit({
    actor: req.session.user.email,
    actor_role: req.session.user.role,
    action: `export:${req.params.type}.csv`,
    entity: "report",
    method: "GET",
    path: `/api/reports/${req.params.type}.csv`,
    status: 200,
    detail: { rows: rows.length, scoped_to: req.session.user.mine_id ?? "all" },
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="coalsmart-${req.params.type}-${todayIso()}.csv"`);
  res.send(csv);
});

// Excel option (B6): SpreadsheetML 2003 XML — opens directly in Excel /
// LibreOffice with zero native dependencies, same rows + audit seal as CSV.
function xmlEsc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildXls(spec, rows) {
  const headerRow = [...spec.columns.map((c) => c.label), ...spec.extra.map((e) => e.toUpperCase())];
  const cell = (value) => {
    const numeric = value !== "" && value != null && Number.isFinite(Number(value));
    const type = numeric ? "Number" : "String";
    return `<Cell><Data ss:Type="${type}">${xmlEsc(numeric ? Number(value) : value)}</Data></Cell>`;
  };
  const body = rows.map((row) =>
    `<Row>${[...spec.columns.map((c) => row[c.key]), ...spec.extra.map((e) => row[e])].map(cell).join("")}</Row>`,
  ).join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>CoalSmart — ${xmlEsc(spec.label)}</Title></DocumentProperties>
<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>
<Worksheet ss:Name="${xmlEsc(spec.label.slice(0, 31))}">
<Table>
<Row>${headerRow.map((h) => `<Cell ss:StyleID="h"><Data ss:Type="String">${xmlEsc(h)}</Data></Cell>`).join("")}</Row>
${body}
</Table>
<WorksheetOptions><FreezePanes/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions>
</Worksheet>
</Workbook>`;
}

router.get("/:type.xls", (req, res) => {
  const spec = REPORT_SPECS[req.params.type];
  if (!spec) return res.status(404).json({ detail: "unknown report type" });
  const rows = fetchRows(spec, req).map((r) => decorate(r, spec));
  const xls = buildXls(spec, rows);

  appendAudit({
    actor: req.session.user.email,
    actor_role: req.session.user.role,
    action: `export:${req.params.type}.xls`,
    entity: "report",
    method: "GET",
    path: `/api/reports/${req.params.type}.xls`,
    status: 200,
    detail: { rows: rows.length, scoped_to: req.session.user.mine_id ?? "all" },
  });

  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="coalsmart-${req.params.type}-${todayIso()}.xls"`);
  res.send(xls);
});

router.get("/:type.pdf", (req, res) => {
  const spec = REPORT_SPECS[req.params.type];
  if (!spec) return res.status(404).json({ detail: "unknown report type" });
  const rows = fetchRows(spec, req).map((r) => decorate(r, spec));
  const { role, mine_id, name } = req.session.user;
  const scopeLabel = isScoped(req) ? `Scope: ${mine_id}` : "Scope: full portfolio";

  const pdf = buildTablePdf({
    title: `CoalSmart — ${spec.label}`,
    subtitle: `${scopeLabel} · generated ${todayIso()} · exported by ${name} (${role}) · ${rows.length} records`,
    columns: spec.columns.map((c) => ({ label: c.label, x: c.x, width: c.width })),
    rows: rows.map((row) => spec.columns.map((c) => (row[c.key] == null ? "—" : String(row[c.key])))),
    footer: "Sealed against the CoalSmart audit trail",
  });

  appendAudit({
    actor: req.session.user.email,
    actor_role: req.session.user.role,
    action: `export:${req.params.type}.pdf`,
    entity: "report",
    method: "GET",
    path: `/api/reports/${req.params.type}.pdf`,
    status: 200,
    detail: { rows: rows.length, scoped_to: mine_id ?? "all" },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="coalsmart-${req.params.type}-${todayIso()}.pdf"`);
  res.send(pdf);
});

export default router;
