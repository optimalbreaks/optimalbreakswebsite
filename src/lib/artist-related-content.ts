// ============================================
// OPTIMAL BREAKS — Artist cross-links (charts, mixes, events)
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChartFeaturedTrack, Database } from '@/types/database'
import type { Locale } from '@/lib/i18n-config'
import { normalizeForEntityMatch } from '@/lib/artist-entity-match'

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
  artistsText: string
  artistNames: string[]
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
  isUpcoming: boolean
}

export type ArtistRelatedContent = {
  chartLinks: ArtistChartLink[]
  mixLinks: ArtistMixLink[]
  /** Próximos primero; después eventos recientes (12 meses). */
  artistEvents: ArtistEventLink[]
  /** Título normalizado → href en /charts (para tracks esenciales). */
  trackHrefByTitle: Map<string, string>
}

/** Pick editorial de New Releases enlazado a la semana (`chart_editions.week_date`). */
export type ArtistFeaturedPick = ChartFeaturedTrack & { weekDate: string }

type ChartRow = {
  id: string
  title: string | null
  mix_name: string | null
  label: string | null
  position?: number | null
  year?: number | null
  artists?: unknown
  chart_editions?: { week_date: string } | { week_date: string }[] | null
}

function extractArtistNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const names: string[] = []
  for (const a of raw) {
    if (typeof a === 'string' && a.trim()) names.push(a.trim())
    else if (a && typeof a === 'object') {
      const n = (a as { name?: unknown }).name
      if (typeof n === 'string' && n.trim()) names.push(n.trim())
    }
  }
  return names
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
  caps: { chart?: number; featured?: number; vinyl?: number; total?: number } = {},
): ArtistChartLink[] {
  const chartCap = caps.chart ?? 12
  const featuredCap = caps.featured ?? 24
  const vinylCap = caps.vinyl ?? 8
  const totalCap = caps.total ?? 40

  const seen = new Set<string>()
  const out: ArtistChartLink[] = []
  const counts = { chart: 0, featured: 0, vinyl: 0 }

  const push = (row: ChartRow, kind: 'chart' | 'featured' | 'vinyl') => {
    if (out.length >= totalCap) return
    if (kind === 'chart' && counts.chart >= chartCap) return
    if (kind === 'featured' && counts.featured >= featuredCap) return
    if (kind === 'vinyl' && counts.vinyl >= vinylCap) return

    const title = (row.title || '').trim() || '—'
    const mix = (row.mix_name || '').trim()
    const key = `${normKey(title)}|${normKey(mix)}`
    if (seen.has(key)) return
    seen.add(key)

    const weekDate = kind === 'vinyl' ? null : weekDateFromRow(row)
    const position = kind === 'chart' ? (row.position ?? null) : null
    const year = kind === 'vinyl' ? (row.year ?? null) : null
    const displayTitle = mix ? `${title} (${mix})` : title
    const artistNames = extractArtistNames(row.artists)

    out.push({
      id: row.id,
      title: displayTitle,
      kind,
      weekDate,
      position,
      subtitle: chartSubtitle(kind, lang, position, weekDate, year),
      href: buildChartHref(lang, row.id, weekDate, kind),
      artistsText: artistNames.join(', '),
      artistNames,
    })
    counts[kind] += 1
  }

  for (const row of chartRows) push(row, 'chart')
  for (const row of featuredRows) push(row, 'featured')
  for (const row of vinylRows) push(row, 'vinyl')

  return out
}

function artistSearchTerms(
  artist: { name: string; name_display?: string | null; slug?: string },
): string[] {
  const terms = new Set<string>()
  const addTerm = (raw: string) => {
    const t = escIlike(raw.trim())
    if (t.length < 2) return
    terms.add(t)
    const depref = escIlike(t.replace(/^(dj|mc|the)\s+/i, '').trim())
    if (depref.length >= 2) terms.add(depref)
  }
  addTerm(artist.name)
  if (artist.name_display) addTerm(artist.name_display)
  if (artist.slug) addTerm(artist.slug.replace(/-/g, ' '))
  return Array.from(terms)
}

function buildArtistMatchKeys(
  artist: { name: string; name_display?: string | null; slug?: string },
): Set<string> {
  const keys = new Set<string>()
  for (const term of artistSearchTerms(artist)) {
    const n = normalizeForEntityMatch(term)
    if (n.length >= 2) keys.add(n)
  }
  return keys
}

