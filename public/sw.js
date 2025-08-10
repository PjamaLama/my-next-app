const CACHE_NAME = 'report-ai-v3';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/logo.png'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(urlsToCache);
      } catch (e) {
        // ignore
      }
      // Activate updated SW immediately
      await self.skipWaiting();
    })()
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Never handle non-GET; fixes "put on Cache: Request method 'POST' is unsupported"
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheableDestinations = new Set(['image', 'style', 'font']);
  const shouldCache = sameOrigin && cacheableDestinations.has(req.destination);

  event.respondWith(
    (async () => {
      // Try cache first for allowed assets
      if (shouldCache) {
        const cached = await caches.match(req);
        if (cached) return cached;
      }

      const networkResponse = await fetch(req).catch(() => undefined);
      if (!networkResponse) return new Response('', { status: 504 });

      if (
        shouldCache &&
        networkResponse.status === 200 &&
        (networkResponse.type === 'basic' || networkResponse.type === 'opaqueredirect')
      ) {
        const responseToCache = networkResponse.clone();
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, responseToCache);
        } catch (_) {
          // ignore cache failures
        }
      }
      return networkResponse;
    })()
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => cacheName !== CACHE_NAME ? caches.delete(cacheName) : Promise.resolve())
      );
      await self.clients.claim();
    })()
  );
});

// Handle background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    // Add background sync logic here if needed
  }
});

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  const options = {
    body: 'Sheety AI notification',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/icon-192x192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Sheety AI', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
}); 