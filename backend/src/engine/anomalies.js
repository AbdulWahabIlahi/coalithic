import { db } from "../db.js";

// Feature 6 — Production & Environmental Anomaly Widget.
// Statistical check over daily production (rolling z-score + ±15% band) and a
// hard limit check over sensor readings. Results are computed live from SQLite.

const Z_THRESHOLD = 2;
const PCT_THRESHOLD = 0.15;
const WINDOW = 30;

export function productionSeries(mineId, limit = WINDOW) {
  return db.prepare(`
    SELECT date, coal_tons FROM production_logs
    WHERE mine_id = ?
    ORDER BY date DESC LIMIT ?
  `).all(mineId, limit).reverse();
}

export function detectProductionAnomalies(mineId, mineName = mineId) {
  const series = productionSeries(mineId);
  if (series.length < 7) {
    return { mine_id: mineId, mine_name: mineName, series, anomalies: [] };
  }

  const anomalies = [];
  // Score each day against the mean/stddev of the days before it (min 7-day history).
  for (let i = 7; i < series.length; i++) {
    const history = series.slice(0, i).map((p) => p.coal_tons);
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;
    const std = Math.sqrt(variance);
    const value = series[i].coal_tons;
    const deviationPct = mean === 0 ? 0 : (value - mean) / mean;
    const z = std === 0 ? 0 : (value - mean) / std;

    const isSpike = deviationPct >= PCT_THRESHOLD && z >= Z_THRESHOLD;
    const isDrop = deviationPct <= -PCT_THRESHOLD && z <= -Z_THRESHOLD;
    if (isSpike || isDrop) {
      anomalies.push({
        date: series[i].date,
        value,
        baseline: Math.round(mean),
        deviation_pct: Math.round(deviationPct * 1000) / 10,
        z_score: Math.round(z * 100) / 100,
        direction: isSpike ? "spike" : "drop",
        detail: `${mineName} ${isSpike ? "spiked" : "dropped"} ${Math.abs(Math.round(deviationPct * 100))}% vs its ${history.length}-day baseline (${Math.round(mean)} t)`,
      });
    }
  }

  // Only the most recent anomaly window matters for the widget.
  const recent = anomalies.filter((a) => Date.now() - Date.parse(a.date) <= 7 * 86_400_000);
  return { mine_id: mineId, mine_name: mineName, series, anomalies: recent };
}

export function sensorBreaches(mineId, mineName = mineId) {
  const latest = db.prepare(`
    SELECT s.metric, s.value, s.unit, s.limit_value, s.recorded_at
    FROM sensor_readings s
    JOIN (
      SELECT metric, MAX(recorded_at) AS recorded_at
      FROM sensor_readings WHERE mine_id = ? GROUP BY metric
    ) t ON t.metric = s.metric AND t.recorded_at = s.recorded_at
    WHERE s.mine_id = ?
  `).all(mineId, mineId);

  return latest
    .filter((r) => r.value > r.limit_value)
    .map((r) => ({
      metric: r.metric,
      value: r.value,
      unit: r.unit,
      limit_value: r.limit_value,
      recorded_at: r.recorded_at,
      detail: `${mineName}: ${r.metric} at ${r.value}${r.unit} breaches the ${r.limit_value}${r.unit} limit`,
    }));
}

export function listActiveAnomalies() {
  const mines = db.prepare("SELECT id, name FROM mines ORDER BY id").all();
  const out = [];
  for (const mine of mines) {
    const prod = detectProductionAnomalies(mine.id, mine.name);
    for (const a of prod.anomalies) {
      out.push({
        mine_id: mine.id,
        mine_name: mine.name,
        kind: "production",
        severity: Math.abs(a.deviation_pct) >= 20 ? "high" : "medium",
        at: a.date,
        detail: a.detail,
        data: a,
      });
    }
    for (const b of sensorBreaches(mine.id, mine.name)) {
      out.push({
        mine_id: mine.id,
        mine_name: mine.name,
        kind: "environment",
        severity: b.value / b.limit_value >= 1.5 ? "high" : "medium",
        at: b.recorded_at,
        detail: b.detail,
        data: b,
      });
    }
  }
  const rank = { high: 0, medium: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
