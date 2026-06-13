import { NextRequest, NextResponse } from 'next/server'

/**
 * Sirve carátulas Beatport bajo nuestro dominio para `og:image`.
 * Meta/Facebook suele recibir 403 al pedir directamente `geo-media.beatport.com`
 * con su user-agent; el HTML ya trae título/desc pero sin imagen válida el preview
 * queda roto o genérico.
 *
 * Ruta bajo `/api/og/` para alinearse con `robots.ts` (Allow explícito OG crawlers).
 */
const ALLOWED_HOSTS = new Set([
  'geo-media.beatport.com',
  'i.discogs.com',
  'i.ytimg.com',
  'img.youtube.com',
])
const MAX_IMAGE_BYTES = 6 * 1024 * 1024

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('src')
  if (!raw?.trim()) {
    return NextResponse.json({ error: 'Missing src param' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid src URL' }, { status: 400 })
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/jpeg,image/png,image/webp,*/*',
      },
      next: { revalidate: 86400 },
    })

    if (!upstream.ok) {
      return new NextResponse(null, { status: 502 })
    }

    const ct = upstream.headers.get('content-type') || 'image/jpeg'
    if (!/^image\//i.test(ct)) {
      return NextResponse.json({ error: 'Upstream is not an image' }, { status: 502 })
    }

    const lenHeader = upstream.headers.get('content-length')
    if (lenHeader) {
      const n = parseInt(lenHeader, 10)
      if (Number.isFinite(n) && n > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Image too large' }, { status: 413 })
      }
    }

    const buf = await upstream.arrayBuffer()
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 })
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
