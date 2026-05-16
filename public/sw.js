self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Solo passthrough, necesario para cumplir con los criterios de instalación PWA
  event.respondWith(fetch(event.request));
});
