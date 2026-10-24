import { Router } from "express";
import { db, todayIso } from "../db.js";
import { requireAuth } from "./auth.js";

const router = Router();
router.use(requireAuth);

// Feature 4 — role-tailored KPI strip for the dashboards. Everything is scoped to
// the caller's mine visibility (Mine Officer → their mine, others → portfolio).

function scopeClause(user) {
  const mineId = user.mine_id;
  const scoped = typeof mineId === "string" && mineId.length > 0;
  return { scoped, mineId, sql: scoped ? "WHERE m.id = ?" : "", params: scoped ? [mineId] : [] };
}

router.get("/overview", (req, res) => {
  const { scoped, sql, params } = scopeClause(req.session.user);
  const risk = db.prepare(`
    SELECT
      COUNT(*) AS total_mines,
      SUM(CASE WHEN COALESCE(r.score, m.risk) >= 70 THEN 1 ELSE 0 END) AS high_risk,
      SUM(CASE WHEN COALESCE(r.score, m.risk) >= 40 AND COALESCE(r.score, m.risk) < 70 THEN 1 ELSE 0 END) AS watch,
      ROUND(AVG(m.compliance), 1) AS avg_compliance
    FROM mines m
    LEFT JOIN risk_scores r ON r.mine_id = m.id
    ${sql}
  `).get(...params);

  const violations = db.prepare(`
    SELECT COUNT(*) AS n FROM violations
    WHERE status = 'open' AND (? = 0 OR mine_id = ?)
  `).get(scoped ? 1 : 0, req.session.user.mine_id ?? "").n;

  const compliance = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalated,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
    FROM compliance_items
    WHERE (? = 0 OR mine_id = ?)
  `).get(scoped ? 1 : 0, req.session.user.mine_id ?? "");

  const captures = db.prepare(`
    SELECT COUNT(*) AS n FROM field_captures
    WHERE (? = 0 OR mine_id = ?)
  `).get(scoped ? 1 : 0, req.session.user.mine_id ?? "").n;

  const overdueActions = (compliance.overdue ?? 0) + (compliance.escalated ?? 0);

  res.json({
    role: req.session.user.role,
    scope: scoped ? req.session.user.mine_id : "all",
    today: todayIso(),
    total_mines: risk.total_mines ?? 0,
    high_risk: risk.high_risk ?? 0,
    watch: risk.watch ?? 0,
    avg_compliance: risk.avg_compliance ?? 100,
    open_violations: violations,
    overdue_actions: overdueActions,
    pending_actions: compliance.pending ?? 0,
    field_captures: captures,
    open_actions: violations + (compliance.pending ?? 0) + overdueActions,
  });
});

export default router;