function orIlikeFilter(column: string, terms: string[]): string {
  return terms.map((t) => `${column}.ilike.%${t}%`).join(',')
}

type EventRow = {
  slug: string
  name: string
  date_start: string | null
  city: string | null
  lineup?: unknown
  stages?: unknown
}

function collectLineupNames(lineup: unknown, stages: unknown): string[] {
  const out = new Set<string>()
  if (Array.isArray(lineup)) {
    for (const n of lineup) if (typeof n === 'string' && n.trim()) out.add(n)
  }
  if (Array.isArray(stages)) {
    for (const st of stages) {
      const sl = (st as { lineup?: unknown })?.lineup
      if (Array.isArray(sl)) {
        for (const n of sl) if (typeof n === 'string' && n.trim()) out.add(n)
      }
    }
  }
  return Array.from(out)
}

function lineupEntryMatchesArtist(lineupName: string, matchKeys: Set<string>): boolean {
  const n = normalizeForEntityMatch(lineupName)
  if (!n) return false
  if (matchKeys.has(n)) return true
  const depref = n.replace(/^(dj|mc|the)\s+/, '')
  return depref !== n && matchKeys.has(depref)
}

function eventRowMatchesArtist(row: EventRow, matchKeys: Set<string>): boolean {
  return collectLineupNames(row.lineup, row.stages).some((name) =>
    lineupEntryMatchesArtist(name, matchKeys),
  )
}

function mapArtistEvents(
  rows: EventRow[],
  matchKeys: Set<string>,
  base: (path: string) => string,
  isUpcoming: boolean,
  cap: number,
  seenSlugs: Set<string>,
): ArtistEventLink[] {
  const out: ArtistEventLink[] = []
  for (const e of rows) {
    if (out.length >= cap) break
    if (!eventRowMatchesArtist(e, matchKeys)) continue
    if (seenSlugs.has(e.slug)) continue
    seenSlugs.add(e.slug)
    out.push({
      slug: e.slug,
      name: e.name,
      dateStart: e.date_start || '',
      city: e.city ?? null,
      href: base(`/events/${e.slug}`),
      isUpcoming,
    })
  }
  return out
}

