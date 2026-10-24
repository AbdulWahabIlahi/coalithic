import { useQuery } from "@tanstack/react-query";

export type ReportType = "compliance" | "inspection" | "contractor" | "environment" | "monthly";

export interface ReportSpec {
  label: string;
  filename: string;
}

export const REPORT_SPECS: Record<ReportType, ReportSpec> = {
  compliance: { label: "Statutory Compliance Register", filename: "coalsmart-compliance" },
  inspection: { label: "Inspection & Safety Register", filename: "coalsmart-inspection" },
  contractor: { label: "Contractor Register", filename: "coalsmart-contractors" },
  environment: { label: "Environment & Sensor Register", filename: "coalsmart-environment" },
  monthly: { label: "Monthly Governance Summary", filename: "coalsmart-monthly-governance" },
};

export type ReportKind = "csv" | "xls" | "pdf";

export function downloadReport(type: ReportType, kind: ReportKind): void {
  const url = `/api/reports/${type}.${kind}`;
  const link = document.createElement("a");
  link.href = url;
  link.download = `${REPORT_SPECS[type].filename}-${new Date().toISOString().slice(0, 10)}.${kind}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function useReportTypes() {
  return useQuery({
    queryKey: ["reports", "types"],
    queryFn: () => Promise.resolve(Object.entries(REPORT_SPECS).map(([key, spec]) => ({ key: key as ReportType, ...spec }))),
    retry: false,
  });
}
