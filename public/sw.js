const CACHE_NAME = 'photo-app-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/manage.html',
    '/styles.css',
    '/main.js',
    '/socket-client.js',
    '/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            // Cache each URL individually and ignore failures
            return Promise.allSettled(
                urlsToCache.map(url =>
                    cache.add(url).catch(error => {
                        console.warn('Failed to cache:', url, error);
                    })
                )
            );
        })
    );
});

self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Don't cache socket.io requests
    if (event.request.url.includes('/socket.io/')) return;

    event.respondWith(
        caches.match(event.request)
        .then(response => {
            // Return cached response if found
            if (response) {
                return response;
            }

            // Clone the request because it's a one-time-use stream
            const fetchRequest = event.request.clone();

            // Make the network request and cache the response
            return fetch(fetchRequest).then(response => {
                // Check if response is valid
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // Clone the response because it's a one-time-use stream
                const responseToCache = response.clone();

                // Add the response to the cache
                caches.open(CACHE_NAME)
                    .then(cache => {
                        cache.put(event.request, responseToCache);
                    })
                    .catch(error => {
                        console.warn('Failed to cache response:', error);
                    });

                return response;
            });
        })
        .catch(error => {
            console.error('Fetch failed:', error);
            // Optionally return a fallback response here
        })
    );
});

// Clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});