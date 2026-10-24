import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  actor_role: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  detail: string; // JSON string, as the backend stores it
  prev_hash: string;
  hash: string;
}

export interface AuditVerify {
  ok: boolean;
  checked: number;
  head?: string;
  broken_at?: number;
  reason?: string;
}

// Feature 7 — tamper-proof audit trail reads.
export function useAuditLogs() {
  return useQuery({
    queryKey: ["audit", "logs"],
    queryFn: () => apiGet<{ items: AuditEntry[]; total: number }>("/audit/logs?limit=50"),
    retry: false,
  });
}

export function useAuditVerify() {
  return useQuery({
    queryKey: ["audit", "verify"],
    queryFn: () => apiGet<AuditVerify>("/audit/verify"),
    retry: false,
  });
}

// One-click statutory export: fetch the report as a blob and hand it to the
// browser's download UI (works against the real API and the demo mock).
export async function downloadReport(kind: "csv" | "pdf"): Promise<string> {
  const res = await fetch(`/api/reports/compliance.${kind}`);
  if (!res.ok) throw new Error(`export failed with ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `coalsmart-compliance-${new Date().toISOString().slice(0, 10)}.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return a.download;
}
