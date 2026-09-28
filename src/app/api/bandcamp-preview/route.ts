import { NextRequest, NextResponse } from 'next/server'
import { AUDIO_PROXY_UA, streamAudioUpstream } from '@/lib/audio-upstream'

/**
 * Preview de Bandcamp: resuelve el MP3 (mp3-128) a partir de la página del
 * tema y lo reenvía con soporte Range.
 *
 * Antes cada petición (y Safari hace varias por pista con Range) volvía a
 * descargar y parsear el HTML de Bandcamp y luego el MP3 entero. Ahora la
 * página se cachea 1 h en la Data Cache (las URLs de stream de Bandcamp
 * llevan token con caducidad; si el token cacheado ya no vale, se resuelve
 * de nuevo sin caché y se reintenta una vez).
 */
const PAGE_REVALIDATE_S = 3600

async function resolveMp3Url(trackUrl: string, fresh: boolean): Promise<string | null> {
  const page = await fetch(trackUrl, {
    headers: { 'User-Agent': AUDIO_PROXY_UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(10_000),
    ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: PAGE_REVALIDATE_S } }),
  })
  if (!page.ok) return null
  const html = await page.text()
  const tralbum = html.match(/data-tralbum="([^"]*)"/)
  if (!tralbum) return null
  try {
    const decoded = tralbum[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const obj = JSON.parse(decoded)
    const mp3: unknown = obj?.trackinfo?.[0]?.file?.['mp3-128']
    return typeof mp3 === 'string' && mp3.startsWith('http') ? mp3 : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const trackUrl = request.nextUrl.searchParams.get('track')
  if (!trackUrl) {
    return NextResponse.json({ error: 'Missing track param' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(trackUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.bandcamp.com')) {
    return NextResponse.json({ error: 'Not a Bandcamp URL' }, { status: 403 })
  }

  const cacheControl = 'public, max-age=3600, s-maxage=3600'
  try {
    const cachedMp3 = await resolveMp3Url(parsed.toString(), false)
    if (cachedMp3) {
      const res = await streamAudioUpstream(request, cachedMp3, cacheControl)
      if (res.status !== 502) return res
    }
    // Token caducado o página sin datos en caché: resolver de nuevo.
    const freshMp3 = await resolveMp3Url(parsed.toString(), true)
    if (!freshMp3) {
      return NextResponse.json({ error: 'No preview available' }, { status: 404 })
    }
    return streamAudioUpstream(request, freshMp3, cacheControl)
  } catch {
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 })
  }
}
