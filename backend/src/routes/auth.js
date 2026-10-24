import { Router } from "express";
import { db, todayIso } from "../db.js";
import { hashPassword, newToken, safeEqual } from "../lib/password.js";

const router = Router();

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

// Server-anchored clock for the topbar — same shape the mock returns.
export function serverInfo(now = new Date()) {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const iso = todayIso(now);
  const label = `${DAYS[ist.getDay()]}, ${ist.getDate()} ${MONTHS[ist.getMonth()]} ${ist.getFullYear()}`;
  const short = `${ist.getDate()} ${MONTHS[ist.getMonth()].slice(0, 3)} ${ist.getFullYear()}`;
  const time = `${String(ist.getHours()).padStart(2, "0")}:${String(ist.getMinutes()).padStart(2, "0")} IST`;
  const h = ist.getHours();
  const part_of_day = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return { today_iso: iso, today_label: label, today_short: short, time_label: `${short} · ${time}`, part_of_day };
}

export function cookieOptions() {
  return { path: "/", httpOnly: true, sameSite: "lax" };
}

export function getSessionUser(req) {
  const cookie = req.headers.cookie ?? "";
  const match = cookie.match(/(?:^|;\s*)cs_session=([^;]+)/);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const row = db.prepare(`
    SELECT u.email, u.name, u.role, u.mine_id
    FROM sessions s JOIN users u ON u.email = s.email
    WHERE s.token = ?
  `).get(token);
  return row ? { user: row, token } : null;
}

export function requireAuth(req, res, next) {
  const session = getSessionUser(req);
  if (!session) return res.status(401).json({ detail: "not signed in" });
  req.session = session;
  next();
}

router.post("/login", (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ detail: "email and password are required" });
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!user || !safeEqual(hashPassword(password, user.salt), user.password_hash)) {
    return res.status(401).json({ detail: "invalid credentials" });
  }
  const token = newToken();
  db.prepare("INSERT INTO sessions (token, email, created_at) VALUES (?, ?, ?)")
    .run(token, user.email, new Date().toISOString());
  res.setHeader("Set-Cookie", `cs_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({
    token,
    user: { email: user.email, name: user.name, role: user.role },
  });
});

router.get("/me", requireAuth, (req, res) => {
  const { email, name, role, mine_id } = req.session.user;
  res.json({ user: { email, name, role, mine_id }, server: serverInfo() });
});

router.post("/logout", (req, res) => {
  const session = getSessionUser(req);
  if (session) db.prepare("DELETE FROM sessions WHERE token = ?").run(session.token);
  res.setHeader("Set-Cookie", "cs_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");
  res.status(204).end();
});

export default router;
