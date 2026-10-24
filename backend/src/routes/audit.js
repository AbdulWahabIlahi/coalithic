import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "./auth.js";
import { verifyAuditChain } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// Feature 7 — read side of the tamper-proof audit trail.

router.get("/logs", (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(Number.parseInt(req.query.offset ?? "0", 10) || 0, 0);
  const { email, role, mine_id } = req.session.user;

  // Mine Officers only see their own actions and anything touching their mine;
  // Corporate/Regulator see the whole trail.
  let sql = "SELECT * FROM audit_logs";
  let countSql = "SELECT COUNT(*) AS n FROM audit_logs";
  const params = [];
  if (role === "Mine Officer" && mine_id) {
    const where = " WHERE (actor = ? OR entity_id = ? OR detail LIKE ?)";
    sql += where;
    countSql += where;
    params.push(email, mine_id, `%"mine_id":"${mine_id}"%`);
  }
  const total = db.prepare(countSql).get(...params)?.n ?? 0;
  sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
  const items = db.prepare(sql).all(...params, limit, offset);
  res.json({ items, total });
});

router.get("/verify", (_req, res) => {
  res.json(verifyAuditChain());
});

export default router;
