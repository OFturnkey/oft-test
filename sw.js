// Service worker for the O F Turnkey site.
// - Screens: network first, so a new version shows as soon as it is published; with no signal it answers
//   from the last copy, so the app still opens. Data requests (to Apps Script) and fonts are not touched.
// - push / notificationclick: shows alerts sent through Firebase Cloud Messaging.
const CACHE = 'oft-screens-v1';
const SCREENS = ['./', 'index.html', 'styles.css', 'config.js', 'core.js', 'app.js', 'logo.png', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SCREENS.map((u) => new Request(u, { cache: 'reload' }))))
    .catch(() => { /* first visit without signal: cache later */ })
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(new Request(req.url, { cache: 'no-cache' })).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.url.split('?')[0], copy)); }
      return res;
    }).catch(() => caches.match(req.url.split('?')[0]).then((hit) => hit || caches.match('./')))
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = {}; }
  const d = payload.data || payload;
  event.waitUntil(self.registration.showNotification(d.title || 'O F Turnkey', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: d.tag || 'oft-alert',
    renotify: true,
    data: { url: d.url || './?tab=tasks' }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './?tab=tasks', self.registration.scope).href;
  event.waitUntil(self.clients.openWindow(url));
});
