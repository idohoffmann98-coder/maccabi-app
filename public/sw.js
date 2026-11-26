// Service worker: טעינה מהירה, עבודה בסיסית אופליין, וקבלת התראות פוש
const CACHE = 'yb-v3';
const IMG_CACHE = 'yb-img-v1'; // תמונות מוקטנות – לא משתנות, נשמרות לאורך זמן
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/icon.svg'];
const IMG_MAX = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// תמונות: קודם מהזיכרון של הטלפון (מופיעות מיד), ורק אם אין – מהרשת
async function imageFirst(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    cache.put(req, res.clone());
    cache.keys().then((keys) => keys.length > IMG_MAX && Promise.all(keys.slice(0, keys.length - IMG_MAX).map((k) => cache.delete(k))));
  }
  return res;
}

// נתונים ודפים: קודם מהרשת (כדי לקבל עדכונים), ואם הרשת איטית מ-4 שניות או אין חיבור – מהזיכרון
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  network.catch(() => {});
  const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
    return (await cache.match(req)) || (await network);
  } catch {
    return (await cache.match(req)) || (await caches.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/^\/(img|logo)\//.test(url.pathname)) e.respondWith(imageFirst(e.request));
  else e.respondWith(networkFirst(e.request));
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'מכבי', body: e.data?.text() }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'מכבי', {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
