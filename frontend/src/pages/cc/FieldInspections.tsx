import { useState } from "react";
import { ClipboardList, CloudUpload, ShieldCheck, Wifi, WifiOff, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import AttentionQueue from "@/components/AttentionQueue";
import FieldCaptureForm from "@/components/FieldCaptureForm";
import PageHeader from "@/components/PageHeader";
import { useFieldQueue } from "@/components/FieldQueue";
import { useFieldCaptures, kindTone } from "@/lib/field";
import { ATTENTION_QUEUE } from "@/lib/demo";

// Field inspections: offline capture queue + synced server records with photos.
export default function FieldInspections() {
  const { queueCount, online, lastCapture, syncQueue } = useFieldQueue();
  const { data: capturesData, isPending } = useFieldCaptures(50);
  const [showForm, setShowForm] = useState(false);
  const rows = capturesData?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Field inspections / Device sync"
        title="Capture now, sync later."
        sub="Records are sealed on the device and stay queued until the next connection."
        action={
          <Button
            data-testid="inspection-capture-button"
            onClick={() => setShowForm((v) => !v)}
            className="h-10 active:scale-[0.99]"
          >
            <ClipboardList className="mr-1 h-4 w-4" />
            {showForm ? "Close form" : "New field capture"}
          </Button>
        }
      />

      {showForm && <FieldCaptureForm onDone={() => setShowForm(false)} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="sync-card">
            <div className="flex items-center justify-between px-5 pt-4">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
                Offline queue
              </p>
              <span
                className={`flex items-center gap-1.5 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] ${
                  online ? "text-primary" : "text-destructive"
                }`}
                data-testid="sync-online-status"
              >
                {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {online ? "online" : "offline"}
              </span>
            </div>
            <div className="px-5 pb-5 pt-1">
              <h2 className="text-lg font-medium text-foreground">Field sync</h2>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-secondary px-4 py-3.5">
                  <p className="text-[13px] text-muted-foreground">Queued records</p>
                  <p
                    className="mt-1 text-[30px] leading-none font-semibold text-foreground"
                    data-testid="sync-queue-count"
                  >
                    {queueCount}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-secondary px-4 py-3.5">
                  <p className="text-[13px] text-muted-foreground">Last capture</p>
                  <p className="mt-1 font-mono text-[13px] font-semibold text-primary">
                    {lastCapture.id}
                  </p>
                </div>
              </div>

              <p className="mt-3 font-mono text-[11px] text-muted-foreground" data-testid="last-capture-saved">
                {lastCapture.saved}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  data-testid="sync-queue-button"
                  variant="outline"
                  onClick={() => syncQueue()}
                  disabled={queueCount === 0}
                >
                  <CloudUpload />
                  Sync queue
                </Button>
                <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  SHA-256 sealed before upload
                </span>
              </div>
            </div>
          </div>

          <AttentionQueue />
        </div>

        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="inspection-protocol">
            <div className="px-5 pt-4">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
                Protocol
              </p>
            </div>
            <div className="px-5 pb-4 pt-1">
              <h2 className="text-lg font-medium text-foreground">Inspection checklist</h2>
            </div>
            <div className="border-t border-border">
              {ATTENTION_QUEUE.map((item, i) => (
                <div
                  key={`${item.title}-${i}`}
                  className="flex items-center gap-3.5 border-b border-border px-5 py-3.5 last:border-b-0"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-semibold text-accent-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-foreground">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Synced records — everything the queue has flushed to the server, with photos. */}
      <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="synced-records-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
            Synced records
          </p>
          <span className="font-mono text-[11px] text-muted-foreground" data-testid="synced-records-count">
            {isPending ? "…" : `${rows.length} record${rows.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">ID</th>
                <th className="px-3 py-2.5 font-medium">Mine</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Observation</th>
                <th className="px-3 py-2.5 font-medium">Geo</th>
                <th className="px-3 py-2.5 font-medium">Captured</th>
                <th className="px-5 py-2.5 font-medium">Photo</th>
              </tr>
            </thead>
            <tbody data-testid="synced-records-body">
              {isPending && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-muted-foreground">
                    Loading synced records…
                  </td>
                </tr>
              )}
              {!isPending && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-muted-foreground">
                    No synced captures yet — save one above and it lands here.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-2.5 font-mono text-[11px] text-primary">{r.id}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">{r.mine_id ?? "—"}</td>
                  <td className={`px-3 py-2.5 font-mono text-[11px] uppercase ${kindTone(r.kind)}`}>
                    {r.kind}
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2.5" title={r.note}>
                    {r.note || "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {r.lat != null ? `${r.lat.toFixed(3)}, ${r.lng?.toFixed(3)}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {new Date(r.captured_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-2.5">
                    {r.photo_url ? (
                      <a href={r.photo_url} target="_blank" rel="noreferrer" title={r.photo_url}>
                        <img
                          src={r.photo_url}
                          alt="capture"
                          className="h-8 w-8 rounded border border-border object-cover"
                        />
                      </a>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <ImageOff className="h-3 w-3" /> none
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
