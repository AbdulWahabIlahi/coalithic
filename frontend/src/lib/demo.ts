// Static demo content mirroring the original prototype's own demo data: the headline
// stats, registers, attention queue and signal copy are constants; the live mines feed
// is the /api/mines contract.
import type { RiskBand } from "@/lib/types";

export const HEADLINE_STATS = [
  { slug: "total-mines", label: "Total mines", value: "50", note: "Across 8 states", tone: "dark" },
  { slug: "overall-compliance", label: "Overall compliance", value: "91%", note: "↑ 2.4% this month", tone: "teal" },
  { slug: "high-risk", label: "High risk", value: "03", note: "2 require action", tone: "red" },
  { slug: "open-actions", label: "Open actions", value: "48", note: "12 overdue", tone: "amber" },
] as const;

export const RISK_LABEL: Record<RiskBand, string> = {
  low: "Low risk",
  watch: "Watch",
  high: "High risk",
};

export function signalText(risk: number): string {
  return risk >= 70 ? "Repeated safety violations detected" : "Routine compliance signal";
}

export const PATTERN_SIGNAL = {
  title: "Pattern detected",
  body: "Section 4 violations repeat across 3 mines and 2 contractors.",
};

export const ATTENTION_QUEUE = [
  { chip: "02d", title: "Safety inspection due", sub: "Singrauli North · Mine Officer" },
  { chip: "07d", title: "Certificate expiring", sub: "ABC Mining Services · Contractor" },
  { chip: "12d", title: "Environmental report", sub: "Talcher East · Compliance" },
];

export const ANOMALY = {
  title: "Production anomaly monitor",
  body: "Singrauli North is 18% above its 30-day baseline. Review recommended before next statutory submission.",
  action: "Review signal",
};

export const INITIAL_QUEUE_COUNT = 3;
export const INITIAL_LAST_CAPTURE = { id: "OBS-7A31F2", saved: "Saved 4 min ago · SHA-256 sealed" };

export type RegisterRow = {
  icon: "report" | "shield" | "hardhat";
  /** Live rows carry their backend id — titles repeat across mines by design. */
  id?: string;
  title: string;
  sub: string;
  badge: "Due soon" | "On track" | "Ready";
  tone: "amber" | "teal";
};

export const COMPLIANCE_ROWS: RegisterRow[] = [
  { icon: "report", title: "Environmental report", sub: "Due in 2 days · Escalation watch", badge: "Due soon", tone: "amber" },
  { icon: "shield", title: "Labour compliance", sub: "Owner: Mine Officer · Updated today", badge: "On track", tone: "teal" },
  { icon: "shield", title: "Safety inspection", sub: "Owner: Mine Officer · Updated today", badge: "On track", tone: "teal" },
  { icon: "shield", title: "Equipment certification", sub: "Owner: Mine Officer · Updated today", badge: "On track", tone: "teal" },
];

export const CONTRACTOR_ROWS: RegisterRow[] = [
  { icon: "hardhat", title: "ABC Mining Services", sub: "Certificate expires in 7 days", badge: "Due soon", tone: "amber" },
  { icon: "hardhat", title: "Eastern Haulage Co.", sub: "Active · 86 workers", badge: "On track", tone: "teal" },
  { icon: "hardhat", title: "Shakti Industrial Works", sub: "Active · 86 workers", badge: "On track", tone: "teal" },
  { icon: "hardhat", title: "RKS Earth Movers", sub: "Active · 86 workers", badge: "On track", tone: "teal" },
];

export const reportRows = (todayShort: string): RegisterRow[] => [
  { icon: "report", title: "Monthly governance report", sub: `Ready · ${todayShort}`, badge: "Ready", tone: "amber" },
  { icon: "report", title: "DGMS safety return", sub: "Immutable record · 48 actions", badge: "On track", tone: "teal" },
  { icon: "report", title: "Contractor compliance pack", sub: "Immutable record · 48 actions", badge: "On track", tone: "teal" },
  { icon: "report", title: "Immutable audit trail", sub: "Immutable record · 48 actions", badge: "On track", tone: "teal" },
];