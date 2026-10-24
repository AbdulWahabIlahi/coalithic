import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useEnvironmentLimits,
  useEnvironmentLatest,
  useEnvironmentBreaches,
  updateLimit,
  breachTone,
  limitDirectionArrow,
} from "@/lib/environment";

// Environment monitoring: live sensor readings against canonical thresholds.
export default function Environment() {
  const { data: limitsData, isPending: limitsPending } = useEnvironmentLimits();
  const { data: latestData, isPending: latestPending } = useEnvironmentLatest();
  const { data: breachesData, isPending: breachesPending } = useEnvironmentBreaches();
  const [editing, setEditing] = useState<string | null>(null);
  const [limitValue, setLimitValue] = useState("");
  const [unitValue, setUnitValue] = useState("");
  const [directionValue, setDirectionValue] = useState<"max" | "min">("max");

  const limits = limitsData?.items ?? [];
  const latest = latestData?.items ?? [];
  const breaches = breachesData?.items ?? [];

  const handleSaveLimit = async (metric: string) => {
    await updateLimit(metric, {
      limit_value: Number(limitValue),
      unit: unitValue,
      direction: directionValue,
    });
    setEditing(null);
    setLimitValue("");
    setUnitValue("");
    setDirectionValue("max");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Environment / Sensor telemetry"
        title="Air, water, dust and noise within limits."
        sub="Latest reading per metric per mine, checked against statutory thresholds."
        action={
          <Button variant="outline" size="sm" disabled={limitsPending || latestPending}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="rounded-lg border border-[#e3ebe6] bg-white shadow-sm">
            <div className="border-b border-[#e3ebe6] px-5 py-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
                Latest readings by mine
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="font-mono text-[10px] tracking-[0.14em] text-[#64748b] uppercase">
                    <th className="px-5 py-3">Mine</th>
                    <th className="px-3 py-3">Metric</th>
                    <th className="px-3 py-3">Value</th>
                    <th className="px-3 py-3">Limit</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-5 py-3">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3ebe6]">
                  {latestPending ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-[12px] text-[#94a3b8]">
                        Loading telemetry…
                      </td>
                    </tr>
                  ) : latest.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-[12px] text-[#94a3b8]">
                        No sensor readings yet.
                      </td>
                    </tr>
                  ) : (
                    latest.map((r) => (
                      <tr key={`${r.mine_id}-${r.metric}`} className="hover:bg-[#f8faf9]">
                        <td className="px-5 py-3">
                          <span className="font-medium text-[#1e293b]">{r.mine_name}</span>
                          <br />
                          <span className="font-mono text-[11px] text-[#94a3b8]">{r.mine_id}</span>
                        </td>
                        <td className="px-3 py-3 font-mono text-[#475569]">{r.metric}</td>
                        <td className="px-3 py-3 font-mono text-[#334155]">
                          {r.value} {r.unit}
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px]">
                          {r.limit_value == null ? "—" : `${r.limit_value} ${r.unit}`}
                        </td>
                        <td className="px-3 py-3">
                          <span className={breachTone(r.breach)}>
                            {r.breach === 1 ? "BREACH" : "OK"}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-[11px] text-[#64748b]">
                          {r.recorded_at.slice(0, 16).replace("T", " ")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-lg border border-[#e3ebe6] bg-white p-5 shadow-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
              Threshold configuration
            </p>
            <div className="mt-4 space-y-3">
              {limits.map((l) =>
                editing === l.metric ? (
                  <div key={l.metric} className="rounded border border-[#e3ebe6] bg-[#f8faf9] p-3">
                    <span className="font-mono text-[11px] text-[#475569]">{l.metric}</span>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input value={limitValue} onChange={(e) => setLimitValue(e.target.value)} className="w-20 text-[11px]" aria-label={`Limit for ${l.metric}`} />
                      <Input value={unitValue} onChange={(e) => setUnitValue(e.target.value)} className="w-16 text-[11px]" aria-label={`Unit for ${l.metric}`} />
                      <select
                        value={directionValue}
                        onChange={(e) => setDirectionValue(e.target.value as "max" | "min")}
                        className="w-16 rounded border border-[#e3ebe6] bg-white px-1.5 text-[11px]"
                        aria-label={`Direction for ${l.metric}`}
                      >
                        <option value="max">max</option>
                        <option value="min">min</option>
                      </select>
                      <Button size="sm" onClick={() => void handleSaveLimit(l.metric)}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div key={l.metric} className="flex items-center gap-3 rounded border border-[#e3ebe6] bg-[#f8faf9] px-3 py-2">
                    <span className="w-20 font-mono text-[11px] text-[#475569]">{l.metric}</span>
                    <span className="min-w-0 flex-1 text-[12px] text-[#334155]">
                      {l.limit_value} {l.unit} {limitDirectionArrow(l.direction)}
                    </span>
                    <Button size="sm" onClick={() => {
                      setEditing(l.metric);
                      setLimitValue(String(l.limit_value));
                      setUnitValue(l.unit);
                      setDirectionValue(l.direction);
                    }}>
                      Edit
                    </Button>
                  </div>
                ),
              )}
              {limits.length === 0 && (
                <p className="text-[12px] text-[#64748b]">No thresholds configured.</p>
              )}
            </div>
          </div>

          {/* B6 — every limit breach in scope, newest first. */}
          <div className="rounded-lg border border-[#e3ebe6] bg-white shadow-sm" data-testid="breach-history-card">
            <div className="flex items-center justify-between border-b border-[#e3ebe6] px-5 py-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
                Breach history
              </p>
              <span className="font-mono text-[11px] text-[#94a3b8]" data-testid="breach-count">
                {breachesPending ? "…" : `${breaches.length} logged`}
              </span>
            </div>
            <div className="max-h-[320px] divide-y divide-[#e3ebe6] overflow-y-auto">
              {breachesPending ? (
                <p className="px-5 py-6 text-[12px] text-[#94a3b8]">Loading breach log…</p>
              ) : breaches.length === 0 ? (
                <p className="px-5 py-6 text-[12px] text-[#94a3b8]">
                  No limit breaches recorded in your scope.
                </p>
              ) : (
                breaches.slice(0, 20).map((b) => (
                  <div key={b.id} className="px-5 py-2.5" data-testid="breach-row">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-[#dc2626]">
                        {b.metric}
                      </span>
                      <span className="font-mono text-[10px] text-[#94a3b8]">
                        {b.recorded_at.slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-[#475569]">
                      {b.mine_name} · {b.value} {b.unit} vs limit {b.limit_value} {b.unit}{" "}
                      {limitDirectionArrow(b.direction)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
