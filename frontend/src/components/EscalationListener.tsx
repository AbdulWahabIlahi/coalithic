import { useEffect } from "react";
import { toast } from "sonner";

// Feature 3 push channel: escalation events stream from the backend over
// /api/ws (Vite proxies the upgrade in dev).
//
// The socket is only opened once GET /api/health confirms the real backend is
// up. In demo mode the mock API answers everything *except* /api/health, and a
// WebSocket to a server that isn't there makes Firefox log a console error on
// every attempt — so in mock mode (or while the backend is down) we quietly
// re-probe instead of connecting.
const PROBE_MS = 15_000;

export default function EscalationListener() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const schedule = (ms: number) => {
      if (disposed) return;
      if (retry) clearTimeout(retry);
      retry = setTimeout(probe, ms);
    };

    const probe = async () => {
      if (disposed) return;
      let live = false;
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        live = res.ok && body?.ok === true;
      } catch {
        live = false;
      }
      if (disposed) return;
      if (!live) return schedule(PROBE_MS);
      connect();
    };

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      try {
        ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      } catch {
        schedule(PROBE_MS);
        return;
      }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg?.type === "escalation" && msg.item) {
            const item = msg.item;
            const where = item.mine_id ? ` · ${item.mine_id}` : "";
            toast.warning(`${item.title}${where} — ${msg.previous_status} → ${item.status}`, {
              description: item.escalated_to
                ? `Escalated to ${item.escalated_to}`
                : `Due ${item.due_date}`,
              duration: 10_000,
            });
          }
          if (msg?.type === "alert" && msg.alert) {
            const a = msg.alert;
            const where = a.mine_id ? ` · ${a.mine_id}` : "";
            toast.warning(`${a.title}${where}`, {
              description: `${a.message} (${a.severity})`,
              duration: 10_000,
            });
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        // Backend went away (or the page is tearing down) — re-probe quietly
        // instead of hammering the socket.
        ws = null;
        schedule(PROBE_MS);
      };
      ws.onerror = () => ws?.close();
    };

    void probe();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return null;
}
