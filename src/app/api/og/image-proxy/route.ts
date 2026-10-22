import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { coverFocusFromBuffer, coverWindow } from '@/lib/digest-cover-pick'

/**
 * Sirve carátulas Beatport/Discogs/YouTube bajo nuestro dominio para `og:image`
 * y para `MediaMetadata.artwork` (pantalla de bloqueo). Meta/Facebook suele
 * recibir 403 al pedir `geo-media.beatport.com` directo; iOS tira la sesión
 * de Media Session si la carátula es cross-origin sin CORS.
 *
 * Ruta bajo `/api/og/` para alinearse con `robots.ts` (Allow explícito OG crawlers).
 */
const ALLOWED_HOSTS = new Set([
  'geo-media.beatport.com',
  'i.discogs.com',
  'i.ytimg.com',
  'img.youtube.com',
  'yt3.googleusercontent.com',
  'yt3.ggpht.com',
])
const MAX_IMAGE_BYTES = 6 * 1024 * 1024

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Timing-Allow-Origin': '*',
} as const

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

const IMAGE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // OJO: sin `image/webp`. El CDN de Beatport (sep 2026) negocia formato
  // por Accept y devuelve WebP si lo anuncias — y WhatsApp/Facebook NO
  // renderizan previews og:image en WebP (el link se comparte sin foto).
  // Pidiendo solo JPEG/PNG, Beatport sirve la JPEG original.
  Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5',
} as const

function imageResponse(body: BodyInit, contentType: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      ...CORS_HEADERS,
    },
  })
}

async function fetchAllowedImage(raw: string): Promise<ArrayBuffer | null> {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) return null
  const upstream = await fetch(parsed.toString(), {
    headers: IMAGE_HEADERS,
    next: { revalidate: 86400 },
  })
  if (!upstream.ok) return null
  const ct = upstream.headers.get('content-type') || ''
  if (!/^image\//i.test(ct)) return null
  const buf = await upstream.arrayBuffer()
  if (buf.byteLength > MAX_IMAGE_BYTES) return null
  return buf
}

/** Tres (o dos) carátulas en columnas iguales, JPEG 1200×630. */
async function jpegThirds(images: ArrayBuffer[]): Promise<Buffer> {
  const width = 1200
  const height = 630
  const n = images.length
  const panelW = Math.floor(width / n)
  const panels = await Promise.all(images.map(async (buf, i) => {
    const w = i === n - 1 ? width - panelW * (n - 1) : panelW
    const oriented = await sharp(Buffer.from(buf)).rotate().toBuffer()
    const meta = await sharp(oriented).metadata()
    const imgW = meta.width || w
    const imgH = meta.height || height
    const focus = await coverFocusFromBuffer(oriented)
    const crop = coverWindow(imgW, imgH, w, height, focus)
    const input = await sharp(oriented)
      .extract(crop)
      .resize(w, height, { fit: 'fill' })
      .jpeg({ quality: 82 })
      .toBuffer()
    return { input, left: i * panelW, top: 0 }
  }))
  return sharp({
    create: { width, height, channels: 3, background: { r: 26, g: 26, b: 26 } },
  }).composite(panels).jpeg({ quality: 82 }).toBuffer()
}

export async function GET(request: NextRequest) {
  const srcs = request.nextUrl.searchParams.getAll('src').map((s) => s.trim()).filter(Boolean).slice(0, 3)
  if (srcs.length === 0) {
    return NextResponse.json({ error: 'Missing src param' }, { status: 400 })
  }

  if (srcs.length >= 2) {
    try {
      const fetched = (await Promise.all(srcs.map((s) => fetchAllowedImage(s)))).filter((b): b is ArrayBuffer => !!b)
      if (fetched.length === 0) return new NextResponse(null, { status: 502 })
      if (fetched.length === 1) return imageResponse(fetched[0], 'image/jpeg')
      const jpeg = await jpegThirds(fetched)
      return imageResponse(new Uint8Array(jpeg), 'image/jpeg')
    } catch {
      return new NextResponse(null, { status: 502 })
    }
  }

  const raw = srcs[0]
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
      headers: IMAGE_HEADERS,
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
        ...CORS_HEADERS,
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
