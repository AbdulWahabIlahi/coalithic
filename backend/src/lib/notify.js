// Pluggable notification transport — Feature 2 sub-item (email/SMS stub).
// Log-only by default so demos and tests never hit a real provider; swap the
// transport later without touching the escalation/alert engines.

import { emit } from "./bus.js";

export const notifyLog = [];

export function notify({ channel = "email", to, subject, body = "" }) {
  const entry = {
    at: new Date().toISOString(),
    channel,
    to: to ?? "unset",
    subject: subject ?? "",
    body: String(body).slice(0, 500),
  };
  notifyLog.push(entry);
  if (notifyLog.length > 500) notifyLog.shift();
  console.info(`[notify:${entry.channel}] to=${entry.to} subject="${entry.subject}"`);
  emit({ type: "notify", ...entry });
  return { delivered: false, transport: "log" };
}
