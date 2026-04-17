// ============================================
// OPTIMAL BREAKS — API: Global search (⌘K palette)
// Mezcla artists + labels + events + mixes + scenes + blog + organizations
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createSimpleSupabase } from '@/lib/supabase'
import { displayArtistImageUrl } from '@/lib/artist-public-portrait'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Lang = 'es' | 'en'
type ResultType =
  | 'artist'
  | 'label'
  | 'event'
  | 'mix'
  | 'scene'
  | 'post'
  | 'organization'

export interface SearchResult {
  type: ResultType
  id: string
  slug: string
  title: string
  subtitle: string
  image_url: string | null
  href: string
}

/** Limita por IP (instancia) para parar curl/bots sin autenticación. */
const ipHits = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0]?.trim() || 'unknown'
  return req.headers.get('x-real-ip') || 'unknown'
}

function allowRate(ip: string): boolean {
  const now = Date.now()
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  if (arr.length >= MAX_PER_WINDOW) {
    ipHits.set(ip, arr)
    return false
  }
  arr.push(now)
  ipHits.set(ip, arr)
  return true
}

/** Escape para `ilike`: % y _ son comodines, el `,` rompe `.or()`. */
function escIlike(raw: string): string {
  return raw.replace(/[%_,]/g, ' ').trim()
}

function isValidLang(v: string | null): v is Lang {
  return v === 'es' || v === 'en'
}

