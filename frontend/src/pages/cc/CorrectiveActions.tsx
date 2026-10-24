import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCorrectiveActions,
  submitCorrectiveAction,
  updateCorrectiveAction,
  stateTone,
} from "@/lib/corrective_actions";

// Corrective actions: officers submit fixes with photo proof; corporate/regulator
// approve or reject. Approving an action resolves the compliance item and refreshes
// the mine risk score.
const STATE_LEGEND: Array<[string, string]> = [
  ["open", "Watch"],
  ["submitted", "Pending review"],
  ["approved", "Resolved"],
  ["rejected", "Rejected"],
];

export default function CorrectiveActions() {
  const { data, isPending } = useCorrectiveActions();
  const actions = data?.items ?? [];
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    item_id: "",
    assignee: "",
    deadline: "",
    proof_photo_url: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitCorrectiveAction({
        item_id: form.item_id,
        assignee: form.assignee,
        deadline: form.deadline,
        proof_photo_url: form.proof_photo_url || null,
      });
      setForm({ item_id: "", assignee: "", deadline: "", proof_photo_url: "" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStateChange = async (id: string, state: "submitted" | "approved" | "rejected") => {
    await updateCorrectiveAction(id, { state, resolved_by: "current-user" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Corrective actions / Approval workflow"
        title="Fix, prove, approve, close."
        sub="Officers submit corrective actions with photo proof; corporate and regulators approve or reject."
        action={
          <Button variant="outline" size="sm" disabled={isPending || submitting}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="rounded-lg border border-[#e3ebe6] bg-white shadow-sm">
            <div className="border-b border-[#e3ebe6] px-5 py-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
                Submit corrective action
              </p>
            </div>
            <div className="p-5 space-y-3">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-[#64748b] mb-1">Compliance item ID</p>
                    <Input
                      placeholder="e.g. K-04"
                      value={form.item_id}
                      onChange={(e) => setForm({ ...form, item_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <p className="text-[11px] text-[#64748b] mb-1">Assignee (officer)</p>
                    <Input
                      value={form.assignee}
                      onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-[#64748b] mb-1">Deadline</p>
                    <Input
                      type="date"
                      value={form.deadline}
                      onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    />
                  </div>
                  <div>
                    <p className="text-[11px] text-[#64748b] mb-1">Proof photo URL</p>
                    <Input
                      placeholder="/uploads/field/CAP-xxxx.jpg"
                      value={form.proof_photo_url}
                      onChange={(e) => setForm({ ...form, proof_photo_url: e.target.value })}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={submitting || !form.item_id || !form.assignee || !form.deadline}>
                  {submitting ? "Submitting…" : "Submit corrective action"}
                </Button>
              </form>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-[#e3ebe6] bg-white shadow-sm">
            <div className="border-b border-[#e3ebe6] px-5 py-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
                Action register
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="font-mono text-[10px] tracking-[0.14em] text-[#64748b] uppercase">
                    <th className="px-5 py-3">ID</th>
                    <th className="px-3 py-3">Item</th>
                    <th className="px-3 py-3">Mine</th>
                    <th className="px-3 py-3">Assignee</th>
                    <th className="px-3 py-3">Deadline</th>
                    <th className="px-3 py-3">State</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3ebe6]">
                  {isPending ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-[12px] text-[#94a3b8]">
                        Loading actions…
                      </td>
                    </tr>
                  ) : actions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-[12px] text-[#94a3b8]">
                        No corrective actions yet.
                      </td>
                    </tr>
                  ) : (
                    actions.map((a) => (
                      <tr key={a.id} className="hover:bg-[#f8faf9]">
                        <td className="px-5 py-3 font-mono text-[#334155]">{a.id}</td>
                        <td className="px-3 py-3">
                          <span className="font-medium text-[#1e293b]">{a.item_title}</span>
                          <br />
                          <span className="font-mono text-[11px] text-[#94a3b8]">{a.item_id}</span>
                        </td>
                        <td className="px-3 py-3 text-[#475569]">{a.mine_name}</td>
                        <td className="px-3 py-3 text-[#475569]">{a.assignee}</td>
                        <td className="px-3 py-3 font-mono text-[#334155]">{a.deadline}</td>
                        <td className="px-3 py-3">
                          <span className={`font-mono font-semibold ${stateTone(a.state)}`}>
                            {a.state}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {a.state === "open" && (
                            <Button size="sm" onClick={() => void handleStateChange(a.id, "submitted")}>
                              Mark submitted
                            </Button>
                          )}
                          {(a.state === "submitted") && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => void handleStateChange(a.id, "approved")}>
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void handleStateChange(a.id, "rejected")}>
                                Reject
                              </Button>
                            </div>
                          )}
                          {a.state === "approved" && (
                            <span className="text-[11px] text-[#16a34a]">Approved · item resolved</span>
                          )}
                          {a.state === "rejected" && (
                            <span className="text-[11px] text-[#dc2626]">Rejected</span>
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
          <div className="rounded-lg border border-[#e3ebe6] bg-white p-5 shadow-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
              How it works
            </p>
            <ul className="mt-4 space-y-3 text-[12px] text-[#475569]">
              <li className="flex gap-2">
                <span className="shrink-0 text-[#0d9488]">1</span>
                Officer submits a corrective action for a compliance item with photo proof.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-[#0d9488]">2</span>
                Action moves to "submitted" and appears in the corporate approval queue.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-[#0d9488]">3</span>
                Corporate / Regulator approves or rejects with reason.
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-[#0d9488]">4</span>
                Approval resolves the compliance item and refreshes the mine risk score.
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-[#e3ebe6] bg-white p-5 shadow-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
              State legend
            </p>
            <div className="mt-4 space-y-2">
              {STATE_LEGEND.map(([state, label]) => (
                <div key={state} className="flex items-center gap-3">
                  <span className={`w-20 font-mono text-[11px] ${stateTone(state)}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
