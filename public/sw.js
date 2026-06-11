// Authenticated-data-safe service worker (Phase 4.5 C1).
//
// RULES (locked): NEVER cache HTML/RSC/API responses — this app serves
// role-gated financial data and a cached page could leak it to the next
// person on a shared device, or show stale money figures offline.
//   • cache-first  → immutable static assets only (/_next/static, icons, fonts)
//   • network-only → documents, RSC payloads, /api/*, everything else
//   • navigations  → network, falling back to the precached /offline.html
// Versioned cache + activate cleanup; skipWaiting/clients.claim so updates
// take over promptly (pwa-register.tsx shows a reload toast on update).
const CACHE = "osos-v2";
const PRECACHE = ["/offline.html", "/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

const STATIC_RE = /^\/(_next\/static\/|icons\/|icon\.svg$|favicon\.ico$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (Supabase)

  // Static, content-hashed assets: cache-first.
  if (STATIC_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
      )
    );
    return;
  }

  // Navigations: network-first, offline fallback page. NEVER cached.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Everything else (RSC payloads, /api/*, data): network-only — no respondWith.
});
