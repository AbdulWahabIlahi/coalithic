import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "./auth.js";
import { detectProductionAnomalies, listActiveAnomalies, sensorBreaches } from "../engine/anomalies.js";

const router = Router();
router.use(requireAuth);

// Feature 6 endpoints.

router.get("/", (req, res) => {
  const mineId = req.session.user.mine_id;
  const scoped = typeof mineId === "string" && mineId.length > 0;
  const items = listActiveAnomalies().filter((a) => !scoped || a.mine_id === mineId);
  res.json({ items });
});

router.get("/production/:mineId", (req, res) => {
  const scoped = req.session.user.mine_id;
  if (scoped && scoped !== req.params.mineId) {
    return res.status(403).json({ detail: "outside your mine scope" });
  }
  const mine = db.prepare("SELECT id, name FROM mines WHERE id = ?").get(req.params.mineId);
  if (!mine) return res.status(404).json({ detail: "mine not found" });

  const prod = detectProductionAnomalies(mine.id, mine.name);
  res.json({
    ...prod,
    sensor_breaches: sensorBreaches(mine.id, mine.name),
  });
});

export default router;
