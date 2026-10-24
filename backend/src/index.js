import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { UPLOADS_DIR } from "./db.js";
import { onEvent } from "./lib/bus.js";
import { auditMutationLogger } from "./lib/audit.js";
import { startEscalationTicker } from "./engine/escalation.js";
import { startAlertTicker } from "./engine/alerts.js";
import authRouter from "./routes/auth.js";
import minesRouter from "./routes/mines.js";
import fieldRouter from "./routes/field.js";
import riskRouter from "./routes/risk.js";
import complianceRouter from "./routes/compliance.js";
import dashboardRouter from "./routes/dashboards.js";
import documentsRouter from "./routes/documents.js";
import anomaliesRouter from "./routes/anomalies.js";
import auditRouter from "./routes/audit.js";
import reportsRouter from "./routes/reports.js";
import alertsRouter from "./routes/alerts.js";
import contractorsRouter from "./routes/contractors.js";
import environmentRouter from "./routes/environment.js";
import correctiveActionsRouter from "./routes/corrective_actions.js";
import attendanceRouter from "./routes/attendance.js";
import grievancesRouter from "./routes/grievances.js";
import assistantRouter from "./routes/assistant.js";

export const app = express();

app.disable("x-powered-by");
// Photos travel as base64 inside JSON for the offline-queue batch sync.
app.use(express.json({ limit: "25mb" }));

// Feature 10 — rate limiting + CORS hardening.
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  next();
});
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: "too many login attempts" });
const mutateLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: "too many requests" });
app.use("/api/auth/login", authLimiter);
app.use("/api", mutateLimiter);

app.use("/uploads/field", express.static(UPLOADS_DIR, { fallthrough: false }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "coalsmart-backend" });
});

// Feature 7: seal every successful mutation into the hash-chained audit trail.
app.use("/api", auditMutationLogger);

app.use("/api/auth", authRouter);
app.use("/api/mines", minesRouter);
app.use("/api/field/captures", fieldRouter);
app.use("/api/risk", riskRouter);
app.use("/api/compliance", complianceRouter);
app.use("/api/dashboards", dashboardRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/anomalies", anomaliesRouter);
app.use("/api/audit", auditRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/contractors", contractorsRouter);
app.use("/api/environment", environmentRouter);
app.use("/api/corrective_actions", correctiveActionsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/grievances", grievancesRouter);
app.use("/api/assistant", assistantRouter);

// Keep 404s in the same JSON envelope the frontend's ApiError expects.
app.use((req, res) => {
  res.status(404).json({ detail: `no route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err?.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ detail: err?.message ?? "internal error" });
});

// Feature 3: escalation events fan out to every connected dashboard over /api/ws
// (proxied by Vite in dev, same origin in prod).
export function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname !== "/api/ws") return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const off = onEvent((event) => {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  });

  wss.on("close", () => {});
  return { wss, detach: off };
}

const PORT = Number(process.env.PORT ?? 8001);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const httpServer = createServer(app);
  attachWebSocket(httpServer);
  startEscalationTicker();
  startAlertTicker();
  httpServer.listen(PORT, () => {
    console.log(`coalsmart-backend listening on http://localhost:${PORT} (ws: /api/ws)`);
  });
}
