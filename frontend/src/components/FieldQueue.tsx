import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { INITIAL_LAST_CAPTURE } from "@/lib/demo";

export interface FieldCapture {
  id: string; // "OBS-7A31F2"
  saved: string;
}

export interface FieldCaptureInput {
  mine_id?: string | null;
  kind?: "observation" | "violation";
  note?: string;
  section?: string;
  severity?: 1 | 2 | 3;
  photo?: string; // base64 data URL — kept out of the sealed canonical payload
}

interface FieldQueueValue {
  queueCount: number;
  online: boolean;
  lastCapture: FieldCapture;
  addCapture: (input?: FieldCaptureInput) => Promise<FieldCapture>;
  syncQueue: () => Promise<number>;
}

// Device-side offline queue (Feature 1): records seal on the device with SHA-256 and
// persist in localStorage until the sync POST to /api/field/captures/sync succeeds.
// Photos ride along as downscaled data URLs (localStorage only — no IndexedDB per
// project rule); under quota pressure the oldest photos are dropped first so the
// geo-tagged metadata always survives.
const QUEUE_KEY = "coalsmart.field.queue.v1";
const DEVICE_KEY = "coalsmart.field.device.v1";
const LAST_SYNC_KEY = "coalsmart.field.last_sync.v1";

interface QueuedCapture {
  client_id: string;
  mine_id: string | null;
  kind: string;
  note: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  captured_at: string;
  client_seal: string;
  section?: string;
  severity?: number;
  photo?: string;
}

const FieldQueueContext = createContext<FieldQueueValue | null>(null);

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev-${Math.random().toString(16).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function loadQueue(): QueuedCapture[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedCapture[]) {
  const write = (q: QueuedCapture[]) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  try {
    write(queue);
  } catch {
    // Quota exceeded: strip the oldest photos (metadata stays queued for sync).
    try {
      write(queue.map((c, i) => (i < queue.length - 5 ? { ...c, photo: undefined } : c)));
    } catch {
      // Storage unavailable (private mode) — the session stays in memory.
    }
  }
}

// Must stay byte-identical with canonical() in backend/src/routes/field.js.
// section/severity/photo are deliberately NOT sealed — only the geo/temporal core is.
function canonical(c: Omit<QueuedCapture, "client_seal" | "section" | "severity" | "photo">): string {
  return JSON.stringify({
    client_id: c.client_id,
    mine_id: c.mine_id ?? null,
    kind: c.kind,
    note: c.note ?? "",
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    accuracy_m: c.accuracy_m ?? null,
    captured_at: c.captured_at,
  });
}

async function sealCapture(c: Omit<QueuedCapture, "client_seal" | "section" | "severity" | "photo">): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(c)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newClientId(): string {
  return `OBS-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

function savedLabel(savedAtMs: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - savedAtMs) / 60_000));
  const when = mins < 1 ? "just now" : mins === 1 ? "1 min ago" : `${mins} min ago`;
  return `Saved ${when} · SHA-256 sealed`;
}

function readLastSync(): FieldCapture | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_SYNC_KEY) ?? "null");
    if (raw && typeof raw.id === "string" && typeof raw.savedAtMs === "number") {
      return { id: raw.id, saved: `Synced ${raw.syncedCount} record(s) · ${savedLabel(raw.savedAtMs)}` };
    }
    return null;
  } catch {
    return null;
  }
}

function geolocate(): Promise<{ lat: number; lng: number; accuracy_m: number } | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 60_000 },
    );
  });
}

export function FieldQueueProvider({ children }: { children: ReactNode }) {
  const initial = loadQueue();
  const [queue, setQueue] = useState<QueuedCapture[]>(initial);
  // Synchronous mirror of the queue so an auto-flush right after addCapture
  // (before React re-renders) still sees the fresh record.
  const queueRef = useRef<QueuedCapture[]>(initial);
  const syncRef = useRef<() => Promise<number>>(async () => 0);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [lastCapture, setLastCapture] = useState<FieldCapture>(
    () => initial.at(-1)
      ? { id: initial.at(-1)!.client_id, saved: savedLabel(Date.parse(initial.at(-1)!.captured_at)) }
      : (readLastSync() ?? INITIAL_LAST_CAPTURE),
  );

  useEffect(() => {
    saveQueue(queue);
    queueRef.current = queue;
  }, [queue]);

  const syncQueue = useMemo<() => Promise<number>>(
    () => async () => {
      const pending = queueRef.current;
      if (pending.length === 0) return 0;
      let syncedCount = 0;
      try {
        const result = await apiPost<{
          synced: { client_id: string }[];
          rejected: { client_id: string }[];
        }>("/field/captures/sync", { device_id: deviceId(), captures: pending });
        const flushedIds = new Set([
          ...result.synced.map((s) => s.client_id),
          ...result.rejected.map((r) => r.client_id),
        ]);
        syncedCount = result.synced.length;
        const remaining = pending.filter((c) => !flushedIds.has(c.client_id));
        queueRef.current = remaining;
        setQueue(remaining);
        localStorage.setItem(
          LAST_SYNC_KEY,
          JSON.stringify({ id: pending.at(-1)?.client_id ?? "—", syncedCount, savedAtMs: Date.now() }),
        );
        setLastCapture(
          readLastSync() ?? { id: pending.at(-1)?.client_id ?? "—", saved: `Synced ${syncedCount} record(s)` },
        );
        if (syncedCount > 0) {
          void queryClient.invalidateQueries({ queryKey: ["field", "captures"] });
        }
      } catch {
        // Offline / server down: records stay queued on the device — that's the point.
        return 0;
      }
      return syncedCount;
    },
    [],
  );

  useEffect(() => {
    syncRef.current = syncQueue;
  }, [syncQueue]);

  // Background sync (TODOLISTV2 #1): flush whenever connectivity returns, plus
  // a gentle retry loop while records remain queued.
  useEffect(() => {
    const flush = () => {
      if (navigator.onLine) void syncRef.current();
    };
    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    const timer = setInterval(flush, 45_000);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, []);

  const value = useMemo<FieldQueueValue>(
    () => ({
      queueCount: queue.length,
      online,
      lastCapture,
      addCapture: async (input) => {
        const geo = await geolocate();
        const base = {
          client_id: newClientId(),
          mine_id: input?.mine_id ?? null,
          kind: input?.kind ?? "observation",
          note: input?.note ?? "",
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          accuracy_m: geo?.accuracy_m ?? null,
          captured_at: new Date().toISOString(),
          section: input?.section || undefined,
          severity: input?.severity ?? undefined,
          photo: input?.photo || undefined,
        };
        const client_seal = await sealCapture(base);
        const capture: QueuedCapture = { ...base, client_seal };
        const next = [...queueRef.current, capture];
        queueRef.current = next;
        setQueue(next);
        const shown: FieldCapture = {
          id: capture.client_id,
          saved: savedLabel(Date.now()),
        };
        setLastCapture(shown);
        if (navigator.onLine) {
          // let the effect persist first, then flush the fresh queue
          setTimeout(() => void syncRef.current(), 50);
        }
        return shown;
      },
      syncQueue,
    }),
    [queue, online, lastCapture, syncQueue],
  );

  return <FieldQueueContext.Provider value={value}>{children}</FieldQueueContext.Provider>;
}

export function useFieldQueue(): FieldQueueValue {
  const ctx = useContext(FieldQueueContext);
  if (!ctx) throw new Error("useFieldQueue must be used inside FieldQueueProvider");
  return ctx;
}
