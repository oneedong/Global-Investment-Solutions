const CACHE_VERSION = 'v1-20250829';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=20250820',
  './script.js?v=20250820',
  './firebase-config.js?v=20250820',
  './symbol_transparent.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          // Only cache successful, basic responses
          if (request.url.startsWith(self.location.origin) && response.ok && response.type === 'basic') {
            cache.put(request, copy);
          }
        });
        return response;
      }).catch(() => caches.match('./index.html'))
    )
  );
});


