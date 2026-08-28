// ============================================
// OPTIMAL BREAKS — 40 Breaks Vitales (Charts Page)
// ============================================

import { createCachedSupabase } from '@/lib/supabase-server'
import { PUBLIC_CHARTS_CACHE_TAG } from '@/lib/revalidate-public'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { ChartEdition, ChartFeaturedTrack, ChartTrack, ChartVinylTrack, ChartFeaturedArtist, ChartTrackArtist, ChartVinylArtist } from '@/types/database'
import type { Metadata } from 'next'
import { detailPageMetadata, siteNameForLang, staticPageMetadata } from '@/lib/seo'
import { sectionOgImageAlt, sectionOgImagePath } from '@/lib/og-section-images'
import { parsePlayParam, formatTrackReleaseDisplay, publicOgArtworkUrl, vinylOgArtworkUrl } from '@/lib/share-track'
import { chartEditionWeekMondayFromPublish } from '@/lib/beatport-next-data-tracks'
import { CHARTS_EDITORIAL_START } from '@/lib/charts-archive'
import ChartView from '@/components/ChartView'
import {
  buildFullArtistSlugMap,
  buildFullLabelSlugMap,
  filterArtistSlugMapForNames,
  findLabelSlug,
  normalizeArtistKey,
} from '@/lib/artist-slug-map'

// La página depende de searchParams (?week=, ?play=): debe renderizarse por
// petición. Los datos siguen viniendo de la Data Cache (createCachedSupabase,
// revalidate 300 s), así que esto NO golpea Supabase en cada visita.
export const dynamic = 'force-dynamic'

/** PostgREST / cliente Supabase corta en 1000 filas por defecto. Sin `.range` paginado,
 * New Releases (y pronto 40 Breaks/vinyl) se ven “recortados” a ~67 por semana cuando
 * el total de filas supera 1000 — no se borran en BD; la página no las carga. */
const SUPABASE_PAGE = 1000

function chartsSupabase() {
  return createCachedSupabase(300, [PUBLIC_CHARTS_CACHE_TAG])
}

async function fetchAllByEditionIds<T>(
  supabase: ReturnType<typeof chartsSupabase>,
  table: 'chart_tracks' | 'chart_featured_tracks' | 'chart_vinyl_tracks',
  editionIds: string[],
  orderCol: 'position' | 'sort_order',
): Promise<T[]> {
  if (editionIds.length === 0) return []
  const out: T[] = []
  for (let offset = 0; ; offset += SUPABASE_PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .in('chart_edition_id', editionIds)
      .order(orderCol, { ascending: true })
      .range(offset, offset + SUPABASE_PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data as T[] | null) ?? []
    out.push(...rows)
    if (rows.length < SUPABASE_PAGE) break
  }
  return out
}