export async function fetchArtistRelatedContent(
  supabase: SupabaseClient<Database>,
  artist: { id: string; name: string; name_display?: string | null; slug: string },
  lang: Locale,
): Promise<ArtistRelatedContent> {
  const base = (path: string) => `/${lang}${path}`
  const todayIso = new Date().toISOString().slice(0, 10)
  const pastCutoff = new Date()
  pastCutoff.setFullYear(pastCutoff.getFullYear() - 1)
  const pastCutoffIso = pastCutoff.toISOString().slice(0, 10)
  const terms = artistSearchTerms(artist)
  const matchKeys = buildArtistMatchKeys(artist)
  const artistNamesOr = orIlikeFilter('artist_names_text', terms)
  const lineupOr = orIlikeFilter('lineup_text', terms)
  const mixOr = [`artist_id.eq.${artist.id}`, ...terms.map((t) => `artist_name.ilike.%${t}%`)].join(',')

  const [mixesRes, chartRes, featuredRes, vinylRes, upcomingEventsRes, pastEventsRes] = await Promise.all([
    supabase
      .from('mixes')
      .select('slug, title, year')
      .or(mixOr)
      .order('published_at', { ascending: false })
      .limit(6),
    supabase
      .from('chart_tracks')
      .select('id, title, mix_name, label, position, artists, chart_editions!inner(week_date)')
      .or(artistNamesOr)
      .order('week_date', { referencedTable: 'chart_editions', ascending: false })
      .order('position', { ascending: true })
      .limit(24),
    supabase
      .from('chart_featured_tracks')
      .select('id, title, mix_name, label, artists, chart_editions!inner(week_date)')
      .or(artistNamesOr)
      .order('week_date', { referencedTable: 'chart_editions', ascending: false })
      .limit(48),
    supabase
      .from('chart_vinyl_tracks')
      .select('id, title, mix_name, label, year, artists')
      .or(artistNamesOr)
      .limit(10),
    supabase
      .from('events')
      .select('slug, name, date_start, city, lineup, stages')
      .or(lineupOr)
      .gte('date_start', todayIso)
      .order('date_start', { ascending: true })
      .limit(20),
    supabase
      .from('events')
      .select('slug, name, date_start, city, lineup, stages')
      .or(lineupOr)
      .lt('date_start', todayIso)
      .gte('date_start', pastCutoffIso)
      .order('date_start', { ascending: false })
      .limit(12),
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

  const seenEventSlugs = new Set<string>()
  const artistEvents = [
    ...mapArtistEvents(
      (upcomingEventsRes.data || []) as EventRow[],
      matchKeys,
      base,
      true,
      5,
      seenEventSlugs,
    ),
    ...mapArtistEvents(
      (pastEventsRes.data || []) as EventRow[],
      matchKeys,
      base,
      false,
      4,
      seenEventSlugs,
    ),
  ]

  return { chartLinks, mixLinks, artistEvents, trackHrefByTitle }
}

type FeaturedPickRow = ChartFeaturedTrack & {
  chart_editions?: { week_date: string } | { week_date: string }[] | null
}

function mapFeaturedPickRows(rows: FeaturedPickRow[]): ArtistFeaturedPick[] {
  const seen = new Set<string>()
  const out: ArtistFeaturedPick[] = []

  for (const row of rows) {
    const weekDate = weekDateFromRow(row as ChartRow)
    if (!weekDate) continue

    const title = (row.title || '').trim() || '—'
    const mix = (row.mix_name || '').trim()
    const key = `${normKey(title)}|${normKey(mix)}`
    if (seen.has(key)) continue
    seen.add(key)

    const { chart_editions: _ce, ...pick } = row
    out.push({ ...pick, weekDate })
  }

  out.sort((a, b) => {
    const ad = a.release_date || ''
    const bd = b.release_date || ''
    if (ad !== bd) return bd.localeCompare(ad)
    return b.weekDate.localeCompare(a.weekDate)
  })

  return out
}

/** Picks de New Releases donde aparece el artista (match por `artist_names_text`). */
export async function fetchArtistFeaturedPicks(
  supabase: SupabaseClient<Database>,
  artist: { name: string; name_display?: string | null; slug?: string },
): Promise<ArtistFeaturedPick[]> {
  const terms = artistSearchTerms(artist)
  if (terms.length === 0) return []
  const artistNamesOr = orIlikeFilter('artist_names_text', terms)

  const { data, error } = await supabase
    .from('chart_featured_tracks')
    .select(
      'id, chart_edition_id, sort_order, title, mix_name, label, artists, platform, link_url, link_label, artwork_url, sample_url, bpm, music_key, release_year, release_date, note_en, note_es, chart_editions!inner(week_date)',
    )
    .or(artistNamesOr)
    .order('week_date', { referencedTable: 'chart_editions', ascending: false })

  if (error || !data?.length) return []
  return mapFeaturedPickRows(data as unknown as FeaturedPickRow[])
}

export async function fetchLabelChartLinks(
  supabase: SupabaseClient<Database>,
  label: { name: string },
  lang: Locale,
): Promise<ArtistChartLink[]> {
  const primaryTerm = escIlike(label.name)
  if (primaryTerm.length < 2) return []
  const ilike = `%${primaryTerm}%`

  const [chartRes, featuredRes, vinylRes] = await Promise.all([
    supabase
      .from('chart_tracks')
      .select('id, title, mix_name, label, position, artists, chart_editions!inner(week_date)')
      .ilike('label', ilike)
      .order('week_date', { referencedTable: 'chart_editions', ascending: false })
      .order('position', { ascending: true })
      .limit(24),
    supabase
      .from('chart_featured_tracks')
      .select('id, title, mix_name, label, artists, chart_editions!inner(week_date)')
      .ilike('label', ilike)
      .order('week_date', { referencedTable: 'chart_editions', ascending: false })
      .limit(24),
    supabase
      .from('chart_vinyl_tracks')
      .select('id, title, mix_name, label, year, artists')
      .ilike('label', ilike)
      .limit(12),
  ])

  return dedupeChartRows(
    (chartRes.data || []) as unknown as ChartRow[],
    (featuredRes.data || []) as unknown as ChartRow[],
    (vinylRes.data || []) as unknown as ChartRow[],
    lang,
    { chart: 12, featured: 24, vinyl: 8, total: 40 },
  )
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
