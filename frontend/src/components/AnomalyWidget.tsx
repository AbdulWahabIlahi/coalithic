import { TriangleAlert } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAnomalies, useProductionSeries } from "@/lib/anomalies";

// Feature 6 — Production anomaly monitor: 30-day output chart for the worst
// anomalous mine, flagged points marked in red. Falls back to the demo mine.
export default function AnomalyWidget() {
  const { data: anomalies } = useAnomalies();
  const top = anomalies?.items.find((a) => a.kind === "production") ?? anomalies?.items[0];
  const mineId = top?.mine_id ?? "M-001";
  const { data, isPending } = useProductionSeries(mineId);

  const chartData = (data?.series ?? []).map((p) => ({
    date: p.date.slice(5), // MM-DD
    tons: p.coal_tons,
  }));
  const flagged = data?.anomalies ?? [];
  const breach = data?.sensor_breaches?.[0];

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="anomaly-widget">
      <div className="flex items-start justify-between px-5 pt-4">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
            Anomaly monitor
          </p>
          <h2 className="mt-1.5 text-lg font-medium text-foreground">
            Production · {data?.mine_name ?? mineId}
          </h2>
        </div>
        <span className="flex items-center gap-1 rounded border border-primary/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
          AI decision support
        </span>
        {flagged.length > 0 && (
          <span className="flex items-center gap-1.5 rounded border border-destructive/50 bg-destructive/10 px-2 py-1 font-mono text-[11px] font-semibold text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" />
            {flagged.length} flagged
          </span>
        )}
      </div>

      <div className="px-5 pb-4 pt-3">
        {isPending ? (
          <div className="h-48 animate-pulse rounded bg-secondary" />
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="muted" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "muted-foreground" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "muted-foreground" }} width={48} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid border" }}
                formatter={(v) => [`${v} t`, "Coal output"]}
              />
              <Line type="monotone" dataKey="tons" stroke="primary" strokeWidth={2} dot={false} />
              {flagged.map((f) => (
                <ReferenceDot
                  key={f.date}
                  x={f.date.slice(5)}
                  y={f.value}
                  r={5}
                  fill="destructive"
                  stroke="background"
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}

        {(flagged[0] || breach) && (
          <div
            className="mt-3 rounded-md border border-accent bg-accent/60 px-3.5 py-2.5"
            data-testid="anomaly-detail"
          >
            <p className="text-[13px] font-medium text-accent-foreground">{flagged[0]?.detail ?? breach?.detail}</p>
            {flagged[0] && (
              <p className="mt-1 font-mono text-[11px] text-accent-foreground">
                {flagged[0].date} · {flagged[0].value} t vs baseline {flagged[0].baseline} t (
                {flagged[0].deviation_pct > 0 ? "+" : ""}
                {flagged[0].deviation_pct}% · z={flagged[0].z_score})
              </p>
            )}
          </div>
        )}
        {breach && flagged[0] && (
          <p className="mt-2 font-mono text-[11px] text-destructive">⚠ {breach.detail}</p>
        )}
      </div>
    </div>
  );
}
