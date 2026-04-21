// ============================================
// OPTIMAL BREAKS — 40 Breaks Vitales (Charts Page)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { ChartEdition, ChartFeaturedTrack, ChartTrack, ChartVinylTrack, ChartFeaturedArtist, ChartTrackArtist, ChartVinylArtist } from '@/types/database'
import type { Metadata } from 'next'
import { staticPageMetadata } from '@/lib/seo'
import { sectionOgImageAlt, sectionOgImagePath } from '@/lib/og-section-images'
import ChartView from '@/components/ChartView'

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
}: {
  params: { lang: Locale }
}): Promise<Metadata> {
  return staticPageMetadata(params.lang, '/charts', 'charts', {
    ogImagePath: sectionOgImagePath('charts'),
    ogImageAlt: sectionOgImageAlt('charts', params.lang),
    extraKeywords: CHARTS_KEYWORDS[params.lang],
  })
}

export default async function ChartsPage({
  params,
  searchParams,
}: {
  params: { lang: Locale }
  searchParams: { week?: string }
}) {
  const lang = params.lang
  const dict = await getDictionary(lang)
  const supabase = createServerSupabase()

  const { data: editionsRaw } = await supabase
    .from('chart_editions')
    .select('*')
    .eq('is_published', true)
    .order('week_date', { ascending: false })
    .limit(52)

  const editions = (editionsRaw as ChartEdition[] | null) ?? []
  const editionIds = editions.map((e) => e.id)

  let allTracks: ChartTrack[] = []
  let allFeatured: ChartFeaturedTrack[] = []
  let allVinyl: ChartVinylTrack[] = []
  if (editionIds.length > 0) {
    const { data: trks } = await supabase
      .from('chart_tracks')
      .select('*')
      .in('chart_edition_id', editionIds)
      .order('position', { ascending: true })
    allTracks = (trks as ChartTrack[]) ?? []

    const { data: feat } = await supabase
      .from('chart_featured_tracks')
      .select('*')
      .in('chart_edition_id', editionIds)
      .order('sort_order', { ascending: true })
    allFeatured = (feat as ChartFeaturedTrack[]) ?? []

    const { data: viny } = await supabase
      .from('chart_vinyl_tracks')
      .select('*')
      .in('chart_edition_id', editionIds)
      .order('sort_order', { ascending: true })
    allVinyl = (viny as ChartVinylTrack[]) ?? []
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

  const validWeekParam =
    searchParams.week && editions.some((e) => e.week_date === searchParams.week)
      ? searchParams.week
      : undefined

  const defaultExpandedWeekDate =
    validWeekParam ?? editions[0]?.week_date ?? ''

  // ---- Mapa `nombreNormalizado → slug` de artistas existentes en BD ----
  // Se usa en `ChartView` para convertir el nombre del artista de cada fila en
  // un enlace INTERNO a `/[lang]/artists/<slug>` cuando el artista existe en
  // `public.artists`. Así el usuario puede descubrir al DJ dentro del sitio sin
  // salir a Beatport. Si no hay match, seguimos mostrando el link externo
  // (Beatport / Discogs) o texto plano.
  const normalizeArtistKey = (raw: string): string =>
    (raw || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const chartArtistNames = new Set<string>()
  const collectArtistNames = (
    arr: (ChartTrackArtist | ChartFeaturedArtist | ChartVinylArtist)[] | null | undefined,
  ) => {
    if (!Array.isArray(arr)) return
    for (const a of arr) {
      const key = normalizeArtistKey(a?.name || '')
      if (key) chartArtistNames.add(key)
    }
  }
  for (const t of allTracks) collectArtistNames(t.artists)
  for (const t of allFeatured) collectArtistNames(t.artists)
  for (const t of allVinyl) collectArtistNames(t.artists)

  let artistSlugMap: Record<string, string> = {}
  if (chartArtistNames.size > 0) {
    // Traemos todos los artistas de la tabla (hoy ~pocos cientos) y cruzamos
    // en memoria: evita construir un `.or()` enorme con un `ilike` por cada
    // nombre único del chart. Si en el futuro hay miles, convendría añadir
    // una columna `name_normalized` y un índice para `.in()`.
    const { data: dbArtists } = await supabase
      .from('artists')
      .select('slug, name, name_display')
      .limit(5000)
    const rows = (dbArtists as { slug: string; name: string | null; name_display: string | null }[] | null) ?? []
    for (const r of rows) {
      for (const raw of [r.name, r.name_display]) {
        const key = normalizeArtistKey(raw || '')
        if (key && !artistSlugMap[key]) artistSlugMap[key] = r.slug
      }
    }
    // Nos quedamos sólo con las claves que aparecen en el chart: el componente
    // cliente no necesita el catálogo completo y así el HTML enviado es menor.
    const filtered: Record<string, string> = {}
    for (const key of chartArtistNames) {
      if (artistSlugMap[key]) filtered[key] = artistSlugMap[key]
      // Fallback: artista en BD sin "the" pero en chart con "the" (o viceversa).
      const withoutThe = key.startsWith('the ') ? key.slice(4) : `the ${key}`
      if (!filtered[key] && artistSlugMap[withoutThe]) filtered[key] = artistSlugMap[withoutThe]
    }
    artistSlugMap = filtered
  }

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <ChartView
        lang={lang}
        dict={dict}
        weeks={weeks}
        defaultExpandedWeekDate={defaultExpandedWeekDate}
        artistSlugMap={artistSlugMap}
      />
    </main>
  )
}
