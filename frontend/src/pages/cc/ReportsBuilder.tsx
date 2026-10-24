import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { downloadReport, REPORT_SPECS, type ReportKind, type ReportType } from "@/lib/reports";

// Reports & statutory export: one-click CSV/XLS/PDF for compliance, inspection,
// contractor, environment and monthly governance registers. Every export is
// sealed into the audit trail on the backend.
export default function ReportsBuilder() {
  const [lastExport, setLastExport] = useState<{ type: ReportType; kind: ReportKind } | null>(null);
  const types = Object.entries(REPORT_SPECS) as [ReportType, { label: string; filename: string }][];

  const handleExport = (type: ReportType, kind: ReportKind) => {
    downloadReport(type, kind);
    setLastExport({ type, kind });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports & statutory export"
        title="One-click regulatory reports."
        sub="Generate CSV, Excel or PDF extracts of any register. Exports are sealed into the audit trail."
        action={
          <Button variant="outline" size="sm">
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="rounded-lg border border-[#e3ebe6] bg-white shadow-sm">
            <div className="border-b border-[#e3ebe6] px-5 py-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
                Report builder
              </p>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[13px] text-[#64748b]">
                Select a register and format. The backend returns role-scoped data
                (mine officers see only their mine; corporate and regulators see all).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {types.map(([type, spec]) => (
                  <div key={type} className="flex items-center justify-between p-3 rounded border border-[#e3ebe6] bg-[#f8faf9]">
                    <div>
                      <p className="text-[13px] font-medium text-[#1e293b]">{spec.label}</p>
                      <p className="mt-0.5 text-xs text-[#64748b]">{spec.filename}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`export-${type}-csv`}
                        onClick={() => void handleExport(type, "csv")}
                      >
                        CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`export-${type}-xls`}
                        onClick={() => void handleExport(type, "xls")}
                      >
                        Excel
                      </Button>
                      <Button
                        size="sm"
                        data-testid={`export-${type}-pdf`}
                        onClick={() => void handleExport(type, "pdf")}
                      >
                        PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {lastExport && (
                <div className="mt-4 rounded bg-[#e9f2ed] border border-[#bfe3da] px-3 py-2">
                  <p className="text-[12px] text-[#0d9488]">
                    Exported <strong>{REPORT_SPECS[lastExport.type].label}</strong> as{" "}
                    <strong>{lastExport.kind.toUpperCase()}</strong>{" "}
                    <span className="font-mono text-[11px]">(check your downloads folder)</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-lg border border-[#e3ebe6] bg-white p-5 shadow-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
              Available registers
            </p>
            <div className="mt-4 space-y-3">
              {types.map(([type, spec]) => (
                <div key={type} className="flex items-center justify-between p-2.5 rounded border border-[#e3ebe6] bg-white">
                  <span className="text-[12px] text-[#475569]">{spec.label}</span>
                  <span className="font-mono text-[11px] text-[#0d9488]">{type}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[#e3ebe6] bg-white p-5 shadow-sm">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#0d9488]">
              Audit trail
            </p>
            <p className="mt-3 text-[12px] text-[#475569]">
              Every export appends an <code className="font-mono text-[#0d9488]">export:&lt;type&gt;.csv|xls|pdf</code>
              entry to the tamper-proof audit chain, so you can prove who extracted what and when.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
