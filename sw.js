"use strict";

const CACHE_NAME = "prioriza-public-v78";
const PUBLIC_ASSETS = [
  "/app",
  "/site.webmanifest",
  "/css/tokens.css",
  "/css/base.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/screens.css?v=sem-areas",
  "/css/responsive.css?v=sprint-062",
  "/js/core/debug.js",
  "/js/core/utils.js",
  "/js/core/admin.js?v=sem-areas",
  "/js/screens/checklist.js?v=sprint-062",
  "/js/screens/agenda.js?v=sem-areas",
  "/js/screens/workspace.js?v=sprint-062",
  "/js/app.js?v=sprint-062"
];

const PRIVATE_PREFIXES = [
  "/auth", "/tarefas", "/checklist", "/notes", "/admin", "/google",
  "/marcos-operacionais", "/backup", "/push", "/debug"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("prioriza-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isPrivate(url) {
  return PRIVATE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + "/"));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivate(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put("/app", response.clone()));
          return response;
        })
        .catch(() => caches.match("/app"))
    );
    return;
  }

  if (!PUBLIC_ASSETS.some((asset) => asset === url.pathname || asset === url.pathname + url.search)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    }))
  );
});
