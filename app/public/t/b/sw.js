// Launch test: the smallest worker that answers the page from its cache.
self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open('b').then((c) => c.add('./')))
})
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r ?? fetch(e.request)))
})
