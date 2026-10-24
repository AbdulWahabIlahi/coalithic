import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const OFFSETS = [-17, -13, -9, -5, -1, 3];
const VALUES = [87.1, 87.8, 88.4, 89.2, 90.3, 91.0];

interface PortfolioHealthProps {
  today: string | undefined; // server-anchored "YYYY-MM-DD"
  loading: boolean;
}

// PORTFOLIO HEALTH card: 30-day compliance trajectory ending at today's 91%.
export default function PortfolioHealth({ today, loading }: PortfolioHealthProps) {
  const data = useMemo(() => {
    if (!today) return [];
    const base = parseISO(today);
    return OFFSETS.map((offset, i) => ({
      label: format(addDays(base, offset), "dd MMM"),
      value: VALUES[i],
    }));
  }, [today]);

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="portfolio-health-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
          Portfolio health
        </p>
        <span className="rounded bg-accent px-2 py-0.5 font-mono text-[11px] font-medium text-accent-foreground">
          91% +4.8% / 30 days
        </span>
      </div>
      <div className="px-5 pb-2 pt-1">
        <h2 className="text-lg font-medium text-foreground">Compliance trajectory</h2>
      </div>
      <div className="h-56 px-2 pb-3">
        {loading || data.length === 0 ? (
          <div className="m-2 h-[196px] animate-pulse rounded bg-secondary" />
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="csTrajectory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="primary" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="primary" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "muted-foreground", fontFamily: "'IBM Plex Mono', monospace" }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis hide domain={[84, 93]} />
              <Tooltip
                formatter={(value) => [`${value}%`, "Compliance"]}
                labelFormatter={(label) => String(label)}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid border",
                  background: "card",
                  fontSize: 12,
                  boxShadow: "0 4px 12px rgba(30, 41, 59, 0.08)",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="primary"
                strokeWidth={2}
                fill="url(#csTrajectory)"
                activeDot={{ r: 4, fill: "primary" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
