import { Router } from "express";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { db, UPLOADS_DIR } from "../db.js";
import { sha256Hex } from "../lib/password.js";
import { requireAuth } from "./auth.js";
import { recordViolation, recomputeMine } from "../engine/risk.js";

const router = Router();
router.use(requireAuth);

// Feature 1 — Offline Geo-Tagged Mobile Field Capture.
// Device queues captures offline, seals each one with SHA-256, then POSTs the whole
// queue here on reconnect. `client_id` is the device-generated idempotency key, so a
// flaky network can re-POST the same queue forever without duplicating records.

const MAX_BATCH = 100;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024; // base64 decoded
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000; // clock skew allowance

// Must stay byte-identical with `canonical()` in frontend/src/components/FieldQueue.tsx.
export function canonical(c) {
  return JSON.stringify({
    client_id: c.client_id,
    mine_id: c.mine_id ?? null,
    kind: c.kind,
    note: c.note ?? "",
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    accuracy_m: c.accuracy_m ?? null,
    captured_at: c.captured_at,
  });
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function validateCapture(raw, receivedAt) {
  if (!raw || typeof raw !== "object") return { error: "capture must be an object" };
  const { client_id, kind, captured_at } = raw;

  if (typeof client_id !== "string" || !/^[A-Za-z0-9-]{4,64}$/.test(client_id)) {
    return { error: "client_id must be a 4-64 char alphanumeric id" };
  }
  if (typeof kind !== "string" || kind.trim().length === 0 || kind.length > 64) {
    return { error: "kind is required" };
  }
  if (typeof captured_at !== "string" || Number.isNaN(Date.parse(captured_at))) {
    return { error: "captured_at must be an ISO timestamp" };
  }

  const capturedMs = Date.parse(captured_at);
  if (capturedMs > receivedAt.getTime() + FUTURE_TOLERANCE_MS) {
    return { error: "captured_at is in the future" };
  }

  const { lat, lng } = raw;
  const hasCoords =
    (lat !== undefined && lat !== null) || (lng !== undefined && lng !== null);
  if (hasCoords) {
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return { error: "lat/lng must be numbers" };
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { error: "lat/lng out of range" };
  }

  if (raw.accuracy_m !== undefined && raw.accuracy_m !== null && !isFiniteNumber(raw.accuracy_m)) {
    return { error: "accuracy_m must be a number" };
  }
  if (raw.note !== undefined && raw.note !== null && (typeof raw.note !== "string" || raw.note.length > 2000)) {
    return { error: "note must be a string under 2000 chars" };
  }
  if (raw.mine_id !== undefined && raw.mine_id !== null && typeof raw.mine_id !== "string") {
    return { error: "mine_id must be a string" };
  }
  return {};
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

function savePhoto(captureId, dataUrl) {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return { error: "photo must be a base64 data URL (image/jpeg, png or webp)" };
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[match[1]];
  const buf = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buf.length === 0) return { error: "photo is empty" };
  if (buf.length > MAX_PHOTO_BYTES) return { error: "photo exceeds 12MB limit" };
  const rel = `${captureId}.${ext}`;
  writeFileSync(path.join(UPLOADS_DIR, rel), buf);
  return { photo_path: rel };
}

router.post("/sync", (req, res) => {
  const receivedAt = new Date();
  const body = req.body ?? {};
  const captures = body.captures;

  if (!Array.isArray(captures) || captures.length === 0) {
    return res.status(400).json({ detail: "captures must be a non-empty array" });
  }
  if (captures.length > MAX_BATCH) {
    return res.status(400).json({ detail: `batch limited to ${MAX_BATCH} captures` });
  }

  const deviceId = typeof body.device_id === "string" ? body.device_id.slice(0, 64) : null;
  const synced = [];
  const rejected = [];

  for (const raw of captures) {
    const v = validateCapture(raw, receivedAt);
    if (v.error) {
      rejected.push({ client_id: raw?.client_id ?? null, reason: v.error });
      continue;
    }

    // Idempotency: a capture already on the server is treated as synced again.
    const existing = db.prepare("SELECT id, seal_hash, photo_path FROM field_captures WHERE client_id = ?")
      .get(raw.client_id);
    if (existing) {
      synced.push({ client_id: raw.client_id, id: existing.id, seal_hash: existing.seal_hash, already_synced: true });
      continue;
    }

    const seal = sha256Hex(canonical(raw));
    if (typeof raw.client_seal === "string" && raw.client_seal.toLowerCase() !== seal) {
      rejected.push({ client_id: raw.client_id, reason: "client seal mismatch — capture altered after sealing" });
      continue;
    }

    const id = `CAP-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    let photoPath = null;
    if (typeof raw.photo === "string" && raw.photo.length > 0) {
      const saved = savePhoto(id, raw.photo);
      if (saved.error) {
        rejected.push({ client_id: raw.client_id, reason: saved.error });
        continue;
      }
      photoPath = saved.photo_path;
    }

    const driftSeconds = Math.round((receivedAt.getTime() - Date.parse(raw.captured_at)) / 1000);
    db.prepare(`
      INSERT INTO field_captures
        (id, client_id, mine_id, kind, note, lat, lng, accuracy_m,
         captured_at, server_received_at, device_id, photo_path,
         client_seal, seal_hash, drift_seconds, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
    `).run(
      id,
      raw.client_id,
      raw.mine_id ?? null,
      raw.kind.trim(),
      typeof raw.note === "string" ? raw.note : "",
      raw.lat ?? null,
      raw.lng ?? null,
      raw.accuracy_m ?? null,
      new Date(Date.parse(raw.captured_at)).toISOString(),
      receivedAt.toISOString(),
      deviceId,
      photoPath,
      typeof raw.client_seal === "string" ? raw.client_seal : null,
      seal,
      driftSeconds,
    );

    synced.push({ client_id: raw.client_id, id, seal_hash: seal, already_synced: false });

    // Feature 2 hook: a geo-tagged violation capture becomes an open violation and
    // immediately re-runs the risk engine for that mine.
    if (raw.kind === "violation" && raw.mine_id) {
      const mineExists = db.prepare("SELECT 1 FROM mines WHERE id = ?").get(raw.mine_id);
      if (mineExists) {
        recordViolation({
          mineId: raw.mine_id,
          section: typeof raw.section === "string" && raw.section ? raw.section : "Field observation",
          title: typeof raw.note === "string" && raw.note ? raw.note.slice(0, 200) : "Field-captured violation",
          severity: Number.isFinite(raw.severity) ? Math.min(3, Math.max(1, Math.trunc(raw.severity))) : 1,
          openedAt: new Date(Date.parse(raw.captured_at)).toISOString(),
        });
        recomputeMine(raw.mine_id, receivedAt);
      }
    }
  }

  res.json({
    synced,
    rejected,
    server_received_at: receivedAt.toISOString(),
  });
});

router.get("/stats", (_req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS n FROM field_captures").get().n;
  const withGeo = db.prepare("SELECT COUNT(*) AS n FROM field_captures WHERE lat IS NOT NULL").get().n;
  const withPhoto = db.prepare("SELECT COUNT(*) AS n FROM field_captures WHERE photo_path IS NOT NULL").get().n;
  const latest = db.prepare("SELECT server_received_at FROM field_captures ORDER BY server_received_at DESC LIMIT 1")
    .get();
  res.json({ total, with_geo: withGeo, with_photo: withPhoto, latest_sync: latest?.server_received_at ?? null });
});

router.get("/", (req, res) => {
  const limit = Math.min(Number.parseInt(req.query.limit ?? "50", 10) || 50, 200);
  // Role scope: officers only ever list captures from their own mine.
  const scoped = typeof req.session.user.mine_id === "string" && req.session.user.mine_id.length > 0
    ? req.session.user.mine_id
    : null;
  const requested = typeof req.query.mine_id === "string" ? req.query.mine_id : null;
  if (scoped && requested && requested !== scoped) {
    return res.status(403).json({ detail: "mine not in your scope" });
  }
  const mineId = scoped ?? requested;

  const rows = mineId
    ? db.prepare(`
        SELECT id, client_id, mine_id, kind, note, lat, lng, accuracy_m,
               captured_at, server_received_at, photo_path, seal_hash, drift_seconds, status
        FROM field_captures WHERE mine_id = ?
        ORDER BY server_received_at DESC LIMIT ?
      `).all(mineId, limit)
    : db.prepare(`
        SELECT id, client_id, mine_id, kind, note, lat, lng, accuracy_m,
               captured_at, server_received_at, photo_path, seal_hash, drift_seconds, status
        FROM field_captures
        ORDER BY server_received_at DESC LIMIT ?
      `).all(limit);

  res.json({
    items: rows.map((r) => ({ ...r, photo_url: r.photo_path ? `/uploads/field/${r.photo_path}` : null })),
  });
});

export default router;
