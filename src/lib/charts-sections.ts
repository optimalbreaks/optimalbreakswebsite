// ============================================
// OPTIMAL BREAKS — /charts por secciones
// La página solo recibe totales. Los temas de una semana o un año
// se piden al abrir el acordeón (la URL con 989 ediciones reventaba).
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChartFeaturedTrack, ChartVinylTrack, Database } from '@/types/database'
import {
  CHARTS_EDITORIAL_START,
  featuredArchiveYearKey,
  isArchiveFeaturedTrack,
} from '@/lib/charts-archive'
import { vinylRowDisplayScore, vinylTrackDedupKey } from '@/lib/share-track'

const PAGE = 1000
export const UNKNOWN_ARCHIVE_YEAR = '__unknown_year__'

export type ChartPickWeekSummary = {
  id: string
  weekDate: string
  count: number
  editionNumber: number
  isLatest: boolean
}

export type ArchiveYearSummary = {
  yearKey: string
  count: number
}

export type ArchiveSectionRow =
  | { kind: 'vinyl'; track: ChartVinylTrack; weekDate: string }
  | { kind: 'featured'; pick: ChartFeaturedTrack; weekDate: string }

export type ChartLocateTarget =
  | { kind: 'picks'; week: string }
  | { kind: 'archive'; year: string }

type Sb = SupabaseClient<Database>

type EditionEmbed = { week_date: string } | { week_date: string }[] | null

function editionWeek(embed: EditionEmbed): string {
  if (!embed) return ''
  return Array.isArray(embed) ? (embed[0]?.week_date ?? '') : (embed.week_date ?? '')
}

function goesToArchive(
  pick: { release_date?: string | null; release_year?: number | null },
  week: string,
): boolean {
  return isArchiveFeaturedTrack(pick) || (!!week && week < CHARTS_EDITORIAL_START)
}

async function fetchPages<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await run(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data as T[] | null) ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

type SlimFeatured = {
  id: string
  link_url: string | null
  release_date: string | null
  release_year: number | null
  chart_edition_id: string
  chart_editions: EditionEmbed
}

type SlimVinyl = {
  id: string
  title: string | null
  mix_name: string | null
  artists: { name?: string }[] | null
  year: number | null
  artwork_url: string | null
  youtube_url: string | null
  format: string | null
  discogs_url: string | null
}

function vinylYearKey(year: number | null | undefined): string {
  return typeof year === 'number' && Number.isFinite(year) ? String(year) : UNKNOWN_ARCHIVE_YEAR
}