const CHARTS_KEYWORDS: Record<Locale, string[]> = {
  es: [
    'radio de breakbeat online',
    'breakbeat radio',
    'chart breakbeat semanal',
    'nuevos lanzamientos breakbeat',
    'top breakbeat',
    '40 Breaks Vitales',
  ],
  en: [
    'online breakbeat radio',
    'breakbeat radio',
    'weekly breakbeat chart',
    'new breakbeat releases',
    'top breakbeat',
    '40 Breaks Vitales',
  ],
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Locale }>
  searchParams?: Promise<{ play?: string; week?: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const query = (await searchParams) ?? {}
  const fallback = () =>
    staticPageMetadata(lang, '/charts', 'charts', {
      ogImagePath: sectionOgImagePath('charts', lang),
      ogImageAlt: sectionOgImageAlt('charts', lang),
      extraKeywords: CHARTS_KEYWORDS[lang],
    })

  const parsed = parsePlayParam(query.play)
  if (!parsed) return fallback()

  if (parsed.kind === 'vinyl') {
    try {
      const supabase = chartsSupabase()
      const { data } = await supabase
        .from('chart_vinyl_tracks')
        .select('title, mix_name, artists, label, artwork_url, youtube_url, year')
        .eq('id', parsed.id)
        .maybeSingle()
      const row = data as null | {
        title: string | null
        mix_name: string | null
        artists: ChartVinylArtist[] | null
        label: string | null
        artwork_url: string | null
        youtube_url: string | null
        year: number | null
      }
      if (!row?.title) return fallback()

      const artistsText = Array.isArray(row.artists)
        ? row.artists.map((a) => a?.name).filter(Boolean).join(', ')
        : ''
      const mix = (row.mix_name || '').trim()
      const title = `${row.title}${mix ? ` (${mix})` : ''}${artistsText ? ` — ${artistsText}` : ''}`
      const descParts: string[] = []
      if (row.label) descParts.push(row.label)
      const relDisp = formatTrackReleaseDisplay(null, row.year)
      if (relDisp) descParts.push(relDisp)
      const description = (lang === 'es'
        ? `Escucha esta canción en Optimal Breaks${descParts.length ? ` · ${descParts.join(' · ')}` : ''}.`
        : `Listen to this track on Optimal Breaks${descParts.length ? ` · ${descParts.join(' · ')}` : ''}.`)

      const path = `/charts?play=${encodeURIComponent(`vinyl:${parsed.id}`)}`
      const siteName = await siteNameForLang(lang)

      return detailPageMetadata(
        lang,
        path,
        siteName,
        title,
        description,
        'website',
        vinylOgArtworkUrl(row.artwork_url, row.youtube_url),
        CHARTS_KEYWORDS[lang],
      )
    } catch {
      return fallback()
    }
  }

  if (parsed.kind !== 'track') return fallback()

  // Link compartido apuntando a una canción concreta: construimos un OG con
  // la portada y los metadatos reales del tema para que el preview en
  // WhatsApp/X/Facebook tenga el nombre y el artwork correctos.
  try {
    const supabase = chartsSupabase()
    const table = parsed.source === 'chart' ? 'chart_tracks' : 'chart_featured_tracks'
    const { data } = await supabase
      .from(table)
      .select('title, mix_name, artists, label, artwork_url, release_year, release_date')
      .eq('id', parsed.id)
      .maybeSingle()
    const row = data as null | {
      title: string | null
      mix_name: string | null
      artists: ChartTrackArtist[] | ChartFeaturedArtist[] | null
      label: string | null
      artwork_url: string | null
      release_year: number | null
      release_date: string | null
    }
    if (!row?.title) return fallback()

    const artistsText = Array.isArray(row.artists)
      ? row.artists.map((a) => a?.name).filter(Boolean).join(', ')
      : ''
    const mix = (row.mix_name || '').trim()
    const title = `${row.title}${mix ? ` (${mix})` : ''}${artistsText ? ` — ${artistsText}` : ''}`
    const descParts: string[] = []
    if (row.label) descParts.push(row.label)
    const relDisp = formatTrackReleaseDisplay(row.release_date, row.release_year)
    if (relDisp) descParts.push(relDisp)
    const description = (lang === 'es'
      ? `Escucha esta canción en Optimal Breaks${descParts.length ? ` · ${descParts.join(' · ')}` : ''}.`
      : `Listen to this track on Optimal Breaks${descParts.length ? ` · ${descParts.join(' · ')}` : ''}.`)

    const week = query.week ? `&week=${encodeURIComponent(query.week)}` : ''
    const path = `/charts?play=${encodeURIComponent(parsed.source)}:${parsed.id}${week}`
    const siteName = await siteNameForLang(lang)

    return detailPageMetadata(
      lang,
      path,
      siteName,
      title,
      description,
      'website',
      publicOgArtworkUrl(row.artwork_url),
      CHARTS_KEYWORDS[lang],
    )
  } catch {
    return fallback()
  }
}

