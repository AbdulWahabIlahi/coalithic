import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export type ComplianceStatus = "pending" | "overdue" | "escalated" | "resolved";

export interface ComplianceItem {
  id: string;
  mine_id: string | null;
  mine_name: string | null;
  title: string;
  category: "environment" | "safety" | "labour" | "equipment" | string;
  owner_role: string;
  due_date: string;
  status: ComplianceStatus;
  escalation_level: number;
  escalated_to: string | null;
  days_overdue: number;
}

export interface ComplianceStats {
  total: number;
  by_status: Record<string, number>;
  overdue: number;
  escalated: number;
  pending: number;
  resolved: number;
  open: number;
  on_track_pct: number;
}

// Feature 3 — statutory register + escalation stats for the compliance page.
export function useComplianceItems() {
  return useQuery({
    queryKey: ["compliance", "items"],
    queryFn: () => apiGet<{ items: ComplianceItem[] }>("/compliance/items"),
    retry: false,
  });
}

export function useComplianceStats() {
  return useQuery({
    queryKey: ["compliance", "stats"],
    queryFn: () => apiGet<ComplianceStats>("/compliance/stats"),
    retry: false,
  });
}