function byType(
  out: SearchResult[],
  cap: number,
): SearchResult[] {
  const seen = new Set<string>()
  const result: SearchResult[] = []
  for (const r of out) {
    const k = `${r.type}:${r.slug}`
    if (seen.has(k)) continue
    seen.add(k)
    result.push(r)
    if (result.length >= cap) break
  }
  return result
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  if (!allowRate(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const url = new URL(request.url)
  const qRaw = (url.searchParams.get('q') || '').trim()
  const langParam = url.searchParams.get('lang')
  const lang: Lang = isValidLang(langParam) ? langParam : 'es'

  if (!qRaw || qRaw.length < 2) {
    return NextResponse.json({ results: [] as SearchResult[] })
  }
  const q = escIlike(qRaw).slice(0, 80)
  if (!q) {
    return NextResponse.json({ results: [] as SearchResult[] })
  }
  const ilike = `%${q}%`
  const supabase = createSimpleSupabase()

  const base = (path: string) => `/${lang}${path}`

  const [
    artistsRes,
    labelsRes,
    eventsRes,
    mixesRes,
    scenesRes,
    postsRes,
    orgsRes,
  ] = await Promise.all([
    supabase
      .from('artists')
      .select('id, slug, name, name_display, image_url, country, styles, category')
      .or(`name.ilike.${ilike},name_display.ilike.${ilike},slug.ilike.${ilike}`)
      .limit(12),
    supabase
      .from('labels')
      .select('id, slug, name, image_url, country, founded_year')
      .or(`name.ilike.${ilike},slug.ilike.${ilike}`)
      .limit(8),
    supabase
      .from('events')
      .select('id, slug, name, image_url, city, country, date_start, event_type')
      .or(`name.ilike.${ilike},slug.ilike.${ilike},city.ilike.${ilike}`)
      .order('date_start', { ascending: false })
      .limit(8),
    supabase
      .from('mixes')
      .select('id, slug, title, artist_name, artist_id, image_url, year, platform, mix_type, video_url, embed_url')
      .or(`title.ilike.${ilike},artist_name.ilike.${ilike},slug.ilike.${ilike}`)
      .limit(8),
    supabase
      .from('scenes')
      .select('id, slug, name_en, name_es, image_url, country, region, era')
      .or(
        `name_en.ilike.${ilike},name_es.ilike.${ilike},slug.ilike.${ilike},country.ilike.${ilike},region.ilike.${ilike}`,
      )
      .limit(6),
    supabase
      .from('blog_posts')
      .select('id, slug, title_en, title_es, image_url, category, published_at, is_published')
      .eq('is_published', true)
      .or(`title_en.ilike.${ilike},title_es.ilike.${ilike},slug.ilike.${ilike}`)
      .order('published_at', { ascending: false })
      .limit(6),
    supabase
      .from('organizations')
      .select('id, slug, name, image_url, country, base_city')
      .or(`name.ilike.${ilike},slug.ilike.${ilike}`)
      .limit(4),
  ])

  const results: SearchResult[] = []

  for (const a of artistsRes.data || []) {
    const styles = Array.isArray(a.styles) ? a.styles.filter(Boolean).slice(0, 2) : []
    const subtitleParts = [a.country, styles.join(' · ')].filter(Boolean)
    results.push({
      type: 'artist',
      id: a.id,
      slug: a.slug,
      title: (a.name_display?.trim() || a.name || a.slug) as string,
      subtitle: subtitleParts.join(' — '),
      image_url: displayArtistImageUrl(a.slug, a.image_url ?? null) ?? null,
      href: base(`/artists/${a.slug}`),
    })
  }

  for (const l of labelsRes.data || []) {
    const parts = [l.country, l.founded_year ? `#${l.founded_year}` : null].filter(Boolean)
    results.push({
      type: 'label',
      id: l.id,
      slug: l.slug,
      title: (l.name || l.slug) as string,
      subtitle: parts.join(' — '),
      image_url: (l.image_url as string | null) ?? null,
      href: base(`/labels/${l.slug}`),
    })
  }

  for (const e of eventsRes.data || []) {
    const place = [e.city, e.country].filter(Boolean).join(', ')
    const year = e.date_start ? e.date_start.slice(0, 4) : ''
    const parts = [place, year].filter(Boolean)
    results.push({
      type: 'event',
      id: e.id,
      slug: e.slug,
      title: (e.name || e.slug) as string,
      subtitle: parts.join(' — '),
      image_url: (e.image_url as string | null) ?? null,
      href: base(`/events/${e.slug}`),
    })
  }

  // Para mixes sin portada propia: usa la foto del artista vinculado
  // y, como último recurso, la thumbnail de YouTube (video_url/embed_url).
  const mixesRows = (mixesRes.data || []) as Array<{
    id: string
    slug: string
    title: string
    artist_name: string
    artist_id: string | null
    image_url: string | null
    year: number | null
    platform: string | null
    mix_type: string | null
    video_url: string | null
    embed_url: string | null
  }>

  const missingArtistIds = Array.from(
    new Set(mixesRows.filter((m) => !m.image_url && m.artist_id).map((m) => m.artist_id as string)),
  )
  const artistImageById = new Map<string, { slug: string; image_url: string | null }>()
  if (missingArtistIds.length) {
    const { data: artistFallbacks } = await supabase
      .from('artists')
      .select('id, slug, image_url')
      .in('id', missingArtistIds)
    for (const a of artistFallbacks || []) {
      artistImageById.set(a.id, { slug: a.slug, image_url: a.image_url ?? null })
    }
  }

  // Como último recurso (mix sin image_url y sin artist_id resoluble), busca por nombre.
  const missingNames = Array.from(
    new Set(
      mixesRows
        .filter(
          (m) =>
            !m.image_url &&
            (!m.artist_id || !artistImageById.has(m.artist_id)) &&
            (m.artist_name || '').trim().length > 0,
        )
        .map((m) => (m.artist_name || '').trim().toLowerCase()),
    ),
  )
  const artistImageByLowerName = new Map<string, { slug: string; image_url: string | null }>()
  if (missingNames.length) {
    const orFilter = missingNames
      .slice(0, 12)
      .map((n) => `name.ilike.${escIlike(n)},name_display.ilike.${escIlike(n)}`)
      .join(',')
    if (orFilter) {
      const { data: rows } = await supabase
        .from('artists')
        .select('slug, name, name_display, image_url')
        .or(orFilter)
        .limit(24)
      for (const r of rows || []) {
        const keys = [r.name, r.name_display].filter(Boolean).map((s) => (s as string).toLowerCase())
        for (const k of keys) {
          if (!artistImageByLowerName.has(k)) {
            artistImageByLowerName.set(k, { slug: r.slug, image_url: r.image_url ?? null })
          }
        }
      }
    }
  }

  function youtubeIdFromUrl(urlStr: string | null | undefined): string | null {
    if (!urlStr) return null
    const patterns = [
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ]
    for (const re of patterns) {
      const mm = urlStr.match(re)
      if (mm) return mm[1]
    }
    return null
  }

  for (const m of mixesRows) {
    const parts = [m.artist_name, m.year ? String(m.year) : null].filter(Boolean)
    let image: string | null = m.image_url ?? null
    if (!image && m.artist_id) {
      const a = artistImageById.get(m.artist_id)
      image = displayArtistImageUrl(a?.slug, a?.image_url ?? null) ?? null
    }
    if (!image) {
      const key = (m.artist_name || '').trim().toLowerCase()
      const a = key ? artistImageByLowerName.get(key) : null
      image = displayArtistImageUrl(a?.slug, a?.image_url ?? null) ?? null
    }
    if (!image) {
      const ytId = youtubeIdFromUrl(m.video_url) || youtubeIdFromUrl(m.embed_url)
      if (ytId) image = `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`
    }
    results.push({
      type: 'mix',
      id: m.id,
      slug: m.slug,
      title: (m.title || m.slug) as string,
      subtitle: parts.join(' — '),
      image_url: image,
      href: base(`/mixes#${m.slug}`),
    })
  }

  for (const s of scenesRes.data || []) {
    const title = (lang === 'es' ? s.name_es : s.name_en) || s.name_en || s.name_es || s.slug
    const parts = [s.region, s.country, s.era].filter(Boolean)
    results.push({
      type: 'scene',
      id: s.id,
      slug: s.slug,
      title: title as string,
      subtitle: parts.join(' — '),
      image_url: (s.image_url as string | null) ?? null,
      href: base(`/scenes/${s.slug}`),
    })
  }

  for (const p of postsRes.data || []) {
    const title = (lang === 'es' ? p.title_es : p.title_en) || p.title_en || p.title_es || p.slug
    const parts = [p.category, p.published_at ? p.published_at.slice(0, 4) : null].filter(Boolean)
    results.push({
      type: 'post',
      id: p.id,
      slug: p.slug,
      title: title as string,
      subtitle: parts.join(' — '),
      image_url: (p.image_url as string | null) ?? null,
      href: base(`/blog/${p.slug}`),
    })
  }

  for (const o of orgsRes.data || []) {
    const parts = [o.base_city, o.country].filter(Boolean)
    results.push({
      type: 'organization',
      id: o.id,
      slug: o.slug,
      title: (o.name || o.slug) as string,
      subtitle: parts.join(' — '),
      image_url: (o.image_url as string | null) ?? null,
      href: base(`/organizations/${o.slug}`),
    })
  }

  const deduped = byType(results, 60)
  return NextResponse.json(
    { results: deduped },
    {
      headers: {
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
      },
    },
  )
}
