// PNP-ITMS Service Worker — App Shell Cache
const CACHE_NAME = "pnp-itms-shell-v4";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/ITMS_LOGO.png",
  "/PNP_LOGO.png",
];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache only static application assets. Never cache API or authenticated data.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Vite development modules must always come from the dev server. Caching
  // these paths leaves old Face ID code active after edits and hard refreshes.
  const isDevelopmentModule =
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/@vite/") ||
    url.pathname.startsWith("/@react-refresh");
  if (isDevelopmentModule) return;

  const isApiRequest =
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    event.request.headers.has("authorization");

  // Protected responses always remain network-only.
  if (isApiRequest) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  const cacheableDestination = ["script", "style", "image", "font", "manifest"].includes(
    event.request.destination
  );
  if (!cacheableDestination) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response && response.ok && response.type === "basic") {
          const clone = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          );
        }
        return response;
      });
    })
  );
});
