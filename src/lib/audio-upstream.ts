// ============================================
// OPTIMAL BREAKS — Reenvío de audio remoto con soporte Range
// ----------------------------------------------
// Lo usan /api/audio-proxy (Beatport) y /api/bandcamp-preview.
// iOS Safari pide el audio en trozos (`Range: bytes=0-1`, luego más) y
// espera 206 + Content-Range. Antes devolvíamos siempre 200 con el archivo
// entero anunciando `Accept-Ranges`: en iOS fallaba la reproducción o el seek,
// y el listener `error` del reproductor saltaba de pista en cadena.
// ============================================

import { NextRequest, NextResponse } from 'next/server'

export const AUDIO_PROXY_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** Tiempo máximo hasta recibir las CABECERAS del CDN (conexión + TTFB). */
const UPSTREAM_TIMEOUT_MS = 10_000

/** Tamaño máximo de una respuesta completa (sin Range). Los samples son ~2-5 MB. */
const MAX_FULL_SIZE = 20 * 1024 * 1024

export async function streamAudioUpstream(
  request: NextRequest,
  upstreamUrl: string,
  cacheControl: string,
): Promise<NextResponse> {
  const range = request.headers.get('range')
  // El timeout cubre SOLO la fase de cabeceras. Con `AbortSignal.timeout` en
  // el fetch, el aborto seguía vivo mientras se reenviaba el cuerpo: un sample
  // de 2-5 MB que tardara más de 10 s en llegar al móvil (4G) se cortaba a
  // mitad («failed to pipe response» / TimeoutError en el servidor; en el
  // cliente el <audio> daba `error` y el reproductor paraba o reiniciaba la
  // pista). Una vez tenemos cabeceras, el stream fluye sin límite de tiempo.
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS)
  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': AUDIO_PROXY_UA,
        ...(range ? { Range: range } : {}),
      },
      signal: ctl.signal,
      cache: 'no-store',
    })
  } catch {
    clearTimeout(timer)
    return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 })
  }
  clearTimeout(timer)

  // 200 (completo), 206 (trozo) y 416 (rango fuera) se reenvían tal cual.
  if (!upstream.ok && upstream.status !== 416) {
    return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 })
  }

  const len = upstream.headers.get('content-length')
  if (upstream.status === 200 && len && Number.parseInt(len, 10) > MAX_FULL_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 })
  }

  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
  })
  // Solo copiamos cabeceras con valor real (antes se mandaba Content-Length vacío).
  for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }

  return new NextResponse(upstream.status === 416 ? null : upstream.body, {
    status: upstream.status,
    headers,
  })
}

/** Trozo máximo de una sesión (el MP3 entero son ~140 MB; un rango abierto lo pide todo). */
const SESSION_PLAY_CHUNK = 8 * 1024 * 1024

/**
 * El `<audio>` del móvil pide `Range`. Si el rango es abierto (`bytes=0-`)
 * lo cerramos: si no, la función se queda abierta toda la hora y Vercel la corta.
 */
function sessionPlayRange(header: string | null): string {
  const cap = SESSION_PLAY_CHUNK - 1
  const fallback = `bytes=0-${cap}`
  if (!header) return fallback
  const m = /^bytes=(\d+)-(\d*)$/i.exec(header.trim())
  if (!m) return fallback
  const start = Number(m[1])
  if (!Number.isFinite(start) || start < 0) return fallback
  const requestedEnd = m[2] === '' ? start + cap : Number(m[2])
  if (!Number.isFinite(requestedEnd) || requestedEnd < start) return fallback
  const end = Math.min(requestedEnd, start + cap)
  return `bytes=${start}-${end}`
}

/**
 * Reproduce un asset de la release `sesiones-descarga`.
 * GitHub responde 302 y el CDN final manda `application/octet-stream` +
 * `Content-Disposition: attachment`. El iPhone no lo decodifica en `<audio>`
 * (el aviso rojo «no se pudo cargar este mix»). Aquí el salto se hace en el
 * servidor, se reenvía el `Range` (un `fetch` que sigue el 302 lo tira) y
 * el móvil recibe `audio/mpeg`.
 */
export async function streamReleaseMp3(request: Request, releaseUrl: string): Promise<NextResponse> {
  const range = sessionPlayRange(request.headers.get('range'))
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 20_000)
  let upstream: Response | undefined
  let failed = false
  try {
    let url = releaseUrl
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': AUDIO_PROXY_UA, Range: range },
        signal: ctl.signal,
        cache: 'no-store',
      })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        await res.body?.cancel()
        if (!loc) {
          failed = true
          break
        }
        url = new URL(loc, url).toString()
        continue
      }
      upstream = res
      break
    }
  } catch {
    failed = true
  } finally {
    clearTimeout(timer)
  }

  if (failed || !upstream || (!upstream.ok && upstream.status !== 416)) {
    await upstream?.body?.cancel()
    return NextResponse.json({ error: failed ? 'Upstream timeout' : `Upstream ${upstream?.status ?? 'none'}` }, { status: failed ? 504 : 502 })
  }

  const len = upstream.headers.get('content-length')
  if (upstream.status === 200 && len && Number.parseInt(len, 10) > SESSION_PLAY_CHUNK) {
    await upstream.body?.cancel()
    return NextResponse.json({ error: 'Range required' }, { status: 502 })
  }

  const headers = new Headers({
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  })
  for (const h of ['content-length', 'content-range']) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }

  return new NextResponse(upstream.status === 416 ? null : upstream.body, {
    status: upstream.status,
    headers,
  })
}
