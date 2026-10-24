import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth, getSessionUser } from "./auth.js";

const router = Router();
router.use(requireAuth);

// Feature 11 — Worker Attendance Module.
// Daily muster per mine (workers in/out, headcount). Officers record their own
// mine; corporate/regulator see the whole portfolio. History feeds the mine
// profile badge and 14-day trend.

function isScoped(session) {
  const role = session?.user?.role ?? null;
  return role !== "Corporate Management" && role !== "Regulator";
}

const SELECT_ATTENDANCE = `
  SELECT a.*, m.name AS mine_name
  FROM attendance a JOIN mines m ON m.id = a.mine_id
`;

// Latest muster across every mine (or the scoped mine) — portfolio strip / dashboards.
router.get("/", (req, res) => {
  const session = getSessionUser(req);
  const mineId = isScoped(session) ? session.user.mine_id : null;
  const sql = `
    SELECT a.*, m.name AS mine_name
    FROM attendance a
    JOIN mines m ON m.id = a.mine_id
    WHERE a.work_date = (SELECT MAX(a2.work_date) FROM attendance a2 WHERE a2.mine_id = a.mine_id)
      ${mineId ? "AND a.mine_id = ?" : ""}
    ORDER BY a.mine_id
  `;
  const rows = mineId ? db.prepare(sql).all(mineId) : db.prepare(sql).all();
  res.json({ items: rows });
});

// History for one mine (most recent first, default 14 days).
router.get("/:mineId", (req, res) => {
  const session = getSessionUser(req);
  if (isScoped(session) && session.user.mine_id !== req.params.mineId) {
    return res.status(403).json({ detail: "not your mine" });
  }
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
  const rows = db.prepare(`
    ${SELECT_ATTENDANCE}
    WHERE a.mine_id = ?
    ORDER BY a.work_date DESC
    LIMIT ?
  `).all(req.params.mineId, days);
  res.json({ mine_id: req.params.mineId, items: rows });
});

// Record (or correct) the daily muster — idempotent per (mine, date).
router.post("/", (req, res) => {
  const session = getSessionUser(req);
  const { mine_id, work_date, workers_in, workers_out, headcount } = req.body ?? {};
  if (!mine_id || !work_date) {
    return res.status(400).json({ detail: "mine_id and work_date are required" });
  }
  const mine = db.prepare("SELECT id FROM mines WHERE id = ?").get(mine_id);
  if (!mine) return res.status(404).json({ detail: "mine not found" });
  if (isScoped(session) && session.user.mine_id !== mine_id) {
    return res.status(403).json({ detail: "not your mine" });
  }
  const inN = Number.isFinite(Number(workers_in)) ? Math.max(0, Math.trunc(Number(workers_in))) : 0;
  const outN = Number.isFinite(Number(workers_out)) ? Math.max(0, Math.trunc(Number(workers_out))) : 0;
  const headN = Number.isFinite(Number(headcount)) ? Math.max(0, Math.trunc(Number(headcount))) : Math.max(inN, outN);

  const existing = db.prepare("SELECT id FROM attendance WHERE mine_id = ? AND work_date = ?").get(mine_id, work_date);
  const id = existing?.id ?? `AT-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const at = new Date().toISOString();
  if (existing) {
    db.prepare(`
      UPDATE attendance SET workers_in = ?, workers_out = ?, headcount = ?, recorded_by = ?
      WHERE id = ?
    `).run(inN, outN, headN, session.user.email, id);
  } else {
    db.prepare(`
      INSERT INTO attendance (id, mine_id, work_date, workers_in, workers_out, headcount, recorded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, mine_id, work_date, inN, outN, headN, session.user.email, at);
  }
  const row = db.prepare(`${SELECT_ATTENDANCE} WHERE a.id = ?`).get(id);
  res.status(existing ? 200 : 201).json({ item: row });
});

export default router;
