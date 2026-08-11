const CACHE = 'doc2sheet-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.method !== 'GET') return;
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
