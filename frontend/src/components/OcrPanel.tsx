import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileScan, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { extractDocument, type DocumentPrefill } from "@/lib/ocr";

// Feature 5 — One-Click OCR Auto-Fill: upload a certificate/photo, get a
// structured prefill, push it straight into the statutory register.
export default function OcrPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [prefill, setPrefill] = useState<DocumentPrefill | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setPrefill(null);
    try {
      const result = await extractDocument(file);
      setPrefill(result.prefill);
      setDocId(result.document_id);
      toast.success("Document parsed", { description: result.prefill.document_type });
    } catch (err) {
      const detail = (err as { body?: { detail?: string } })?.body?.detail;
      setError(detail ?? "Extraction failed — try a clearer photo or PDF");
    } finally {
      setBusy(false);
    }
  };

  const addToRegister = async () => {
    if (!prefill) return;
    setBusy(true);
    try {
      await apiPost("/compliance/items", {
        mine_id: prefill.mine_id,
        title: prefill.title,
        category: prefill.category,
        owner_role: "Mine Officer",
        due_date: prefill.expires_on ?? new Date().toISOString().slice(0, 10),
      });
      toast.success("Added to statutory register", { description: prefill.title });
      setPrefill(null);
      setDocId(null);
      if (fileRef.current) fileRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["compliance"] });
    } catch {
      toast.error("Could not add to register");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="ocr-panel">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
        OCR auto-fill
      </p>
      <h2 className="mt-3 text-lg font-medium text-foreground">Upload certificate</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Photo or PDF of a DGMS certificate, licence or inspection sheet — dates and
        contractor details are extracted into the register form.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        data-testid="ocr-file-input"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <Button
        variant="outline"
        className="mt-4 w-full"
        data-testid="ocr-upload-button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? <Loader2 className="animate-spin" /> : <FileScan />}
        {busy ? "Extracting…" : "Choose file"}
      </Button>

      {error && (
        <p className="mt-3 text-[13px] text-destructive" data-testid="ocr-error">
          {error}
        </p>
      )}

      {prefill && (
        <div className="mt-4 rounded-md border border-input bg-secondary p-3.5" data-testid="ocr-prefill">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
            Extracted · {docId}
          </p>
          <dl className="mt-2 space-y-1.5 text-[12px]">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Type</dt>
              <dd className="text-right font-medium text-foreground">{prefill.document_type}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Contractor</dt>
              <dd className="text-right font-medium text-foreground">{prefill.contractor_name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Mine</dt>
              <dd className="text-right font-medium text-foreground">
                {prefill.mine_id ?? prefill.mine_name ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Valid from</dt>
              <dd className="text-right font-mono text-foreground">{prefill.valid_from ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="text-right font-mono text-accent-foreground">{prefill.expires_on ?? "—"}</dd>
            </div>
          </dl>
          <Button
            className="mt-3 w-full"
            data-testid="ocr-add-button"
            disabled={busy}
            onClick={() => void addToRegister()}
          >
            <Plus />
            Add to register
          </Button>
        </div>
      )}
    </div>
  );
}
