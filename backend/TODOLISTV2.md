# CoalSmart — TODOLIST V2 (Gap Backlog)

Features identified as missing from the final product vs. the SIH problem
statement. Excludes blockchain (intentionally dropped — a plain SHA-256
append-only trail already ships in Feature 7 of `TODOLIST.md`).

- [x] **1. PWA / Real Offline Shell** — make the whole app usable without
      connectivity, not just the capture queue
      - [x] Web app manifest + service worker (cache app shell & API GETs)
            *(`public/manifest.webmanifest` + 192/512 icons; `public/sw.js`:
              network-first navigations/API GETs with cache fallback, cache-first
              hashed `/assets` + `/uploads` photos; registered in `main.tsx`,
              caches cleared on logout in `session.ts`)*
      - [x] Background sync: flush localStorage field queue when `navigator.onLine`
            returns, retry with backoff, show sync status badge
            *(online/offline listeners flush immediately, plus a fixed 45s retry
              loop while records remain queued — interval retry, not exponential
              backoff; Topbar badge shows connection state + queued count)*
      - [x] Camera/GPS capture flow tuned for mobile browsers
            *(`FieldCaptureForm`: `capture="environment"` camera input, client-side
              downscale to ≤900px JPEG before it touches localStorage, GPS acquired
              on save via `getCurrentPosition` with a 4s timeout)*
- [x] **2. Alert & Notification Center** — turn static demo alerts into live ones
      - [x] `alerts` table + `GET /api/alerts` (unread, role-scoped), `PATCH /alerts/:id`
            (read / assign / escalate)
      - [x] Emit alerts from engines: risk pattern found, anomaly flagged,
            compliance overdue, OCR expiry soon
      - [x] Live bell dropdown in Topbar over WebSocket + in-app toasts
      - [x] Email/SMS stub (log-only transport, pluggable later)
            *(`src/lib/notify.js`: in-memory `notifyLog` (max 500) + bus event;
              alerts engine emails on new high-severity alerts, escalation
              ticker emails both levels and SMS at L2 — covered in
              `test/gaps.test.js`)*
      - [x] Wire `AttentionQueue` on Overview to the real API (demo fallback stays)
            *(`AttentionQueue` maps `/api/compliance/items` — escalated → overdue
              → due-soon, top 4 — falling back to `ATTENTION_QUEUE` when empty;
              used on Overview and Field Inspections; `attention-source` testid
              shows live register vs demo data)*
- [x] **3. Contractor Management Backend** — contractors are risk inputs only today
      - [x] `GET/POST/PATCH /api/contractors` + mine linkage
      - [x] Expiry watchdog: safety-cert / contract-end within N days → alert
      - [x] Live `Contractors.tsx` (stats, table, filters) replacing hardcoded data
      - [x] Show contractor on violation rows (root-cause attribution)
            *(Mine Intelligence "Open violations" card: section, severity chip,
              contractor name via `/api/risk/violations`; officer scope enforced 403)*
- [x] **4. Environment Monitoring Dashboard** — sensor data exists, surfacing doesn't
      - [x] `GET /api/environment/:mineId` (air, water, dust, noise series + limits)
      - [x] Threshold config per parameter; breach history with corrective status
      - [x] Env tab on Mine Details with charts + breach badges (demo fallback)
        *(delivered as a standalone `/environment` page, not a Mine Details tab;
          historical breach log now shipped: `GET /api/environment/breaches`
          (role-scoped, limit-crossing readings, latest 50) + "Breach history"
          card on the Environment page)*
- [x] **5. AI Depth: Explainability, Root-Cause, Prediction** — currently rule-based
      - [x] "Why this score?" panel: per-factor breakdown (violations +25,
            overdue +20, env +15 …) for each mine risk score
      - [x] Root-cause view: group violations by section/contractor/cause across
            mines ("Contractor ABC — same dust violation in 3 mines")
        *(backend `/api/risk/root-cause/:mineId` done; frontend surface now ships:
          Mine Intelligence gets a "Root cause" card (by-section bars, by-
          contractor chips, cross-mine pattern count) beside the violations list)*
      - [ ] Isolation Forest / z-score upgrade for production + sensor series
            (z-score ships in Feature 6; add multivariate + seasonal baseline)
      - [x] Predictive flag: items trending toward overdue / risk band crossing
            *(due-soon alerts at 7-day horizon; band-crossing prediction not built)*
      - [x] Label all outputs "AI-generated decision support" in the UI
            *("AI decision support" chips on Risk drivers, Root cause and the
              Anomaly monitor; assistant keeps its decision-support-only footer
              disclaimer — Isolation Forest upgrade above still open)*
