import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface DashboardOverview {
  role: string;
  scope: string;
  today: string;
  total_mines: number;
  high_risk: number;
  watch: number;
  avg_compliance: number;
  open_violations: number;
  overdue_actions: number;
  pending_actions: number;
  field_captures: number;
  open_actions: number;
}

// Feature 4 — role-scoped KPI strip; the server filters to the caller's mine.
export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboards", "overview"],
    queryFn: () => apiGet<DashboardOverview>("/dashboards/overview"),
    retry: false,
  });
}
