// ============================================
// OPTIMAL BREAKS — Artist cross-links (charts, mixes, events)
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Locale } from '@/lib/i18n-config'

function escIlike(raw: string): string {
  return raw.replace(/[%_,]/g, ' ').trim()
}

function normKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clave normalizada para emparejar títulos de tracks (essential_tracks ↔ charts). */
export function normalizeTrackTitleKey(title: string): string {
  return normKey(title)
}

function formatShortDate(iso: string, lang: Locale): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export type ArtistChartLink = {
  id: string
  title: string
  kind: 'chart' | 'featured' | 'vinyl'
  weekDate: string | null
  position: number | null
  subtitle: string
  href: string
}

export type ArtistMixLink = {
  slug: string
  title: string
  year: number | null
  href: string
}

export type ArtistEventLink = {
  slug: string
  name: string
  dateStart: string
  city: string | null
  href: string
}

export type ArtistRelatedContent = {
  chartLinks: ArtistChartLink[]
  mixLinks: ArtistMixLink[]
  upcomingEvents: ArtistEventLink[]
  /** Título normalizado → href en /charts (para tracks esenciales). */
  trackHrefByTitle: Map<string, string>
}

type ChartRow = {
  id: string
  title: string | null
  mix_name: string | null
  label: string | null
  position?: number | null
  year?: number | null
  chart_editions?: { week_date: string } | { week_date: string }[] | null
}

function weekDateFromRow(row: ChartRow): string | null {
  const ce = row.chart_editions
  if (!ce) return null
  if (Array.isArray(ce)) return ce[0]?.week_date ?? null
  return ce.week_date ?? null
}

function buildChartHref(lang: Locale, rowId: string, weekDate: string | null, kind: 'chart' | 'featured' | 'vinyl'): string {
  const anchor = kind === 'vinyl' ? `chart-vinyl-row-${rowId}` : `chart-row-${rowId}`
  const week = weekDate ? `?week=${weekDate}` : ''
  return `/${lang}/charts${week}#${anchor}`
}

