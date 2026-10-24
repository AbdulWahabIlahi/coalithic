import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, todayIso } from "../db.js";
import { requireAuth, getSessionUser } from "./auth.js";
import { appendAudit } from "../lib/audit.js";
import { recomputeAllRiskScores } from "../engine/risk.js";

const router = Router();
router.use(requireAuth);

const SELECT_ACTION = `
  SELECT ca.*, c.title AS item_title, c.mine_id AS item_mine_id, m.name AS mine_name
  FROM corrective_actions ca
  JOIN compliance_items c ON c.id = ca.item_id
  JOIN mines m ON m.id = ca.mine_id
`;

function isScoped(session) {
  const role = session?.user?.role ?? null;
  return role !== "Corporate Management" && role !== "Regulator";
}

// Feature 6 — Digital Approval & Corrective-Action Workflow.
// Officer submits a corrective action (with photo proof) for a compliance item.
// Corporate/Regulator approves or rejects. Every state change is sealed in audit_logs.

router.get("/", (req, res) => {
  const session = getSessionUser(req);
  const mineId = isScoped(session) ? session.user.mine_id : null;
  let sql = SELECT_ACTION;
  const params = [];
  if (mineId) {
    sql += " WHERE ca.mine_id = ?";
    params.push(mineId);
  }
  sql += " ORDER BY ca.created_at DESC";
  res.json({ items: db.prepare(sql).all(...params) });
});

router.post("/", (req, res) => {
  const session = getSessionUser(req);
  const { item_id, assignee, deadline, proof_photo_url } = req.body ?? {};
  if (!item_id || typeof assignee !== "string" || !deadline) {
    return res.status(400).json({ detail: "item_id, assignee and deadline are required" });
  }
  const item = db.prepare("SELECT * FROM compliance_items WHERE id = ?").get(item_id);
  if (!item) return res.status(404).json({ detail: "compliance item not found" });
  if (isScoped(session) && item.mine_id !== session.user.mine_id) {
    return res.status(403).json({ detail: "item not in your mine" });
  }

  const id = `CA-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const at = new Date().toISOString();
  db.prepare(`
    INSERT INTO corrective_actions
      (id, item_id, mine_id, assignee, deadline, proof_photo_url, state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(id, item_id, item.mine_id, assignee, deadline, proof_photo_url ?? null, at);

  appendAudit({
    at,
    actor: session.user.email,
    actor_role: session.user.role,
    action: "post:corrective_actions",
    entity: "corrective_action",
    entity_id: id,
    method: "POST",
    path: "/api/corrective_actions",
    status: 201,
    detail: { item_id, mine_id: item.mine_id, assignee, deadline },
  });

  const action = db.prepare(`${SELECT_ACTION} WHERE ca.id = ?`).get(id);
  res.status(201).json({ item: action });
});

router.patch("/:id", (req, res) => {
  const session = getSessionUser(req);
  const action = db.prepare(`${SELECT_ACTION} WHERE ca.id = ?`).get(req.params.id);
  if (!action) return res.status(404).json({ detail: "corrective action not found" });
  if (isScoped(session) && action.item_mine_id !== session.user.mine_id) {
    return res.status(403).json({ detail: "action not in your mine" });
  }

  const { state, resolved_by } = req.body ?? {};
  if (!["open", "submitted", "approved", "rejected"].includes(state)) {
    return res.status(400).json({ detail: "invalid state" });
  }

  // Role gating: officer submits; corporate/regulator approves or rejects.
  const role = session.user.role;
  if (state === "submitted" && role !== "Mine Officer") {
    return res.status(403).json({ detail: "only a Mine Officer can submit" });
  }
  if ((state === "approved" || state === "rejected") && role === "Mine Officer") {
    return res.status(403).json({ detail: "only Corporate or Regulator can approve/reject" });
  }

  const at = new Date().toISOString();
  const updates = [];
  const params = [];
  if (state) { updates.push("state = ?"); params.push(state); }
  if (resolved_by !== undefined) { updates.push("resolved_by = ?"); params.push(resolved_by); }
  if (state === "approved" || state === "rejected") {
    updates.push("resolved_at = ?");
    params.push(at);
  }
  params.push(req.params.id);
  db.prepare(`UPDATE corrective_actions SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  appendAudit({
    at,
    actor: session.user.email,
    actor_role: session.user.role,
    action: "patch:corrective_actions",
    entity: "corrective_action",
    entity_id: req.params.id,
    method: "PATCH",
    path: "/api/corrective_actions",
    status: 200,
    detail: { item_id: action.item_id, state, resolved_by },
  });

  // Closing an action resolves the underlying compliance item and refreshes risk.
  if (state === "approved") {
    db.prepare(`
      UPDATE compliance_items
      SET status = 'resolved', escalation_level = 0, escalated_to = NULL, updated_at = ?
      WHERE id = ?
    `).run(at, action.item_id);
    db.prepare(`
      INSERT INTO compliance_events (item_id, from_status, to_status, escalation_level, escalated_to, note, at)
      VALUES (?, ?, ?, 0, NULL, 'resolved via corrective action', ?)
    `).run(action.item_id, "resolved", "resolved via corrective action", at);
    recomputeAllRiskScores(new Date());
  }

  const updated = db.prepare(`${SELECT_ACTION} WHERE ca.id = ?`).get(req.params.id);
  res.json({ item: updated });
});

export default router;
