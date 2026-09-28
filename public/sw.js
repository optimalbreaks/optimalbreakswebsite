// ============================================
// OPTIMAL BREAKS — Service Worker (PWA)
// Cache-first for static, network-first for API
// + Web Share Target → inbox → chat captura
// ============================================

// v5: manifest con id/scope/launch_handler (consistencia del reproductor en
// PWA móvil) — el bump invalida el manifest.json precacheado en clientes.
// v6 (sep 2026): el SW deja de tocar el audio (Range/206 rompía iOS), ya no
// guarda HTML privado (/mi-cuenta, admin, login) ni respuestas de error, y
// la caché de páginas tiene tope. El bump borra la caché v5 con MP3/HTML viejos.
const CACHE_NAME = 'ob-v6'
/** Máximo de páginas HTML guardadas para el modo offline (las más recientes). */
const MAX_HTML_ENTRIES = 40
/** Rutas con datos del usuario o de administración: nunca a la caché. */
const PRIVATE_PATH_RE = /^\/(?:[a-z]{2}\/)?(?:mi-cuenta|administrator|dashboard|login|reset-password|auth|u\/)/

async function trimCache(cacheName, max) {
  try {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    // Solo recortamos HTML; los estáticos precacheados se quedan.
    const html = keys.filter((k) => !STATIC_ASSETS.includes(new URL(k.url).pathname))
    const excess = html.length - max
    for (let i = 0; i < excess; i++) await cache.delete(html[i])
  } catch {
    /* no-op */
  }
}
const SHARE_INBOX = 'ob-share-inbox'
// Sin '/': redirige a /es o /en y una respuesta redirigida no puede servirse
// para una navegación (Chrome da error de red en modo offline).
const STATIC_ASSETS = [
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

  // Audio / vídeo: NUNCA pasar por el SW. El <audio> pide con `Range` y espera
  // 206; la Cache API no guarda 206 y devolver un 200 completo a una petición
  // Range hace fallar la reproducción en iOS Safari / PWA. El navegador y la
  // caché HTTP ya lo gestionan bien por sí solos.
  if (
    request.destination === 'audio' ||
    request.destination === 'video' ||
    request.headers.has('range') ||
    url.pathname.startsWith('/music/') ||
    /\.(mp3|m4a|ogg|wav|flac)$/i.test(url.pathname)
  ) {
    return
  }

  // Terceros (imágenes de CDNs, YouTube…): que los gestione el navegador.
  if (url.origin !== self.location.origin) return

  const isHtml = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')

  if (isHtml) {
    // Páginas privadas y fichas de artista: solo red (sin guardar).
    if (PRIVATE_PATH_RE.test(url.pathname) || url.pathname.includes('/artists')) return

    // Resto de páginas: red primero; guardamos solo respuestas OK y no
    // redirigidas, con tope de entradas; offline → última copia.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected && response.type === 'basic') {
            const clone = response.clone()
            event.waitUntil(
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, clone))
                .then(() => trimCache(CACHE_NAME, MAX_HTML_ENTRIES))
                .catch(() => {}),
            )
          }
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    )
    return
  }

  // Estáticos precacheados (manifest, favicon): caché primero.
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)))
  }
  // Todo lo demás: sin intervención del SW.
})
