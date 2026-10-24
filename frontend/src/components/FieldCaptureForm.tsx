import { useRef, useState } from "react";
import { ClipboardList, Camera, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFieldQueue, type FieldCaptureInput } from "@/components/FieldQueue";
import { useMines } from "@/lib/mines";

// B1/E — the real field capture form: mine, observation vs violation, note,
// severity + section (violations feed the risk engine), camera photo and GPS.
// Everything queues locally and syncs when the device is online.

const MAX_EDGE = 900;

// Downscale in-browser so a capture photo fits comfortably in localStorage
// (a 12MP phone photo would otherwise blow the quota in two records).
function downscalePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not read image"));
    };
    img.src = url;
  });
}

export default function FieldCaptureForm({ onDone }: { onDone?: () => void }) {
  const { data: minesData } = useMines();
  const mines = minesData?.items ?? [];
  const { addCapture } = useFieldQueue();

  const [mineId, setMineId] = useState("");
  const [kind, setKind] = useState<"observation" | "violation">("observation");
  const [note, setNote] = useState("");
  const [section, setSection] = useState("");
  const [severity, setSeverity] = useState<1 | 2 | 3>(2);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await downscalePhoto(file);
      setPhoto(dataUrl);
      setPhotoName(file.name);
    } catch {
      toast.error("Could not read that photo — try another file");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mineId || note.trim().length < 5) return;
    setBusy(true);
    try {
      const input: FieldCaptureInput = {
        mine_id: mineId,
        kind,
        note: note.trim(),
        section: kind === "violation" ? section.trim() || "Field observation" : undefined,
        severity: kind === "violation" ? severity : undefined,
        photo: photo ?? undefined,
      };
      const shown = await addCapture(input);
      toast.success(
        navigator.onLine ? "Capture queued & syncing" : "Capture saved offline",
        { description: `${shown.id} · SHA-256 sealed` },
      );
      setNote("");
      setSection("");
      setPhoto(null);
      setPhotoName(null);
      if (fileRef.current) fileRef.current.value = "";
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm" data-testid="capture-form-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
          New field record
        </p>
        <span className="font-mono text-[10px] text-muted-foreground">geo-tagged · sealed</span>
      </div>

      <form onSubmit={submit} className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="capture-mine" className="mb-1 block text-[11px] text-muted-foreground">
              Mine <span className="text-destructive">*</span>
            </label>
            <select
              id="capture-mine"
              data-testid="capture-mine-select"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[13px] shadow-xs"
              value={mineId}
              onChange={(e) => setMineId(e.target.value)}
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
            <span className="mb-1 block text-[11px] text-muted-foreground">Record type</span>
            <div className="flex h-9 overflow-hidden rounded-md border border-input">
              {(["observation", "violation"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  data-testid={`capture-kind-${k}`}
                  onClick={() => setKind(k)}
                  className={`flex-1 px-3 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                    kind === k
                      ? k === "violation"
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {kind === "violation" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="capture-section" className="mb-1 block text-[11px] text-muted-foreground">
                Section / location
              </label>
              <Input
                id="capture-section"
                data-testid="capture-section-input"
                placeholder="e.g. South Ramp, Dump Yard"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="capture-severity" className="mb-1 block text-[11px] text-muted-foreground">
                Severity
              </label>
              <select
                id="capture-severity"
                data-testid="capture-severity-select"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[13px] shadow-xs"
                value={severity}
                onChange={(e) => setSeverity(Number(e.target.value) as 1 | 2 | 3)}
              >
                <option value={1}>1 — Minor</option>
                <option value={2}>2 — Significant</option>
                <option value={3}>3 — Critical</option>
              </select>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="capture-note" className="mb-1 block text-[11px] text-muted-foreground">
            Observation <span className="text-destructive">*</span>
          </label>
          <textarea
            id="capture-note"
            data-testid="capture-note-input"
            className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] shadow-xs"
            placeholder={
              kind === "violation"
                ? "What is wrong, where exactly, who is involved…"
                : "What did you observe on site…"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            minLength={5}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="capture-photo"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-[12px] text-foreground transition-colors hover:bg-secondary"
          >
            <Camera className="h-3.5 w-3.5" />
            {photoName ? "Change photo" : "Attach photo"}
          </label>
          <input
            id="capture-photo"
            ref={fileRef}
            data-testid="capture-photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handlePhoto(e.target.files?.[0])}
          />
          {photo && <span className="font-mono text-[11px] text-primary">photo ready · downscaled</span>}

          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            GPS captured on save
          </span>
        </div>

        <Button
          type="submit"
          data-testid="capture-submit-button"
          disabled={busy || !mineId || note.trim().length < 5}
          className="w-full"
        >
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-1 h-4 w-4" />}
          {busy ? "Sealing…" : "Save to offline queue"}
        </Button>
        <p className="font-mono text-[10px] text-muted-foreground">
          {navigator.onLine
            ? "Online — the queue flushes to the server right after saving."
            : "Offline — records stay queued on this device and sync automatically."}
        </p>
      </form>
    </div>
  );
}
