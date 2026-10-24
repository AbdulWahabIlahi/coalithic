// Hand-written mirrors of the backend's Pydantic models (backend/models/*) — nothing
// infers across the Python boundary, so keep these in sync in the same edit.

export interface Mine {
  id: string; // "M-001"
  name: string;
  state: string;
  risk: number; // 0-100
  compliance: number; // 0-100
  lat: number;
  lng: number;
  open_issues: number;
  last_inspection: string; // "YYYY-MM-DD"
}

export interface MinesResponse {
  items: Mine[];
  today: string; // server-anchored "YYYY-MM-DD"
}

export interface User {
  email: string;
  name: string;
  role: string;
}

export interface ServerInfo {
  today_iso: string;
  today_label: string; // "TUESDAY, 22 OCTOBER 2025"
  today_short: string; // "22 Oct 2025"
  time_label: string; // "22 Oct 2025 · 14:32 IST"
  part_of_day: string; // morning | afternoon | evening
}

export interface LoginResponse {
  token: string; // contract parity with the original — sessions ride the httpOnly cookie
  user: User;
}

export interface MeResponse {
  user: User;
  server: ServerInfo;
}

export type RiskBand = "low" | "watch" | "high";

export function riskBand(risk: number): RiskBand {
  return risk >= 70 ? "high" : risk >= 40 ? "watch" : "low";
}

export const RISK_COLORS: Record<RiskBand, string> = {
  low: "#16a34a",
  watch: "#d97706",
  high: "#dc2626",
};