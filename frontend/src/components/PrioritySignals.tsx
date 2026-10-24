import { Link } from "react-router-dom";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { PATTERN_SIGNAL, signalText } from "@/lib/demo";
import { patternHeadline, useRiskPatterns } from "@/lib/risk";
import { RISK_COLORS, riskBand, type Mine } from "@/lib/types";

const TILE_TONES = {
  low: "bg-accent text-accent-foreground",
  watch: "bg-accent text-accent-foreground",
  high: "bg-accent text-destructive",
} as const;

interface PrioritySignalsProps {
  mines: Mine[];
  loading: boolean;
  error: boolean;
}

// AI RISK ENGINE card: the top portfolio signals with score rails.
export default function PrioritySignals({ mines, loading, error }: PrioritySignalsProps) {
  const signals = mines.slice(0, 3);
  // Feature 2: live repeat-violation pattern from the engine, demo copy as fallback.
  const { data: patternData } = useRiskPatterns();
  const pattern =
    patternHeadline(patternData?.items[0]) ?? PATTERN_SIGNAL;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="priority-signals-card">
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
          AI risk engine
        </p>
        <Link
          to="/mines"
          data-testid="view-all-link"
          className="flex items-center gap-0.5 text-[13px] text-primary transition-colors hover:text-accent-foreground"
        >
          View all
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="px-5 pb-4 pt-1">
        <h2 className="text-lg font-medium text-foreground">Priority signals</h2>
      </div>

      {error ? (
        <p className="px-5 pb-5 text-[13px] text-muted-foreground" data-testid="signals-error-text">
          Live feed unavailable — signals return when the backend reconnects.
        </p>
      ) : loading ? (
        <div className="space-y-3 px-5 pb-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-secondary" />
          ))}
        </div>
      ) : (
        <>
          <div className="border-t border-border">
            {signals.map((mine) => {
              const band = riskBand(mine.risk);
              return (
                <div
                  key={mine.id}
                  data-testid={`signal-row-${mine.id.toLowerCase()}`}
                  className="flex items-center gap-3.5 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-secondary"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TILE_TONES[band]}`}>
                    <ShieldCheck className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-foreground">{mine.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{signalText(mine.risk)}</p>
                  </div>
                  <p className="shrink-0 leading-none">
                    <span className="text-[19px] font-semibold" style={{ color: RISK_COLORS[band] }}>
                      {mine.risk}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">/100</span>
                  </p>
                </div>
              );
            })}
          </div>
          <div className="border-t border-border px-5 py-4" data-testid="pattern-signal">
            <p className="text-[13px] font-semibold text-foreground">{pattern.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{pattern.body}</p>
          </div>
        </>
      )}
    </div>
  );
}
