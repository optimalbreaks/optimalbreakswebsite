// ============================================
// OPTIMAL BREAKS — Imagen de Story de Instagram por canción
// GET /api/og/story?play=<chart|featured|vinyl|beatport>:<id>&lang=es|en → PNG 1080×1920
// GET /api/og/story?play=mix:<slug> → story de una sesión (festival, edición,
// fecha, lugar y retrato del artista). Botón IG de `ShareButtons` en /mixes/<slug>.
//
// La consume el botón "IG" de `TrackShareButton`: el cliente baja este PNG
// y lo pasa a `navigator.share({ files })` para que el usuario lo suba a
// Stories (Instagram no acepta enlaces web sueltos; sí acepta imágenes).
// Estética fanzine alineada con `UserTracksOgImage` / OG del sitio.
// ============================================

import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { createCachedSupabase } from '@/lib/supabase-server'
import { SITE_URL } from '@/lib/seo'
import {
  findBeatportTopTrackById,
  parsePlayParam,
  upscaleTrackArtworkForOg,
  youtubeThumbnailFromUrl,
} from '@/lib/share-track'
import { extractYouTubeId } from '@/lib/mix-sessions'
import { festivalBrandOfSeries, festivalSeriesForEventName } from '@/lib/event-series'
import {
  buildArtistSlugLookup,
  fetchAllArtistLinkRows,
  flattenLineupArtistNames,
  resolveArtistSlug,
} from '@/lib/artist-entity-match'
import type { BeatportTopTrack, Mix } from '@/types/database'

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

const QUERY_ARTWORK_HOSTS = new Set([
  'geo-media.beatport.com',
  'i.discogs.com',
  'i.ytimg.com',
  'img.youtube.com',
])

function isAllowedQueryArtworkUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (QUERY_ARTWORK_HOSTS.has(host)) return true
    if (host.endsWith('.supabase.co') && u.pathname.includes('/storage/')) return true
    return false
  } catch {
    return false
  }
}

async function fetchBeatportStoryRow(
  id: string,
  from: string | null,
): Promise<StoryRow | null> {
  const parsedFrom = from ? /^(artists|labels)\/([a-z0-9-]+)$/i.exec(from.trim()) : null
  if (!parsedFrom) return null
  const table = parsedFrom[1].toLowerCase() as 'artists' | 'labels'
  const slug = parsedFrom[2]
  const supabase = createCachedSupabase()
  const { data } = await supabase.from(table).select('beatport_top_tracks').eq('slug', slug).maybeSingle()
  const tracks = (data as { beatport_top_tracks?: BeatportTopTrack[] | null } | null)?.beatport_top_tracks
  const track = findBeatportTopTrackById(tracks, id)
  if (!track?.title) return null
  return {
    title: track.title,
    mix_name: track.mix_name || null,
    artists: track.artists,
    label: track.label || null,
    artwork_url: track.artwork_url,
    release_year: track.release_year,
  }
}

function storyRowFromQuery(sp: URLSearchParams): StoryRow | null {
  const title = (sp.get('title') || '').trim()
  if (!title) return null
  const artists = (sp.get('artists') || '').trim()
  const yearRaw = Number(sp.get('year') || '')
  const artwork = (sp.get('artwork') || '').trim()
  return {
    title,
    mix_name: (sp.get('mix') || '').trim() || null,
    artists: artists
      ? artists.split(',').map((n) => ({ name: n.trim() })).filter((a) => a.name)
      : [],
    label: (sp.get('label') || '').trim() || null,
    artwork_url: artwork || null,
    release_year: Number.isFinite(yearRaw) && yearRaw > 1900 ? yearRaw : null,
  }
}

async function fetchStoryRow(
  kind: 'chart' | 'featured' | 'vinyl',
  id: string,
): Promise<StoryRow | null> {
  const supabase = createCachedSupabase()
  const table =
    kind === 'chart' ? 'chart_tracks' : kind === 'featured' ? 'chart_featured_tracks' : 'chart_vinyl_tracks'
  const cols =
    kind === 'vinyl'
      ? 'title, mix_name, artists, label, artwork_url, youtube_url, year'
      : 'title, mix_name, artists, label, artwork_url, release_year'
  const { data } = await supabase.from(table).select(cols).eq('id', id).maybeSingle()
  return (data as StoryRow | null) ?? null
}

