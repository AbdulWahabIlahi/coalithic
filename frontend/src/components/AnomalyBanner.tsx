import { useNavigate } from "react-router-dom";
import { ChevronRight, Gauge } from "lucide-react";
import { ANOMALY } from "@/lib/demo";
import { useAnomalies } from "@/lib/anomalies";

// Feature 6: live top anomaly from the engine, demo copy as fallback.
export default function AnomalyBanner() {
  const navigate = useNavigate();
  const { data } = useAnomalies();
  const top = data?.items[0];

  const title = top
    ? top.kind === "production" ? "Production anomaly detected" : "Environmental limit breach"
    : ANOMALY.title;
  const body = top?.detail ?? ANOMALY.body;
  const action = top ? `Review ${top.mine_id}` : ANOMALY.action;

  return (
    <div
      data-testid="anomaly-banner"
      className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-secondary px-5 py-4"
    >
      <Gauge className="h-5 w-5 shrink-0 text-chart-3" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-accent-foreground">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-accent-foreground">{body}</p>
      </div>
      <button
        data-testid="anomaly-review-link"
        onClick={() => navigate("/mines")}
        className="flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-accent-foreground transition-colors hover:text-primary"
      >
        {action}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
