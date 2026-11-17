// Minimal service worker — makes Orpit installable, serves the app shell
// offline, and shows daily reminder push notifications.
const CACHE = 'orbit-shell-v2';

// Daily reminder push → show a warm notification.
self.addEventListener('push', (e) => {
  let data = { title: 'Orpit', body: 'Time to log your day 🌙', url: '/' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [80, 40, 80],
    })
  );
});

// Tapping the notification opens (or focuses) the app.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache the API — always hit the network.
  if (url.pathname.startsWith('/api')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Only good answers are kept: a "not found" kept here would come back offline.
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      // Offline: what was kept, and for a page the app itself. A script is never
      // answered with the page, which a browser can't run.
      .catch(() =>
        caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('/') : Response.error()))
      )
  );
});
