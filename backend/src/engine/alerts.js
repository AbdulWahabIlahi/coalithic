// Feature 2 — Alert & Notification Center.
//
// generateAlerts() computes the current alert set from live SQLite state:
//   risk          — mines in the 'high' band
//   anomaly       — active production/environment anomalies
//   compliance    — overdue / escalated statutory items
//   contract      — contractor safety cert expiring or already lapsed
//   due_soon      (predictive, Feature 5) — pending compliance due within 7 days
//
// Each alert carries a stable `key` so re-runs dedupe instead of duplicating;
// alerts whose condition clears are marked resolved. Newly created alerts are
// returned and emitted on the event bus so the WebSocket layer fans them out
// to live dashboards.

import { db, todayIso } from "../db.js";
import { emit } from "../lib/bus.js";
import { notify } from "../lib/notify.js";
import { listActiveAnomalies } from "./anomalies.js";

const EXPIRY_WINDOW_DAYS = 14;
const DUE_SOON_DAYS = 7;

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const insert = db.prepare(`
  INSERT INTO alerts (key, mine_id, category, severity, title, message, status, created_at, data)
  VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
`);
const upsert = db.prepare(`
  UPDATE alerts
  SET severity = ?, title = ?, message = ?, data = ?
  WHERE key = ?
`);

export function generateAlerts(now = new Date()) {
  const at = now.toISOString();
  const today = isoDate(now);
  const weekFromNow = addDays(DUE_SOON_DAYS);
  const expiryWindow = addDays(EXPIRY_WINDOW_DAYS);
  const currentKeys = new Set();
  const created = [];

  function upsertAlert({ key, mine_id, category, severity, title, message, data = {} }) {
    currentKeys.add(key);
    const payload = JSON.stringify(data ?? {});
    const existing = db.prepare("SELECT 1 FROM alerts WHERE key = ?").get(key);
    if (existing) {
      upsert.run(severity, title, message, payload, key);
    } else {
      insert.run(key, mine_id, category, severity, title, message, at, payload);
      created.push({ key, mine_id, category, severity, title, message, created_at: at, status: "open" });
    }
  }

  // ---- Risk alerts (Feature 5 explainability feed) ----
  const highRisk = db.prepare("SELECT mine_id, score FROM risk_scores WHERE band = 'high'").all();
  for (const s of highRisk) {
    upsertAlert({
      key: `risk:high:${s.mine_id}`,
      mine_id: s.mine_id,
      category: "risk",
      severity: "high",
      title: `High risk — ${s.mine_id}`,
      message: `Risk score ${s.score}/100 — review contributing factors`,
      data: { score: s.score },
    });
  }

  // ---- Anomaly alerts (Feature 6 signals) ----
  for (const a of listActiveAnomalies()) {
    upsertAlert({
      key: `anomaly:${a.mine_id}:${a.kind}`,
      mine_id: a.mine_id,
      category: "anomaly",
      severity: a.severity,
      title: `${a.kind.charAt(0).toUpperCase() + a.kind.slice(1)} anomaly — ${a.mine_id}`,
      message: a.detail,
      data: a.data,
    });
  }

  // ---- Compliance alerts (Feature 3 signals) ----
  const items = db.prepare(
    "SELECT id, mine_id, title, due_date, status, escalation_level FROM compliance_items WHERE status IN ('pending', 'overdue', 'escalated')"
  ).all();
  for (const it of items) {
    const overdue = it.status === "overdue" || (it.status === "pending" && it.due_date < today);
    if (overdue) {
      upsertAlert({
        key: `compliance:overdue:${it.id}`,
        mine_id: it.mine_id,
        category: "compliance",
        severity: "high",
        title: `Overdue — ${it.title}`,
        message: `Statutory item ${it.id} is past its due date (${it.due_date})`,
        data: { item_id: it.id, escalation_level: it.escalation_level },
      });
    } else if (it.status === "escalated") {
      upsertAlert({
        key: `compliance:escalated:${it.id}`,
        mine_id: it.mine_id,
        category: "compliance",
        severity: "high",
        title: `Escalated — ${it.title}`,
        message: `Statutory item ${it.id} has been escalated (${it.escalation_level})`,
        data: { item_id: it.id, escalation_level: it.escalation_level },
      });
    } else if (it.due_date >= today && it.due_date <= weekFromNow) {
      upsertAlert({
        key: `compliance:due_soon:${it.id}`,
        mine_id: it.mine_id,
        category: "compliance",
        severity: it.due_date === today ? "high" : "medium",
        title: `Due soon — ${it.title}`,
        message: `Statutory item ${it.id} is due on ${it.due_date}`,
        data: { item_id: it.id, due_date: it.due_date },
      });
    }
  }

  // ---- Grievance SLA breaches (Feature 12 — reuses the same alert pipeline) ----
  const grievances = db.prepare(
    "SELECT id, mine_id, category, sla_due_at FROM grievances WHERE status IN ('open', 'in_review')"
  ).all();
  for (const g of grievances) {
    const breached = Date.parse(g.sla_due_at) < now.getTime();
    if (breached) {
      upsertAlert({
        key: `grievance:sla:${g.id}`,
        mine_id: g.mine_id,
        category: "grievance",
        severity: "high",
        title: `Grievance SLA breached — ${g.id}`,
        message: `Grievance ${g.id} (${g.category}) is past its 72h resolution SLA (due ${g.sla_due_at})`,
        data: { grievance_id: g.id, sla_due_at: g.sla_due_at },
      });
    } else {
      const hoursLeft = Math.round((Date.parse(g.sla_due_at) - now.getTime()) / 3600000);
      if (hoursLeft <= 24) {
        upsertAlert({
          key: `grievance:due_soon:${g.id}`,
          mine_id: g.mine_id,
          category: "grievance",
          severity: "medium",
          title: `Grievance SLA due soon — ${g.id}`,
          message: `Grievance ${g.id} (${g.category}) must close within ${hoursLeft}h`,
          data: { grievance_id: g.id, hours_left: hoursLeft },
        });
      }
    }
  }

  // ---- Contract expiry alerts (Feature 3 watchdog) ----
  const contractors = db.prepare(`
    SELECT id, name, mine_id, safety_cert_expiry FROM contractors
    WHERE safety_cert_expiry IS NOT NULL AND safety_cert_expiry <= ?
  `).all(expiryWindow);
  for (const c of contractors) {
    const expired = c.safety_cert_expiry < today;
    upsertAlert({
      key: `contract:expiry:${c.id}`,
      mine_id: c.mine_id,
      category: "contract",
      severity: expired ? "high" : "medium",
      title: expired ? `Certificate lapsed — ${c.name}` : `Certificate expiring — ${c.name}`,
      message: expired
        ? `Safety certificate for ${c.name} lapsed on ${c.safety_cert_expiry}`
        : `Safety certificate for ${c.name} expires on ${c.safety_cert_expiry}`,
      data: { contractor_id: c.id, contractor_name: c.name, expiry: c.safety_cert_expiry, expired },
    });
  }

  // ---- Resolve alerts whose condition no longer holds ----
  const openKeys = db.prepare("SELECT key FROM alerts WHERE status = 'open'").all().map((r) => r.key);
  const resolved = [];
  const resolve = db.prepare("UPDATE alerts SET status = 'resolved', resolved_at = ? WHERE key = ?");
  for (const key of openKeys) {
    if (!currentKeys.has(key)) {
      resolve.run(at, key);
      resolved.push(key);
    }
  }

  // Emit newly created alerts so live dashboards get them over WebSocket.
  for (const alert of created) {
    emit({ type: "alert", at, alert });
    // Log-only email/SMS transport (B6): high-severity alerts reach the
    // control-room inbox the moment they are first raised.
    if (alert.severity === "high") {
      notify({
        channel: "email",
        to: "control-room@coalsmart.gov",
        subject: `[CoalSmart HIGH] ${alert.title}`,
        body: alert.message,
      });
    }
  }

  return { created, resolved };
}

