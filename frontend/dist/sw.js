/* CoalSmart service worker — TODOLISTV2 #1 (PWA + background sync).
   - App shell: cache-first for hashed /assets, network-first for navigations.
   - API GETs: network-first with cache fallback so the dashboard still renders
     offline (react-query then falls back to demo data on hard failures).
   - Photos in /uploads: cache-first so synced captures stay viewable offline.
   Note: the field capture *queue* lives in localStorage (project rule bans
   IndexedDB); flushing it is handled in-app via the online/interval listeners. */
const VERSION = "coalsmart-v1";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, shellFallback) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(VERSION);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const hit = await caches.match(request);
    if (hit) return hit;
    if (shellFallback) {
      const shell = await caches.match(shellFallback);
      if (shell) return shell;
    }
    return Response.error();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(VERSION);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/ws")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/uploads/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
  }
  // everything else (favicon, fonts from CDN, …) stays on the network
});
