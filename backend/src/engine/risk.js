import { randomUUID } from "node:crypto";
import { db, todayIso } from "../db.js";

// Feature 2 — AI Risk & Cross-Mine Pattern Engine.
// Rule-based weights over live signals: seeded baseline risk + open violation
// severity + statutory overdue/escalation load + cross-mine pattern membership.
// Every factor is emitted as an explanation row so the dashboard can say WHY.

const SEVERITY_WEIGHT = { 1: 2, 2: 4, 3: 6 };
const VIOLATION_CAP = 25;
const OVERDUE_PER_ITEM = 4;
const ESCALATED_BONUS = 8;
const PATTERN_BONUS = 5;
const CLEAN_WINDOW_DAYS = 14;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function daysBetween(isoA, isoB) {
  return Math.floor((Date.parse(isoB) - Date.parse(isoA)) / 86_400_000);
}

export function recomputeAllRiskScores(now = new Date()) {
  const computedAt = now.toISOString();
  const mineRows = db.prepare("SELECT id, risk AS baseline FROM mines").all();

  const openViolations = db.prepare(`
    SELECT v.mine_id, v.section, v.severity, v.contractor_id, v.opened_at
    FROM violations v
    WHERE v.status = 'open'
  `).all();

  const complianceLoad = db.prepare(`
    SELECT mine_id,
           SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
           SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalated_count
    FROM compliance_items
    GROUP BY mine_id
  `).all();

  const patterns = detectPatterns(openViolations, now);
  syncPatterns(patterns, now);

  const patternByMine = new Map();
  for (const p of patterns) {
    for (const mineId of p.mine_ids) {
      patternByMine.set(mineId, (patternByMine.get(mineId) ?? 0) + 1);
    }
  }

  const loadByMine = new Map(complianceLoad.map((r) => [r.mine_id, r]));
  const violationsByMine = new Map();
  for (const v of openViolations) {
    if (!violationsByMine.has(v.mine_id)) violationsByMine.set(v.mine_id, []);
    violationsByMine.get(v.mine_id).push(v);
  }

  const results = [];
  const selectPrev = db.prepare("SELECT score, explanation FROM risk_scores WHERE mine_id = ?");

  for (const mine of mineRows) {
    const factors = [];
    factors.push({
      factor: "baseline",
      delta: mine.baseline,
      detail: `Seeded portfolio baseline for ${mine.id}`,
    });

    let score = mine.baseline;

    // Open violation severity pressure (last 30 days counts full weight).
    const mineViolations = violationsByMine.get(mine.id) ?? [];
    let violationPoints = 0;
    let recentOpen = 0;
    for (const v of mineViolations) {
      const age = daysBetween(v.opened_at, computedAt);
      const weight = (SEVERITY_WEIGHT[v.severity] ?? 2) * (age <= CLEAN_WINDOW_DAYS ? 1.5 : 1);
      violationPoints += weight;
      if (age <= CLEAN_WINDOW_DAYS) recentOpen += 1;
    }
    violationPoints = Math.min(VIOLATION_CAP, Math.round(violationPoints));
    if (violationPoints > 0) {
      score += violationPoints;
      factors.push({
        factor: "open_violations",
        delta: violationPoints,
        detail: `${mineViolations.length} open violation(s), ${recentOpen} in the last ${CLEAN_WINDOW_DAYS} days`,
      });
    }

    // Statutory register pressure (Feature 3 signals feed Feature 2).
    const load = loadByMine.get(mine.id);
    if (load && (load.overdue_count > 0 || load.escalated_count > 0)) {
      const points = load.overdue_count * OVERDUE_PER_ITEM + load.escalated_count * ESCALATED_BONUS;
      score += points;
      factors.push({
        factor: "statutory_overdue",
        delta: points,
        detail: `${load.overdue_count} overdue, ${load.escalated_count} escalated statutory item(s)`,
      });
    }

    // Cross-mine / cross-contractor repeat patterns.
    const patternCount = patternByMine.get(mine.id) ?? 0;
    if (patternCount > 0) {
      const points = patternCount * PATTERN_BONUS;
      score += points;
      factors.push({
        factor: "repeat_pattern",
        delta: points,
        detail: `Member of ${patternCount} repeat-violation pattern(s) across the portfolio`,
      });
    }

    score = clamp(Math.round(score), 0, 100);
    const prev = selectPrev.get(mine.id);
    const delta = prev ? score - prev.score : 0;
    if (prev && delta !== 0) {
      factors.push({
        factor: "score_change",
        delta,
        detail: delta > 0
          ? `Risk rose ${delta} point(s) since the last computation`
          : `Risk fell ${Math.abs(delta)} point(s) since the last computation`,
      });
    }

    const band = score >= 70 ? "high" : score >= 40 ? "watch" : "low";
    const explanation = JSON.stringify({ factors, patterns: patternCount, computed_at: computedAt });

    db.prepare(`
      INSERT INTO risk_scores (mine_id, score, band, explanation, delta, computed_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(mine_id) DO UPDATE SET
        score = excluded.score,
        band = excluded.band,
        explanation = excluded.explanation,
        delta = excluded.delta,
        computed_at = excluded.computed_at
    `).run(mine.id, score, band, explanation, delta, computedAt);

    db.prepare(`
      INSERT INTO risk_score_history (mine_id, score, delta, explanation, computed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(mine.id, score, delta, explanation, computedAt);

    results.push({ mine_id: mine.id, score, band, delta, factors });
  }

  return { computed_at: computedAt, mines: results, patterns };
}

// Group open violations by section: a pattern needs the same section hit by >= 2
// distinct mines (cross-mine) or >= 2 distinct contractors on one mine.
export function detectPatterns(openViolations, now = new Date()) {
  const bySection = new Map();
  for (const v of openViolations) {
    if (!bySection.has(v.section)) bySection.set(v.section, []);
    bySection.get(v.section).push(v);
  }

  const patterns = [];
  for (const [section, rows] of bySection) {
    const mineIds = [...new Set(rows.map((r) => r.mine_id))].sort();
    const contractorIds = [...new Set(rows.map((r) => r.contractor_id).filter(Boolean))].sort();
    const crossMine = mineIds.length >= 2;
    const crossContractor = contractorIds.length >= 2;
    if (!crossMine && !crossContractor) continue;

    const opened = rows.map((r) => r.opened_at).sort();
    patterns.push({
      id: `P-${section.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`,
      section,
      mine_ids: mineIds,
      contractor_ids: contractorIds,
      violation_count: rows.length,
      first_seen: opened[0],
      last_seen: opened[opened.length - 1],
      computed_at: now.toISOString(),
    });
  }
  return patterns.sort((a, b) => b.violation_count - a.violation_count);
}

function syncPatterns(patterns, now) {
  db.exec("DELETE FROM risk_patterns");
  const insert = db.prepare(`
    INSERT INTO risk_patterns
      (id, section, mine_ids, contractor_ids, violation_count, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of patterns) {
    insert.run(
      p.id,
      p.section,
      JSON.stringify(p.mine_ids),
      JSON.stringify(p.contractor_ids),
      p.violation_count,
      p.first_seen ?? now.toISOString(),
      p.last_seen ?? now.toISOString(),
    );
  }
}

export function listPatterns() {
  return db.prepare("SELECT * FROM risk_patterns ORDER BY violation_count DESC").all().map((r) => ({
    id: r.id,
    section: r.section,
    mine_ids: JSON.parse(r.mine_ids),
    contractor_ids: JSON.parse(r.contractor_ids),
    violation_count: r.violation_count,
    first_seen: r.first_seen,
    last_seen: r.last_seen,
  }));
}

export function listRiskScores() {
  return db.prepare("SELECT * FROM risk_scores ORDER BY score DESC").all().map((r) => ({
    mine_id: r.mine_id,
    score: r.score,
    band: r.band,
    delta: r.delta,
    explanation: JSON.parse(r.explanation),
    computed_at: r.computed_at,
  }));
}

// Convenience for the field-capture sync (Feature 1): recompute a single mine after
// a violation capture lands, so the map updates without a full portfolio pass.
export function recomputeMine(mineId, now = new Date()) {
  const result = recomputeAllRiskScores(now);
  return result.mines.find((m) => m.mine_id === mineId) ?? null;
}

export function recordViolation({ mineId, contractorId = null, section = "Field observation", title, severity = 1, openedAt = new Date().toISOString() }) {
  const id = `V-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  db.prepare(`
    INSERT INTO violations (id, mine_id, contractor_id, section, title, severity, status, opened_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(id, mineId, contractorId, section, title, severity, openedAt);
  return id;
}

export function today() {
  return todayIso();
}
