import { useNavigate } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import AttentionQueue from "@/components/AttentionQueue";
import IndiaRiskMap from "@/components/IndiaRiskMap";
import PageHeader from "@/components/PageHeader";
import PortfolioHealth from "@/components/PortfolioHealth";
import PrioritySignals from "@/components/PrioritySignals";
import StatStrip from "@/components/StatStrip";
import { useMines } from "@/lib/mines";
import { useMe } from "@/lib/session";

// The control-room home: date line, greeting, stat strip, live map, signals, queue.
export default function Overview() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data, isPending, isError, refetch } = useMines();

  const firstName = me?.user.name.split(" ")[0] ?? "Aarav";
  const eyebrow = `${me?.server.today_label ?? "NATIONAL OPERATIONS"} / NATIONAL OPERATIONS`;
  const greeting = `Good ${me?.server.part_of_day ?? "morning"}, ${firstName}.`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={eyebrow}
        title={greeting}
        sub="Here's the safety picture across your mine portfolio."
        action={
          <Button
            data-testid="new-field-capture-button"
            onClick={() => navigate("/inspections")}
            className="h-10 active:scale-[0.99]"
          >
            <ClipboardList className="mr-1 h-4 w-4" />
            New field capture
          </Button>
        }
      />

      <StatStrip />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <IndiaRiskMap
            mines={data?.items ?? []}
            loading={isPending}
            error={isError}
            onRefresh={() => void refetch()}
          />
          <PortfolioHealth today={data?.today} loading={isPending} />
        </div>
        <div className="space-y-6 lg:col-span-5">
          <PrioritySignals mines={data?.items ?? []} loading={isPending} error={isError} />
          <AttentionQueue />
        </div>
      </div>
    </div>
  );
}