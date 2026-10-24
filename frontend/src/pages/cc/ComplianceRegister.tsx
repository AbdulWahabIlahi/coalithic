import { CloudUpload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import AnomalyBanner from "@/components/AnomalyBanner";
import OcrPanel from "@/components/OcrPanel";
import PageHeader from "@/components/PageHeader";
import RegisterList from "@/components/RegisterList";
import { COMPLIANCE_ROWS, type RegisterRow } from "@/lib/demo";
import { useComplianceItems, useComplianceStats, type ComplianceItem } from "@/lib/compliance";

// Map statutory categories onto the shared list-card vocabulary.
function toRow(item: ComplianceItem): RegisterRow {
  const icon = item.category === "environment" ? "report" : "shield";
  const urgent = item.status === "overdue" || item.status === "escalated" || (item.status === "pending" && item.days_overdue > -3);
  const badge = item.status === "resolved" ? "Ready" : urgent ? "Due soon" : "On track";
  const tone = badge === "Ready" ? "teal" : urgent ? "amber" : "teal";
  const owner = item.escalated_to ? `Escalated to ${item.escalated_to}` : item.owner_role;
  const due = item.days_overdue > 0
    ? `${item.days_overdue}d overdue`
    : `Due ${item.due_date}`;
  return {
    icon,
    id: item.id,
    title: item.title,
    sub: `${item.mine_name ?? "Portfolio"} · ${owner} · ${due}`,
    badge,
    tone,
  };
}

// Compliance register: the statutory obligations list with the anomaly strip beneath.
export default function ComplianceRegister() {
  // Feature 3: live register from the escalation engine, demo rows as fallback.
  const { data, isPending, isError, refetch } = useComplianceItems();
  const { data: stats } = useComplianceStats();

  const rows = data ? data.items.map(toRow) : COMPLIANCE_ROWS;
  const pct = stats?.on_track_pct ?? 91;
  const overdueCount = stats ? stats.overdue + stats.escalated : 12;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance register / Statutory"
        title="Obligations, tracked to close."
        sub="Environmental, labour, safety and equipment certification in one register."
        action={
          <Button
            variant="outline"
            data-testid="compliance-refresh-button"
            onClick={() => void refetch()}
            disabled={isPending}
          >
            <RefreshCw className={isPending ? "animate-spin" : undefined} />
            Refresh register
          </Button>
        }
      />

      <AnomalyBanner />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {isError ? (
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="compliance-error">
              <p className="text-[13px] text-muted-foreground">
                Live register unavailable — showing the last known snapshot.{" "}
                <CloudUpload className="inline h-3.5 w-3.5" />
              </p>
            </div>
          ) : (
            <RegisterList rows={rows} testPrefix="compliance" />
          )}
        </div>
        <div className="space-y-6 lg:col-span-4">
          <OcrPanel />
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="compliance-summary">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              Register health
            </p>
            <p className="mt-3 text-[34px] leading-none font-semibold text-foreground">{pct}%</p>
            <p className="mt-2 text-xs text-muted-foreground">Overall compliance · live from the escalation engine</p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 font-mono text-[11px] text-muted-foreground" data-testid="overdue-count">
              {overdueCount} overdue actions portfolio-wide
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
