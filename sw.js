// ============================================================
// PRIORIZA — Service Worker (PWA + Web Push)
// ============================================================

const CACHE_NAME = "prioriza-v2";
const OFFLINE_URL = "/app";

const FILES_TO_CACHE = [
  "/app",
  "/favicon.ico",
  "/icon-16x16.png",
  "/icon-32x32.png",
  "/icon-180x180.png",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/site.webmanifest"
];

// ── Instalação: pré-cache ──
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

// ── Ativação: limpa caches antigos ──
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: usa rede e cai para cache se offline ──
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// ── Push: recebe e exibe notificação ──
self.addEventListener("push", event => {
  // Suporta tanto {"titulo","corpo"} (servidor Python) quanto {"title","body"} (padrão)
  let data = {
    titulo: "PRIORIZA",
    corpo: "Você tem tarefas pendentes!",
    url: "/app"
  };

  try {
    if (event.data) {
      const parsed = JSON.parse(event.data.text());
      // Aceita os dois formatos
      data.titulo = parsed.titulo || parsed.title || data.titulo;
      data.corpo   = parsed.corpo  || parsed.body  || data.corpo;
      data.url     = parsed.url    || data.url;
      data.icone   = parsed.icone  || parsed.icon  || "/icon-192x192.png";
    }
  } catch (e) {
    console.log("Push com payload inválido.");
  }

  const options = {
    body: data.corpo,
    icon: data.icone || "/icon-192x192.png",
    badge: "/icon-192x192.png",
    vibrate: [100, 50, 100],
    data: { url: data.url || "/app" },
    actions: [
      { action: "open",    title: "Abrir app" },
      { action: "dismiss", title: "Dispensar" }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.titulo, options)
  );
});

// ── Clique na notificação ──
self.addEventListener("notificationclick", event => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
