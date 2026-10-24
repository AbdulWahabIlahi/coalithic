import { createHash } from "node:crypto";
import { db } from "../db.js";

// Feature 7 — Tamper-Proof Audit Trail.
//
// Every mutating action (and system escalation) is appended to `audit_logs`.
// Each row seals the previous one: hash = SHA-256(prev_hash + canonical fields),
// with genesis prev_hash = 64 zeros. SQLite triggers reject UPDATE/DELETE, so
// the only write path is append — and any attempt to rewrite history (e.g. by
// dropping the triggers) is caught by verifyAuditChain().

export const GENESIS_HASH = "0".repeat(64);

// Field order matters: the hash must be reproducible from the stored row alone.
const HASH_FIELDS = ["at", "actor", "actor_role", "action", "entity", "entity_id", "method", "path", "status", "detail", "prev_hash"];

function computeHash(row) {
  const canonical = JSON.stringify(HASH_FIELDS.map((f) => row[f] ?? null));
  return createHash("sha256").update(canonical).digest("hex");
}

function headHash() {
  const row = db.prepare("SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1").get();
  return row?.hash ?? GENESIS_HASH;
}

export function appendAudit(entry) {
  const row = {
    at: entry.at ?? new Date().toISOString(),
    actor: entry.actor ?? "system",
    actor_role: entry.actor_role ?? null,
    action: entry.action,
    entity: entry.entity ?? null,
    entity_id: entry.entity_id ?? null,
    method: entry.method ?? null,
    path: entry.path ?? null,
    status: entry.status ?? null,
    detail: typeof entry.detail === "string" ? entry.detail : JSON.stringify(entry.detail ?? {}),
    prev_hash: headHash(),
  };
  const hash = computeHash(row);
  const info = db.prepare(`
    INSERT INTO audit_logs (at, actor, actor_role, action, entity, entity_id, method, path, status, detail, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.at, row.actor, row.actor_role, row.action, row.entity, row.entity_id, row.method, row.path, row.status, row.detail, row.prev_hash, hash);
  return { id: Number(info.lastInsertRowid), ...row, hash };
}

// Walk the whole chain: prev_hash linkage + recomputed hash at every link.
export function verifyAuditChain() {
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY id ASC").all();
  let prev = GENESIS_HASH;
  for (const row of rows) {
    if (row.prev_hash !== prev) {
      return { ok: false, checked: rows.length, broken_at: row.id, reason: "prev_hash does not match the previous link" };
    }
    if (row.hash !== computeHash(row)) {
      return { ok: false, checked: rows.length, broken_at: row.id, reason: "row hash does not match its contents" };
    }
    prev = row.hash;
  }
  return { ok: true, checked: rows.length, head: prev };
}

// ---------------------------------------------------------------------------
// Request-side capture: log successful mutations, never secrets or payloads
// (passwords, base64 photos/tokens are redacted; long strings truncated).

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const ENTITY_BY_ROOT = {
  auth: "session",
  compliance: "compliance_item",
  field: "field_capture",
  documents: "document",
  risk: "risk_score",
  mines: "mine",
};

function safeDetail(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const out = {};
  for (const [key, value] of Object.entries(body)) {
    if (/password|token|file|photo|seal/i.test(key)) {
      out[key] = "[redacted]";
    } else if (typeof value === "string") {
      out[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = `[${value.length} items]`;
    } else if (value && typeof value === "object") {
      out[key] = "[object]";
    }
  }
  return out;
}

function inferTarget(pathname) {
  // /api/compliance/items/K-12 → { entity: compliance_item, entity_id: K-12 }
  const parts = pathname.split("/").filter(Boolean); // ["api", "compliance", "items", "K-12"]
  const root = parts[1] ?? "";
  const entity = (ENTITY_BY_ROOT[root] ?? root) || null;
  const tail = parts[parts.length - 1];
  const isCollection = !tail || tail === root || ["items", "captures", "sync", "recompute", "login", "logout", "extract", "me"].includes(tail);
  return { entity, entity_id: isCollection || parts.length < 4 ? null : tail };
}

export function auditMutationLogger(req, res, next) {
  if (!MUTATING.has(req.method)) return next();

  res.on("finish", () => {
    if (res.statusCode >= 400) return; // failed changes are not actions
    try {
      const pathname = (req.originalUrl ?? req.url ?? "").split("?")[0];
      const session = req.session ?? null;
      // Login only gains a session mid-request — actor comes from the body.
      const loginEmail = pathname.endsWith("/auth/login") && typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : null;
      const { entity, entity_id } = inferTarget(pathname);
      appendAudit({
        actor: session?.user?.email ?? loginEmail ?? "anonymous",
        actor_role: session?.user?.role ?? null,
        action: `${req.method.toLowerCase()}:${pathname.replace(/^\/api\//, "").replace(/\/$/, "")}`,
        entity,
        entity_id,
        method: req.method,
        path: pathname,
        status: res.statusCode,
        detail: safeDetail(req.body),
      });
    } catch (err) {
      console.error("audit append failed", err);
    }
  });
  next();
}
