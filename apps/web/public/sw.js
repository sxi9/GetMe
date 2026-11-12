/* GetMe service worker: app-shell cache for offline opens + Web Push display. */
const CACHE = 'getme-shell-v1';
const SHELL = ['/', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || url.origin !== location.origin) return;
  // navigation: network first, fall back to the cached shell so the app opens offline
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put('/', c)); return r; }).catch(() => caches.match('/'))); return; }
  // static assets: cache first
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok && (url.pathname.startsWith('/assets') || url.pathname.startsWith('/uploads'))) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })));
});
self.addEventListener('push', (e) => {
  let data = { title: 'GetMe', body: '', url: '/', tag: undefined };
  try { data = { ...data, ...e.data.json() }; } catch { data.body = e.data ? e.data.text() : ''; }
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon.svg', badge: '/icon.svg', tag: data.tag, data: { url: data.url }, vibrate: [120, 60, 120] }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs.find(x => 'focus' in x); if (c) { c.navigate(url); return c.focus(); } return self.clients.openWindow(url); }));
});
