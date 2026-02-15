// sw.js — RealNow Service Worker v4.0
// Caches app shell + last data snapshot for offline viewing

const CACHE_NAME = 'realnow-v4';
const DATA_CACHE = 'realnow-data-v4';

const APP_SHELL = [
  '/',
  '/index.html',
  '/static/js/main.js',
  '/static/css/main.css',
  '/manifest.json'
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL).catch(err => {
        console.log('[SW] Some assets failed to cache (will retry on fetch):', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== DATA_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // API requests — network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone and cache the response
          const clone = response.clone();
          caches.open(DATA_CACHE).then(cache => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          // Offline — serve from cache
          return caches.match(event.request).then(cached => {
            if (cached) {
              console.log('[SW] Serving cached API:', url.pathname);
              return cached;
            }
            return new Response(JSON.stringify({ 
              offline: true, 
              error: 'No cached data available' 
            }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }
  
  // Static assets — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Final fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Background sync — refresh data when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'refresh-data') {
    event.waitUntil(
      fetch('/api/aggregate').then(response => {
        const clone = response.clone();
        return caches.open(DATA_CACHE).then(cache => {
          return cache.put('/api/aggregate', clone);
        });
      })
    );
  }
});