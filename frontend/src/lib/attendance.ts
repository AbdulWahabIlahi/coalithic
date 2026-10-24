import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export interface AttendanceRecord {
  id: string;
  mine_id: string;
  mine_name: string;
  work_date: string;
  workers_in: number;
  workers_out: number;
  headcount: number;
  recorded_by: string | null;
  created_at: string;
}

export function useAttendanceMine(mineId: string, days = 14) {
  return useQuery({
    queryKey: ["attendance", mineId, days],
    queryFn: () => apiGet<{ mine_id: string; items: AttendanceRecord[] }>(`/attendance/${mineId}?days=${days}`),
    enabled: !!mineId,
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useAttendanceLatest() {
  return useQuery({
    queryKey: ["attendance", "latest"],
    queryFn: () => apiGet<{ items: AttendanceRecord[] }>("/attendance"),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useRecordAttendance() {
  return useMutation({
    mutationFn: (body: {
      mine_id: string;
      work_date: string;
      workers_in: number;
      workers_out: number;
      headcount: number;
    }) => apiPost<{ item: AttendanceRecord }>("/attendance", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

/** 7-day average headcount vs the day before yesterday — a small trend signal. */
export function headcountTrend(items: AttendanceRecord[]): { direction: "up" | "down" | "flat"; pct: number } {
  const sorted = [...items].sort((a, b) => a.work_date.localeCompare(b.work_date));
  if (sorted.length < 2) return { direction: "flat", pct: 0 };
  const latest = sorted[sorted.length - 1].headcount;
  const previous = sorted[sorted.length - 2].headcount;
  if (previous === 0) return { direction: "flat", pct: 0 };
  const pct = Math.round(((latest - previous) / previous) * 1000) / 10;
  return { direction: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat", pct };
}
