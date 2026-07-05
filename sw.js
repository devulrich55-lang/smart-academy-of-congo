/**
 * Service Worker Evo-smartUni — coque hors-ligne (shell statique)
 */
const CACHE = "sac-pwa-v20260705g";
const SHELL = [
  "/",
  "/index.html",
  "/connexion.html",
  "/inscription.html",
  "/manifest.webmanifest",
  "/css/theme.css",
  "/css/mobile.css",
  "/css/logo.css",
  "/css/connexion.css",
  "/css/floating-back.css",
  "/js/sac-config.js",
  "/js/sac-client-guard.js",
  "/js/sac-storage.js",
  "/js/sac-theme.js",
  "/js/sac-mobile.js",
  "/js/sac-pwa.js",
  "/evo-uni.jpeg",
  "/logo_pro.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "EVOMONITOR_PUSH") return;
  const { title, body, tag, icon } = event.data;
  event.waitUntil(
    self.registration.showNotification(title || "EvoMonitor", {
      body: body || "",
      tag: tag || "evomonitor-alert",
      icon: icon || "/evo-uni.jpeg",
      badge: icon || "/evo-uni.jpeg",
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  const isHtml =
    req.mode === "navigate" ||
    req.destination === "document" ||
    /\.html$/i.test(url.pathname);

  if (isHtml) {
    // Network-first for HTML to avoid stale login pages.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/connexion.html"))
        )
    );
    return;
  }

  if (url.pathname.match(/\.js$/i)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          if (res && res.status === 200 && ct.includes("javascript")) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (
            res &&
            res.status === 200 &&
            url.pathname.match(/\.(css|png|jpg|jpeg|webp|ico|woff2?)$/i)
          ) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
