import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export interface MetricLimit {
  metric: string;
  limit_value: number;
  unit: string;
  direction: "max" | "min";
}

export interface SensorReading {
  mine_id: string;
  metric: string;
  value: number;
  unit: string;
  limit_value: number | null;
  recorded_at: string;
  breach: number;
}

export interface EnvironmentLatest {
  mine_id: string;
  mine_name: string;
  metric: string;
  value: number;
  unit: string;
  limit_value: number | null;
  recorded_at: string;
  breach: number;
}

export function useEnvironmentLimits() {
  return useQuery({
    queryKey: ["environment", "limits"],
    queryFn: () => apiGet<{ items: MetricLimit[] }>("/environment/limits"),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useEnvironmentLatest() {
  return useQuery({
    queryKey: ["environment", "latest"],
    queryFn: () => apiGet<{ items: EnvironmentLatest[] }>("/environment"),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useEnvironmentMine(mineId: string) {
  return useQuery({
    queryKey: ["environment", mineId],
    queryFn: () => apiGet<{ mine_id: string; latest: SensorReading[]; history: SensorReading[] }>(`/environment/${mineId}`),
    enabled: !!mineId,
    refetchInterval: 30_000,
    retry: false,
  });
}

// B6 — historical breach log: every reading that crossed its limit (role-scoped).
export interface BreachRow {
  id: number;
  mine_id: string;
  mine_name: string;
  metric: string;
  value: number;
  unit: string;
  limit_value: number;
  direction: "max" | "min";
  recorded_at: string;
}

export function useEnvironmentBreaches() {
  return useQuery({
    queryKey: ["environment", "breaches"],
    queryFn: () => apiGet<{ items: BreachRow[]; scoped_to: string | null }>("/environment/breaches"),
    refetchInterval: 60_000,
    retry: false,
  });
}

export async function updateLimit(
  metric: string,
  body: { limit_value: number; unit: string; direction: "max" | "min" },
): Promise<MetricLimit> {
  const { item } = await apiPut<{ item: MetricLimit }>(`/environment/limits/${metric}`, body);
  queryClient.invalidateQueries({ queryKey: ["environment", "limits"] });
  return item;
}

export function breachTone(breach: number) {
  return breach === 1 ? "text-[#dc2626] font-semibold" : "text-[#16a34a]";
}

export function limitDirectionArrow(direction: "max" | "min") {
  return direction === "max" ? "↑" : "↓";
}
