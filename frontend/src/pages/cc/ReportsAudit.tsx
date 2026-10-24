import { useState } from "react";
import { FileDown, FileText, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import AnomalyBanner from "@/components/AnomalyBanner";
import PageHeader from "@/components/PageHeader";
import RegisterList from "@/components/RegisterList";
import { downloadReport, useAuditLogs, useAuditVerify, type AuditVerify } from "@/lib/audit";
import { reportRows } from "@/lib/demo";
import { useMe } from "@/lib/session";

// Feature 7 — Reports & audit: one-click statutory export (CSV/PDF) and the
// hash-chained audit trail with live chain verification. Demo values stand in
// when the backend is unreachable.
export default function ReportsAudit() {
  const { data: me } = useMe();
  const todayShort = me?.server.today_short ?? "";
  const rows = reportRows(todayShort);

  const { data: audit } = useAuditLogs();
  const { data: verify } = useAuditVerify();
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [checking, setChecking] = useState(false);
  const [chain, setChain] = useState<AuditVerify | null>(null);

  const total = audit?.total;
  const latest = audit?.items?.slice(0, 5) ?? [];
  const verified = chain ?? verify ?? null;

  const doExport = async (kind: "csv" | "pdf") => {
    setExporting(kind);
    try {
      const name = await downloadReport(kind);
      toast.success(`${kind.toUpperCase()} exported`, { description: name });
    } catch {
      toast.error("Export failed", { description: "Live backend unavailable" });
    } finally {
      setExporting(null);
    }
  };

  const verifyChain = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/audit/verify");
      if (!res.ok) throw new Error();
      const result = (await res.json()) as AuditVerify;
      setChain(result);
      if (result.ok) toast.success("Audit chain verified", { description: `${result.checked} sealed entries intact` });
      else toast.error("Chain broken", { description: `Entry #${result.broken_at} — ${result.reason}` });
    } catch {
      toast.error("Verification failed", { description: "Live backend unavailable" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports & audit / Immutable trail"
        title="Nothing leaves the room unrecorded."
        sub="Every action, export and submission is sealed against the audit trail."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              data-testid="export-report-button"
              className="h-10"
              disabled={exporting !== null}
              onClick={() => void doExport("csv")}
            >
              {exporting === "csv" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}
              Export CSV
            </Button>
            <Button
              variant="outline"
              data-testid="export-pdf-button"
              className="h-10"
              disabled={exporting !== null}
              onClick={() => void doExport("pdf")}
            >
              {exporting === "pdf" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}
              Export PDF
            </Button>
          </div>
        }
      />

      <AnomalyBanner />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <RegisterList rows={rows} testPrefix="report" />
        </div>
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="audit-summary">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              Audit trail
            </p>
            <p className="mt-3 text-[34px] leading-none font-semibold text-foreground">
              {total ?? 48}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Sealed entries · SHA-256 hash-chained, append-only</p>

            <div
              className={`mt-4 flex items-start gap-2 rounded-md border px-3 py-2 ${
                verified?.ok
                  ? "border-[#bfe3da] bg-[#e9f2ed]/60"
                  : verified
                    ? "border-[#fecaca] bg-[#fef2f2]/60"
                    : "border-border bg-secondary"
              }`}
              data-testid="chain-status"
            >
              {verified?.ok ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : verified ? (
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">
                  {verified?.ok
                    ? `Chain verified · ${verified.checked} links`
                    : verified
                      ? `Chain broken at #${verified.broken_at}`
                      : "Not verified yet"}
                </p>
                <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                  {verified?.ok
                    ? `head ${verified.head?.slice(0, 24)}…`
                    : verified?.reason ?? "Run verification to seal-check the trail"}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              className="mt-3 w-full"
              data-testid="verify-chain-button"
              disabled={checking}
              onClick={() => void verifyChain()}
            >
              {checking ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {checking ? "Verifying…" : "Verify chain"}
            </Button>

            <div className="mt-4 border-t border-border pt-3" data-testid="audit-latest">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Latest entries</p>
              <ul className="mt-2 space-y-2">
                {latest.length > 0 ? (
                  latest.map((entry) => (
                    <li key={entry.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {entry.action}
                        <span className="ml-1.5 font-normal text-muted-foreground">{entry.actor.split("@")[0]}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        #{entry.id} · {entry.hash.slice(0, 8)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-[12px] text-muted-foreground">Awaiting live entries</li>
                )}
              </ul>
            </div>

            <p className="mt-4 font-mono text-[11px] text-muted-foreground" data-testid="audit-date">
              {todayShort || "Awaiting server date"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
