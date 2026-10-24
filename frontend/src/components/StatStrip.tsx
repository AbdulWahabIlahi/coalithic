import { HEADLINE_STATS } from "@/lib/demo";
import { useDashboardOverview } from "@/lib/dashboard";

const NUMBER_TONES = {
  dark: "text-foreground",
  teal: "text-primary",
  red: "text-destructive",
  amber: "text-accent-foreground",
} as const;

// Feature 4: live role-scoped KPIs from /api/dashboards/overview, demo values as
// fallback so the strip never blanks out when the backend is down.
export default function StatStrip() {
  const { data } = useDashboardOverview();

  const stats = data
    ? [
        {
          slug: "total-mines",
          label: "Total mines",
          value: String(data.total_mines).padStart(2, "0"),
          note: data.scope === "all" ? "Across your portfolio" : `Scope: ${data.scope}`,
          tone: "dark" as const,
        },
        {
          slug: "overall-compliance",
          label: "Overall compliance",
          value: `${Math.round(data.avg_compliance)}%`,
          note: `${data.watch} on watch`,
          tone: "teal" as const,
        },
        {
          slug: "high-risk",
          label: "High risk",
          value: String(data.high_risk).padStart(2, "0"),
          note: data.high_risk > 0 ? "Require action" : "None right now",
          tone: "red" as const,
        },
        {
          slug: "open-actions",
          label: "Open actions",
          value: String(data.open_actions),
          note: `${data.overdue_actions} overdue`,
          tone: "amber" as const,
        },
      ]
    : HEADLINE_STATS;

  return (
    <div
      data-testid="stat-strip"
      className="grid grid-cols-2 rounded-lg border border-border bg-card shadow-sm divide-y divide-border lg:grid-cols-4 lg:divide-y-0 lg:divide-x"
    >
      {stats.map((stat) => (
        <div key={stat.slug} data-testid={`stat-${stat.slug}`} className="px-6 py-5">
          <p className="text-[13px] text-muted-foreground">{stat.label}</p>
          <p className={`mt-1 text-[34px] font-semibold leading-none ${NUMBER_TONES[stat.tone]}`}>
            {stat.value}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{stat.note}</p>
        </div>
      ))}
    </div>
  );
}
