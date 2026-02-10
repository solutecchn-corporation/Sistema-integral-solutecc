const CACHE_VERSION = "1.2.5"; // Actualizar con cada release
const CACHE_NAME = `visonixro-v${CACHE_VERSION}`;
const urlsToCache = ["/", "/index.html", "/manifest.json"];

// Install event - cache resources
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing version ${CACHE_VERSION}`);
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log(`[SW] Opened cache: ${CACHE_NAME}`);
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.log("[SW] Cache install error:", err);
      })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating version ${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network first for JS/CSS, cache first for others
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  
  // Network-first strategy for JS, CSS, and JSON files (always get fresh code)
  if (
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json") ||
    url.pathname.includes("/assets/")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone and cache the fresh response
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || new Response("Offline", { status: 503 });
          });
        })
    );
    return;
  }

  // Cache-first strategy for other resources
  event.respondWith(
    caches
      .match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        });
      })
      .catch(() => {
        return new Response("Offline", { status: 503 });
      })
  );
});
