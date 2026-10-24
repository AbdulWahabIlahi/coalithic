import { Ellipsis } from "lucide-react";
import { ATTENTION_QUEUE } from "@/lib/demo";
import { useComplianceItems, type ComplianceItem } from "@/lib/compliance";

// ATTENTION QUEUE card: live statutory actions from /api/compliance/items,
// falling back to the demo list when the register is empty or offline.

function chipFor(item: ComplianceItem): string {
  if (item.status === "escalated") return `L${item.escalation_level}`;
  if (item.status === "overdue") return `+${item.days_overdue}d`;
  const days = Math.ceil((Date.parse(item.due_date) - Date.now()) / 86_400_000);
  return Number.isFinite(days) && days >= 0 ? `DUE-${days}d` : "TODAY";
}

export default function AttentionQueue() {
  const { data, isPending, isError } = useComplianceItems();

  const live = (data?.items ?? [])
    .filter((i) => i.status !== "resolved")
    .sort((a, b) => {
      const rank = (i: ComplianceItem) =>
        i.status === "escalated" ? 0 : i.status === "overdue" ? 1 : 2;
      return rank(a) - rank(b) || a.due_date.localeCompare(b.due_date);
    })
    .slice(0, 4)
    .map((i) => ({
      chip: chipFor(i),
      title: i.title,
      sub: `${i.mine_name ?? i.mine_id ?? "Portfolio"} · due ${i.due_date} · ${i.owner_role}`,
    }));

  const rows = !isPending && !isError && live.length > 0 ? live : ATTENTION_QUEUE;
  const isLive = rows !== ATTENTION_QUEUE;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="attention-queue-card">
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
          Attention queue
        </p>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
            isLive ? "text-primary" : "text-muted-foreground"
          }`}
          data-testid="attention-source"
        >
          {isLive ? "live register" : "demo data"}
        </span>
      </div>
      <div className="px-5 pb-4 pt-1">
        <h2 className="text-lg font-medium text-foreground">Next actions</h2>
      </div>
      <div className="border-t border-border">
        {rows.map((item) => (
          <div
            key={item.chip}
            data-testid={`attention-row-${item.chip}`}
            className="flex items-center gap-3.5 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-secondary"
          >
            <span className="rounded border border-input px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {item.chip}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-foreground">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">{item.sub}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-5 py-2.5">
        <Ellipsis className="h-4 w-4 text-muted-foreground" aria-label="More actions" />
        <span className="font-mono text-[10px] text-muted-foreground">
          {isLive ? "from the statutory register" : "waiting for the register…"}
        </span>
      </div>
    </div>
  );
}
