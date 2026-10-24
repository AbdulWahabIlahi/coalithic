import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useContractors,
  useExpiringContractors,
  updateContractor,
  complianceTone,
} from "@/lib/contractors";

// Contractors: approved vendors with certificate and workforce standing, now live.
export default function Contractors() {
  const { data, isPending } = useContractors();
  const { data: expiring } = useExpiringContractors();
  const [editing, setEditing] = useState<string | null>(null);
  const [expiryValue, setExpiryValue] = useState("");
  const contractors = data?.items ?? [];

  const handleSave = async (id: string) => {
    await updateContractor(id, { safety_cert_expiry: expiryValue || null });
    setEditing(null);
    setExpiryValue("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contractors / Approved vendors"
        title="Cleared to work the seam."
        sub="Certificate validity, workforce counts and standing for every contractor."
        action={
          <Button variant="outline" size="sm" disabled={isPending}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="rounded-lg border border-[#e3ebe6] bg-white shadow-sm">
            <div className="border-b border-[#e3ebe6] px-5 py-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
                Contractor register
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="font-mono text-[10px] tracking-[0.14em] text-[#64748b] uppercase">
                    <th className="px-5 py-3">Contractor</th>
                    <th className="px-3 py-3">Mine</th>
                    <th className="px-3 py-3">Contact</th>
                    <th className="px-3 py-3">Cert. expiry</th>
                    <th className="px-3 py-3">Standing</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e3ebe6]">
                  {isPending ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-[12px] text-[#94a3b8]">
                        Loading contractor register…
                      </td>
                    </tr>
                  ) : contractors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-[12px] text-[#94a3b8]">
                        No contractors on record.
                      </td>
                    </tr>
                  ) : (
                    contractors.map((c) => (
                      <tr key={c.id} className="hover:bg-[#f8faf9]">
                        <td className="px-5 py-3">
                          <span className="font-medium text-[#1e293b]">{c.name}</span>
                          <br />
                          <span className="font-mono text-[11px] text-[#94a3b8]">{c.id}</span>
                        </td>
                        <td className="px-3 py-3 text-[#475569]">
                          {c.mine_id ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-[#475569]">
                          {c.contact_name ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          {editing === c.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={expiryValue}
                                onChange={(e) => setExpiryValue(e.target.value)}
                                className="w-32 text-[11px]"
                              />
                              <Button
                                size="sm"
                                onClick={() => void handleSave(c.id)}
                                className="h-8 px-2"
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing(null)}
                                className="h-8 px-2"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className={cnInline(c.safety_cert_expiry ? "text-[#16a34a]" : "text-[#dc2626]")}>
                                {c.safety_cert_expiry ?? "not set"}
                              </span>
                              <button
                                onClick={() => {
                                  setEditing(c.id);
                                  setExpiryValue(c.safety_cert_expiry ?? "");
                                }}
                                className="ml-2 text-[11px] text-[#0d9488] hover:underline"
                              >
                                {editing === c.id ? "Editing" : "Edit expiry"}
                              </button>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`font-mono font-semibold ${complianceTone(c.compliance)}`}
                          >
                            {c.compliance}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[11px] text-[#64748b]">
                          {c.notes ?? "—"}
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
              Contractor standing
            </p>
            <dl className="mt-4 space-y-3">
              {[
                { k: "Active contractors", v: String(contractors.length) },
                {
                  k: "Certificates expiring",
                  v: String(expiring?.items?.length ?? 0),
                  tone: "text-[#b45309]",
                },
                {
                  k: "Compliant",
                  v: String(contractors.filter((c) => c.compliance === "compliant").length),
                  tone: "text-[#16a34a]",
                },
              ].map((row) => (
                <div key={row.k} className="flex items-center justify-between border-b border-[#e3ebe6] pb-3 last:border-b-0 last:pb-0">
                  <dt className="text-[13px] text-[#64748b]">{row.k}</dt>
                  <dd className={`font-mono text-[15px] font-semibold text-[#1e293b] ${row.tone ?? ""}`}>
                    {row.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {expiring?.items?.length && (
            <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-4 shadow-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#dc2626]">
                Expiring soon
              </p>
              <ul className="mt-3 space-y-2">
                {expiring.items.map((c) => (
                  <li key={c.id} className="text-[12px]">
                    <span className="font-medium text-[#1e293b]">{c.name}</span>{" "}
                    <span className="font-mono text-[11px] text-[#94a3b8]">
                      ({c.mine_id}) expires {c.safety_cert_expiry}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function cnInline(...classes: (string | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
