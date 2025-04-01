const CACHE_NAME = 'photo-app-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/manage.html',
    '/styles.css',
    '/socket-client.js',
    '/state.js',
    '/api.js',
    '/manage.js',
    '/slideshow.js',
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

    // Check if the URL scheme is supported (only http/https)
    const url = new URL(event.request.url);
    if (!['http:', 'https:'].includes(url.protocol)) {
        return;
    }

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

                try {
                    // Clone the response because it's a one-time-use stream
                    const responseToCache = response.clone();

                    // Add the response to the cache
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            try {
                                cache.put(event.request, responseToCache);
                            } catch (error) {
                                console.warn('Failed to cache response:', error);
                            }
                        })
                        .catch(error => {
                            console.warn('Failed to open cache:', error);
                        });
                } catch (error) {
                    console.warn('Failed to clone response:', error);
                }

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