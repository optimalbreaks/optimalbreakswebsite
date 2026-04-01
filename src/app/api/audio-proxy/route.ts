import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = ['geo-samples.beatport.com', 'geo-media.beatport.com']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

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

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status },
      )
    }

    const contentLength = parseInt(upstream.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 })
    }

    const body = upstream.body
    if (!body) {
      return NextResponse.json({ error: 'Empty body' }, { status: 502 })
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
        'Content-Length': upstream.headers.get('content-length') || '',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Proxy fetch failed' },
      { status: 502 },
    )
  }
}