- [x] **6. Digital Approval & Corrective-Action Workflow** — escalation assigns,
      but nothing closes through a real chain
      - [x] `corrective_actions` table: assignee, deadline, proof photo, state
            machine (open → submitted → approved/rejected)
      - [x] Approve/reject endpoints (role-gated: officer submits, corporate approves)
      - [x] Proof upload reuses `/uploads`; closure recomputes risk score
      - [x] My-Tasks view for officers + approval queue for management
        *(single `/corrective-actions` page; actions and buttons are role-scoped)*
- [x] **7. Report Suite Expansion** — only compliance CSV/PDF exists
      - [x] `GET /api/reports/inspection|environment|contractor|monthly.{csv,pdf}`
      - [x] Report builder UI: pick type, mine scope, date range → preview → download
      - [x] Excel option (xlsx via minimal writer or sheet-compatible CSV)
            *(`GET /api/reports/:type.xls` — SpreadsheetML 2003 XML with frozen
              header, `application/vnd.ms-excel`, audit-sealed; "Excel" button per
              register in Report Builder; regression-covered in `test/gaps.test.js`)*
      - [x] Every export appends to the audit trail (pattern from Feature 7)
- [x] **8. Real GIS Map** — `IndiaRiskMap` is a schematic SVG
      - [x] Leaflet + OSM tiles with real mine `lat/lng` (columns already exist)
      - [x] Risk-colored pins, click → mine drawer, pan/zoom, state filters
      - [x] Field observation pins (from `field_captures` lat/lng)
            *(amber CircleMarkers + popups on the Leaflet layer — Leaflet-only,
              the schematic SVG fallback keeps mine pins; "Field · N" legend chip)*
      - [x] Keep schematic SVG as offline/demo fallback
- [x] **9. Seed Scale-Up** — prototype density for the demo
      - [x] Grow from 12 → 50 mines across Jharkhand/Chhattisgarh/Odisha/MP/WB
      - [x] Matching compliance items, violations, production & sensor history,
            contractors per mine
      - [x] Guarantee seeded data still triggers every demo story (patterns,
            anomalies, escalations)
- [x] **10. Ops & Quality Hardening**
      - [x] Rate limiting on auth + mutation endpoints
      - [x] Frontend test suite (Vitest) for lib/ engines, key flows (login →
            export → verify chain)
            *(19 hermetic tests: risk bands, signal copy, pattern headline,
              attendance trend, SLA helpers, request layer + login→feed flow;
              `npm test` in frontend/)*
      - [x] `npm run lint` / typecheck in CI; `.env.example` + deploy script
            *(oxlint — typescript-eslint doesn't support TS 7 yet — plus
              `tsc --noEmit` in the build gate; `.github/workflows/ci.yml`,
              `backend/.env.example`, `backend/scripts/deploy.sh`)*
      - [x] Security pass: CORS origin allowlist, upload MIME/size validation
- [x] **11. Worker Attendance Module** (was skipped earlier — keeping per request)
      - [x] Daily muster per mine (in/out, headcount) captured from field app
            *(POST /api/attendance is idempotent per mine+date and is what the
              field app posts to; capture form also ships on the mine profile)*
      - [x] Attendance on mine profile as a static-live badge + trend
            *(headcount badge + 14-day bar trend + inline muster form on Mine
              Intelligence; 14-day seed history for M-001…M-005)*
- [x] **12. Grievance Handling Module**
      - [x] Grievance table (worker → mine, category, status) + submit endpoint
            *(72h SLA stamped on create; open → in_review → resolved state
              machine, role-scoped reads, audit-sealed mutations)*
      - [x] Officer dashboard list, SLA timer reusing the escalation engine
            *(`/grievances` page with SLA countdown/breach flags; due-soon and
              breached SLAs raise alerts through the shared generateAlerts pipeline)*
- [x] **13. Multilingual AI Compliance Assistant**
      - [x] Chat endpoint: NL question → grounded, cited answer
            *(`POST /api/assistant/chat` streams SSE from Gemma 3 served by a
              local Ollama instance (`gemma3:4b`, OpenAI-compatible); every turn
              injects a live SQLite snapshot into a strict system prompt —
              data-only, source tags like (risk_scores), read-only; deterministic
              local responder answers when the model is unreachable or disabled)*
      - [x] English + Hindi response toggle; strictly read-only queries
            *(`/assistant` page with EN/हिं toggle, suggestion chips, streaming
              deltas, source badge — Gemma3 live vs local fallback; backend
              test suite covers auth, validation, Hindi, stubbed upstream and
              the fallback path)*
      - [x] Disclaimer: decision-support only, not legal advice
            *(exact statutory-authority line required by the system prompt and
              rendered in the chat footer on every answer)*

## Rules

1. Never break the existing frontend contract (`/api/auth/*`, `/api/mines`, cookie name).
2. Each feature lands with its endpoints + a `node --test` suite in `backend/test/`.
3. Mock parity in `mock-api.ts` for every new `/api/*` endpoint.
4. Tick the checkbox only after the smoke test passes.
5. No blockchain — SHA-256 hash chain in `TODOLIST.md` Feature 7 covers tamper evidence.
