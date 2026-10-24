import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth, getSessionUser } from "./auth.js";

const router = Router();
router.use(requireAuth);

// Feature 12 — Grievance Handling Module.
// Worker → mine grievances with a 72h SLA. Breaches surface through the same
// alert pipeline as compliance escalations (see engine/alerts.js). Officers
// triage (open → in_review) and resolve; corporate/regulator see everything.

const SLA_HOURS = 72;
const CATEGORIES = ["safety", "wages", "facilities", "environment", "harassment", "other"];
const STATUSES = ["open", "in_review", "resolved"];

function isScoped(session) {
  const role = session?.user?.role ?? null;
  return role !== "Corporate Management" && role !== "Regulator";
}

const SELECT_GRIEVANCE = `
  SELECT g.*, m.name AS mine_name
  FROM grievances g JOIN mines m ON m.id = g.mine_id
`;

function withSla(row, now = Date.now()) {
  const due = Date.parse(row.sla_due_at);
  const remainingMs = due - now;
  return {
    ...row,
    sla_hours: SLA_HOURS,
    sla_remaining_hours: row.status === "resolved" ? null : Math.round(remainingMs / 3600000),
    sla_breached: row.status !== "resolved" && remainingMs < 0,
  };
}

router.get("/", (req, res) => {
  const session = getSessionUser(req);
  const mineId = isScoped(session) ? session.user.mine_id : null;
  let sql = SELECT_GRIEVANCE;
  const params = [];
  if (mineId) {
    sql += " WHERE g.mine_id = ?";
    params.push(mineId);
  }
  sql += " ORDER BY g.created_at DESC";
  const now = Date.now();
  const items = db.prepare(sql).all(...params).map((r) => withSla(r, now));
  res.json({ items });
});

router.post("/", (req, res) => {
  const { mine_id, worker_name, category, description } = req.body ?? {};
  if (!mine_id || typeof description !== "string" || description.trim().length < 5) {
    return res.status(400).json({ detail: "mine_id and a description (min 5 chars) are required" });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ detail: `category must be one of: ${CATEGORIES.join(", ")}` });
  }
  const mine = db.prepare("SELECT id FROM mines WHERE id = ?").get(mine_id);
  if (!mine) return res.status(404).json({ detail: "mine not found" });

  const id = `GR-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const at = new Date().toISOString();
  const slaDue = new Date(Date.now() + SLA_HOURS * 3600 * 1000).toISOString();
  db.prepare(`
    INSERT INTO grievances
      (id, mine_id, worker_name, category, description, status, sla_due_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `  ).run(id, mine_id, worker_name || null, category, description.trim(), slaDue, at, at);

  const row = db.prepare(`${SELECT_GRIEVANCE} WHERE g.id = ?`).get(id);
  res.status(201).json({ item: withSla(row) });
});

router.patch("/:id", (req, res) => {
  const session = getSessionUser(req);
  const row = db.prepare(`${SELECT_GRIEVANCE} WHERE g.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ detail: "grievance not found" });
  if (isScoped(session) && row.mine_id !== session.user.mine_id) {
    return res.status(403).json({ detail: "grievance not in your mine" });
  }

  const { status, resolved_by } = req.body ?? {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ detail: `status must be one of: ${STATUSES.join(", ")}` });
  }
  if (status === "resolved" && row.status === "resolved") {
    return res.status(400).json({ detail: "already resolved" });
  }

  const at = new Date().toISOString();
  const updates = ["status = ?", "updated_at = ?"];
  const params = [status, at];
  if (status === "resolved") {
    updates.push("resolved_at = ?", "resolved_by = ?");
    params.push(at, resolved_by ?? session.user.email);
  }
  params.push(req.params.id);
  db.prepare(`UPDATE grievances SET ${updates.join(", ")} WHERE id = ?`  ).run(...params);

  const updated = db.prepare(`${SELECT_GRIEVANCE} WHERE g.id = ?`).get(req.params.id);
  res.json({ item: withSla(updated) });
});

export default router;