let alertTimer = null;

export function startAlertTicker(intervalMs = Number(process.env.ALERTS_TICK_MS ?? 30_000)) {
  if (alertTimer || intervalMs <= 0) return () => {};
  alertTimer = setInterval(() => {
    try {
      generateAlerts();
    } catch (err) {
      console.error("alert tick failed", err);
    }
  }, intervalMs);
  alertTimer.unref?.();
  return stopAlertTicker;
}

export function stopAlertTicker() {
  if (alertTimer) clearInterval(alertTimer);
  alertTimer = null;
}

export function listAlerts(mineId = null, role = null) {
  let sql = "SELECT * FROM alerts";
  const where = [];
  const params = [];
  const isScoped = role !== "Corporate Management" && role !== "Regulator" && mineId;
  if (isScoped) {
    where.push("(mine_id IS NULL OR mine_id = ?)");
    params.push(mineId);
  }
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += " ORDER BY created_at DESC";
  return db.prepare(sql).all(...params).map((r) => ({
    ...r,
    data: JSON.parse(r.data ?? "{}"),
  }));
}

export function patchAlert(id, { read, assigned_to }) {
  const alert = db.prepare("SELECT * FROM alerts WHERE id = ?").get(id);
  if (!alert) return null;
  const at = new Date().toISOString();
  if (read === true) {
    db.prepare("UPDATE alerts SET read_at = ? WHERE id = ? AND read_at IS NULL").run(at, id);
  }
  if (typeof assigned_to === "string") {
    db.prepare("UPDATE alerts SET assigned_to = ? WHERE id = ?").run(assigned_to, id);
  }
  const updated = db.prepare("SELECT * FROM alerts WHERE id = ?").get(id);
  return { ...updated, data: JSON.parse(updated.data ?? "{}") };
}
