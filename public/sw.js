const CACHE_NAME = 'photo-app-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/settings.html',
  '/management.html',
  '/styles.css',
  '/manifest.json'
  // Add other assets like images as needed
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
