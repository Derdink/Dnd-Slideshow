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
      .then(cache =>
        cache.addAll(urlsToCache).catch(err => {
          console.error('addAll failed, trying individual cache', err);
          // Fallback: try to cache each URL individually
          return Promise.all(
            urlsToCache.map(url =>
              fetch(url).then(response => {
                if (!response.ok) {
                  throw new Error('Failed to fetch ' + url);
                }
                return cache.put(url, response);
              }).catch(fetchErr => {
                console.error('Failed to cache:', url, fetchErr);
              })
            )
          );
        })
      )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
