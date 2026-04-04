import { NextRequest, NextResponse } from 'next/server'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MAX_SIZE = 10 * 1024 * 1024

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

  if (!parsed.hostname.endsWith('.bandcamp.com')) {
    return NextResponse.json({ error: 'Not a Bandcamp URL' }, { status: 403 })
  }

  try {
    const page = await fetch(trackUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    })
    if (!page.ok) {
      return NextResponse.json(
        { error: `Bandcamp returned ${page.status}` },
        { status: 502 },
      )
    }

    const html = await page.text()
    const tralbum = html.match(/data-tralbum="([^"]*)"/)
    if (!tralbum) {
      return NextResponse.json({ error: 'No track data found' }, { status: 404 })
    }

    const decoded = tralbum[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const obj = JSON.parse(decoded)
    const mp3Url: string | undefined = obj?.trackinfo?.[0]?.file?.['mp3-128']

    if (!mp3Url) {
      return NextResponse.json(
        { error: 'No preview available' },
        { status: 404 },
      )
    }

    const upstream = await fetch(mp3Url, {
      headers: { 'User-Agent': UA },
    })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Stream ${upstream.status}` },
        { status: upstream.status },
      )
    }

    const cl = parseInt(upstream.headers.get('content-length') || '0', 10)
    if (cl > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 })
    }

    const body = upstream.body
    if (!body) {
      return NextResponse.json({ error: 'Empty stream' }, { status: 502 })
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
        'Content-Length': upstream.headers.get('content-length') || '',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 })
  }
}
