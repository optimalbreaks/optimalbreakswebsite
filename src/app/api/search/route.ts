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
      .select('id, slug, title, artist_name, image_url, year, platform, mix_type')
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

  for (const m of mixesRes.data || []) {
    const parts = [m.artist_name, m.year ? String(m.year) : null].filter(Boolean)
    results.push({
      type: 'mix',
      id: m.id,
      slug: m.slug,
      title: (m.title || m.slug) as string,
      subtitle: parts.join(' — '),
      image_url: (m.image_url as string | null) ?? null,
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
