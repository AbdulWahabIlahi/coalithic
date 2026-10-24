import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export interface Alert {
  id: number;
  key: string;
  mine_id: string | null;
  category: string;
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  status: "open" | "resolved";
  read_at: string | null;
  assigned_to: string | null;
  created_at: string;
  data: Record<string, unknown>;
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiGet<{ items: Alert[] }>("/alerts"),
    refetchInterval: 20_000,
    retry: false,
  });
}

export async function markAlertRead(id: number): Promise<void> {
  await apiPatch(`/alerts/${id}`, { read: true });
  queryClient.invalidateQueries({ queryKey: ["alerts"] });
}

export function severityColor(severity: string) {
  return {
    low: "#16a34a",
    medium: "#d97706",
    high: "#dc2626",
  }[severity] ?? "#64748b";
}

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  return `${Math.floor(hrs / 24)} day(s) ago`;
}
