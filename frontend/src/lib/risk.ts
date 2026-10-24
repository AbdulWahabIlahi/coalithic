import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface RiskFactor {
  factor: string;
  delta: number;
  detail: string;
}

export interface RiskExplain {
  mine_id: string;
  score: number;
  band: string;
  delta: number;
  factors: RiskFactor[];
  patterns: number;
  computed_at: string;
}

export interface RiskPattern {
  id: string;
  section: string;
  mine_ids: string[];
  contractor_ids: string[];
  violation_count: number;
  first_seen: string;
  last_seen: string;
}

export function useRiskExplain(mineId: string) {
  return useQuery({
    queryKey: ["risk", "explain", mineId],
    queryFn: () => apiGet<RiskExplain>(`/risk/explain/${mineId}`),
    enabled: !!mineId,
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useRiskPatterns() {
  return useQuery({
    queryKey: ["risk", "patterns"],
    queryFn: () => apiGet<{ items: RiskPattern[] }>("/risk/patterns"),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function patternHeadline(pattern: RiskPattern | null | undefined) {
  if (!pattern) return null;
  return {
    title: `Repeat ${pattern.section} violations across ${pattern.mine_ids.length} mine(s)`,
    body: `${pattern.violation_count} open violation(s) in section ${pattern.section} involve ${pattern.contractor_ids.join(", ") || "unknown contractors"}.`,
  };
}

// B2 — open violations with contractor attribution ("what is wrong, where,
// who was responsible"). Role-scoped on the server; ?mine_id filters further.
export interface ViolationRow {
  id: string;
  mine_id: string;
  mine_name: string | null;
  section: string;
  title: string;
  severity: 1 | 2 | 3;
  status: string;
  opened_at: string;
  closed_at: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
}

export function useViolations(mineId?: string) {
  const qs = mineId ? `?mine_id=${encodeURIComponent(mineId)}` : "";
  return useQuery({
    queryKey: ["risk", "violations", mineId ?? "all"],
    queryFn: () => apiGet<{ items: ViolationRow[] }>(`/risk/violations${qs}`),
    refetchInterval: 60_000,
    retry: false,
  });
}

// Feature 5 — root cause: section/contractor grouping for one mine + its patterns.
export interface RootCauseSection {
  section: string;
  n: number;
  contractors: string | null;
}

export interface RootCauseContractor {
  contractor_id: string;
  name: string | null;
  n: number;
}

export interface RootCause {
  mine_id: string;
  by_section: RootCauseSection[];
  by_contractor: RootCauseContractor[];
  patterns: RiskPattern[];
}

export function useRootCause(mineId: string) {
  return useQuery({
    queryKey: ["risk", "root-cause", mineId],
    queryFn: () => apiGet<RootCause>(`/risk/root-cause/${mineId}`),
    enabled: !!mineId,
    refetchInterval: 60_000,
    retry: false,
  });
}
