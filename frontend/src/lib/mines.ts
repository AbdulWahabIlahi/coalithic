import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { MinesResponse } from "@/lib/types";

// The command room's live dataset — same contract as the original prototype's API.
export function useMines() {
  return useQuery({
    queryKey: ["mines"],
    queryFn: () => apiGet<MinesResponse>("/mines"),
    retry: false,
  });
}