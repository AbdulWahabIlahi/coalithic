# CoalSmart Backend — Feature Checklist

Stack: **Express.js** (port 8001, matches the Vite proxy in `frontend/vite.config.ts`) +
**SQLite** via Node's built-in `node:sqlite` (zero native deps). Data lives in
`backend/data/coalsmart.db`, photos in `backend/uploads/field/`.

The frontend talks to `/api/*` through `src/lib/api.ts` (httpOnly cookie auth,
cookie name `cs_session`) and runs on the mock in `mock-api.ts` unless
`VITE_NO_MOCK=1` is set. Every feature below must keep that contract working.

## Foundation (prerequisite plumbing — done with Feature 1)

- [x] Express app on :8001, JSON body (25 MB for base64 photos), `/uploads` static
- [x] SQLite schema bootstrap + mine seed data (same 12 mines as the mock)
- [x] Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (httpOnly `cs_session` cookie)
- [x] `GET /api/mines` → `{ items, today }` matching `frontend/src/lib/types.ts`
- [x] Mock parity: `mock-api.ts` extended with `/api/field/*` so demo mode still works

## Features

- [x] **1. Offline Geo-Tagged Mobile Field Capture** — field officers log safety
      violations/inspections with photos, GPS, timestamps while offline; device
      queue auto-syncs via REST when online.
      - [x] `field_captures` table (client_id idempotency key, lat/lng, captured_at
            vs server_received_at drift, photo path, SHA-256 seal)
      - [x] `POST /api/field/captures/sync` — batch upload, idempotent on
            `client_id`, verifies client-side SHA-256 seal, saves photos to `/uploads/field/`
      - [x] `GET /api/field/captures` + `GET /api/field/captures/stats`
      - [x] Frontend `FieldQueue` backed by localStorage offline queue + real sync
- [x] **2. AI Risk & Cross-Mine Pattern Engine** — live 0–100 risk score per mine
      with explanations + cross-mine/cross-contractor repeat-violation grouping
      - [x] Tables: `contractors`, `violations`, `risk_scores`, `risk_score_history`, `risk_patterns`
      - [x] Rule engine (`src/engine/risk.js`): baseline + violation severity +
            statutory overdue load + pattern membership, each as an explained factor
      - [x] Pattern detection: Section grouping across ≥2 mines or ≥2 contractors
      - [x] `GET /api/risk/scores`, `GET /api/risk/patterns`, `POST /api/risk/recompute`
      - [x] Integration: `/api/mines` serves the live engine score; field violation
            captures (Feature 1) auto-create violations and recompute that mine
      - [x] Frontend: PrioritySignals shows the live pattern (demo copy as fallback)
- [x] **3. Statutory Compliance Register & Auto-Escalation Timer** — DGMS/labour
      deadlines, cron moves Pending → Overdue → Escalated, WebSocket push
      - [x] Tables: `compliance_items`, `compliance_events` + 16 seeded statutory items
      - [x] Escalation ticker (`src/engine/escalation.js`): overdue on due-date pass,
            level 1 → Corporate Management after 1 day, level 2 → Regulator after 5
      - [x] `GET /api/compliance/items|stats|escalations`, `POST /items`, `PATCH /items/:id`
      - [x] WebSocket push at `/api/ws` (Vite proxies the upgrade) + toast listener in the UI
      - [x] Frontend: ComplianceRegister page is live (items, health %, overdue count)
      - [x] Feature 2 integration: overdue/escalated load raises risk scores
- [x] **4. Live GIS Map & Role-Based Dashboards** — role-filtered API for the
      Leaflet India map (Green/Yellow/Red pins) and KPI charts
      - [x] `users.mine_id` scope (NULL = full portfolio) + seeded Mine Officer
            (`officer@coalsmart.gov`) and Regulator (`regulator@coalsmart.gov`)
      - [x] `GET /api/mines` role-scoped: officers see only their mine, scores live
            from the risk engine
      - [x] `GET /api/dashboards/overview` — scoped KPIs (mines, high-risk, avg
            compliance, open actions, overdue/pending, field captures)
      - [x] Frontend: StatStrip and AnomalyBanner driven by live KPIs/anomalies
            with demo copy as fallback
- [x] **5. One-Click OCR Document Auto-Fill** — PDF/image upload → Tesseract/EasyOCR
      → regex/LLM parse (dates, contractor, mine id) → pre-filled form JSON
      - [x] `src/lib/ocr.js`: system `tesseract` (images) + `pdftotext` (PDFs) via
            spawnSync, TESSDATA_PREFIX autodiscovery, no native npm deps;
            missing binary → 503 with install hint
      - [x] `parseCertificate`: document type, mine id/name, contractor, valid-from
            and expiry (dd-mm-yyyy + month-name dates, label cleanup)
      - [x] `POST /api/documents/extract` (base64 data URL or pre-extracted `text`)
            stores the doc and returns prefill; `GET /api/documents` archive list
      - [x] Frontend: OcrPanel on ComplianceRegister — file → prefill preview →
            one click into the statutory register (query invalidation + toast)
- [x] **6. Production & Environmental Anomaly Widget** — statistical/Isolation
      Forest check over production & sensor logs → anomaly flag + chart data
      - [x] Tables: `production_logs` (30-day seeded series with a +18% spike on
            M-001 and a −26% dip on M-004) + `sensor_readings` (pm10/water_ph
            breaches on M-001/M-002)
      - [x] `src/engine/anomalies.js`: rolling z-score ≥2 within a ±15% band
            (7-day min history, 7-day recency) + sensor limit breaches
      - [x] `GET /api/anomalies` (role-scoped, high → medium) and
            `GET /api/anomalies/production/:mineId` (30-day series + flags, 403
            outside the caller's scope)
      - [x] Frontend: AnomalyWidget chart with flagged points on MineIntelligence,
            AnomalyBanner fed by the live engine; demo copy as fallback
- [x] **7. Tamper-Proof Audit Trail & One-Click Statutory Reports** — append-only
      `audit_logs` with SHA-256 hash chaining, PDF/CSV statutory export
      - [x] `audit_logs` table + `RAISE(ABORT)` triggers (UPDATE/DELETE rejected)
      - [x] `src/lib/audit.js`: SHA-256 chain over ordered fields, genesis 64-zeros,
            `appendAudit`, `verifyAuditChain`, `auditMutationLogger` request seal
      - [x] `GET /api/audit/logs` (role-scoped) + `GET /api/audit/verify`
      - [x] `src/lib/pdf.js` dependency-free table PDF (WinAnsi, paginated,
            pdftotext-parseable) + `GET /api/reports/compliance.csv|.pdf`
      - [x] Escalation ticker writes `system` entries; exports audited as
            `export:compliance.*`; passwords/tokens/files redacted in details
      - [x] Frontend: ReportsAudit live — export buttons, verify chain, latest
            entries; `src/lib/audit.ts` hooks; mock parity for audit/reports

## Rules

1. Never break the existing frontend contract (`/api/auth/*`, `/api/mines`, cookie name).
2. Each feature lands with its endpoints + a `node --test` suite in `backend/test/`.
3. Tick the checkbox only after the smoke test passes.
