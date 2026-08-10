"use strict";

const CACHE_NAME = "prioriza-public-v49";
const PUBLIC_ASSETS = [
  "/app",
  "/site.webmanifest",
  "/css/tokens.css",
  "/css/base.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/screens.css",
  "/css/responsive.css?v=20260809-notas2",
  "/js/core/debug.js",
  "/js/core/utils.js"
];

const PRIVATE_PREFIXES = [
  "/auth", "/tarefas", "/checklist", "/notes", "/admin", "/google",
  "/operacao", "/financas", "/marcos", "/backup", "/push", "/debug"
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
