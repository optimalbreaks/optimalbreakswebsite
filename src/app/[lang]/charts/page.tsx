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
import LoadingBreaks from '@/components/LoadingBreaks'
import { Suspense } from 'react'
import { buildFullArtistSlugMap, buildFullLabelSlugMap, slugLookupKeys } from '@/lib/artist-slug-map'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { resolveSharedLanding } from '@/lib/shared-track-landing'
import SharedTrackLanding from '@/components/SharedTrackLanding'

// La página depende de searchParams (?week=, ?play=): debe renderizarse por
// petición. Los datos siguen viniendo de la Data Cache (createCachedSupabase,
// revalidate 300 s), así que esto NO golpea Supabase en cada visita.
export const dynamic = 'force-dynamic'

function chartsSupabase() {
  return createCachedSupabase(300, [PUBLIC_CHARTS_CACHE_TAG])
}

const CHARTS_KEYWORDS: Record<Locale, string[]> = {
  es: [
    '16000 canciones breakbeat',
    'archivo breakbeat',
    'radio de breakbeat online',
    'breakbeat radio',
    'chart breakbeat semanal',
    'nuevos lanzamientos breakbeat',
    'top breakbeat',
    'selecciones de archivo breakbeat',
  ],
  en: [
    '16000 breakbeat tracks',
    'breakbeat archive',
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
  searchParams: Promise<{ week?: string; play?: string }>
}) {
  const { lang } = await params
  const query = await searchParams
  // Tema compartido (`?play=featured|chart|vinyl:<id>`): se resuelve AQUÍ, con
  // una consulta por id cacheada, para pintar el emergente en el HTML inicial
  // — sin esperar al cargador, a ChartView ni a la descarga de la semana/año.
  const [dict, sharedLanding] = await Promise.all([
    getDictionary(lang),
    resolveSharedLanding(chartsSupabase(), typeof query.play === 'string' ? query.play : null),
  ])
  const c = dict.charts

  // La cabecera sale al instante; el esquema (semanas/años) llega por streaming
  // con el cargador fanzine debajo, como en /top100.
  return (
    <main className="min-h-screen bg-[var(--paper)]">
      {sharedLanding ? <SharedTrackLanding landing={sharedLanding} lang={lang} /> : null}
      <div className="max-w-4xl mx-auto px-0 sm:px-4 py-6 sm:py-10">
        <header className="px-4 sm:px-0 mb-10 sm:mb-14 text-center">
          <h1
            className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[0.95] mb-3"
            style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
          >
            {c.radio_title}
          </h1>
          <p
            className="text-sm sm:text-base text-[var(--ink)]/60 max-w-2xl mx-auto"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {c.radio_subtitle}
          </p>
        </header>
      </div>
      <Suspense
        fallback={(
          <div className="max-w-4xl mx-auto px-4 pb-16">
            <LoadingBreaks
              es={lang === 'es'}
              title={lang === 'es' ? 'Cargando los charts' : 'Loading the charts'}
              subtitle={lang === 'es' ? 'Montando semanas y archivo por año' : 'Building weeks and the archive by year'}
            />
          </div>
        )}
      >
        <ChartsBody lang={lang} dict={dict} sharedLandingHandled={!!sharedLanding} />
      </Suspense>
    </main>
  )
}

async function ChartsBody({
  lang,
  dict,
  sharedLandingHandled,
}: {
  lang: Locale
  dict: Awaited<ReturnType<typeof getDictionary>>
  sharedLandingHandled: boolean
}) {
  const supabase = chartsSupabase()

  // Totales nada más. Los temas llegan al pulsar ▶ en la semana o el año.
  const { pickWeeks, archiveYears } = await loadChartsOutline(supabase)

  // Paginado y ordenado: `.limit(5000)` no servía porque PostgREST corta en
  // `max_rows` (1.000 por defecto) y, sin ORDER BY, qué artistas quedaban
  // fuera era aleatorio (sus nombres dejaban de enlazar a la ficha).
  type ArtistSlugRow = { slug: string; name: string | null; name_display: string | null }
  type LabelSlugRow = { slug: string; name: string | null; image_url: string | null }
  const [artistRows, labelRows] = await Promise.all([
    fetchAllPages<ArtistSlugRow>((from, to) =>
      supabase
        .from('artists')
        .select('slug, name, name_display')
        .order('slug', { ascending: true })
        .range(from, to),
    ).catch(() => [] as ArtistSlugRow[]),
    fetchAllPages<LabelSlugRow>((from, to) =>
      supabase
        .from('labels')
        .select('slug, name, image_url')
        .order('slug', { ascending: true })
        .range(from, to),
    ).catch(() => [] as LabelSlugRow[]),
  ])
  const artistSlugMap = buildFullArtistSlugMap(artistRows)
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
    <ChartView
      lang={lang}
      dict={dict}
      pickWeeks={pickWeeks}
      archiveYears={archiveYears}
      artistSlugMap={artistSlugMap}
      labelSlugMap={labelSlugMap}
      labelImageMap={labelImageMap}
      sharedLandingHandled={sharedLandingHandled}
      hideHeader
    />
  )
}
