// ============================================
// OPTIMAL BREAKS — Service Worker (PWA)
// Cache-first for static, network-first for API
// + Web Share Target → inbox → chat captura
// ============================================

// v5: manifest con id/scope/launch_handler (consistencia del reproductor en
// PWA móvil) — el bump invalida el manifest.json precacheado en clientes.
const CACHE_NAME = 'ob-v5'
const SHARE_INBOX = 'ob-share-inbox'
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
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHARE_INBOX).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

async function handleShareTarget(request) {
  const formData = await request.formData()
  const title = String(formData.get('title') || '')
  const text = String(formData.get('text') || '')
  const url = String(formData.get('url') || '')
  const media = [
    ...formData.getAll('media'),
    ...formData.getAll('files'),
    ...formData.getAll('images'),
  ].filter((f) => f && typeof f === 'object' && f.size > 0)

  const cache = await caches.open(SHARE_INBOX)
  const oldKeys = await cache.keys()
  await Promise.all(oldKeys.map((k) => cache.delete(k)))

  await cache.put(
    '/__share_payload__',
    new Response(
      JSON.stringify({
        title,
        text,
        url,
        fileCount: media.length,
        createdAt: Date.now(),
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
  )

  for (let i = 0; i < media.length; i++) {
    const f = media[i]
    await cache.put(
      `/__share_file_${i}__`,
      new Response(f, {
        headers: {
          'content-type': f.type || 'application/octet-stream',
          'x-filename': f.name || `share-${i + 1}.jpg`,
        },
      }),
    )
  }

  const origin = new URL(request.url).origin
  return Response.redirect(`${origin}/es/administrator/chat?share=1`, 303)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Web Share Target (Facebook / fotos / enlaces → PWA)
  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          return await handleShareTarget(request)
        } catch {
          // No re-fetch a /share-target (bucle SW). El usuario reabre Captura.
          return Response.redirect(
            `${url.origin}/es/administrator/chat?share=1&share_err=1`,
            303,
          )
        }
      })(),
    )
    return
  }

  // Skip non-GET and Supabase/API requests
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api')) return
  if (url.hostname.includes('supabase')) return

  // Music & mix audio files: cache first
  if (url.pathname.startsWith('/music/') || url.pathname.startsWith('/mixes-audio/') || /\.(mp3|m4a|ogg|wav)(\?|$)/.test(url.pathname)) {
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

  // Fichas / listado artistas: siempre red (no guardar HTML; evita bios viejas tras db:artist)
  if (
    request.headers.get('accept')?.includes('text/html') &&
    url.pathname.includes('/artists')
  ) {
    event.respondWith(fetch(request))
    return
  }

  // Otras páginas: red primero, caché si falla la red
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
