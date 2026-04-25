const CACHE_NAME = 'solvio-v2'

// Install: skip waiting immediately
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Activate: clean ALL old caches, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Fetch: only cache static assets (_next/static), never cache HTML/API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never intercept: API calls, non-GET, navigation (HTML pages)
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    event.request.mode === 'navigate' ||
    event.request.headers.get('accept')?.includes('text/html')
  ) {
    return
  }

  // Only cache _next/static assets (JS/CSS bundles)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Everything else: network only, no caching
})
