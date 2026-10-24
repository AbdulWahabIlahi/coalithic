import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { headcountTrend, useAttendanceMine, useRecordAttendance } from "@/lib/attendance";
import { toast } from "sonner";

interface AttendancePanelProps {
  mineId: string;
  mineName: string;
}

// Feature 11 — attendance on the mine profile: live headcount badge + 14-day trend,
// with an inline muster form so the officer can record today from the control room.
export default function AttendancePanel({ mineId, mineName }: AttendancePanelProps) {
  const { data, isPending } = useAttendanceMine(mineId, 14);
  const record = useRecordAttendance();
  const items = data?.items ?? [];
  const latest = items[0];
  const trend = headcountTrend(items);
  const [form, setForm] = useState({ workers_in: "", workers_out: "", headcount: "" });

  const maxHeadcount = Math.max(1, ...items.map((r) => r.headcount));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const today = new Date().toISOString().slice(0, 10);
    record.mutate(
      {
        mine_id: mineId,
        work_date: today,
        workers_in: Number(form.workers_in) || 0,
        workers_out: Number(form.workers_out) || 0,
        headcount: Number(form.headcount) || 0,
      },
      {
        onSuccess: () => toast.success("Muster recorded", { description: `${mineName} · ${today}` }),
        onError: () => toast.error("Could not record muster"),
      },
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="attendance-panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
          Attendance — {mineName}
        </p>
        {latest ? (
          <span
            data-testid="attendance-headcount-badge"
            className="rounded bg-accent px-2 py-0.5 font-mono text-[11px] font-medium text-accent-foreground"
          >
            {latest.headcount} present · {latest.work_date}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
        <div>
          {isPending ? (
            <div className="h-24 animate-pulse rounded bg-secondary" />
          ) : items.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No muster recorded yet.</p>
          ) : (
            <>
              <div className="flex items-end gap-3" data-testid="attendance-trend">
                {items
                  .slice(0, 14)
                  .reverse()
                  .map((r) => (
                    <div key={r.id} className="flex flex-1 flex-col items-center gap-1" title={`${r.work_date}: ${r.headcount}`}>
                      <div
                        className="w-full rounded-sm bg-primary/70"
                        style={{ height: `${Math.max(6, (r.headcount / maxHeadcount) * 72)}px` }}
                      />
                      <span className="font-mono text-[9px] text-muted-foreground">{r.work_date.slice(8)}</span>
                    </div>
                  ))}
              </div>
              <p className="mt-3 font-mono text-[11px] text-muted-foreground" data-testid="attendance-trend-label">
                14-day trend ·{" "}
                {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}{" "}
                {Math.abs(trend.pct)}% vs previous day · in {latest.workers_in} / out {latest.workers_out} today
              </p>
            </>
          )}
        </div>

        <form onSubmit={submit} className="space-y-2">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <CalendarCheck className="h-3.5 w-3.5" /> Record today's muster
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Input
              data-testid="attendance-in-input"
              type="number"
              min={0}
              placeholder="In"
              value={form.workers_in}
              onChange={(e) => setForm({ ...form, workers_in: e.target.value })}
            />
            <Input
              data-testid="attendance-out-input"
              type="number"
              min={0}
              placeholder="Out"
              value={form.workers_out}
              onChange={(e) => setForm({ ...form, workers_out: e.target.value })}
            />
            <Input
              data-testid="attendance-headcount-input"
              type="number"
              min={0}
              placeholder="Head"
              value={form.headcount}
              onChange={(e) => setForm({ ...form, headcount: e.target.value })}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="w-full"
            data-testid="attendance-record-button"
            disabled={record.isPending || !form.headcount}
          >
            {record.isPending ? "Recording…" : "Record muster"}
          </Button>
        </form>
      </div>
    </div>
  );
}
