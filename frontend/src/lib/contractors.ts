import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export interface Contractor {
  id: string;
  name: string;
  mine_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  safety_cert_expiry: string | null;
  compliance: string;
  notes: string | null;
}

export function useContractors() {
  return useQuery({
    queryKey: ["contractors"],
    queryFn: () => apiGet<{ items: Contractor[] }>("/contractors"),
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useExpiringContractors(withinDays = 14) {
  return useQuery({
    queryKey: ["contractors", "expiring", withinDays],
    queryFn: () =>
      apiGet<{ items: Contractor[] }>(`/contractors/expiring?within_days=${withinDays}`),
    refetchInterval: 30_000,
    retry: false,
  });
}

export async function updateContractor(id: string, body: Partial<Contractor>): Promise<Contractor> {
  const { item } = await apiPatch<{ item: Contractor }>(`/contractors/${id}`, body);
  queryClient.invalidateQueries({ queryKey: ["contractors"] });
  queryClient.invalidateQueries({ queryKey: ["contractors", "expiring"] });
  return item;
}

export async function createContractor(body: {
  name: string;
  mine_id?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  safety_cert_expiry?: string | null;
  compliance?: string;
  notes?: string | null;
}): Promise<Contractor> {
  const { item } = await apiPost<{ item: Contractor }>("/contractors", body);
  queryClient.invalidateQueries({ queryKey: ["contractors"] });
  queryClient.invalidateQueries({ queryKey: ["contractors", "expiring"] });
  return item;
}

export function complianceTone(compliance: string) {
  return {
    compliant: "text-[#16a34a]",
    watch: "text-[#d97706]",
    breach: "text-[#dc2626]",
  }[compliance] ?? "text-[#64748b]";
}
