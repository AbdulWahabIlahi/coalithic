# CoalSmart — National Mine Safety Control Room

![CI](https://github.com/AbdulWahabIlahi/coalithic/actions/workflows/ci.yml/badge.svg)
![version](https://img.shields.io/badge/version-0.9.4-teal)
![node](https://img.shields.io/badge/node-%E2%89%A522.5-brightgreen)

A full-stack governance prototype for coal-mine safety oversight: offline field
capture, a live risk engine, statutory compliance escalation, anomaly detection,
a tamper-evident audit trail, and a multilingual AI compliance assistant — in one
control-room interface.

Built for a national regulator / corporate safety director scenario across a
portfolio of mines.

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Configuration](#configuration)
- [Optional integrations](#optional-integrations)
- [API surface](#api-surface)
- [Project structure](#project-structure)
- [Testing \& CI](#testing--ci)
- [Offline / PWA behaviour](#offline--pwa-behaviour)
- [Security notes](#security-notes)
- [Docs](#docs)

---

## What it does

| # | Capability | How it works |
|---|------------|--------------|
| 1 | **Offline geo-tagged field capture** | Field officers log violations/inspections with photo, GPS and timestamp while offline. Records queue in `localStorage`, seal with a SHA-256 checksum, and batch-sync idempotently on reconnect. |
| 2 | **AI risk & cross-mine pattern engine** | Live 0–100 score per mine with a per-factor explanation ("why this score?"), plus repeat-violation grouping across mines and contractors. |
| 3 | **Statutory compliance register** | DGMS/labour deadlines with an auto-escalation timer: Pending → Overdue → Level 1 (Corporate) → Level 2 (Regulator), pushed over WebSocket. |
| 4 | **Role-based dashboards & GIS map** | Corporate sees the whole portfolio; a Mine Officer sees only their mine. Leaflet India map with Green/Yellow/Red risk pins and live KPI strips. |
| 5 | **One-click OCR document auto-fill** | PDF/image upload → `tesseract`/`pdftotext` → regex extraction of dates, contractor and mine id → pre-filled form JSON. |
| 6 | **Production & environmental anomalies** | Rolling z-score over 30-day production series plus sensor limit breaches (PM10, water pH, noise) → flagged charts and banner alerts. |
| 7 | **Tamper-evident audit trail & reports** | Append-only `audit_logs` with SHA-256 hash chaining (UPDATE/DELETE rejected by SQL triggers), chain verification endpoint, one-click CSV/PDF statutory export. |
| 8 | **Alert & notification centre** | Alerts emitted by every engine, live bell dropdown over WebSocket, in-app toasts, and a pluggable email/SMS transport (log-only stub today). |
| 9 | **Contractors & corrective actions** | Contract/cert expiry watchdog, contractor-attributed violations, and a digital approval workflow for corrective actions. |
| 10 | **Attendance & grievances** | Daily muster with headcount trend per mine; grievance intake with a 72-hour SLA that reuses the escalation engine. |
| 11 | **Multilingual AI assistant** | SSE-streaming chat grounded on a live SQLite snapshot, English + हिंदी toggle, source citations, and a deterministic fallback when the model is unreachable. |
| 12 | **PWA with a real offline shell** | Service worker caches the app shell and API GETs; background sync flushes the field queue when connectivity returns. |

> Detailed feature checklists live in [`backend/TODOLIST.md`](backend/TODOLIST.md)
> (v1) and [`backend/TODOLISTV2.md`](backend/TODOLISTV2.md) (gap backlog).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  frontend/  — React 19 + Vite + Tailwind 4 (PWA)                         │
│  Pages: Overview · Mines · Inspections · Compliance · Contractors ·      │
│  Corrective Actions · Environment · Grievances · Assistant · Reports     │
│  mock-api.ts serves a full demo API unless VITE_NO_MOCK=1                │
└───────────────┬──────────────────────────────────────────────────────────┘
                │  /api/*  +  /api/ws (proxied by Vite)
                │  httpOnly session cookie `cs_session`
┌───────────────▼──────────────────────────────────────────────────────────┐
│  backend/  — Express 5 (Node ≥22.5) on :8001                             │
│                                                                          │
│  routes/    auth · mines · field · risk · compliance · dashboards ·      │
│             documents · anomalies · audit · reports · alerts ·           │
│             contractors · environment · corrective_actions ·             │
│             attendance · grievances · assistant                          │
│                                                                          │
│  engine/    risk.js · anomalies.js · alerts.js · escalation.js ·        │
│             assistant_context.js                                         │
│                                                                          │
│  lib/       audit.js (hash chain) · pdf.js · ocr.js · notify.js ·       │
│             bus.js · password.js · env.js                                │
│                                                                          │
│  SQLite via node:sqlite (zero native deps) → data/coalsmart.db          │
│  Photos → uploads/field/  ·  WebSocket → /api/ws                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Data never leaves the process: SQLite file in `backend/data/`, uploads under
`backend/uploads/field/`. No external services are required to run the app.

---

## Tech stack

**Frontend** — React 19, TypeScript, Vite 8, Tailwind CSS 4, TanStack Query,
React Router 7, Recharts, Leaflet / react-leaflet, Radix UI, sonner, oxlint,
Vitest.

**Backend** — Express 5, `node:sqlite`, `ws`, `express-rate-limit`, SSE for the
assistant, dependency-free PDF writer, system `tesseract`/`pdftotext` for OCR.

**Quality** — GitHub Actions CI (lint + typecheck + tests + build for both
apps), 129 automated tests, zero runtime third-party AI dependencies.

---

## Quick start

Requires **Node.js ≥ 22.5** (for `node:sqlite`).

### 1. Demo mode (frontend only, ~30 seconds)

```bash
git clone https://github.com/AbdulWahabIlahi/coalithic.git
cd coalithic/frontend
npm install
npm run dev
```

Open http://localhost:5173 — the built-in mock API (`mock-api.ts`) serves the
whole app, so no backend is needed.

### 2. Full stack (real backend + live engines)

```bash
# terminal 1 — API on :8001
cd backend
npm install
npm run dev

# terminal 2 — frontend pointed at the real API
cd frontend
VITE_NO_MOCK=1 npm run dev
```

Vite proxies `/api`, `/api/ws` and `/uploads` to `http://localhost:8001`.

### 3. Deploy the backend

```bash
cd backend
cp .env.example .env      # edit as needed
./scripts/deploy.sh       # npm ci → npm test → npm start  (--skip-tests to bypass)
```

### Commands

| Location | Command | Purpose |
|----------|---------|---------|
| `frontend/` | `npm run dev` | Dev server with mock API |
| `frontend/` | `VITE_NO_MOCK=1 npm run dev` | Dev server against real backend |
| `frontend/` | `npm test` | Vitest suite |
| `frontend/` | `npm run lint` | oxlint |
| `frontend/` | `npm run build` | Typecheck (`tsc --noEmit`) + production build |
| `backend/` | `npm run dev` | API with `--watch` |
| `backend/` | `npm start` | API, production |
| `backend/` | `npm test` | `node --test` suite |

---

## Demo accounts

All three share the password **`CoalSmart2025!`** (pre-filled on the login page).

| Email | Role | Scope |
|-------|------|-------|
| `director@coalsmart.gov` | Corporate Management | Full portfolio |
| `officer@coalsmart.gov` | Mine Officer | Mine `M-001` only (403 elsewhere) |
| `regulator@coalsmart.gov` | Regulator | Full portfolio, read/audit focus |

---

## Configuration

Copy [`backend/.env.example`](backend/.env.example) to `backend/.env`. The app
loads it with a tiny built-in parser — values already exported in the shell win.

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `8001` | HTTP + WebSocket port |
| `COALSMART_DB` | `./data/coalsmart.db` | SQLite file |
| `COALSMART_UPLOADS` | `./uploads/field` | Field photo storage |
| `ALERTS_TICK_MS` | `30000` | Alert engine interval (`0` disables) |
| `COMPLIANCE_TICK_MS` | `60000` | Compliance escalation interval (`0` disables) |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | Ollama OpenAI-compatible endpoint; `""` disables the model |
| `LLM_MODEL` | `gemma3:4b` | Chat model |
| `LLM_API_KEY` | *(empty)* | Optional — Ollama needs none |

Frontend: `VITE_NO_MOCK=1` switches from the mock API to the real backend.

---

## Optional integrations

The core app runs with none of these; each degrades gracefully.

- **OCR** — install the system binaries to enable document auto-fill:
  `tesseract` (images) and `pdftotext` (text-layer PDFs). A missing binary
  returns a clear `503`, never a crash.
- **AI assistant** — run Gemma 3 through a local [Ollama](https://ollama.com)
  instance (`ollama pull gemma3:4b`). When the model is unreachable or
  `LLM_BASE_URL=""`, a deterministic local responder answers so the feature
  never dead-ends.
- **Notifications** — `src/lib/notify.js` logs email/SMS to an in-memory ring
  buffer and bus; swap in a real transport later.

---

## API surface

Session auth is an httpOnly cookie (`cs_session`); every route except
`POST /api/auth/login` and `GET /api/health` requires it. Reads and mutations
are role-scoped.

| Group | Endpoints |
|-------|-----------|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout` |
| Mines | `GET /api/mines` · `GET /api/mines/:mineId` |
| Field capture | `POST /api/field/captures/sync` · `GET /api/field/captures` · `GET /api/field/captures/stats` |
| Risk | `GET /api/risk/scores` · `GET /api/risk/patterns` · `GET /api/risk/root-cause/:mineId` · `POST /api/risk/recompute` |
| Compliance | `GET /api/compliance/items\|stats\|escalations` · `POST /api/compliance/items` · `PATCH /api/compliance/items/:id` |
| Dashboards | `GET /api/dashboards/overview` |
| Documents / OCR | `POST /api/documents/extract` · `GET /api/documents` |
| Anomalies | `GET /api/anomalies` · `GET /api/anomalies/production/:mineId` |
| Audit | `GET /api/audit/logs` · `GET /api/audit/verify` |
| Reports | `GET /api/reports/compliance.csv` · `GET /api/reports/compliance.pdf` |
| Alerts | `GET /api/alerts` · `PATCH /api/alerts/:id` |
| Contractors | `GET/POST/PATCH /api/contractors` |
| Environment | `GET /api/environment/:mineId` · `GET /api/environment/breaches` |
| Corrective actions | `GET/POST/PATCH /api/corrective_actions` |
| Attendance | `GET/POST /api/attendance` |
| Grievances | `GET/POST/PATCH /api/grievances` |
| Assistant | `GET /api/assistant/snapshot` · `POST /api/assistant/chat` (SSE) |
| Live | `GET /api/ws` (WebSocket upgrade — alerts, escalation push) |

Errors always return a JSON envelope (`{ "detail": "…" }`) that the frontend
`ApiError` class understands.

---

## Project structure

```
coalithic/
├── .github/workflows/ci.yml   # lint + typecheck + tests + build
├── backend/
│   ├── data/                  # SQLite database (created on boot)
│   ├── scripts/deploy.sh      # install → test → start
│   ├── src/
│   │   ├── engine/            # risk · anomalies · alerts · escalation · assistant
│   │   ├── lib/               # audit · pdf · ocr · notify · bus · env · password
│   │   ├── routes/            # one router per API group
│   │   ├── db.js              # schema bootstrap + deterministic seeds
│   │   └── index.js           # Express app + WebSocket + tickers
│   ├── test/                  # node --test suites (106 tests)
│   ├── TODOLIST.md            # v1 feature checklist
│   ├── TODOLISTV2.md          # gap backlog
│   └── .env.example
└── frontend/
    ├── mock-api.ts            # full demo API as a Vite plugin
    ├── public/                # manifest, service worker, icons
    └── src/
        ├── components/        # AppShell, Sidebar, Topbar, widgets, ui/
        ├── lib/               # typed API layer, engines, hooks, 23 tests
        └── pages/             # Login + one file per control-room page
```

---

## Testing & CI

```bash
cd backend  && npm test        # node --test — 106 tests across 10 suites
cd frontend && npm test        # vitest — 23 tests
cd frontend && npm run lint    # oxlint
```

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to
`main` and every pull request:

- **backend** — `npm ci` → `npm test`
- **frontend** — `npm ci` → `npm run lint` → `npm test` → `npm run build`
  (the build gate runs `tsc --noEmit`, so type errors fail CI)

Backend tests are hermetic: each suite runs against a throwaway SQLite file
created with `mkdtemp`, so they never touch `data/coalsmart.db`.

---

## Offline / PWA behaviour

- `public/sw.js` — network-first for navigations and API GETs, cache-first for
  hashed `/assets` and `/uploads` photos.
- `public/manifest.webmanifest` + 192/512 icons — installable on mobile.
- The field queue flushes immediately when `navigator.onLine` returns, plus a
  fixed 45-second retry loop while records remain queued; the topbar badge shows
  connection state and queue depth.
- Photos are downscaled client-side to ≤900px JPEG before they touch
  `localStorage`; GPS is acquired on save with a 4-second timeout.
- Caches are cleared on logout.

---

## Security notes

- httpOnly, SameSite session cookie — no tokens in JS-readable storage.
- Rate limiting: 30 login attempts / 15 min, 120 mutations / min.
- CORS origin allowlist, upload MIME and size validation, 25 MB JSON body cap
  for base64 photos.
- SHA-256 hash chain over every successful mutation; SQL triggers reject
  `UPDATE`/`DELETE` on `audit_logs`.
- Passwords hashed with SHA-256 + a fixed dev salt and compared with
  `timingSafeEqual` — fine for a demo, **swap for bcrypt/argon2 before any real
  deployment**.
- The AI assistant is strictly read-only: it receives a data snapshot, is told
  never to write, and every answer carries a "decision-support only, not legal
  advice" disclaimer.

---

## Docs

- [`backend/TODOLIST.md`](backend/TODOLIST.md) — v1 feature checklist and the
  contract rules the codebase follows.
- [`backend/TODOLISTV2.md`](backend/TODOLISTV2.md) — gap backlog and how each
  item was delivered.
- [`backend/.env.example`](backend/.env.example) — every configuration knob.

---

**Note:** this is a governance prototype with seeded demo data. Blockchain was
deliberately dropped in favour of the plain SHA-256 append-only audit trail.
