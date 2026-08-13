// ============================================
// OPTIMAL BREAKS — Imagen de Story de Instagram por canción
// GET /api/og/story?play=<chart|featured|vinyl>:<id>&lang=es|en → PNG 1080×1920
//
// La consume el botón "IG" de `TrackShareButton`: el cliente baja este PNG
// y lo pasa a `navigator.share({ files })` para que el usuario lo suba a
// Stories (Instagram no acepta enlaces web sueltos; sí acepta imágenes).
// Estética fanzine alineada con `UserTracksOgImage` / OG del sitio.
// ============================================

import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import {
  parsePlayParam,
  upscaleTrackArtworkForOg,
  youtubeThumbnailFromUrl,
} from '@/lib/share-track'

export const runtime = 'nodejs'

const WIDTH = 1080
const HEIGHT = 1920

const PAPER = '#e8dcc8'
const INK = '#1a1a1a'
const RED = '#d62828'
const YELLOW = '#f4c430'

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const MONO = 'ui-monospace, "Cascadia Code", "Courier New", monospace'

const NEEDS_RENCODE = new Set(['image/webp', 'image/avif'])

type StoryRow = {
  title: string | null
  mix_name: string | null
  artists: { name?: string }[] | null
  label: string | null
  artwork_url: string | null
  youtube_url?: string | null
  release_year?: number | null
  year?: number | null
}

/** Descarga la carátula y la devuelve como data URL PNG/JPEG apto para Satori
 * (WebP/AVIF se re-encodean con sharp; también recorta a cuadrado ~900px). */
async function loadArtworkDataUrl(rawUrl: string | null | undefined): Promise<string | null> {
  const url = rawUrl?.trim()
  if (!url || !/^https?:\/\//.test(url)) return null
  try {
    const res = await fetch(url, {
      cache: 'force-cache',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/jpeg,image/png,image/webp,*/*',
      },
    })
    if (!res.ok) return null
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
    if (!/^image\//i.test(mime)) return null
    const buf = Buffer.from(await res.arrayBuffer())

    const sharpMod = await import('sharp')
    const sharp =
      (sharpMod as { default?: typeof import('sharp') }).default ??
      (sharpMod as unknown as typeof import('sharp'))
    const pipeline = sharp(buf).resize({ width: 900, height: 900, fit: 'cover' })
    if (NEEDS_RENCODE.has(mime) || mime === 'image/png') {
      const png = await pipeline.png({ compressionLevel: 9 }).toBuffer()
      return `data:image/png;base64,${png.toString('base64')}`
    }
    const jpg = await pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer()
    return `data:image/jpeg;base64,${jpg.toString('base64')}`
  } catch {
    return null
  }
}

async function fetchStoryRow(
  kind: 'chart' | 'featured' | 'vinyl',
  id: string,
): Promise<StoryRow | null> {
  const supabase = createServerSupabase()
  const table =
    kind === 'chart' ? 'chart_tracks' : kind === 'featured' ? 'chart_featured_tracks' : 'chart_vinyl_tracks'
  const cols =
    kind === 'vinyl'
      ? 'title, mix_name, artists, label, artwork_url, youtube_url, year'
      : 'title, mix_name, artists, label, artwork_url, release_year'
  const { data } = await supabase.from(table).select(cols).eq('id', id).maybeSingle()
  return (data as StoryRow | null) ?? null
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const lang = sp.get('lang') === 'en' ? 'en' : 'es'
  const parsed = parsePlayParam(sp.get('play'))

  let kind: 'chart' | 'featured' | 'vinyl' | null = null
  let id = ''
  if (parsed?.kind === 'track') {
    kind = parsed.source
    id = parsed.id
  } else if (parsed?.kind === 'vinyl') {
    kind = 'vinyl'
    id = parsed.id
  }
  if (!kind || !id) {
    return NextResponse.json({ error: 'Invalid play param' }, { status: 400 })
  }

  const row = await fetchStoryRow(kind, id)
  if (!row?.title) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  }

  const artworkSource =
    upscaleTrackArtworkForOg(row.artwork_url) ??
    (kind === 'vinyl' ? youtubeThumbnailFromUrl(row.youtube_url) : null)
  const artworkDataUrl = await loadArtworkDataUrl(artworkSource)

  const es = lang === 'es'
  const mix = (row.mix_name || '').trim()
  const title = `${row.title}${mix ? ` (${mix})` : ''}`.slice(0, 90)
  const artists = (Array.isArray(row.artists) ? row.artists : [])
    .map((a) => a?.name)
    .filter(Boolean)
    .join(', ')
    .slice(0, 110)
  const year = row.release_year ?? row.year ?? null
  const metaBits = [row.label, year && year > 0 ? String(year) : null]
    .filter(Boolean)
    .join(' · ')
  const kicker =
    kind === 'vinyl'
      ? 'RETRO VINYL PICKS'
      : kind === 'featured'
        ? 'NEW RELEASES'
        : '40 BREAKS VITALES'
  const footer = es
    ? 'Escúchalo en www.optimalbreaks.com'
    : 'Listen at www.optimalbreaks.com'

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          backgroundColor: INK,
          padding: '150px 70px 170px',
          boxSizing: 'border-box',
          border: `18px solid ${PAPER}`,
        }}
      >
        {/* Barra roja superior */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 14,
            backgroundColor: RED,
            display: 'flex',
          }}
        />

        {/* Cabecera de marca */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            fontSize: 52,
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: 'uppercase',
            fontFamily: FONT,
          }}
        >
          <span style={{ color: PAPER }}>OPTIMAL&nbsp;</span>
          <span style={{ color: RED }}>BREAKS</span>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 18,
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: 8,
            color: YELLOW,
            textTransform: 'uppercase',
            fontFamily: MONO,
          }}
        >
          {kicker}
        </div>

        {/* Carátula */}
        <div
          style={{
            display: 'flex',
            marginTop: 70,
            width: 880,
            height: 880,
            border: `10px solid ${PAPER}`,
            backgroundColor: '#000',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {artworkDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artworkDataUrl}
              alt=""
              width={860}
              height={860}
              style={{ width: 860, height: 860, objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                fontSize: 200,
                fontWeight: 900,
                color: PAPER,
                fontFamily: FONT,
              }}
            >
              OB
            </div>
          )}
        </div>

        {/* Título y artistas */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 64,
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 44 ? 44 : 56,
              fontWeight: 900,
              lineHeight: 1.15,
              color: PAPER,
              textAlign: 'center',
              textTransform: 'uppercase',
              fontFamily: FONT,
            }}
          >
            {title}
          </div>
          {artists ? (
            <div
              style={{
                display: 'flex',
                marginTop: 22,
                fontSize: 36,
                fontWeight: 700,
                color: YELLOW,
                textAlign: 'center',
                fontFamily: MONO,
              }}
            >
              {artists}
            </div>
          ) : null}
          {metaBits ? (
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: 2,
                color: PAPER,
                opacity: 0.6,
                textTransform: 'uppercase',
                fontFamily: MONO,
              }}
            >
              {metaBits}
            </div>
          ) : null}
        </div>

        {/* Pie */}
        <div
          style={{
            position: 'absolute',
            bottom: 84,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: 3,
            color: PAPER,
            opacity: 0.85,
            textTransform: 'uppercase',
            fontFamily: MONO,
          }}
        >
          {footer}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )
}