function chartSubtitle(
  kind: 'chart' | 'featured' | 'vinyl',
  lang: Locale,
  position: number | null,
  weekDate: string | null,
  year: number | null,
): string {
  if (kind === 'chart') {
    const parts = [
      position != null ? `#${position}` : null,
      lang === 'es' ? '40 Breaks Vitales' : '40 Breaks Vitales',
      weekDate ? formatShortDate(weekDate, lang) : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }
  if (kind === 'featured') {
    const parts = [
      lang === 'es' ? 'New Releases' : 'New Releases',
      weekDate ? formatShortDate(weekDate, lang) : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }
  const parts = [
    lang === 'es' ? 'Retro Vinyl' : 'Retro Vinyl',
    year ? String(year) : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

function dedupeChartRows(
  chartRows: ChartRow[],
  featuredRows: ChartRow[],
  vinylRows: ChartRow[],
  lang: Locale,
): ArtistChartLink[] {
  const seen = new Set<string>()
  const out: ArtistChartLink[] = []

  const push = (row: ChartRow, kind: 'chart' | 'featured' | 'vinyl') => {
    const title = (row.title || '').trim() || '—'
    const mix = (row.mix_name || '').trim()
    const key = `${normKey(title)}|${normKey(mix)}`
    if (seen.has(key)) return
    seen.add(key)

    const weekDate = kind === 'vinyl' ? null : weekDateFromRow(row)
    const position = kind === 'chart' ? (row.position ?? null) : null
    const year = kind === 'vinyl' ? (row.year ?? null) : null
    const displayTitle = mix ? `${title} (${mix})` : title

    out.push({
      id: row.id,
      title: displayTitle,
      kind,
      weekDate,
      position,
      subtitle: chartSubtitle(kind, lang, position, weekDate, year),
      href: buildChartHref(lang, row.id, weekDate, kind),
    })
  }

  for (const row of chartRows) push(row, 'chart')
  for (const row of featuredRows) push(row, 'featured')
  for (const row of vinylRows) push(row, 'vinyl')

  return out.slice(0, 8)
}

function artistSearchTerms(name: string, nameDisplay: string | null | undefined): string[] {
  const terms = new Set<string>()
  for (const raw of [name, nameDisplay]) {
    const t = escIlike((raw || '').trim())
    if (t.length >= 2) terms.add(t)
  }
  return Array.from(terms)
}

export async function fetchArtistRelatedContent(
  supabase: SupabaseClient<Database>,
  artist: { id: string; name: string; name_display?: string | null },
  lang: Locale,
): Promise<ArtistRelatedContent> {
  const base = (path: string) => `/${lang}${path}`
  const todayIso = new Date().toISOString().slice(0, 10)
  const terms = artistSearchTerms(artist.name, artist.name_display)
  const primaryTerm = terms[0] || escIlike(artist.name)
  const ilike = `%${primaryTerm}%`

  const mixOr = [`artist_id.eq.${artist.id}`, `artist_name.ilike.${ilike}`].join(',')

  const [mixesRes, chartRes, featuredRes, vinylRes, eventsRes] = await Promise.all([
    supabase
      .from('mixes')
      .select('slug, title, year')
      .or(mixOr)
      .order('published_at', { ascending: false })
      .limit(6),
    supabase
      .from('chart_tracks')
      .select('id, title, mix_name, label, position, chart_editions!inner(week_date)')
      .ilike('artist_names_text', ilike)
      .order('week_date', { referencedTable: 'chart_editions', ascending: false })
      .order('position', { ascending: true })
      .limit(20),
    supabase
      .from('chart_featured_tracks')
      .select('id, title, mix_name, label, chart_editions!inner(week_date)')
      .ilike('artist_names_text', ilike)
      .order('week_date', { referencedTable: 'chart_editions', ascending: false })
      .limit(20),
    supabase
      .from('chart_vinyl_tracks')
      .select('id, title, mix_name, label, year')
      .ilike('artist_names_text', ilike)
      .limit(10),
    supabase
      .from('events')
      .select('slug, name, date_start, city')
      .ilike('lineup_text', ilike)
      .gte('date_start', todayIso)
      .order('date_start', { ascending: true })
      .limit(5),
  ])

  const chartLinks = dedupeChartRows(
    (chartRes.data || []) as unknown as ChartRow[],
    (featuredRes.data || []) as unknown as ChartRow[],
    (vinylRes.data || []) as unknown as ChartRow[],
    lang,
  )

  const trackHrefByTitle = new Map<string, string>()
  for (const link of chartLinks) {
    const rawTitle = link.title.replace(/\s*\([^)]*\)\s*$/, '').trim()
    const keys = [normKey(rawTitle), normKey(link.title)]
    for (const k of keys) {
      if (k && !trackHrefByTitle.has(k)) trackHrefByTitle.set(k, link.href)
    }
  }

  const mixLinks: ArtistMixLink[] = (mixesRes.data || []).map((m) => ({
    slug: m.slug,
    title: m.title,
    year: m.year ?? null,
    href: base(`/mixes/${m.slug}`),
  }))

  const upcomingEvents: ArtistEventLink[] = (eventsRes.data || []).map((e) => ({
    slug: e.slug,
    name: e.name,
    dateStart: e.date_start || '',
    city: e.city ?? null,
    href: base(`/events/${e.slug}`),
  }))

  return { chartLinks, mixLinks, upcomingEvents, trackHrefByTitle }
}

/** Intenta enlazar un texto editorial de mix con una fila del catálogo. */
export function resolveRecommendedMixHref(
  label: string,
  mixLinks: ArtistMixLink[],
): string | null {
  const key = normKey(label)
  if (!key) return null
  for (const mix of mixLinks) {
    const mixKey = normKey(mix.title)
    if (mixKey.includes(key) || key.includes(mixKey)) return mix.href
  }
  return null
}
