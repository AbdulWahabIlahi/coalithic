import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export interface CorrectiveAction {
  id: string;
  item_id: string;
  mine_id: string;
  mine_name: string;
  item_title: string;
  assignee: string;
  deadline: string;
  proof_photo_url: string | null;
  state: "open" | "submitted" | "approved" | "rejected";
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export function useCorrectiveActions() {
  return useQuery({
    queryKey: ["corrective_actions"],
    queryFn: () => apiGet<{ items: CorrectiveAction[] }>("/corrective_actions"),
    refetchInterval: 30_000,
    retry: false,
  });
}

export async function submitCorrectiveAction(body: {
  item_id: string;
  assignee: string;
  deadline: string;
  proof_photo_url?: string | null;
}): Promise<CorrectiveAction> {
  const { item } = await apiPost<{ item: CorrectiveAction }>("/corrective_actions", body);
  queryClient.invalidateQueries({ queryKey: ["corrective_actions"] });
  return item;
}

export async function updateCorrectiveAction(
  id: string,
  body: { state: "submitted" | "approved" | "rejected"; resolved_by?: string | null }
): Promise<CorrectiveAction> {
  const { item } = await apiPatch<{ item: CorrectiveAction }>(`/corrective_actions/${id}`, body);
  queryClient.invalidateQueries({ queryKey: ["corrective_actions"] });
  return item;
}

export function stateTone(state: string) {
  return {
    open: "text-[#d97706]",
    submitted: "text-[#2563eb]",
    approved: "text-[#16a34a]",
    rejected: "text-[#dc2626]",
  }[state] ?? "text-[#64748b]";
}
