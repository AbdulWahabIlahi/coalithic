import { RefreshCw, TriangleAlert, Sparkles, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import AnomalyBanner from "@/components/AnomalyBanner";
import AnomalyWidget from "@/components/AnomalyWidget";
import AttendancePanel from "@/components/AttendancePanel";
import IndiaRiskMap from "@/components/IndiaRiskMap";
import PageHeader from "@/components/PageHeader";
import { RISK_LABEL, signalText } from "@/lib/demo";
import { useMines } from "@/lib/mines";
import { useRiskExplain, useRootCause, useViolations } from "@/lib/risk";
import { RISK_COLORS, riskBand } from "@/lib/types";

// Mine intelligence: the full portfolio beside the live map, with the anomaly strip on top.
export default function MineIntelligence() {
  const { data, isPending, isError, refetch } = useMines();
  const mines = data?.items ?? [];
  const top = mines.reduce((a, b) => (a.risk ?? 0) > (b.risk ?? 0) ? a : b, mines[0]);
  const { data: explain, isPending: explainPending } = useRiskExplain(top?.id ?? "");
  const { data: violationsData, isPending: violationsPending } = useViolations();
  const { data: rootCause, isPending: rootPending } = useRootCause(top?.id ?? "");
  const violations = violationsData?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mine intelligence / National portfolio"
        title="Every seam, accounted for."
        sub="Risk, compliance and last inspection across the operating portfolio."
        action={
          <Button
            variant="outline"
            data-testid="mines-refresh-button"
            onClick={() => void refetch()}
            disabled={isPending}
          >
            <RefreshCw className={isPending ? "animate-spin" : undefined} />
            Refresh feed
          </Button>
        }
      />

      <AnomalyBanner />

      <IndiaRiskMap
        mines={mines}
        loading={isPending}
        error={isError}
        onRefresh={() => void refetch()}
      />

      <AnomalyWidget />

      {/* Feature 11 — attendance badge + trend on the top-risk mine's profile. */}
      {top && !isPending ? <AttendancePanel mineId={top.id} mineName={top.name} /> : null}

      <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="mine-table">
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
            Register extract
          </p>
          <span className="font-mono text-[11px] text-muted-foreground" data-testid="mine-count">
            {mines.length} mines
          </span>
        </div>
        <div className="px-5 pb-4 pt-1">
          <h2 className="text-lg font-medium text-foreground">Mine register</h2>
        </div>

        {isError ? (
          <p className="px-5 pb-5 text-[13px] text-muted-foreground" data-testid="mines-error-text">
            Live feed unavailable — the register returns when the backend reconnects.
          </p>
        ) : isPending ? (
          <div className="space-y-3 px-5 pb-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded bg-secondary" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  <th className="px-5 py-2.5 font-medium">Mine</th>
                  <th className="px-3 py-2.5 font-medium">State</th>
                  <th className="px-3 py-2.5 font-medium">Risk</th>
                  <th className="px-3 py-2.5 font-medium">Compliance</th>
                  <th className="px-3 py-2.5 font-medium">Open</th>
                  <th className="px-5 py-2.5 font-medium">Last inspection</th>
                </tr>
              </thead>
              <tbody>
                {mines.map((mine) => {
                  const band = riskBand(mine.risk);
                  return (
                    <tr
                      key={mine.id}
                      data-testid={`mine-row-${mine.id.toLowerCase()}`}
                      className="border-t border-border transition-colors hover:bg-secondary"
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium text-foreground">{mine.name}</span>
                        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{mine.id}</span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{mine.state}</td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: RISK_COLORS[band] }}
                          />
                          <span className="font-mono font-semibold" style={{ color: RISK_COLORS[band] }}>
                            {mine.risk}
                          </span>
                          <span className="text-muted-foreground">· {RISK_LABEL[band]}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-foreground">{mine.compliance}%</td>
                      <td className="px-3 py-3 font-mono text-foreground">{mine.open_issues}</td>
                      <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">
                        {mine.last_inspection}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border px-5 py-3.5 text-[#b45309]">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <p className="text-[13px]">{signalText(mines[0]?.risk ?? 0)}</p>
        </div>
      </div>

      {/* Feature 5 — AI depth: per-mine factor breakdown ("why this risk?"). */}
      {top && !isPending && !explainPending ? (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              Risk drivers — {top.name}
            </p>
            <span className="flex items-center gap-1 rounded border border-primary/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
              <Sparkles className="h-2.5 w-2.5" />
              AI decision support
            </span>
          </div>
          <div className="px-5 py-3">
            <p className="font-mono text-[11px] text-muted-foreground">
              Score {explain?.score}/100 ·
              {riskBand(explain?.score ?? 0)} band ·
              computed {explain?.computed_at?.slice(0, 16).replace("T", " ") ?? "—"}
            </p>
            <div className="mt-3 space-y-2">
              {(explain?.factors ?? []).length > 0 ? (
                (explain?.factors ?? []).map((f) => (
                  <div key={f.factor} className="flex items-start gap-2 text-[12px]">
                    <span className="mt-0.5 shrink-0 font-mono text-[10px] text-muted-foreground">
                      {f.delta > 0 ? "+" : ""}{f.delta}
                    </span>
                    <div className="flex-1">
                      <p className="text-foreground">{f.factor.replace(/_/g, " ")}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-muted-foreground">No contributing factors recorded.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* B2/E — violations with contractor attribution + root-cause grouping. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="violations-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary flex items-center gap-1.5">
              <ShieldAlert className="h-3 w-3" />
              Open violations
            </p>
            <span className="font-mono text-[11px] text-muted-foreground" data-testid="violations-count">
              {violationsPending ? "…" : `${violations.length} open`}
            </span>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {!violationsPending && violations.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">No open violations in your scope.</p>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Observation</th>
                    <th className="px-3 py-2 font-medium">Mine</th>
                    <th className="px-3 py-2 font-medium">Sev</th>
                    <th className="px-5 py-2 font-medium">Contractor</th>
                  </tr>
                </thead>
                <tbody>
                  {(violationsPending ? [] : violations).slice(0, 30).map((v) => (
                    <tr key={v.id} className="border-b border-border last:border-b-0">
                      <td className="max-w-[220px] px-5 py-2.5" title={`${v.section} — ${v.title}`}>
                        <p className="truncate font-medium text-foreground">{v.title}</p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">{v.section}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {v.mine_id}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            v.severity === 3
                              ? "bg-destructive/15 text-destructive"
                              : v.severity === 2
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          S{v.severity}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-[12px] text-foreground">
                        {v.contractor_name ?? <span className="text-muted-foreground">unassigned</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="root-cause-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              Root cause — {top?.name ?? "—"}
            </p>
            <span className="flex items-center gap-1 rounded border border-primary/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
              <Sparkles className="h-2.5 w-2.5" />
              AI decision support
            </span>
          </div>
          <div className="px-5 py-4">
            {rootPending ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-6 animate-pulse rounded bg-secondary" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    By section
                  </p>
                  <div className="mt-1.5 space-y-1.5">
                    {(rootCause?.by_section ?? []).slice(0, 6).map((s) => (
                      <div key={s.section} className="flex items-center gap-2 text-[12px]">
                        <span className="min-w-0 flex-1 truncate text-foreground">{s.section}</span>
                        <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${Math.min(100, (s.n / Math.max(1, rootCause?.by_section[0]?.n ?? 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                          {s.n}
                        </span>
                      </div>
                    ))}
                    {(rootCause?.by_section ?? []).length === 0 && (
                      <p className="text-[12px] text-muted-foreground">No open violations for this mine.</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    By contractor
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(rootCause?.by_contractor ?? []).slice(0, 6).map((c) => (
                      <span
                        key={c.contractor_id}
                        className="rounded border border-border px-2 py-1 text-[11px] text-foreground"
                      >
                        {c.name ?? c.contractor_id}
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">×{c.n}</span>
                      </span>
                    ))}
                    {(rootCause?.by_contractor ?? []).length === 0 && (
                      <span className="text-[12px] text-muted-foreground">No contractor-attributed issues.</span>
                    )}
                  </div>
                </div>
                {(rootCause?.patterns ?? []).length > 0 && (
                  <p className="text-[12px] text-muted-foreground">
                    {rootCause?.patterns.length} cross-mine repeat pattern(s) include this mine.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
