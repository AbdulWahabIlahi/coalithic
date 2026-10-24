import { Router } from "express";
import { db, todayIso } from "../db.js";
import { requireAuth } from "./auth.js";
import { seedComplianceItem } from "../engine/escalation.js";

const router = Router();
router.use(requireAuth);

// Feature 3 endpoints — the statutory register the escalation timer drives.

const SELECT_ITEM = `
  SELECT c.*, m.name AS mine_name
  FROM compliance_items c
  LEFT JOIN mines m ON m.id = c.mine_id
`;

router.get("/items", (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const mineId = typeof req.query.mine_id === "string" ? req.query.mine_id : null;

  let sql = SELECT_ITEM;
  const where = [];
  const params = [];
  if (status) {
    where.push("c.status = ?");
    params.push(status);
  }
  if (mineId) {
    where.push("c.mine_id = ?");
    params.push(mineId);
  }
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += " ORDER BY c.due_date ASC";

  const items = db.prepare(sql).all(...params).map((r) => ({
    ...r,
    days_overdue: r.due_date < todayIso()
      ? Math.floor((Date.parse(todayIso()) - Date.parse(r.due_date)) / 86_400_000)
      : 0,
  }));
  res.json({ items });
});

router.get("/stats", (_req, res) => {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS n FROM compliance_items GROUP BY status
  `).all();
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  const open = (byStatus.pending ?? 0) + (byStatus.overdue ?? 0) + (byStatus.escalated ?? 0);
  const onTrack = total === 0 ? 100 : Math.round((100 * (total - (byStatus.overdue ?? 0) - (byStatus.escalated ?? 0))) / total);
  res.json({
    total,
    by_status: byStatus,
    overdue: byStatus.overdue ?? 0,
    escalated: byStatus.escalated ?? 0,
    pending: byStatus.pending ?? 0,
    resolved: byStatus.resolved ?? 0,
    open,
    on_track_pct: onTrack,
  });
});

router.get("/escalations", (req, res) => {
  const limit = Math.min(Number.parseInt(req.query.limit ?? "20", 10) || 20, 100);
  const items = db.prepare(`
    SELECT e.*, c.title, c.mine_id
    FROM compliance_events e
    JOIN compliance_items c ON c.id = e.item_id
    ORDER BY e.at DESC
    LIMIT ?
  `).all(limit);
  res.json({ items });
});

router.post("/items", (req, res) => {
  const { mine_id, title, category, owner_role, due_date } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length === 0) {
    return res.status(400).json({ detail: "title is required" });
  }
  if (typeof due_date !== "string" || Number.isNaN(Date.parse(due_date))) {
    return res.status(400).json({ detail: "due_date must be an ISO date" });
  }
  const id = seedComplianceItem({
    mineId: mine_id ?? null,
    title: title.trim(),
    category: typeof category === "string" ? category : "safety",
    ownerRole: typeof owner_role === "string" ? owner_role : "Mine Officer",
    dueDate: due_date.slice(0, 10),
  });
  const item = db.prepare(`${SELECT_ITEM} WHERE c.id = ?`).get(id);
  res.status(201).json({ item });
});

router.patch("/items/:id", (req, res) => {
  const item = db.prepare("SELECT * FROM compliance_items WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).json({ detail: "item not found" });

  const status = typeof req.body?.status === "string" ? req.body.status : item.status;
  if (!["pending", "overdue", "escalated", "resolved"].includes(status)) {
    return res.status(400).json({ detail: "invalid status" });
  }
  const at = new Date().toISOString();
  db.prepare(`
    UPDATE compliance_items
    SET status = ?, escalation_level = ?, escalated_to = ?, updated_at = ?
    WHERE id = ?
  `).run(
    status,
    status === "resolved" ? 0 : item.escalation_level,
    status === "resolved" ? null : item.escalated_to,
    at,
    item.id,
  );
  db.prepare(`
    INSERT INTO compliance_events (item_id, from_status, to_status, escalation_level, escalated_to, note, at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, item.status, status, item.escalation_level, item.escalated_to, "manual update", at);

  const updated = db.prepare(`${SELECT_ITEM} WHERE c.id = ?`).get(item.id);
  res.json({ item: updated });
});

export default router;
