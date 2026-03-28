// ============================================
// OPTIMAL BREAKS — Service Worker (PWA)
// Cache-first for static, network-first for API
// ============================================

const CACHE_NAME = 'ob-v2'
const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET and Supabase/API requests
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api')) return
  if (url.hostname.includes('supabase')) return

  // Music files: cache first
  if (url.pathname.startsWith('/music/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
      })
    )
    return
  }

  // Pages: network first, cache fallback
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

  // Other assets: cache first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  )
})