function absoluteImageUrl(raw: string | null | undefined): string | null {
  const url = (raw || '').trim()
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return `${SITE_URL}${url}`
  return null
}

function storyDateLabel(iso: string | null | undefined, es: boolean): string {
  const day = (iso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  const d = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(es ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Story de una sesión (/mixes/<slug>): festival, edición, fecha y retrato. */
async function mixStoryResponse(slug: string, es: boolean): Promise<ImageResponse | NextResponse> {
  const supabase = createCachedSupabase()
  const { data: mixRaw } = await supabase.from('mixes').select('*').eq('slug', slug).maybeSingle()
  const mix = mixRaw as Mix | null
  if (!mix?.title) return NextResponse.json({ error: 'Mix not found' }, { status: 404 })

  let eventName: string | null = null
  let eventDate: string | null = null
  let eventPlace: string | null = null
  if (mix.event_id) {
    const { data } = await supabase
      .from('events')
      .select('name, date_start, venue, city')
      .eq('id', mix.event_id)
      .maybeSingle()
    const ev = data as { name?: string | null; date_start?: string | null; venue?: string | null; city?: string | null } | null
    eventName = ev?.name?.trim() || null
    eventDate = ev?.date_start || null
    eventPlace = [ev?.venue, ev?.city].map((s) => s?.trim()).filter(Boolean).join(' · ') || null
  }

  const series = eventName ? festivalSeriesForEventName(eventName) : null
  const brand = festivalBrandOfSeries(series?.slug)
  const festivalName = brand?.name ?? series?.name ?? null
  const editionName = brand && series ? series.name : null

  const names = flattenLineupArtistNames(mix.artist_name ? [mix.artist_name] : [])
  const lookup = buildArtistSlugLookup(await fetchAllArtistLinkRows(supabase))
  let portrait: string | null = null
  for (const name of names) {
    const artistSlug = resolveArtistSlug(name, lookup)
    if (!artistSlug) continue
    const { data } = await supabase.from('artists').select('image_url').eq('slug', artistSlug).maybeSingle()
    portrait = absoluteImageUrl((data as { image_url?: string | null } | null)?.image_url)
    if (portrait) break
  }
  const yt = extractYouTubeId(mix.video_url)
  const artworkDataUrl = await loadArtworkDataUrl(
    portrait || absoluteImageUrl(mix.image_url) || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null),
  )

  const artist = (mix.artist_name || names[0] || '').trim().slice(0, 80)
  const title = mix.title.trim().slice(0, 90)
  const when = storyDateLabel(eventDate || mix.published_at, es)
  const kicker = es ? 'SESIÓN' : 'DJ SET'
  const footerWarning = es
    ? 'La música del sticker no es esta sesión'
    : 'The sticker music is not this set'
  const footerDomain = es
    ? 'Escúchala entera en el enlace · www.optimalbreaks.com'
    : 'Hear the full set via the link · www.optimalbreaks.com'

  const line = (text: string, size: number, color: string, weight: number, tracking = 1) => (
    <div
      style={{
        display: 'flex',
        marginTop: 16,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: tracking,
        color,
        textAlign: 'center',
        textTransform: 'uppercase',
        fontFamily: FONT,
      }}
    >
      {text}
    </div>
  )

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
          padding: '130px 70px 200px',
          boxSizing: 'border-box',
          border: `18px solid ${PAPER}`,
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, backgroundColor: RED, display: 'flex' }} />
        <div style={{ display: 'flex', flexDirection: 'row', fontSize: 52, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', fontFamily: FONT }}>
          <span style={{ color: PAPER }}>OPTIMAL&nbsp;</span>
          <span style={{ color: RED }}>BREAKS</span>
        </div>
        <div style={{ display: 'flex', marginTop: 16, fontSize: 30, fontWeight: 800, letterSpacing: 8, color: YELLOW, textTransform: 'uppercase', fontFamily: MONO }}>
          {kicker}
        </div>
        <div style={{ display: 'flex', marginTop: 48, width: 720, height: 720, border: `10px solid ${PAPER}`, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
          {artworkDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artworkDataUrl} alt="" width={700} height={700} style={{ width: 700, height: 700, objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'flex', fontSize: 160, fontWeight: 900, color: PAPER, fontFamily: FONT }}>OB</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 40, width: '100%' }}>
          {artist ? line(artist, artist.length > 24 ? 44 : 56, YELLOW, 900, 1) : null}
          {festivalName
            ? line(festivalName, 38, PAPER, 900, 2)
            : line(eventName || title, (eventName || title).length > 42 ? 30 : 38, PAPER, 800, 0)}
          {editionName ? line(`${es ? 'Edición' : 'Edition'}: ${editionName}`, 30, YELLOW, 700, 2) : null}
          {when ? line(when, 30, PAPER, 700, 2) : null}
          {eventPlace ? line(eventPlace, 24, PAPER, 600, 2) : null}
        </div>
        <div style={{ position: 'absolute', bottom: 64, left: 70, right: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, letterSpacing: 1, color: YELLOW, textTransform: 'uppercase', fontFamily: MONO, textAlign: 'center' }}>
            {footerWarning}
          </div>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 600, letterSpacing: 1, color: PAPER, opacity: 0.65, textTransform: 'uppercase', fontFamily: MONO, textAlign: 'center' }}>
            {footerDomain}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    },
  )
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const lang = sp.get('lang') === 'en' ? 'en' : 'es'
  const playRaw = (sp.get('play') || '').trim()
  const mixPlay = /^mix:([a-z0-9-]{2,})$/i.exec(playRaw)
  if (mixPlay) return mixStoryResponse(mixPlay[1].toLowerCase(), lang === 'es')
  const parsed = parsePlayParam(playRaw)

  let kind: 'chart' | 'featured' | 'vinyl' | 'beatport' | null = null
  let id = ''
  if (parsed?.kind === 'track') {
    kind = parsed.source
    id = parsed.id
  } else if (parsed?.kind === 'vinyl') {
    kind = 'vinyl'
    id = parsed.id
  } else if (parsed?.kind === 'beatport') {
    kind = 'beatport'
    id = parsed.id
  }
  if (!kind || !id) {
    return NextResponse.json({ error: 'Invalid play param' }, { status: 400 })
  }

  let artworkUntrusted = false
  const row =
    kind === 'beatport'
      ? await (async () => {
          const fromCatalog = await fetchBeatportStoryRow(id, sp.get('from'))
          if (fromCatalog) return fromCatalog
          artworkUntrusted = true
          return storyRowFromQuery(sp)
        })()
      : await fetchStoryRow(kind, id)
  if (!row?.title) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  }

  const rawArtwork =
    upscaleTrackArtworkForOg(row.artwork_url) ??
    (kind === 'vinyl' ? youtubeThumbnailFromUrl(row.youtube_url) : null)
  const artworkSource =
    rawArtwork && artworkUntrusted && !isAllowedQueryArtworkUrl(rawArtwork)
      ? null
      : rawArtwork
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
        : kind === 'beatport'
          ? 'BEATPORT TOP 10'
          : '40 BREAKS VITALES'
  // El admin suele añadir un sticker de música de Instagram a la story
  // (catálogo de Meta): avisamos de que ese audio NO es el tema compartido.
  const footerWarning = es
    ? 'La música que suena aquí no es este tema'
    : 'The music playing here is not this track'
  const footerDomain = es
    ? 'Escúchalo real en el enlace · www.optimalbreaks.com'
    : 'Hear the real one via the link · www.optimalbreaks.com'

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

        {/* Pie: advertencia sobre el audio del sticker + dominio */}
        <div
          style={{
            position: 'absolute',
            bottom: 72,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 2,
              color: YELLOW,
              textTransform: 'uppercase',
              fontFamily: MONO,
            }}
          >
            {footerWarning}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 2,
              color: PAPER,
              opacity: 0.65,
              textTransform: 'uppercase',
              fontFamily: MONO,
            }}
          >
            {footerDomain}
          </div>
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