export default async function ChartsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Locale }>
  searchParams: Promise<{ week?: string }>
}) {
  const { lang } = await params
  const query = await searchParams
  const dict = await getDictionary(lang)
  const supabase = chartsSupabase()

  const { data: editionsRaw } = await supabase
    .from('chart_editions')
    .select('*')
    .eq('is_published', true)
    .order('week_date', { ascending: false })
    .limit(52)

  const editions = (editionsRaw as ChartEdition[] | null) ?? []
  const editionIds = editions.map((e) => e.id)
  const recentEditionIdSet = new Set(editionIds)

  const { data: archiveEditionsRaw } = await supabase
    .from('chart_editions')
    .select('*')
    .eq('is_published', true)
    .lt('week_date', CHARTS_EDITORIAL_START)
    .order('week_date', { ascending: false })

  const archiveEditions = ((archiveEditionsRaw as ChartEdition[] | null) ?? []).filter(
    (e) => !recentEditionIdSet.has(e.id),
  )
  const archiveEditionIds = archiveEditions.map((e) => e.id)

  let allTracks: ChartTrack[] = []
  let allFeatured: ChartFeaturedTrack[] = []
  let allVinyl: ChartVinylTrack[] = []
  let archiveOnlyFeatured: ChartFeaturedTrack[] = []
  if (editionIds.length > 0 || archiveEditionIds.length > 0) {
    ;[allTracks, allFeatured, allVinyl, archiveOnlyFeatured] = await Promise.all([
      fetchAllByEditionIds<ChartTrack>(supabase, 'chart_tracks', editionIds, 'position'),
      fetchAllByEditionIds<ChartFeaturedTrack>(
        supabase,
        'chart_featured_tracks',
        editionIds,
        'sort_order',
      ),
      fetchAllByEditionIds<ChartVinylTrack>(
        supabase,
        'chart_vinyl_tracks',
        editionIds,
        'sort_order',
      ),
      fetchAllByEditionIds<ChartFeaturedTrack>(
        supabase,
        'chart_featured_tracks',
        archiveEditionIds,
        'sort_order',
      ),
    ])
  }

  const byEdition = new Map<string, ChartTrack[]>()
  for (const t of allTracks) {
    const id = t.chart_edition_id
    const list = byEdition.get(id) ?? []
    list.push(t)
    byEdition.set(id, list)
  }

  const featuredByEdition = new Map<string, ChartFeaturedTrack[]>()
  for (const row of allFeatured) {
    const id = row.chart_edition_id
    const list = featuredByEdition.get(id) ?? []
    list.push(row)
    featuredByEdition.set(id, list)
  }

  const vinylByEdition = new Map<string, ChartVinylTrack[]>()
  for (const row of allVinyl) {
    const id = row.chart_edition_id
    const list = vinylByEdition.get(id) ?? []
    list.push(row)
    vinylByEdition.set(id, list)
  }

  const weeks = editions.map((edition) => ({
    edition,
    tracks: byEdition.get(edition.id) ?? [],
    featured: featuredByEdition.get(edition.id) ?? [],
    vinyl: vinylByEdition.get(edition.id) ?? [],
  }))

  const archiveWeekByEditionId = new Map(archiveEditions.map((e) => [e.id, e.week_date]))
  const archiveFeatured = archiveOnlyFeatured.map((pick) => ({
    pick,
    weekDate: archiveWeekByEditionId.get(pick.chart_edition_id) || '',
  }))

  const weekParamMonday =
    chartEditionWeekMondayFromPublish(query.week) ?? query.week
  const validWeekParam =
    weekParamMonday && editions.some((e) => e.week_date === weekParamMonday)
      ? weekParamMonday
      : undefined

  const defaultExpandedWeekDate =
    validWeekParam ?? editions[0]?.week_date ?? ''

  // ---- Mapa `nombreNormalizado → slug` de artistas existentes en BD ----
  // Se usa en `ChartView` para convertir el nombre del artista de cada fila en
  // un enlace INTERNO a `/[lang]/artists/<slug>` cuando el artista existe en
  // `public.artists`. Si no hay ficha, el nombre queda como texto: Beatport /
  // Spotify / TIDAL solo salen en sus botones de fila.
  const chartArtistNames = new Set<string>()
  const collectArtistNames = (
    arr: (ChartTrackArtist | ChartFeaturedArtist | ChartVinylArtist)[] | null | undefined,
  ) => {
    if (!Array.isArray(arr)) return
    for (const a of arr) {
      const name = (a?.name || '').trim()
      if (name) chartArtistNames.add(name)
    }
  }
  for (const t of allTracks) collectArtistNames(t.artists)
  for (const t of allFeatured) collectArtistNames(t.artists)
  for (const t of allVinyl) collectArtistNames(t.artists)
  for (const t of archiveOnlyFeatured) collectArtistNames(t.artists)

  let artistSlugMap: Record<string, string> = {}
  if (chartArtistNames.size > 0) {
    const { data: dbArtists } = await supabase
      .from('artists')
      .select('slug, name, name_display')
      .limit(5000)
    const rows = (dbArtists as { slug: string; name: string | null; name_display: string | null }[] | null) ?? []
    artistSlugMap = filterArtistSlugMapForNames(buildFullArtistSlugMap(rows), chartArtistNames)
  }

  const chartLabelNames = new Set<string>()
  for (const t of allTracks) {
    const name = (t.label || '').trim()
    if (name) chartLabelNames.add(name)
  }
  for (const t of allFeatured) {
    const name = (t.label || '').trim()
    if (name) chartLabelNames.add(name)
  }
  for (const t of allVinyl) {
    const name = (t.label || '').trim()
    if (name) chartLabelNames.add(name)
  }
  for (const t of archiveOnlyFeatured) {
    const name = (t.label || '').trim()
    if (name) chartLabelNames.add(name)
  }

  let labelImageMap: Record<string, string> = {}
  let labelSlugMap: Record<string, string> = {}
  if (chartLabelNames.size > 0) {
    const { data: dbLabels } = await supabase
      .from('labels')
      .select('slug, name, image_url')
      .limit(5000)
    const labelRows =
      (dbLabels as { slug: string; name: string | null; image_url: string | null }[] | null) ?? []
    const fullLabelMap = buildFullLabelSlugMap(
      labelRows.map((r) => ({ slug: r.slug, name: r.name, name_display: null })),
    )
    labelSlugMap = filterArtistSlugMapForNames(fullLabelMap, chartLabelNames, { labelSuffixes: true })
    const imagesBySlug = new Map<string, string>()
    for (const r of labelRows) {
      const img = (r.image_url || '').trim()
      if (img && !imagesBySlug.has(r.slug)) imagesBySlug.set(r.slug, img)
    }
    Array.from(chartLabelNames).forEach((raw) => {
      const slug = findLabelSlug(raw, fullLabelMap)
      const img = slug ? imagesBySlug.get(slug) : undefined
      if (!img) return
      const key = normalizeArtistKey(raw)
      if (key) labelImageMap[key] = img
    })
  }

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <ChartView
        lang={lang}
        dict={dict}
        weeks={weeks}
        archiveFeatured={archiveFeatured}
        defaultExpandedWeekDate={defaultExpandedWeekDate}
        artistSlugMap={artistSlugMap}
        labelSlugMap={labelSlugMap}
        labelImageMap={labelImageMap}
      />
    </main>
  )
}
