import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, getSessionUser } from "./auth.js";

const router = Router();
router.use(requireAuth);

function isScoped(session) {
  const role = session?.user?.role ?? null;
  return role !== "Corporate Management" && role !== "Regulator";
}

// Canonical threshold config per metric.
router.get("/limits", (_req, res) => {
  const limits = db.prepare("SELECT * FROM metric_limits ORDER BY metric").all();
  res.json({ items: limits });
});

router.put("/limits/:metric", (req, res) => {
  const { limit_value, unit, direction } = req.body ?? {};
  if (typeof limit_value !== "number" || !unit || !["max", "min"].includes(direction)) {
    return res.status(400).json({ detail: "limit_value, unit and direction (max|min) are required" });
  }
  db.prepare(`
    INSERT INTO metric_limits (metric, limit_value, unit, direction) VALUES (?, ?, ?, ?)
    ON CONFLICT(metric) DO UPDATE SET limit_value = excluded.limit_value, unit = excluded.unit, direction = excluded.direction
  `).run(req.params.metric, limit_value, unit, direction);
  res.json({ item: db.prepare("SELECT * FROM metric_limits WHERE metric = ?").get(req.params.metric) });
});

// B6 — historical breach log: every sensor reading that crossed its metric
// limit (latest 50), role-scoped like the rest of the environment surface.
router.get("/breaches", (req, res) => {
  const session = getSessionUser(req);
  const scope = isScoped(session) && session.user.mine_id ? session.user.mine_id : null;
  const rows = db.prepare(`
    SELECT s.id, s.mine_id, m.name AS mine_name, s.metric, s.value, s.unit,
           s.limit_value, l.direction, s.recorded_at
    FROM sensor_readings s
    JOIN mines m ON m.id = s.mine_id
    JOIN metric_limits l ON l.metric = s.metric
    WHERE ((l.direction = 'max' AND s.value > l.limit_value)
        OR (l.direction = 'min' AND s.value < l.limit_value))
      ${scope ? "AND s.mine_id = ?" : ""}
    ORDER BY s.recorded_at DESC
    LIMIT 50
  `).all(...(scope ? [scope] : []));
  res.json({ items: rows, scoped_to: scope });
});

// Latest reading per metric for one mine (+ breach flag) plus short history.
router.get("/:mineId", (req, res) => {
  const session = getSessionUser(req);
  if (isScoped(session) && req.params.mineId !== session.user.mine_id) {
    return res.status(403).json({ detail: "mine not in your scope" });
  }
  const mineId = req.params.mineId;
  const latest = db.prepare(`
    SELECT s.metric, s.value, s.unit, s.limit_value, s.recorded_at,
           CASE WHEN s.limit_value IS NOT NULL AND s.value > s.limit_value THEN 1 ELSE 0 END AS breach
    FROM sensor_readings s
    JOIN (
      SELECT metric, MAX(recorded_at) AS ra
      FROM sensor_readings WHERE mine_id = ? GROUP BY metric
    ) t ON t.metric = s.metric AND t.ra = s.recorded_at
    WHERE s.mine_id = ?
  `).all(mineId, mineId);
  const history = db.prepare(`
    SELECT * FROM sensor_readings WHERE mine_id = ? ORDER BY recorded_at DESC LIMIT 60
  `).all(mineId);
  res.json({ mine_id: mineId, latest, history });
});

// Latest readings across all mines (portfolio view).
router.get("/", (_req, res) => {
  const rows = db.prepare(`
    SELECT s.mine_id, m.name AS mine_name, s.metric, s.value, s.unit, s.limit_value, s.recorded_at,
           CASE WHEN s.limit_value IS NOT NULL AND s.value > s.limit_value THEN 1 ELSE 0 END AS breach
    FROM sensor_readings s
    JOIN (
      SELECT mine_id, metric, MAX(recorded_at) AS ra
      FROM sensor_readings GROUP BY mine_id, metric
    ) t ON t.mine_id = s.mine_id AND t.metric = s.metric AND t.ra = s.recorded_at
    JOIN mines m ON m.id = s.mine_id
    ORDER BY s.mine_id, s.metric
  `).all();
  res.json({ items: rows });
});

export default router;
