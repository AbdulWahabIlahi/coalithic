import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth } from "./auth.js";
import { extractText, parseCertificate } from "../lib/ocr.js";

const router = Router();
router.use(requireAuth);

// Feature 5 — One-Click OCR Document Auto-Fill.
// POST /extract: image or PDF (base64 data URL, or a pre-extracted `text` field
// for text-layer PDFs handled client-side) → structured prefill JSON that the
// frontend drops straight into the compliance form.

const DATA_URL_RE = /^data:([^;]+);base64,(.+)$/;
const MAX_DOC_BYTES = 15 * 1024 * 1024;

router.post("/extract", (req, res) => {
  const body = req.body ?? {};
  let rawText = null;
  let mime = "text/plain";
  let filename = typeof body.filename === "string" ? body.filename : "upload.txt";

  if (typeof body.text === "string" && body.text.trim().length > 0) {
    // Client already has the text (e.g. a text-layer PDF) — skip OCR.
    rawText = body.text;
  } else if (typeof body.file === "string") {
    const match = DATA_URL_RE.exec(body.file);
    if (!match) {
      return res.status(400).json({ detail: "file must be a base64 data URL" });
    }
    mime = match[1];
    const buf = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    if (buf.length === 0) return res.status(400).json({ detail: "file is empty" });
    if (buf.length > MAX_DOC_BYTES) return res.status(413).json({ detail: "file exceeds 15MB limit" });
    rawText = extractText(buf, mime, filename);
  } else {
    return res.status(400).json({ detail: "send a base64 data URL in `file` or extracted `text`" });
  }

  const prefill = parseCertificate(rawText);
  const id = `DOC-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  db.prepare(`
    INSERT INTO documents (id, filename, mime, extracted_text, prefill, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, filename, mime, rawText.slice(0, 20000), JSON.stringify(prefill), req.session.user.email, new Date().toISOString());

  res.json({
    document_id: id,
    raw_text: rawText.slice(0, 4000),
    prefill,
  });
});

router.get("/", (_req, res) => {
  const rows = db.prepare(`
    SELECT id, filename, mime, prefill, created_by, created_at
    FROM documents ORDER BY created_at DESC LIMIT 50
  `).all();
  res.json({
    items: rows.map((r) => ({ ...r, prefill: JSON.parse(r.prefill) })),
  });
});

export default router;
