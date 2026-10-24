import { useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GRIEVANCE_CATEGORIES,
  grievanceStatusTone,
  slaLabel,
  useGrievances,
  useSubmitGrievance,
  useUpdateGrievance,
  type GrievanceCategory,
  type GrievanceStatus,
} from "@/lib/grievances";
import { useMines } from "@/lib/mines";

// Feature 12 — Grievance handling: worker complaints with a 72h SLA, triaged by
// the mine officer and visible portfolio-wide to corporate/regulator.
export default function Grievances() {
  const { data, isPending } = useGrievances();
  const grievances = data?.items ?? [];
  const { data: minesData } = useMines();
  const mines = minesData?.items ?? [];
  const submit = useSubmitGrievance();
  const update = useUpdateGrievance();
  const [form, setForm] = useState({
    mine_id: "",
    worker_name: "",
    category: "safety" as GrievanceCategory,
    description: "",
  });

  const openCount = grievances.filter((g) => g.status !== "resolved").length;
  const breachedCount = grievances.filter((g) => g.sla_breached).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit.mutate(
      {
        mine_id: form.mine_id,
        worker_name: form.worker_name || undefined,
        category: form.category,
        description: form.description,
      },
      {
        onSuccess: (res) => {
          toast.success("Grievance filed", { description: res.item.id });
          setForm({ mine_id: "", worker_name: "", category: "safety", description: "" });
        },
        onError: () => toast.error("Could not file grievance"),
      },
    );
  };

  const handleStatus = (id: string, status: GrievanceStatus) => {
    update.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(`Grievance ${status.replace("_", " ")}`, { description: id }),
        onError: () => toast.error("Could not update grievance"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Grievances / Worker voice"
        title="Raise it. Track it. Close it in 72 hours."
        sub="Worker grievances against a mine, with an SLA timer; breaches escalate through the alert engine."
        action={
          <div className="flex gap-2 font-mono text-[11px] text-muted-foreground">
            <span data-testid="grievance-open-count">{openCount} open</span>
            <span data-testid="grievance-breached-count" className={breachedCount > 0 ? "text-destructive" : ""}>
              {breachedCount} breached
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
                Grievance register
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    <th className="px-5 py-3">ID</th>
                    <th className="px-3 py-3">Mine</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3">Description</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">SLA</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isPending ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-[12px] text-muted-foreground">
                        Loading grievances…
                      </td>
                    </tr>
                  ) : grievances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-[12px] text-muted-foreground">
                        No grievances filed.
                      </td>
                    </tr>
                  ) : (
                    grievances.map((g) => (
                      <tr key={g.id} data-testid={`grievance-row-${g.id}`} className="hover:bg-secondary">
                        <td className="px-5 py-3 font-mono text-foreground">{g.id}</td>
                        <td className="px-3 py-3 text-muted-foreground">{g.mine_name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{g.category}</td>
                        <td className="max-w-[280px] px-3 py-3">
                          <span className="line-clamp-2 text-foreground">{g.description}</span>
                          {g.worker_name ? (
                            <span className="font-mono text-[10px] text-muted-foreground">— {g.worker_name}</span>
                          ) : (
                            <span className="font-mono text-[10px] text-muted-foreground">— anonymous</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`font-mono font-semibold ${grievanceStatusTone(g)}`}>{g.status}</span>
                        </td>
                        <td className={`px-3 py-3 font-mono ${g.sla_breached ? "text-destructive" : "text-muted-foreground"}`} data-testid={`grievance-sla-${g.id}`}>
                          {slaLabel(g)}
                        </td>
                        <td className="px-5 py-3">
                          {g.status === "open" && (
                            <Button size="sm" variant="outline" onClick={() => handleStatus(g.id, "in_review")}>
                              Triage
                            </Button>
                          )}
                          {g.status === "in_review" && (
                            <Button size="sm" onClick={() => handleStatus(g.id, "resolved")}>
                              Resolve
                            </Button>
                          )}
                          {g.status === "resolved" && (
                            <span className="text-[11px] text-muted-foreground">Closed</span>
                          )}
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
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              File a grievance
            </p>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">Mine</p>
                <select
                  data-testid="grievance-mine-select"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[13px] shadow-xs"
                  value={form.mine_id}
                  onChange={(e) => setForm({ ...form, mine_id: e.target.value })}
                  required
                >
                  <option value="">Select mine…</option>
                  {mines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">Category</p>
                <select
                  data-testid="grievance-category-select"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[13px] shadow-xs"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as GrievanceCategory })}
                >
                  {GRIEVANCE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">Worker name (optional)</p>
                <Input
                  data-testid="grievance-worker-input"
                  placeholder="Leave blank for anonymous"
                  value={form.worker_name}
                  onChange={(e) => setForm({ ...form, worker_name: e.target.value })}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">Description</p>
                <textarea
                  data-testid="grievance-description-input"
                  className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] shadow-xs"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                  minLength={5}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                data-testid="grievance-submit-button"
                disabled={submit.isPending || !form.mine_id || form.description.trim().length < 5}
              >
                {submit.isPending ? "Filing…" : "File grievance"}
              </Button>
            </form>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              How the SLA works
            </p>
            <ul className="mt-4 space-y-3 text-[12px] text-muted-foreground">
              <li className="flex gap-2">
                <span className="shrink-0 text-primary">1</span>
                A worker (or the officer on their behalf) files a grievance against a mine.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-primary">2</span>
                A 72-hour SLA starts; due-soon and breached grievances raise live alerts.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-primary">3</span>
                The officer triages (open → in_review) and resolves; every change is audit-sealed.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
