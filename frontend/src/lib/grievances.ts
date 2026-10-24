import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export type GrievanceCategory = "safety" | "wages" | "facilities" | "environment" | "harassment" | "other";
export type GrievanceStatus = "open" | "in_review" | "resolved";

export interface Grievance {
  id: string;
  mine_id: string;
  mine_name: string;
  worker_name: string | null;
  category: GrievanceCategory;
  description: string;
  status: GrievanceStatus;
  sla_hours: number;
  sla_due_at: string;
  sla_remaining_hours: number | null;
  sla_breached: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export const GRIEVANCE_CATEGORIES: GrievanceCategory[] = [
  "safety", "wages", "facilities", "environment", "harassment", "other",
];

export function useGrievances() {
  return useQuery({
    queryKey: ["grievances"],
    queryFn: () => apiGet<{ items: Grievance[] }>("/grievances"),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useSubmitGrievance() {
  return useMutation({
    mutationFn: (body: { mine_id: string; worker_name?: string; category: GrievanceCategory; description: string }) =>
      apiPost<{ item: Grievance }>("/grievances", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["grievances"] });
    },
  });
}

export function useUpdateGrievance() {
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: GrievanceStatus }) =>
      apiPatch<{ item: Grievance }>(`/grievances/${id}`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["grievances"] });
    },
  });
}

export function grievanceStatusTone(g: Pick<Grievance, "status" | "sla_breached">): string {
  if (g.status === "resolved") return "text-accent-foreground";
  if (g.sla_breached) return "text-destructive font-semibold";
  return g.status === "in_review" ? "text-primary" : "text-accent-foreground";
}

/** "in 12h" / "breached 10h ago" / "closed" — for the SLA timer column. */
export function slaLabel(g: Pick<Grievance, "status" | "sla_remaining_hours">): string {
  if (g.status === "resolved") return "closed";
  const h = g.sla_remaining_hours ?? 0;
  if (h < 0) return `breached ${Math.abs(h)}h ago`;
  return `in ${h}h`;
}
