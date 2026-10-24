// Tiny in-process event bus so the escalation engine doesn't need to know about
// the WebSocket layer (and tests can listen without a socket).
const listeners = new Set();

export function onEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(event) {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      console.error("event listener failed", err);
    }
  }
}
