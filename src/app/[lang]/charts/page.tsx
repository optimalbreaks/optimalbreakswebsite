// ============================================
// OPTIMAL BREAKS — 40 Breaks Vitales (Charts Page)
// ============================================

import { createCachedSupabase } from '@/lib/supabase-server'
import { PUBLIC_CHARTS_CACHE_TAG } from '@/lib/revalidate-public'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { ChartFeaturedArtist, ChartTrackArtist, ChartVinylArtist } from '@/types/database'
import type { Metadata } from 'next'
import { detailPageMetadata, siteNameForLang, staticPageMetadata } from '@/lib/seo'
import { sectionOgImageAlt, sectionOgImagePath } from '@/lib/og-section-images'
import { parsePlayParam, formatTrackReleaseDisplay, publicOgArtworkUrl, vinylOgArtworkUrl } from '@/lib/share-track'
import { loadChartsOutline } from '@/lib/charts-sections'
import ChartView from '@/components/ChartView'
import { buildFullArtistSlugMap, buildFullLabelSlugMap, slugLookupKeys } from '@/lib/artist-slug-map'

// La página depende de searchParams (?week=, ?play=): debe renderizarse por
// petición. Los datos siguen viniendo de la Data Cache (createCachedSupabase,
// revalidate 300 s), así que esto NO golpea Supabase en cada visita.
export const dynamic = 'force-dynamic'

function chartsSupabase() {
  return createCachedSupabase(300, [PUBLIC_CHARTS_CACHE_TAG])
}

const CHARTS_KEYWORDS: Record<Locale, string[]> = {
  es: [
    'radio de breakbeat online',
    'breakbeat radio',
    'chart breakbeat semanal',
    'nuevos lanzamientos breakbeat',
    'top breakbeat',
    'selecciones de archivo breakbeat',
  ],
  en: [
    'online breakbeat radio',
    'breakbeat radio',
    'weekly breakbeat chart',
    'new breakbeat releases',
    'top breakbeat',
    'breakbeat archive picks',
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
  // ?week= y ?play= los resuelve el cliente al abrir solo esa sección.
  await searchParams
  const dict = await getDictionary(lang)
  const supabase = chartsSupabase()

  // Totales nada más. Los temas llegan al pulsar ▶ en la semana o el año.
  const { pickWeeks, archiveYears } = await loadChartsOutline(supabase)

  const { data: dbArtists } = await supabase
    .from('artists')
    .select('slug, name, name_display')
    .limit(5000)
  const artistRows = (dbArtists as { slug: string; name: string | null; name_display: string | null }[] | null) ?? []
  const artistSlugMap = buildFullArtistSlugMap(artistRows)

  const { data: dbLabels } = await supabase
    .from('labels')
    .select('slug, name, image_url')
    .limit(5000)
  const labelRows =
    (dbLabels as { slug: string; name: string | null; image_url: string | null }[] | null) ?? []
  const labelSlugMap = buildFullLabelSlugMap(
    labelRows.map((r) => ({ slug: r.slug, name: r.name, name_display: null })),
  )
  const labelImageMap: Record<string, string> = {}
  for (const r of labelRows) {
    const img = (r.image_url || '').trim()
    if (!img || !r.name) continue
    for (const key of slugLookupKeys(r.name, { labelSuffixes: true })) {
      if (!labelImageMap[key]) labelImageMap[key] = img
    }
  }

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <ChartView
        lang={lang}
        dict={dict}
        pickWeeks={pickWeeks}
        archiveYears={archiveYears}
        artistSlugMap={artistSlugMap}
        labelSlugMap={labelSlugMap}
        labelImageMap={labelImageMap}
      />
    </main>
  )
}
