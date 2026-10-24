import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, "..");
export const DATA_DIR = path.join(ROOT, "data");
export const UPLOADS_DIR = process.env.COALSMART_UPLOADS
  ? path.resolve(process.env.COALSMART_UPLOADS)
  : path.join(ROOT, "uploads", "field");

// Allow tests (and prod) to point at a scratch database without touching the dev one.
const DB_PATH = process.env.COALSMART_DB ?? path.join(DATA_DIR, "coalsmart.db");

mkdirSync(path.dirname(DB_PATH), { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email         TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    email      TEXT NOT NULL REFERENCES users(email),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mines (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    state           TEXT NOT NULL,
    risk            INTEGER NOT NULL,
    compliance      INTEGER NOT NULL,
    lat             REAL NOT NULL,
    lng             REAL NOT NULL,
    open_issues     INTEGER NOT NULL,
    last_inspection TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS field_captures (
    id                  TEXT PRIMARY KEY,
    client_id           TEXT NOT NULL UNIQUE,
    mine_id             TEXT,
    kind                TEXT NOT NULL,
    note                TEXT NOT NULL DEFAULT '',
    lat                 REAL,
    lng                 REAL,
    accuracy_m          REAL,
    captured_at         TEXT NOT NULL,
    server_received_at  TEXT NOT NULL,
    device_id           TEXT,
    photo_path          TEXT,
    client_seal         TEXT,
    seal_hash           TEXT NOT NULL,
    drift_seconds       INTEGER,
    status              TEXT NOT NULL DEFAULT 'synced'
  );

  CREATE INDEX IF NOT EXISTS idx_field_captures_mine ON field_captures(mine_id);
  CREATE INDEX IF NOT EXISTS idx_field_captures_received ON field_captures(server_received_at);

  -- Feature 6: corrective actions — officer submits a fix with photo proof;
  -- corporate approves/rejects; every state change is hash-chained in audit_logs.
  CREATE TABLE IF NOT EXISTS corrective_actions (
    id              TEXT PRIMARY KEY,
    item_id         TEXT NOT NULL REFERENCES compliance_items(id),
    mine_id         TEXT NOT NULL REFERENCES mines(id),
    assignee        TEXT NOT NULL,
    deadline        TEXT NOT NULL,
    proof_photo_url TEXT,
    state           TEXT NOT NULL DEFAULT 'open',
    created_at      TEXT NOT NULL,
    resolved_at     TEXT,
    resolved_by     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_corrective_actions_item ON corrective_actions(item_id, state);
  CREATE INDEX IF NOT EXISTS idx_corrective_actions_mine ON corrective_actions(mine_id, state);
`);

// Feature 2: AI risk & cross-mine pattern engine
db.exec(`
  CREATE TABLE IF NOT EXISTS contractors (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS violations (
    id            TEXT PRIMARY KEY,
    mine_id       TEXT NOT NULL REFERENCES mines(id),
    contractor_id TEXT REFERENCES contractors(id),
    section       TEXT NOT NULL,
    title         TEXT NOT NULL,
    severity      INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'open',
    opened_at     TEXT NOT NULL,
    closed_at     TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_violations_mine ON violations(mine_id, status);
  CREATE INDEX IF NOT EXISTS idx_violations_section ON violations(section, status);

  CREATE TABLE IF NOT EXISTS risk_scores (
    mine_id      TEXT PRIMARY KEY REFERENCES mines(id),
    score        INTEGER NOT NULL,
    band         TEXT NOT NULL,
    explanation  TEXT NOT NULL,
    delta        INTEGER NOT NULL DEFAULT 0,
    computed_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS risk_score_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mine_id     TEXT NOT NULL REFERENCES mines(id),
    score       INTEGER NOT NULL,
    delta       INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    computed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS risk_patterns (
    id              TEXT PRIMARY KEY,
    section         TEXT NOT NULL,
    mine_ids        TEXT NOT NULL,
    contractor_ids  TEXT NOT NULL,
    violation_count INTEGER NOT NULL,
    first_seen      TEXT NOT NULL,
    last_seen       TEXT NOT NULL
  );

  -- Feature 3: statutory compliance register & auto-escalation
  CREATE TABLE IF NOT EXISTS compliance_items (
    id               TEXT PRIMARY KEY,
    mine_id          TEXT REFERENCES mines(id),
    title            TEXT NOT NULL,
    category         TEXT NOT NULL,
    owner_role       TEXT NOT NULL,
    due_date         TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    escalation_level INTEGER NOT NULL DEFAULT 0,
    escalated_to     TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_items(status, due_date);

  CREATE TABLE IF NOT EXISTS compliance_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id     TEXT NOT NULL REFERENCES compliance_items(id),
    from_status TEXT,
    to_status   TEXT,
    escalation_level INTEGER NOT NULL DEFAULT 0,
    escalated_to TEXT,
    note        TEXT,
    at          TEXT NOT NULL
  );

  -- Feature 4: role-scoped dashboards (mine officers see their mine only)
  -- users.mine_id is added via ALTER TABLE below for existing databases.

  -- Feature 5: OCR document auto-fill archive
  CREATE TABLE IF NOT EXISTS documents (
    id             TEXT PRIMARY KEY,
    filename       TEXT NOT NULL,
    mime           TEXT NOT NULL,
    extracted_text TEXT NOT NULL,
    prefill        TEXT NOT NULL,
    created_by     TEXT,
    created_at     TEXT NOT NULL
  );

  -- Feature 6: production & environmental telemetry for the anomaly engine
  CREATE TABLE IF NOT EXISTS production_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mine_id    TEXT NOT NULL REFERENCES mines(id),
    date       TEXT NOT NULL,
    coal_tons  REAL NOT NULL,
    UNIQUE (mine_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_production_mine_date ON production_logs(mine_id, date);

  CREATE TABLE IF NOT EXISTS sensor_readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mine_id      TEXT NOT NULL REFERENCES mines(id),
    metric       TEXT NOT NULL,
    value        REAL NOT NULL,
    unit         TEXT NOT NULL,
    limit_value  REAL NOT NULL,
    recorded_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sensor_mine ON sensor_readings(mine_id, metric, recorded_at);

  -- Feature 7: tamper-proof audit trail — append-only, each row hash-chained
  -- to the previous one (SHA-256 over prev_hash + canonical row fields).
  CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          TEXT NOT NULL,
    actor       TEXT NOT NULL,
    actor_role  TEXT,
    action      TEXT NOT NULL,
    entity      TEXT,
    entity_id   TEXT,
    method      TEXT,
    path        TEXT,
    status      INTEGER,
    detail      TEXT NOT NULL DEFAULT '{}',
    prev_hash   TEXT NOT NULL,
    hash        TEXT NOT NULL UNIQUE
  );

  CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at);

  CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only');
  END;

  -- Feature 2: alert & notification center — deduplicated by key, open/resolved lifecycle.
  CREATE TABLE IF NOT EXISTS alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT NOT NULL UNIQUE,
    mine_id     TEXT REFERENCES mines(id),
    category    TEXT NOT NULL,
    severity    TEXT NOT NULL,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open',
    read_at     TEXT,
    assigned_to TEXT,
    created_at  TEXT NOT NULL,
    resolved_at TEXT,
    data        TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_mine ON alerts(mine_id, status);
  CREATE INDEX IF NOT EXISTS idx_alerts_key ON alerts(key);

  -- Feature 4: canonical metric threshold configuration for environment monitoring.
  CREATE TABLE IF NOT EXISTS metric_limits (
    metric      TEXT PRIMARY KEY,
    limit_value REAL NOT NULL,
    unit        TEXT NOT NULL,
    direction   TEXT NOT NULL DEFAULT 'max'
  );

  -- Feature 11: daily worker attendance muster per mine (in/out, headcount).
  CREATE TABLE IF NOT EXISTS attendance (
    id          TEXT PRIMARY KEY,
    mine_id     TEXT NOT NULL REFERENCES mines(id),
    work_date   TEXT NOT NULL,
    workers_in  INTEGER NOT NULL DEFAULT 0,
    workers_out INTEGER NOT NULL DEFAULT 0,
    headcount   INTEGER NOT NULL DEFAULT 0,
    recorded_by TEXT,
    created_at  TEXT NOT NULL,
    UNIQUE (mine_id, work_date)
  );
  CREATE INDEX IF NOT EXISTS idx_attendance_mine_date ON attendance(mine_id, work_date);

  -- Feature 12: worker grievances with a 72h SLA (breaches surface as alerts).
  CREATE TABLE IF NOT EXISTS grievances (
    id           TEXT PRIMARY KEY,
    mine_id      TEXT NOT NULL REFERENCES mines(id),
    worker_name  TEXT,
    category     TEXT NOT NULL,
    description  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'open',
    sla_due_at   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    resolved_at  TEXT,
    resolved_by  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_grievances_mine_status ON grievances(mine_id, status);
  CREATE INDEX IF NOT EXISTS idx_grievances_sla ON grievances(status, sla_due_at);
`);

// Feature 4 — mine scope on the user (NULL = sees the whole portfolio).
try {
  db.exec("ALTER TABLE users ADD COLUMN mine_id TEXT");
} catch {
  /* column already exists on subsequent boots */
}

// Feature 3 — contractor registry fields (mine linkage, contact, cert expiry).
try {
  db.exec(`
    ALTER TABLE contractors ADD COLUMN mine_id TEXT REFERENCES mines(id);
    ALTER TABLE contractors ADD COLUMN contact_name TEXT;
    ALTER TABLE contractors ADD COLUMN contact_phone TEXT;
    ALTER TABLE contractors ADD COLUMN safety_cert_expiry TEXT;
    ALTER TABLE contractors ADD COLUMN compliance TEXT DEFAULT 'compliant';
    ALTER TABLE contractors ADD COLUMN notes TEXT;
  `);
} catch {
  /* columns already exist on subsequent boots */
}

// Same seed set the Vite mock serves, so /api/mines is byte-compatible either way.
// Feature 9: scale from 12 → 50 mines across the Indian coal belt.
const STATES = [
  "Jharkhand", "Chhattisgarh", "Odisha", "West Bengal", "Madhya Pradesh",
  "Telangana", "Maharashtra", "Uttar Pradesh", "Meghalaya", "Tamil Nadu",
  "Rajasthan", "Assam",
];
const SEED_MINES = (() => {
  const mines = [];
  const names = [
    "Singrauli North", "Talcher East", "Korba Deep", "Jharia West", "Raniganj South",
    "Godavari Kothagudem", "Wardha Valley", "Mand-Raigarh", "Singrauli South", "Cherrapunji LUM",
    "Neyveli Lignite", "Barmer Opencast", "Ananta", "Bharatpur", "Lakhanpur", "Hingula",
    "Basundhara", "Garjanbahal", "Kulda", "Gare Palma", "Dipka", "Gevra", "Kusmunda",
    "Bhatda", "Sasai", "Dumri", "Parsa", "Kente", "Pachwara North", "Pachwara Central",
    "Amrapali", "Magadh", "Churi", "Ashoka", "Karharbari", "Gidi", "Karo", "Borkar",
    "Tapin North", "Tapin South", "Khadia", "Kharia", "Mora", "Bina", "Nigahi",
    "Jayanti", "Block B", "Block C", "Block D", "Block E", "Block F",
  ];
  const STATES_LIST = [
    "Jharkhand", "Chhattisgarh", "Odisha", "West Bengal", "Madhya Pradesh",
    "Telangana", "Maharashtra", "Uttar Pradesh", "Meghalaya", "Tamil Nadu",
    "Rajasthan", "Assam",
  ];
  // Deterministic pseudo-random coordinates across the Indian coal belt.
  function pseudo(seed, i) {
    return ((seed * 16807 + i * 31) % 10000) / 10000;
  }
  for (let i = 0; i < 50; i++) {
    const id = `M-${String(i + 1).padStart(3, "0")}`;
    const lat = 11.6 + pseudo(242, i) * 24.0;   // 11.6 → 35.6
    const lng = 71.4 + pseudo(826, i) * 22.0;   // 71.4 → 93.4
    const risk = Math.round(20 + Math.sin(i) * 30 + (i % 7) * 5);
    const compliance = Math.round(60 + Math.cos(i) * 25 + (i % 5) * 5);
    mines.push([
      id,
      names[i],
      STATES_LIST[i % STATES_LIST.length],
      Math.max(10, Math.min(100, risk)),
      Math.max(40, Math.min(100, compliance)),
      Math.round(lat * 100) / 100,
      Math.round(lng * 100) / 100,
      i % 10,
      `2025-10-${String((i % 28) + 1).padStart(2, "0")}`,
    ]);
  }
  return mines;
})();

const insertMine = db.prepare(`
  INSERT OR IGNORE INTO mines
    (id, name, state, risk, compliance, lat, lng, open_issues, last_inspection)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const m of SEED_MINES) insertMine.run(...m);

// Demo account kept identical to the mock's credentials so both modes share one login.
// Feature 4 adds a scoped Mine Officer and a portfolio-wide Regulator for role testing.
import { hashPassword, DEV_SALT } from "./lib/password.js";

const DEMO_PASSWORD = "CoalSmart2025!";
const demoHash = hashPassword(DEMO_PASSWORD, DEV_SALT);
const upsertUser = db.prepare(`
  INSERT INTO users (email, name, role, password_hash, salt, mine_id)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET
    name = excluded.name,
    role = excluded.role,
    password_hash = excluded.password_hash,
    salt = excluded.salt,
    mine_id = excluded.mine_id
`);
upsertUser.run("director@coalsmart.gov", "Aarav Sharma", "Corporate Management", demoHash, DEV_SALT, null);
upsertUser.run("officer@coalsmart.gov", "Meera Nair", "Mine Officer", demoHash, DEV_SALT, "M-001");
upsertUser.run("regulator@coalsmart.gov", "R. Iyer", "Regulator", demoHash, DEV_SALT, null);

// ---------------------------------------------------------------------------
// Feature 2 seeds — contractors + open violations shaped so the pattern engine
// finds the same "Section 4 across 3 mines and 2 contractors" story the demo UI tells.
const SEED_CONTRACTORS = [
  ["C-01", "ABC Mining Services"],
  ["C-02", "Eastern Haulage Co."],
  ["C-03", "Shakti Industrial Works"],
  ["C-04", "RKS Earth Movers"],
];
const insertContractor = db.prepare("INSERT OR IGNORE INTO contractors (id, name) VALUES (?, ?)");
for (const c of SEED_CONTRACTORS) insertContractor.run(...c);

// Contractor detail seeding (Feature 3): link to mines, set cert expiry so the
// expiry watchdog has real signal on first boot (C-01 expires soon, C-03 already lapsed).
const nowForCert = new Date();
function certExpiry(days) {
  const d = new Date(nowForCert);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const updateContractor = db.prepare(`
  UPDATE contractors
  SET mine_id = ?, contact_name = ?, contact_phone = ?, safety_cert_expiry = ?, compliance = ?, notes = ?
  WHERE id = ?
`);
updateContractor.run("M-001", "R. Patel", "+91 98765 00001", certExpiry(5), "watch", "Safety cert due for renewal", "C-01");
updateContractor.run("M-002", "S. Reddy", "+91 98765 00002", certExpiry(40), "compliant", "", "C-02");
updateContractor.run("M-003", "T. Das", "+91 98765 00003", certExpiry(-3), "breach", "Safety certificate lapsed", "C-03");
updateContractor.run("M-004", "V. Singh", "+91 98765 00004", certExpiry(60), "compliant", "", "C-04");

// Feature 4 — canonical metric thresholds (used by /api/environment and breach detection).
const insertLimit = db.prepare(`
  INSERT OR IGNORE INTO metric_limits (metric, limit_value, unit, direction) VALUES (?, ?, ?, 'max')
`);
insertLimit.run("pm10", 100, "µg/m³");
insertLimit.run("noise", 95, "dB");
insertLimit.run("water_ph", 8.5, "pH");

function daysAgoIso(days, hour = 10) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

const SEED_VIOLATIONS = [
  // [id, mine_id, contractor_id, section, title, severity, status, opened_at]
  ["V-1001", "M-001", "C-01", "Section 4", "Bench stability breach on south face", 3, "open", daysAgoIso(12)],
  ["V-1002", "M-002", "C-01", "Section 4", "Edge marking missing along haul road", 2, "open", daysAgoIso(9)],
  ["V-1003", "M-003", "C-02", "Section 4", "Dust suppression not operating", 2, "open", daysAgoIso(7)],
  ["V-1004", "M-001", "C-02", "Section 22", "Fire extinguisher service overdue", 2, "open", daysAgoIso(5)],
  ["V-1005", "M-004", "C-03", "Section 18", "Warning signage faded at dump edge", 1, "open", daysAgoIso(4)],
  ["V-1006", "M-001", "C-01", "Section 4", "Unsafe steep batter above ramp", 2, "open", daysAgoIso(3)],
  ["V-1007", "M-002", "C-04", "Section 37", "Gas detector calibration lapsed", 3, "open", daysAgoIso(2)],
  ["V-1008", "M-005", "C-03", "Section 18", "Walkway obstruction near tipper bay", 1, "open", daysAgoIso(1)],
  ["V-0901", "M-001", "C-01", "Section 4", "Bench breach (closed after fix)", 3, "resolved", daysAgoIso(40)],
  ["V-0902", "M-003", "C-02", "Section 22", "Expired hose reel (closed)", 2, "resolved", daysAgoIso(25)],
];
const insertViolation = db.prepare(`
  INSERT OR IGNORE INTO violations
    (id, mine_id, contractor_id, section, title, severity, status, opened_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const v of SEED_VIOLATIONS) insertViolation.run(...v);

// ---------------------------------------------------------------------------
// Feature 3 seeds — statutory register with due dates relative to "today" so the
// escalation timer has real overdue and due-soon work from the first boot.
function dueIn(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const nowIso = new Date().toISOString();
const SEED_COMPLIANCE = [
  // [id, mine_id, title, category, owner_role, due_date]
  ["K-01", "M-002", "Environmental report", "environment", "Compliance", dueIn(2)],
  ["K-02", "M-001", "Safety inspection", "safety", "Mine Officer", dueIn(10)],
  ["K-03", "M-003", "Labour compliance", "labour", "Mine Officer", dueIn(6)],
  ["K-04", "M-001", "DGMS safety return", "safety", "Mine Officer", dueIn(-6)],
  ["K-05", "M-004", "Equipment certification", "equipment", "Mine Officer", dueIn(7)],
  ["K-06", "M-003", "Environmental report", "environment", "Compliance", dueIn(12)],
  ["K-07", "M-002", "Labour compliance", "labour", "Mine Officer", dueIn(-12)],
  ["K-08", "M-005", "DGMS safety return", "safety", "Mine Officer", dueIn(4)],
  ["K-09", "M-001", "Equipment certification", "equipment", "Mine Officer", dueIn(-2)],
  ["K-10", "M-004", "Environmental report", "environment", "Compliance", dueIn(9)],
  ["K-11", "M-002", "Safety inspection", "safety", "Mine Officer", dueIn(-15)],
  ["K-12", "M-005", "Labour compliance", "labour", "Mine Officer", dueIn(3)],
  ["K-13", "M-003", "DGMS safety return", "safety", "Mine Officer", dueIn(5)],
  ["K-14", "M-001", "Environmental report", "environment", "Compliance", dueIn(14)],
  ["K-15", "M-004", "Equipment certification", "equipment", "Mine Officer", dueIn(-9)],
  ["K-16", "M-002", "DGMS safety return", "safety", "Mine Officer", dueIn(8)],
];
const insertCompliance = db.prepare(`
  INSERT OR IGNORE INTO compliance_items
    (id, mine_id, title, category, owner_role, due_date, status, escalation_level, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
`);
for (const k of SEED_COMPLIANCE) insertCompliance.run(...k, nowIso, nowIso);

// ---------------------------------------------------------------------------
// Feature 6 seeds — 30 days of production per mine (deterministic noise) with
// one injected spike at Singrauli North and one dip at Jharia West, plus a few
// sensor breaches so the anomaly engine has real signal on first boot.
function lcg(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const PRODUCTION_BASELINE = {
  "M-001": 4200, "M-002": 3100, "M-003": 3600, "M-004": 2800,
  "M-005": 2400, "M-006": 1900, "M-007": 1600, "M-008": 2100,
  "M-009": 2700, "M-010": 900, "M-011": 3300, "M-012": 2000,
};

function dateDaysAgoIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const insertProduction = db.prepare(`
  INSERT OR IGNORE INTO production_logs (mine_id, date, coal_tons) VALUES (?, ?, ?)
`);
const mineIdsForSeed = Object.keys(PRODUCTION_BASELINE);
mineIdsForSeed.forEach((mineId, idx) => {
  const rand = lcg(1000 + idx * 17);
  const baseline = PRODUCTION_BASELINE[mineId];
  for (let day = 29; day >= 0; day--) {
    let tons = baseline * (0.92 + rand() * 0.16); // ±8% natural noise
    if (mineId === "M-001" && day === 2) tons = baseline * 1.18; // the demo spike
    if (mineId === "M-004" && day === 5) tons = baseline * 0.74; // sudden drop
    insertProduction.run(mineId, dateDaysAgoIso(day), Math.round(tons));
  }
});

const insertSensor = db.prepare(`
  INSERT OR IGNORE INTO sensor_readings (mine_id, metric, value, unit, limit_value, recorded_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const nowSensor = new Date().toISOString();
// PM10 dust breach at Singrauli North (matches the field story), pH breach at Talcher East.
insertSensor.run("M-001", "pm10", 168, "µg/m³", 100, nowSensor);
insertSensor.run("M-001", "noise", 88, "dB", 95, nowSensor);
insertSensor.run("M-002", "water_ph", 9.4, "pH", 8.5, nowSensor);
insertSensor.run("M-002", "pm10", 76, "µg/m³", 100, nowSensor);
insertSensor.run("M-003", "pm10", 82, "µg/m³", 100, nowSensor);
insertSensor.run("M-004", "noise", 91, "dB", 95, nowSensor);

// ---------------------------------------------------------------------------
// Feature 11 seeds — 14 days of daily muster for the first five mines so the
// attendance badge and trend have history from the first boot.
const insertAttendance = db.prepare(`
  INSERT OR IGNORE INTO attendance
    (id, mine_id, work_date, workers_in, workers_out, headcount, recorded_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const ATTENDANCE_BASE = { "M-001": 186, "M-002": 142, "M-003": 164, "M-004": 118, "M-005": 96 };
const mineIdsAttendance = Object.keys(ATTENDANCE_BASE);
mineIdsAttendance.forEach((mineId, idx) => {
  const rand = lcg(2000 + idx * 31);
  const baseline = ATTENDANCE_BASE[mineId];
  for (let day = 13; day >= 0; day--) {
    const workDate = dateDaysAgoIso(day);
    const headcount = Math.round(baseline * (0.93 + rand() * 0.12));
    const workersIn = headcount + Math.round(rand() * 6);
    const workersOut = headcount - Math.round(rand() * 4);
    insertAttendance.run(
      `AT-${mineId.slice(2)}-${workDate.replace(/-/g, "")}`,
      mineId,
      workDate,
      workersIn,
      workersOut,
      headcount,
      "seed",
      daysAgoIso(day, 9),
    );
  }
});

// ---------------------------------------------------------------------------
// Feature 12 seeds — grievances with varied SLA states (open fresh, open past
// the 72h SLA so the breach alert fires, in-review, resolved).
const nowGriev = new Date();
function slaDueIn(hours) {
  return new Date(nowGriev.getTime() + hours * 3600 * 1000).toISOString();
}
function hoursAgoIso(hours) {
  return new Date(nowGriev.getTime() - hours * 3600 * 1000).toISOString();
}
const insertGrievance = db.prepare(`
  INSERT OR IGNORE INTO grievances
    (id, mine_id, worker_name, category, description, status, sla_due_at, created_at, updated_at, resolved_at, resolved_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
insertGrievance.run(
  "GR-0001", "M-001", "Ramesh Kumar", "safety",
  "Bench edge marking missing near the south ramp — tipper traffic passes within 2m of the drop.",
  "open", slaDueIn(40), hoursAgoIso(32), hoursAgoIso(32), null, null,
);
insertGrievance.run(
  "GR-0002", "M-001", "Anonymous", "wages",
  "Contractor wage slip for last fortnight shows unexplained deductions.",
  "open", slaDueIn(-10), hoursAgoIso(82), hoursAgoIso(82), null, null,
);
insertGrievance.run(
  "GR-0003", "M-002", "Sunita Devi", "facilities",
  "Drinking water point at the dump yard has been dry for three days.",
  "in_review", slaDueIn(12), hoursAgoIso(60), hoursAgoIso(20), null, null,
);
insertGrievance.run(
  "GR-0004", "M-003", "Anonymous", "environment",
  "Dust from haul road crossing affecting nearby settlement during night shift.",
  "resolved", slaDueIn(-30), hoursAgoIso(100), hoursAgoIso(10), hoursAgoIso(11), "officer@coalsmart.gov",
);

export function todayIso(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
