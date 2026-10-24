import { randomUUID } from "node:crypto";
import { db, todayIso } from "../db.js";
import { emit } from "../lib/bus.js";
import { appendAudit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";

// Feature 3 — Statutory Compliance Register & Auto-Escalation Timer.
// Background tick (default every 30s, COMPLIANCE_TICK_MS overrides):
//   pending  → overdue   once due_date has passed
//   overdue  → escalated(level 1 → Corporate Management) after 1 day past due
//   escalated → level 2 (→ Regulator) after 5 days past due
// Every transition is written to compliance_events and pushed on the event bus,
// which the WebSocket layer fans out to connected dashboards.

export const ESCALATION_GRACE_DAYS = 1;
export const REGULATOR_DAYS = 5;

const ROLE_BY_LEVEL = {
  1: "Corporate Management",
  2: "Regulator",
};

function daysOverdue(dueDate, today) {
  return Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
}

function recordEvent(itemId, fromStatus, toStatus, level, escalatedTo, note, at) {
  db.prepare(`
    INSERT INTO compliance_events (item_id, from_status, to_status, escalation_level, escalated_to, note, at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(itemId, fromStatus, toStatus, level, escalatedTo, note, at);
}

// Feature 7: system transitions are sealed into the audit trail too.
function auditTransition(item, fromStatus, toStatus, detail, at) {
  appendAudit({
    at,
    actor: "system",
    action: "escalation",
    entity: "compliance_item",
    entity_id: item.id,
    path: "/api/compliance/escalations",
    status: 200,
    detail: { mine_id: item.mine_id, from: fromStatus, to: toStatus, ...detail },
  });
}

export function runEscalationTick(now = new Date()) {
  const today = todayIso(now);
  const at = now.toISOString();
  const transitions = [];

  // pending → overdue
  const newlyOverdue = db.prepare(`
    SELECT * FROM compliance_items
    WHERE status = 'pending' AND due_date < ?
  `).all(today);

  for (const item of newlyOverdue) {
    db.prepare(`
      UPDATE compliance_items SET status = 'overdue', updated_at = ? WHERE id = ?
    `).run(at, item.id);
    recordEvent(item.id, "pending", "overdue", 0, null, `Due date ${item.due_date} passed`, at);
    auditTransition(item, "pending", "overdue", { due_date: item.due_date }, at);
    const event = {
      type: "escalation",
      at,
      previous_status: "pending",
      item: { ...item, status: "overdue", updated_at: at },
    };
    emit(event);
    transitions.push(event);
  }

  // overdue → escalated(level up to Corporate Management, then Regulator)
  const escalateCandidates = db.prepare(`
    SELECT * FROM compliance_items
    WHERE status IN ('overdue', 'escalated') AND due_date < ?
  `).all(today);

  for (const item of escalateCandidates) {
    const overdueDays = daysOverdue(item.due_date, today);
    let targetLevel = 0;
    if (overdueDays >= REGULATOR_DAYS) targetLevel = 2;
    else if (overdueDays > ESCALATION_GRACE_DAYS) targetLevel = 1;

    if (targetLevel === 0 || targetLevel <= item.escalation_level) continue;

    const escalatedTo = ROLE_BY_LEVEL[targetLevel];
    db.prepare(`
      UPDATE compliance_items
      SET status = 'escalated', escalation_level = ?, escalated_to = ?, updated_at = ?
      WHERE id = ?
    `).run(targetLevel, escalatedTo, at, item.id);
    recordEvent(
      item.id,
      item.status,
      "escalated",
      targetLevel,
      escalatedTo,
      `${overdueDays} day(s) overdue — escalated to ${escalatedTo}`,
      at,
    );
    auditTransition(item, item.status, "escalated", { level: targetLevel, escalated_to: escalatedTo }, at);
    // Log-only notification transport: email at both levels, SMS only at L2.
    notify({
      channel: "email",
      to: targetLevel === 1 ? "corporate@coalsmart.gov" : "regulator@coalsmart.gov",
      subject: `[CoalSmart ESCALATION L${targetLevel}] ${item.title} (${item.mine_id})`,
      body: `${overdueDays} day(s) overdue — escalated to ${escalatedTo}`,
    });
    if (targetLevel === 2) {
      notify({
        channel: "sms",
        to: "+91-00000-00000",
        subject: `Escalation L2: ${item.id} (${item.mine_id})`,
        body: `${overdueDays} days overdue — regulator attention required`,
      });
    }
    const event = {
      type: "escalation",
      at,
      previous_status: item.status,
      item: {
        ...item,
        status: "escalated",
        escalation_level: targetLevel,
        escalated_to: escalatedTo,
        updated_at: at,
      },
    };
    emit(event);
    transitions.push(event);
  }

  return { today, transitions };
}

let timer = null;

export function startEscalationTicker(intervalMs = Number(process.env.COMPLIANCE_TICK_MS ?? 30_000)) {
  if (timer || intervalMs <= 0) return () => {};
  timer = setInterval(() => {
    try {
      runEscalationTick();
    } catch (err) {
      console.error("escalation tick failed", err);
    }
  }, intervalMs);
  timer.unref?.();
  return stopEscalationTicker;
}

export function stopEscalationTicker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function seedComplianceItem({ mineId, title, category, ownerRole, dueDate }) {
  const id = `K-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const at = new Date().toISOString();
  db.prepare(`
    INSERT INTO compliance_items
      (id, mine_id, title, category, owner_role, due_date, status, escalation_level, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
  `).run(id, mineId, title, category, ownerRole, dueDate, at, at);
  return id;
}
