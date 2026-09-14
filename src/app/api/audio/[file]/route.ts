/**
 * Streaming de audio completo alojado (exclusivas cedidas por artistas).
 *
 * Los MP3 viven en `private/music/` (fuera de `public/`, incluidos en el bundle
 * vía `outputFileTracingIncludes` en next.config.js). Barrera media tipo
 * SoundCloud/Bandcamp — el usuario normal no puede descargar ni compartir un
 * enlace que funcione; no es DRM (el streaming siempre es capturable):
 *
 *   1. GET /api/audio/<file>.mp3 sin firma: solo se acepta desde la propia web
 *      (Sec-Fetch-Site same-origin o Referer del mismo host). Responde 302 a la
 *      URL firmada. Pegar la URL en la barra de direcciones o en otra web → 403.
 *   2. GET con `?e=<expiry>&s=<HMAC>`: verifica firma y caducidad (6 h) y sirve
 *      el archivo con soporte Range (seek). Un enlace firmado compartido muere
 *      solo. Si caduca pero la petición sigue viniendo de la web, re-firma (302).
 *
 * El <audio> del DeckAudioProvider sigue la redirección solo; no hay cambios
 * de cliente: `full_audio_url` en BD apunta directamente a /api/audio/….
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AUDIO_DIR = path.join(process.cwd(), 'private', 'music')
const TTL_SECONDS = 6 * 60 * 60 // 6 h: cubre una sesión de escucha larga con seeks
const FILE_RE = /^[a-z0-9][a-z0-9._-]*\.mp3$/i

function signingSecret(): string {
  return (
    process.env.AUDIO_STREAM_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  )
}

function sign(file: string, exp: number): string {
  return createHmac('sha256', signingSecret()).update(`${file}:${exp}`).digest('base64url')
}

function signatureValid(file: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const expected = Buffer.from(sign(file, exp))
  const received = Buffer.from(sig)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/** Petición nacida en nuestra propia web (player, no barra de direcciones ni hotlink). */
function isSameOriginRequest(req: NextRequest): boolean {
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true
  const referer = req.headers.get('referer') || ''
  const host = req.headers.get('host') || ''
  if (!referer || !host) return false
  try {
    return new URL(referer).host === host
  } catch {
    return false
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params
  if (!FILE_RE.test(file) || file.includes('..')) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  if (!signingSecret()) {
    return NextResponse.json({ error: 'signing secret missing' }, { status: 500 })
  }

  const filePath = path.join(AUDIO_DIR, file)
  let stat
  try {
    stat = await fs.stat(filePath)
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const url = req.nextUrl
  const exp = Number.parseInt(url.searchParams.get('e') || '', 10)
  const sig = url.searchParams.get('s') || ''

  if (!sig || !signatureValid(file, exp, sig)) {
    // Sin firma válida: solo re-firmamos si la petición viene de nuestra web.
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const freshExp = Math.floor(Date.now() / 1000) + TTL_SECONDS
    const redirect = new URL(url)
    redirect.searchParams.set('e', String(freshExp))
    redirect.searchParams.set('s', sign(file, freshExp))
    return NextResponse.redirect(redirect, 302)
  }

  // Firma válida → servir con soporte Range (seek del <audio>).
  const size = stat.size
  const headers = new Headers({
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': 'inline',
    'X-Robots-Tag': 'noindex',
  })

  const range = req.headers.get('range')
  let start = 0
  let end = size - 1
  let status = 200
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/)
    if (m) {
      if (m[1]) start = Number.parseInt(m[1], 10)
      if (m[2]) end = Number.parseInt(m[2], 10)
      if (!m[1] && m[2]) {
        // Sufijo: bytes=-N (últimos N bytes)
        start = Math.max(0, size - Number.parseInt(m[2], 10))
        end = size - 1
      }
      end = Math.min(end, size - 1)
      if (start > end || start >= size) {
        headers.set('Content-Range', `bytes */${size}`)
        return new NextResponse(null, { status: 416, headers })
      }
      status = 206
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
    }
  }
  headers.set('Content-Length', String(end - start + 1))

  const nodeStream = createReadStream(filePath, { start, end })
  const body = Readable.toWeb(nodeStream) as unknown as ReadableStream
  return new NextResponse(body, { status, headers })
}
