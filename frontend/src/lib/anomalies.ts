import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface ProductionPoint {
  date: string;
  coal_tons: number;
}

export interface ProductionAnomaly {
  date: string;
  value: number;
  baseline: number;
  deviation_pct: number;
  z_score: number;
  direction: "spike" | "drop";
  detail: string;
}

export interface AnomalyEvent {
  mine_id: string;
  mine_name: string;
  kind: "production" | "environment";
  severity: "high" | "medium";
  at: string;
  detail: string;
}

export interface ProductionBundle {
  mine_id: string;
  mine_name: string;
  series: ProductionPoint[];
  anomalies: ProductionAnomaly[];
  sensor_breaches: { metric: string; value: number; unit: string; limit_value: number; detail: string }[];
}

// Feature 6 — live production/environment anomalies.
export function useAnomalies() {
  return useQuery({
    queryKey: ["anomalies"],
    queryFn: () => apiGet<{ items: AnomalyEvent[] }>("/anomalies"),
    retry: false,
  });
}

export function useProductionSeries(mineId: string | null) {
  return useQuery({
    queryKey: ["anomalies", "production", mineId],
    queryFn: () => apiGet<ProductionBundle>(`/anomalies/production/${mineId}`),
    enabled: Boolean(mineId),
    retry: false,
  });
}
