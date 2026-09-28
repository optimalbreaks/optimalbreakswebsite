import { NextRequest, NextResponse } from 'next/server'
import { streamAudioUpstream } from '@/lib/audio-upstream'

const ALLOWED_HOSTS = ['geo-samples.beatport.com', 'geo-media.beatport.com']

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  // Reenvía `Range` al CDN de Beatport y devuelve 206/Content-Range tal cual
  // (imprescindible para iOS Safari y para el seek). Ver lib/audio-upstream.
  return streamAudioUpstream(request, parsed.toString(), 'public, max-age=86400, s-maxage=86400')
}
