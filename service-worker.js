/* ====================================================================
   DIGITAL MENU — SERVICE WORKER
   Implements the full PWA offline lifecycle: install (pre-cache),
   activate (clean up old caches), fetch (cache-first strategy).
   ==================================================================== */

/* --------------------------------------------------------------------
   CACHE VERSIONING
   --------------------------------------------------------------------
   HOW TO PUSH A MENU UPDATE (prices, items, new dishes, etc.):
   1. Change CACHE_NAME below, e.g. "menu-cache-v1" -> "menu-cache-v2".
   2. Re-deploy all files (index.html, manifest.json, service-worker.js,
      and anything in ASSETS_TO_CACHE) to the server.
   3. That's it. On the customer's NEXT visit while they have any
      connectivity, the browser fetches this file, sees the new
      CACHE_NAME string, and the 'install' + 'activate' events below
      automatically pre-cache the new version and delete the old one.
      No customer action is required.
   -------------------------------------------------------------------- */
const CACHE_NAME = "menu-cache-v2";

/* --------------------------------------------------------------------
   CORE ASSETS TO PRE-CACHE ON INSTALL
   --------------------------------------------------------------------
   Everything the app needs to render and run with zero network.
   All menu images referenced from JS (e.g. "images/kacchi-biryani.jpg")
   should be added here too as they're added to the menu data, so they
   survive the very first offline load. Missing files are skipped
   individually (see addAllSafely) so one bad path doesn't break
   the whole install.
   -------------------------------------------------------------------- */
const ASSETS_TO_CACHE = [
  "./",
  "index.html"
  // NOTE: manifest + icons are no longer separate files — they're
  // inlined as data URIs directly inside index.html's <head>, so the
  // browser never makes a network request for them and there's
  // nothing extra to pre-cache here.
  //
  // EDIT ME: add menu image paths here as they're added to the menu
  // data in index.html, e.g. "images/kacchi-biryani.jpg"
];

/* A tiny inline fallback shown only if a page request fails AND
   isn't already in the cache (e.g. very first visit with no network). */
const OFFLINE_FALLBACK_HTML = `
  <!DOCTYPE html>
  <html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#16140f;color:#f0e6d2;font-family:-apple-system,Segoe UI,Roboto,sans-serif;
      text-align:center;padding:24px;}
    p{max-width:320px;line-height:1.5;color:#9c9285;}
  </style></head>
  <body>
    <div>
      <h2 style="color:#d3a34e;">You're offline</h2>
      <p>This page hasn't been loaded yet, so it isn't saved for offline use.
      Please connect to the internet once to load it, then it will work offline too.</p>
    </div>
  </body></html>
`;

/* --------------------------------------------------------------------
   INSTALL — pre-cache every core asset into a fresh, versioned cache
   -------------------------------------------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => addAllSafely(cache, ASSETS_TO_CACHE))
  );
  // Activate this new service worker as soon as it finishes installing,
  // instead of waiting for all tabs of the old version to close.
  self.skipWaiting();
});

/* Adds each asset individually and swallows per-file failures, so a
   single missing image (e.g. a menu photo not yet uploaded) doesn't
   abort caching of everything else. */
async function addAllSafely(cache, urls) {
  await Promise.all(
    urls.map((url) =>
      cache.add(url).catch((err) => {
        console.warn("[SW] Skipped pre-caching (not found):", url, err);
      })
    )
  );
}

/* --------------------------------------------------------------------
   ACTIVATE — delete any cache that isn't the current CACHE_NAME
   -------------------------------------------------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((existingCaches) =>
      Promise.all(
        existingCaches
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      )
    )
  );
  // Take control of any already-open tabs immediately, without
  // requiring a reload, so updates apply right away.
  self.clients.claim();
});

/* --------------------------------------------------------------------
   FETCH — cache-first strategy:
   1. Serve from cache if present (instant, works offline).
   2. Otherwise fetch from network, and store a copy in cache for
      next time.
   3. If both cache and network fail, serve a minimal offline page
      (only for navigations) so the customer never sees a browser
      error screen.
   -------------------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  // Only handle GET requests; let everything else (e.g. POST) pass through.
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          // Only cache successful, same-origin responses.
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Both cache and network failed.
          if (event.request.mode === "navigate") {
            return new Response(OFFLINE_FALLBACK_HTML, {
              headers: { "Content-Type": "text/html" }
            });
          }
          return new Response("", { status: 504, statusText: "Offline" });
        });
    })
  );
});
