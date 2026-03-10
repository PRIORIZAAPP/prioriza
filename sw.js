// ============================================================
// PRIORIZA — Service Worker (PWA + Web Push)  F10
// ============================================================

const CACHE_NAME = "prioriza-v1";
const OFFLINE_URL = "/app";

// ── Instalação: pré-cache da página principal ──
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// ── Ativação: limpa caches antigos ──
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: serve do cache se offline ──
self.addEventListener("fetch", event => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
  }
});

// ── Push: recebe e exibe notificação ──
self.addEventListener("push", event => {
  let data = { title: "PRIORIZA", body: "Você tem tarefas pendentes!", url: "/app" };
  try {
    if (event.data) {
      data = JSON.parse(event.data.text());
    }
  } catch (e) {}

  const options = {
    body: data.body || "",
    icon: "/static/prioriza-logo.png",
    badge: "/static/prioriza-logo.png",
    vibrate: [100, 50, 100],
    data: { url: data.url || "/app" },
    actions: [
      { action: "open",    title: "Abrir app" },
      { action: "dismiss", title: "Dispensar" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "PRIORIZA", options)
  );
});

// ── Clique na notificação ──
self.addEventListener("notificationclick", event => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
