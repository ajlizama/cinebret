const CACHE_NAME = 'cinebret-v1'
const STATIC_ASSETS = [
  '/',
  '/catalogo',
  '/comunidad',
  '/cinereels',
  '/manifest.json',
  '/logo-oficial-transparent.png',
  '/logo-pequeno-transparent.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// Fetch: network-first for API/data, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip API routes and auth - always go to network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  // TMDB images: cache-first (they never change)
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // HTML pages: network-first with cache fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    )
    return
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
    })
  )
})

// Background Sync: retry failed actions when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-user-actions') {
    event.waitUntil(syncPendingActions())
  }
})

async function syncPendingActions() {
  // Read pending actions from IndexedDB and POST them
  // This will be implemented when we add offline action queue
}

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title || 'CineBret'
  const options = {
    body: data.body || 'Tienes nuevas recomendaciones',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    image: data.image,
    data: { url: data.url || '/' },
    actions: data.actions || [],
    vibrate: [100, 50, 100],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Notification click: open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const client = clients.find((c) => c.url.includes('cinebret.cl'))
      if (client) {
        client.navigate(url)
        return client.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
