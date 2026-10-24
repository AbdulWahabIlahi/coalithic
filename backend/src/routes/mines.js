import { Router } from "express";
import { db, todayIso } from "../db.js";
import { recomputeAllRiskScores } from "../engine/risk.js";
import { requireAuth } from "./auth.js";

const router = Router();
router.use(requireAuth);

// Feature 4 — role-scoped mine feed: Mine Officers only ever see their assigned
// mine; Corporate Management and Regulators see the full portfolio.
router.get("/", requireAuth, (req, res) => {
  const hasScores = db.prepare("SELECT COUNT(*) AS n FROM risk_scores").get().n > 0;
  if (!hasScores) recomputeAllRiskScores();

  const mineId = req.session.user.mine_id;
  const scoped = typeof mineId === "string" && mineId.length > 0;

  const rows = db.prepare(`
    SELECT m.id, m.name, m.state,
           COALESCE(r.score, m.risk) AS risk,
           m.compliance, m.lat, m.lng,
           COALESCE(v.open_issues, m.open_issues) AS open_issues,
           m.last_inspection
    FROM mines m
    LEFT JOIN risk_scores r ON r.mine_id = m.id
    LEFT JOIN (
      SELECT mine_id, COUNT(*) AS open_issues
      FROM violations WHERE status = 'open' GROUP BY mine_id
    ) v ON v.mine_id = m.id
    ${scoped ? "WHERE m.id = ?" : ""}
    ORDER BY m.id
  `).all(...(scoped ? [mineId] : []));

  res.json({ items: rows, today: todayIso() });
});

export default router;
