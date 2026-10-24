import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "./auth.js";
import { listPatterns, listRiskScores, recomputeAllRiskScores } from "../engine/risk.js";
import { generateAlerts } from "../engine/alerts.js";

const router = Router();
router.use(requireAuth);

// Feature 2 endpoints — live risk scores, explanations and repeat patterns.

// Mine officers only ever touch their assigned mine on the per-mine endpoints.
function scopedMine(req) {
  const mineId = req.session.user.mine_id;
  return typeof mineId === "string" && mineId.length > 0 ? mineId : null;
}

router.get("/scores", (_req, res) => {
  // Self-warm: compute once on a fresh database so the dashboard is never empty.
  if (db.prepare("SELECT COUNT(*) AS n FROM risk_scores").get().n === 0) {
    recomputeAllRiskScores();
  }
  res.json({ items: listRiskScores() });
});

// Feature 5 — per-mine factor breakdown ("Why is this mine high risk?").
router.get("/explain/:mineId", (req, res) => {
  const scope = scopedMine(req);
  if (scope && scope !== req.params.mineId) {
    return res.status(403).json({ detail: "mine not in your scope" });
  }
  const row = db.prepare("SELECT * FROM risk_scores WHERE mine_id = ?").get(req.params.mineId);
  if (!row) return res.status(404).json({ detail: "risk score not found" });
  const explanation = JSON.parse(row.explanation);
  res.json({
    mine_id: row.mine_id,
    score: row.score,
    band: row.band,
    delta: row.delta,
    factors: explanation.factors ?? [],
    patterns: explanation.patterns ?? 0,
    computed_at: row.computed_at,
  });
});

// Feature 5 — root-cause: violations grouped by section/contractor for one mine,
// plus the cross-mine patterns this mine belongs to.
router.get("/root-cause/:mineId", (req, res) => {
  const mineId = req.params.mineId;
  const scope = scopedMine(req);
  if (scope && scope !== mineId) {
    return res.status(403).json({ detail: "mine not in your scope" });
  }
  const bySection = db.prepare(`
    SELECT section, COUNT(*) AS n, GROUP_CONCAT(DISTINCT contractor_id) AS contractors
    FROM violations WHERE mine_id = ? AND status = 'open'
    GROUP BY section ORDER BY n DESC
  `).all(mineId);
  const byContractor = db.prepare(`
    SELECT contractor_id, name, COUNT(*) AS n
    FROM violations v LEFT JOIN contractors c ON c.id = v.contractor_id
    WHERE v.mine_id = ? AND v.status = 'open' AND v.contractor_id IS NOT NULL
    GROUP BY v.contractor_id ORDER BY n DESC
  `).all(mineId);
  const patterns = db.prepare("SELECT * FROM risk_patterns").all().map((r) => ({
    ...r,
    mine_ids: JSON.parse(r.mine_ids),
    contractor_ids: JSON.parse(r.contractor_ids),
  }));
  const minePatterns = patterns.filter((p) => p.mine_ids.includes(mineId));
  res.json({ mine_id: mineId, by_section: bySection, by_contractor: byContractor, patterns: minePatterns });
});

// B2 — open violations with contractor attribution, so the UI can show
// "what is wrong, where, and who was responsible" per mine or portfolio-wide.
router.get("/violations", (req, res) => {
  const scope = scopedMine(req);
  const requested = typeof req.query.mine_id === "string" && req.query.mine_id ? req.query.mine_id : null;
  if (scope && requested && requested !== scope) {
    return res.status(403).json({ detail: "mine not in your scope" });
  }
  const mineFilter = scope ?? requested;
  const rows = db.prepare(`
    SELECT v.id, v.mine_id, m.name AS mine_name, v.section, v.title, v.severity,
           v.status, v.opened_at, v.closed_at, v.contractor_id, c.name AS contractor_name
    FROM violations v
    LEFT JOIN mines m ON m.id = v.mine_id
    LEFT JOIN contractors c ON c.id = v.contractor_id
    ${mineFilter ? "WHERE v.mine_id = ?" : ""}
    ORDER BY CASE v.severity WHEN 3 THEN 0 WHEN 2 THEN 1 ELSE 2 END, v.opened_at DESC
    LIMIT 150
  `).all(...(mineFilter ? [mineFilter] : []));
  res.json({ items: rows });
});

router.get("/patterns", (_req, res) => {
  if (db.prepare("SELECT COUNT(*) AS n FROM risk_scores").get().n === 0) {
    recomputeAllRiskScores();
  }
  res.json({ items: listPatterns() });
});

router.post("/recompute", (_req, res) => {
  const result = recomputeAllRiskScores();
  // Refresh alerts so risk-band changes surface immediately on the bell.
  generateAlerts();
  res.json({
    computed_at: result.computed_at,
    mine_count: result.mines.length,
    pattern_count: result.patterns.length,
  });
});

export default router;

