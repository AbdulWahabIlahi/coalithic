import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../db.js";

// Tiny .env loader (no dependency): reads backend/.env if present and fills in
// any process.env keys that are not already set. Values already exported in the
// shell always win, so CI and tests stay deterministic.
let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* no .env file — environment variables alone are fine */
  }
}
