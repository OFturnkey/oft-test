// Service worker for the O F Turnkey site.
// - Screens: network first, so a new version shows as soon as it is published; with no signal, or when the network
//   hasn't answered within NET_WAIT_MS (a laptop waking up, weak Wi-Fi), it answers from the last copy, so the app
//   opens at once; the fresh copy is still saved for next time. Data requests (to Apps Script) and fonts are not touched.
// - push / notificationclick: shows alerts sent through Firebase Cloud Messaging.
const CACHE = 'oft-screens-v1';
const NET_WAIT_MS = 3000;
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
  const key = req.url.split('?')[0];
  const net = fetch(new Request(req.url, { cache: 'no-cache' })).then((res) => {
    if (res.ok) { const copy = res.clone(); return caches.open(CACHE).then((c) => c.put(key, copy)).then(() => res, () => res); }
    return res;
  });
  // Keeps the worker alive until the network has answered and the copy is saved, even when the saved copy answered first.
  event.waitUntil(net.catch(() => {}));
  const saved = () => caches.match(key).then((hit) => hit || caches.match('./'));
  event.respondWith(new Promise((resolve) => {
    let done = false;
    const answer = (r) => { if (!done && r) { done = true; resolve(r); } };
    // Slow network: the saved copy answers (if there is one); the network still finishes and refreshes it.
    const timer = setTimeout(() => saved().then(answer), NET_WAIT_MS);
    net.then((res) => { clearTimeout(timer); answer(res); }, () => { clearTimeout(timer); saved().then((r) => { if (r) answer(r); else answer(Response.error()); }); });
  }));
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
