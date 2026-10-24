import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

// B3 — synced field captures (server side of the offline queue): geo-tags,
// drift, seal hash and photo thumbnails for the Field Inspections page and map.

export const FIELD_CAPTURES_KEY = ["field", "captures"] as const;

export interface FieldCaptureRow {
  id: string;
  client_id: string;
  mine_id: string | null;
  kind: string;
  note: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  captured_at: string;
  server_received_at: string;
  photo_url: string | null;
  seal_hash: string;
  drift_seconds: number;
  status: string;
}

export function useFieldCaptures(limit = 50) {
  return useQuery({
    queryKey: [...FIELD_CAPTURES_KEY, limit],
    queryFn: () => apiGet<{ items: FieldCaptureRow[] }>(`/field/captures?limit=${limit}`),
    retry: false,
  });
}

export function kindTone(kind: string): string {
  return kind === "violation" ? "text-destructive" : "text-muted-foreground";
}