/** Totales de New Releases (por semana) y del archivo (por año). Sin las filas. */
export async function loadChartsOutline(supabase: Sb): Promise<{
  pickWeeks: ChartPickWeekSummary[]
  archiveYears: ArchiveYearSummary[]
}> {
  const [editionsRes, featured, vinyl] = await Promise.all([
    supabase
      .from('chart_editions')
      .select('id, week_date')
      .eq('is_published', true)
      .gte('week_date', CHARTS_EDITORIAL_START)
      .order('week_date', { ascending: false }),
    fetchPages<SlimFeatured>((from, to) =>
      supabase
        .from('chart_featured_tracks')
        .select('id, link_url, release_date, release_year, chart_edition_id, chart_editions!inner(week_date)')
        .eq('chart_editions.is_published', true)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchPages<SlimVinyl>((from, to) =>
      supabase
        .from('chart_vinyl_tracks')
        .select('id, title, mix_name, artists, year, artwork_url, youtube_url, format, discogs_url, chart_editions!inner(week_date)')
        .eq('chart_editions.is_published', true)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])
  if (editionsRes.error) throw new Error(editionsRes.error.message)

  const nrCount = new Map<string, number>()
  const archiveFeatured = new Map<string, { urls: Set<string>; ids: Set<string>; n: number }>()
  for (const row of featured) {
    const week = editionWeek(row.chart_editions)
    const pick = { release_date: row.release_date, release_year: row.release_year }
    if (week >= CHARTS_EDITORIAL_START && !isArchiveFeaturedTrack(pick)) {
      nrCount.set(row.chart_edition_id, (nrCount.get(row.chart_edition_id) || 0) + 1)
      continue
    }
    if (!goesToArchive(pick, week)) continue
    const year = featuredArchiveYearKey(pick)
    const bucket = archiveFeatured.get(year) ?? { urls: new Set<string>(), ids: new Set<string>(), n: 0 }
    const url = (row.link_url || '').trim().toLowerCase()
    if (url && bucket.urls.has(url)) continue
    if (bucket.ids.has(row.id)) continue
    if (url) bucket.urls.add(url)
    bucket.ids.add(row.id)
    bucket.n += 1
    archiveFeatured.set(year, bucket)
  }

  const vinylKeys = new Map<string, Set<string>>()
  for (const row of vinyl) {
    const year = vinylYearKey(row.year)
    const keys = vinylKeys.get(year) ?? new Set<string>()
    keys.add(vinylTrackDedupKey(row.title, row.mix_name, row.artists))
    vinylKeys.set(year, keys)
  }

  const editions = (editionsRes.data ?? []) as { id: string; week_date: string }[]
  const pickWeeks: ChartPickWeekSummary[] = []
  for (const edition of editions) {
    const count = nrCount.get(edition.id) || 0
    if (count <= 0) continue
    pickWeeks.push({
      id: edition.id,
      weekDate: edition.week_date,
      count,
      editionNumber: pickWeeks.length + 1,
      isLatest: pickWeeks.length === 0,
    })
  }

  const yearKeys = new Set<string>([...archiveFeatured.keys(), ...vinylKeys.keys()])
  const archiveYears: ArchiveYearSummary[] = [...yearKeys]
    .map((yearKey) => ({
      yearKey,
      count: (archiveFeatured.get(yearKey)?.n || 0) + (vinylKeys.get(yearKey)?.size || 0),
    }))
    .filter((y) => y.count > 0)
    .sort((a, b) => {
      if (a.yearKey === UNKNOWN_ARCHIVE_YEAR) return 1
      if (b.yearKey === UNKNOWN_ARCHIVE_YEAR) return -1
      return Number(b.yearKey) - Number(a.yearKey)
    })

  return { pickWeeks, archiveYears }
}

function stripEdition<T extends { chart_editions?: EditionEmbed }>(row: T): { rest: Omit<T, 'chart_editions'>; week: string } {
  const week = editionWeek(row.chart_editions ?? null)
  const rest = { ...row }
  delete rest.chart_editions
  return { rest: rest as Omit<T, 'chart_editions'>, week }
}

/** New Releases de un lunes: solo temas con release de 2026 en adelante. */
export async function loadPickWeek(supabase: Sb, week: string): Promise<ChartFeaturedTrack[]> {
  const { data: edition, error } = await supabase
    .from('chart_editions')
    .select('id, week_date')
    .eq('is_published', true)
    .eq('week_date', week)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!edition?.id) return []

  const rows = await fetchPages<ChartFeaturedTrack & { chart_editions?: EditionEmbed }>((from, to) =>
    supabase
      .from('chart_featured_tracks')
      .select('*')
      .eq('chart_edition_id', edition.id)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
  return rows
    .map((row) => stripEdition(row).rest as ChartFeaturedTrack)
    .filter((pick) => !isArchiveFeaturedTrack(pick))
}

function dedupeArchive(rows: ArchiveSectionRow[]): ArchiveSectionRow[] {
  const featured: ArchiveSectionRow[] = []
  const urls = new Set<string>()
  const ids = new Set<string>()
  const vinylBest = new Map<string, { row: ArchiveSectionRow; score: number }>()
  for (const row of rows) {
    if (row.kind === 'featured') {
      const url = (row.pick.link_url || '').trim().toLowerCase()
      if (url && urls.has(url)) continue
      if (ids.has(row.pick.id)) continue
      if (url) urls.add(url)
      ids.add(row.pick.id)
      featured.push(row)
      continue
    }
    const key = vinylTrackDedupKey(row.track.title, row.track.mix_name, row.track.artists)
    const score = vinylRowDisplayScore(row.track)
    const prev = vinylBest.get(key)
    if (!prev || score > prev.score) vinylBest.set(key, { row, score })
  }
  return [...featured, ...[...vinylBest.values()].map((v) => v.row)]
}

/** Archivo de un año: vinilo + Beatport/Bandcamp anteriores a 2026. */
export async function loadArchiveYear(supabase: Sb, yearKey: string): Promise<ArchiveSectionRow[]> {
  const year = yearKey === UNKNOWN_ARCHIVE_YEAR ? null : Number(yearKey)
  if (yearKey !== UNKNOWN_ARCHIVE_YEAR && (!Number.isInteger(year) || (year as number) < 1900 || (year as number) > 2100)) {
    return []
  }

  const featuredQuery = (from: number, to: number) => {
    let q = supabase
      .from('chart_featured_tracks')
      .select('*, chart_editions!inner(week_date)')
      .eq('chart_editions.is_published', true)
      .order('id', { ascending: true })
    if (year == null) {
      q = q.is('release_date', null).is('release_year', null)
    } else {
      const next = year + 1
      q = q.or(
        `and(release_date.gte.${year}-01-01,release_date.lt.${next}-01-01),release_year.eq.${year}`,
      )
    }
    return q.range(from, to)
  }

  const vinylQuery = (from: number, to: number) => {
    let q = supabase
      .from('chart_vinyl_tracks')
      .select('*, chart_editions!inner(week_date)')
      .eq('chart_editions.is_published', true)
      .order('id', { ascending: true })
    q = year == null ? q.is('year', null) : q.eq('year', year)
    return q.range(from, to)
  }

  const [featuredRows, vinylRows] = await Promise.all([
    fetchPages<ChartFeaturedTrack & { chart_editions?: EditionEmbed }>(featuredQuery),
    fetchPages<ChartVinylTrack & { chart_editions?: EditionEmbed }>(vinylQuery),
  ])

  const rows: ArchiveSectionRow[] = []
  for (const row of featuredRows) {
    const { rest, week } = stripEdition(row)
    const pick = rest as ChartFeaturedTrack
    if (featuredArchiveYearKey(pick) !== yearKey) continue
    if (!goesToArchive(pick, week)) continue
    rows.push({ kind: 'featured', pick, weekDate: week })
  }
  for (const row of vinylRows) {
    const { rest, week } = stripEdition(row)
    const track = rest as ChartVinylTrack
    if (vinylYearKey(track.year) !== yearKey) continue
    rows.push({ kind: 'vinyl', track, weekDate: week })
  }
  return dedupeArchive(rows)
}

/** Dónde abrir un enlace compartido o del buscador, sin cargar el catálogo. */
export async function locateChartTrack(supabase: Sb, id: string): Promise<ChartLocateTarget | null> {
  const featured = await supabase
    .from('chart_featured_tracks')
    .select('release_date, release_year, chart_editions!inner(week_date, is_published)')
    .eq('id', id)
    .maybeSingle()
  if (featured.error) throw new Error(featured.error.message)
  const f = featured.data as {
    release_date: string | null
    release_year: number | null
    chart_editions: { week_date: string; is_published?: boolean } | { week_date: string; is_published?: boolean }[] | null
  } | null
  if (f) {
    const embed = f.chart_editions
    const edition = Array.isArray(embed) ? embed[0] : embed
    if (edition && edition.is_published !== false) {
      const week = edition.week_date || ''
      const pick = { release_date: f.release_date, release_year: f.release_year }
      if (goesToArchive(pick, week)) return { kind: 'archive', year: featuredArchiveYearKey(pick) }
      if (week) return { kind: 'picks', week }
    }
  }

  const vinyl = await supabase
    .from('chart_vinyl_tracks')
    .select('year, chart_editions!inner(is_published)')
    .eq('id', id)
    .maybeSingle()
  if (vinyl.error) throw new Error(vinyl.error.message)
  const v = vinyl.data as {
    year: number | null
    chart_editions: { is_published?: boolean } | { is_published?: boolean }[] | null
  } | null
  if (!v) return null
  const embed = v.chart_editions
  const edition = Array.isArray(embed) ? embed[0] : embed
  if (edition && edition.is_published === false) return null
  return { kind: 'archive', year: vinylYearKey(v.year) }
}
