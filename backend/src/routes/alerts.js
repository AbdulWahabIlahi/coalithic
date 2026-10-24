import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, getSessionUser } from "./auth.js";
import { generateAlerts, listAlerts, patchAlert } from "../engine/alerts.js";

const router = Router();
router.use(requireAuth);

router.get("/", (_req, res) => {
  const session = getSessionUser(_req);
  const role = session?.user?.role ?? null;
  const mineId = session?.user?.mine_id ?? null;
  // Fresh compute so the bell reflects live state (idempotent — dedupe by key).
  generateAlerts();
  res.json({ items: listAlerts(mineId, role) });
});

router.patch("/:id", (req, res) => {
  const { read, assigned_to } = req.body ?? {};
  const updated = patchAlert(Number(req.params.id), { read, assigned_to });
  if (!updated) return res.status(404).json({ detail: "alert not found" });
  res.json({ item: updated });
});

export default router;
