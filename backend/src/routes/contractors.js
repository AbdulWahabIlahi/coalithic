import { randomUUID } from "node:crypto";
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, getSessionUser } from "./auth.js";

const router = Router();
router.use(requireAuth);

function isScoped(session) {
  const role = session?.user?.role ?? null;
  return role !== "Corporate Management" && role !== "Regulator";
}

router.get("/", (req, res) => {
  const session = getSessionUser(req);
  const mineId = isScoped(session) ? session.user.mine_id : null;
  let sql = "SELECT * FROM contractors";
  const params = [];
  if (mineId) {
    sql += " WHERE mine_id = ?";
    params.push(mineId);
  }
  sql += " ORDER BY name";
  res.json({ items: db.prepare(sql).all(...params) });
});

router.get("/expiring", (_req, res) => {
  const within = Number.parseInt(_req.query.within_days ?? "14", 10);
  const limit = new Date();
  limit.setUTCDate(limit.getUTCDate() + within);
  const items = db.prepare(`
    SELECT * FROM contractors
    WHERE safety_cert_expiry IS NOT NULL AND safety_cert_expiry <= ?
    ORDER BY safety_cert_expiry ASC
  `).all(limit.toISOString().slice(0, 10));
  res.json({ items });
});

router.post("/", (req, res) => {
  const { name, mine_id, contact_name, contact_phone, safety_cert_expiry, compliance, notes } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ detail: "name is required" });
  }
  const id = `C-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  db.prepare(`
    INSERT INTO contractors (id, name, mine_id, contact_name, contact_phone, safety_cert_expiry, compliance, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), mine_id ?? null, contact_name ?? null, contact_phone ?? null, safety_cert_expiry ?? null, compliance ?? "compliant", notes ?? null);
  const item = db.prepare("SELECT * FROM contractors WHERE id = ?").get(id);
  res.status(201).json({ item });
});

router.patch("/:id", (req, res) => {
  const item = db.prepare("SELECT * FROM contractors WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).json({ detail: "contractor not found" });
  const session = getSessionUser(req);
  if (isScoped(session) && item.mine_id !== session.user.mine_id) {
    return res.status(403).json({ detail: "contractor not in your mine" });
  }
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(req.body ?? {})) {
    if (["name", "mine_id", "contact_name", "contact_phone", "safety_cert_expiry", "compliance", "notes"].includes(key)) {
      fields.push(`${key} = ?`);
      params.push(val);
    }
  }
  if (fields.length) {
    params.push(req.params.id);
    db.prepare(`UPDATE contractors SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  }
  res.json({ item: db.prepare("SELECT * FROM contractors WHERE id = ?").get(req.params.id) });
});

export default router;
