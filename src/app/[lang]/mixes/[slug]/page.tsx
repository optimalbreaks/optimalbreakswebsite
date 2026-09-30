// ============================================
// OPTIMAL BREAKS — Ficha de una sesión (/mixes/<slug>)
// ----------------------------------------------
// Una URL por sesión para búsquedas del tipo «sesión olibass 2026 verano
// godino vs paket». Si la sesión está ligada a un evento (`mixes.event_id`),
// el título lleva artista + evento + año + temporada, y la ficha enlaza al
// evento, a la serie del festival y al resto de sesiones de esa edición.
// ============================================

import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Locale } from '@/lib/i18n-config'
import type { BreakEvent, Mix } from '@/types/database'
import { createCachedSupabase } from '@/lib/supabase-server'
import { breadcrumbJsonLd, detailPageMetadata, siteNameForLang, SITE_URL } from '@/lib/seo'
import {
  eventLabelWithYear,
  loadMixesForEvents,
  mixDescription,
  mixMediaJsonLd,
  mixThumbnailUrl,
} from '@/lib/mix-sessions'
import {
  eventsOfBrand,
  eventsOfSeries,
  festivalBrandOfSeries,
  festivalSeriesForEventName,
  MIN_SERIES_EDITIONS,
  seasonOfEvent,
} from '@/lib/event-series'
import { loadAgendaEvents } from '@/lib/agenda-data'
import { buildArtistSlugLookup, fetchAllArtistLinkRows, flattenLineupArtistNames, resolveArtistSlug } from '@/lib/artist-entity-match'
import { splitProseForDisplay } from '@/lib/bio-format'
import { formatMixDateLine } from '@/lib/mix-datetime-local'
import { imageCacheVersion, versionedImageUrl } from '@/lib/image-url'
import { MixSessionGrid, MixSessionPlayer } from '@/components/MixesExplorer'
import ShareButtons from '@/components/ShareButtons'

type Props = { params: Promise<{ lang: Locale; slug: string }> }

type MixEvent = Pick<
  BreakEvent,
  'id' | 'slug' | 'name' | 'date_start' | 'date_end' | 'venue' | 'city' | 'country' | 'image_url' | 'updated_at'
>

const loadMixPage = cache(async (slug: string) => {
  const supabase = createCachedSupabase()
  const { data: mixRaw } = await supabase.from('mixes').select('*').eq('slug', slug).maybeSingle()
  const mix = mixRaw as Mix | null
  if (!mix) return null
  let event: MixEvent | null = null
  if (mix.event_id) {
    const { data } = await supabase
      .from('events')
      .select('id, slug, name, date_start, date_end, venue, city, country, image_url, updated_at')
      .eq('id', mix.event_id)
      .maybeSingle()
    event = (data as MixEvent | null) ?? null
  }
  const seriesRaw = event ? festivalSeriesForEventName(event.name) : null
  const season = seriesRaw && event ? seasonOfEvent(seriesRaw, event) : null
  // Solo enlazar páginas publicadas (≥ MIN_SERIES_EDITIONS eventos)
  const agenda = seriesRaw ? await loadAgendaEvents() : []
  const series = seriesRaw && eventsOfSeries(seriesRaw, agenda).length >= MIN_SERIES_EDITIONS ? seriesRaw : null
  const brandRaw = festivalBrandOfSeries(seriesRaw?.slug)
  const brand = brandRaw && eventsOfBrand(brandRaw, agenda).length >= MIN_SERIES_EDITIONS ? brandRaw : null
  return { mix, event, series, season, brand }
})

function eventDateLabel(e: Pick<BreakEvent, 'date_start'>, lang: Locale): string {
  if (!e.date_start) return ''
  const d = new Date(`${e.date_start.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function sessionTitle(data: NonNullable<Awaited<ReturnType<typeof loadMixPage>>>, lang: Locale): string {
  const { mix, event, season } = data
  if (!event) return mix.title
  const who = mix.artist_name?.trim() || mix.title
  const seasonBit = season ? ` (${lang === 'es' ? season.label_es : season.label_en})` : ''
  return `${who} — ${lang === 'es' ? 'Sesión' : 'DJ set'} ${eventLabelWithYear(event.name, event.date_start)}${seasonBit}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const data = await loadMixPage(slug)
  if (!data) {
    return { title: lang === 'es' ? 'Sesión no encontrada' : 'Set not found', robots: { index: false, follow: true } }
  }
  const { mix, event } = data
  const es = lang === 'es'
  const siteName = await siteNameForLang(lang)
  const title = sessionTitle(data, lang)
  const place = event ? [event.venue, event.city].filter(Boolean).join(', ') : ''
  const lead = event
    ? es
      ? `Sesión completa de ${mix.artist_name || mix.title} en ${eventLabelWithYear(event.name, event.date_start)}${eventDateLabel(event, lang) ? ` (${eventDateLabel(event, lang)}${place ? `, ${place}` : ''})` : ''}.`
      : `Full set by ${mix.artist_name || mix.title} at ${eventLabelWithYear(event.name, event.date_start)}${eventDateLabel(event, lang) ? ` (${eventDateLabel(event, lang)}${place ? `, ${place}` : ''})` : ''}.`
    : ''
  const description = [lead, mixDescription(mix, lang)].filter(Boolean).join(' ') || undefined
  const image =
    mixThumbnailUrl(mix) ?? (event ? versionedImageUrl(event.image_url, imageCacheVersion(event.updated_at)) : null)
  return detailPageMetadata(lang, `/mixes/${slug}`, siteName, title, description, 'website', image)
}

const MONO = "'Courier Prime', monospace"
const TYPE = "'Special Elite', monospace"

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(20px, 3.5vw, 26px)', letterSpacing: '2px', margin: 0 }}>
        {children}
      </h2>
      <div className="mt-1 h-[3px] w-12 bg-[var(--red)]" />
    </div>
  )
}

export default async function MixDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const data = await loadMixPage(slug)
  if (!data) notFound()
  const { mix, event, series, season, brand } = data
  const es = lang === 'es'
  const supabase = createCachedSupabase()

  const title = sessionTitle(data, lang)
  const eventLabel = event ? eventLabelWithYear(event.name, event.date_start) : null
  const seasonLabel = season ? (es ? season.label_es : season.label_en) : null
  const description = mixDescription(mix, lang)

  const lookup = buildArtistSlugLookup(await fetchAllArtistLinkRows(supabase))
  const artists = flattenLineupArtistNames(mix.artist_name ? [mix.artist_name] : []).map((name) => ({
    name,
    slug: resolveArtistSlug(name, lookup) ?? null,
  }))

  const siblings = event ? (await loadMixesForEvents(supabase, [event.id])).filter((m) => m.id !== mix.id) : []

  const pageUrl = `${SITE_URL}/${lang}/mixes/${slug}`
  const eventUrl = event ? `${SITE_URL}/${lang}/events/${event.slug}` : null
  const mediaLd = mixMediaJsonLd(mix, {
    lang,
    pageUrl,
    event: event && eventUrl
      ? { name: eventLabel ?? event.name, url: eventUrl, dateStart: event.date_start, city: event.city, venue: event.venue }
      : null,
  })
  const crumbs = [
    { name: es ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
    ...(brand
      ? [{ name: brand.name, url: `${SITE_URL}/${lang}/festivals/${brand.slug}` }]
      : [{ name: 'Mixes', url: `${SITE_URL}/${lang}/mixes` }]),
    ...(series ? [{ name: series.name, url: `${SITE_URL}/${lang}/festivals/${series.slug}` }] : []),
    ...(event && eventUrl ? [{ name: event.name, url: eventUrl }] : []),
    { name: title, url: pageUrl },
  ]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [...(mediaLd ? [mediaLd] : []), breadcrumbJsonLd(crumbs)],
  }

  const dateLine = formatMixDateLine(mix, lang)

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <div className="home-wrap">
          <Link href={event ? `/${lang}/events/${event.slug}` : `/${lang}/mixes`} className="btn-back">
            <span className="arrow">←</span>{' '}
            {event ? event.name : es ? 'Volver a Mixes' : 'Back to Mixes'}
          </Link>

          <div className="sec-tag">
            {event
              ? `${es ? 'SESIÓN' : 'DJ SET'} · ${eventLabel}${seasonLabel ? ` · ${seasonLabel.toUpperCase()}` : ''}`
              : 'MIX'}
          </div>
          <h1 className="sec-title sec-title--compact">
            <span className="hl">{title}</span>
          </h1>
          <p className="mt-2" style={{ fontFamily: MONO, fontWeight: 700, fontSize: '14px', color: 'var(--dim)' }}>
            {[mix.title !== title ? mix.title : null, dateLine].filter(Boolean).join(' · ')}
          </p>

          <div className="mt-6 max-w-[900px]">
            <MixSessionPlayer mix={mix} lang={lang} />
          </div>

          {mix.download_url?.startsWith('https://') && (
            <a
              href={mix.download_url}
              download
              rel="noopener"
              className="mt-5 inline-flex max-w-full flex-col border-4 border-[var(--ink)] bg-[var(--yellow)] px-5 py-3 text-[var(--ink)] no-underline shadow-[6px_6px_0_var(--ink)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_var(--ink)]"
            >
              <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(15px, 2.6vw, 19px)', textTransform: 'uppercase' }}>
                ⬇ {es ? 'Descargar sesión en MP3' : 'Download set as MP3'}
              </span>
              <span className="mt-1" style={{ fontFamily: MONO, fontWeight: 700, fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                {es ? 'Gratis · cedida para descarga' : 'Free · shared for download'}
              </span>
            </a>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {artists.map((a) =>
              a.slug ? (
                <Link key={a.name} href={`/${lang}/artists/${a.slug}`} className="cutout red no-underline">
                  {a.name}
                </Link>
              ) : (
                <span key={a.name} className="cutout fill">{a.name}</span>
              ),
            )}
            {event && (
              <Link href={`/${lang}/events/${event.slug}`} className="cutout outline no-underline text-[var(--ink)]">
                {es ? 'Evento: ' : 'Event: '}{event.name} →
              </Link>
            )}
            {brand && (
              <Link href={`/${lang}/festivals/${brand.slug}`} className="cutout outline no-underline text-[var(--ink)]">
                {es ? 'Festival: ' : 'Festival: '}{brand.name} →
              </Link>
            )}
            {series && (
              <Link href={`/${lang}/festivals/${series.slug}`} className="cutout fill no-underline">
                {es
                  ? brand
                    ? `Edición: ${series.name} →`
                    : `Festival: ${series.name} →`
                  : brand
                    ? `Edition: ${series.name} →`
                    : `Festival: ${series.name} →`}
              </Link>
            )}
          </div>

          <div className="mt-5">
            <ShareButtons url={`/${lang}/mixes/${slug}`} title={`${title} | Optimal Breaks`} lang={lang} storyPlay={`mix:${slug}`} />
          </div>

          {description && (
            <section className="mt-10 max-w-[760px] space-y-3">
              {splitProseForDisplay(description).map((p, i) => (
                <p key={i} style={{ fontFamily: TYPE, fontSize: '16px', lineHeight: 1.8 }}>{p}</p>
              ))}
            </section>
          )}

          {event && (
            <section className="mt-10 max-w-[760px]">
              <Heading>{es ? 'Dónde se grabó' : 'Where it was recorded'}</Heading>
              <Link
                href={`/${lang}/events/${event.slug}`}
                className="block border-4 border-[var(--ink)] bg-[var(--yellow)] px-5 py-4 text-[var(--ink)] no-underline shadow-[6px_6px_0_var(--ink)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_var(--ink)]"
              >
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(16px, 3vw, 22px)', textTransform: 'uppercase' }}>
                  {event.name}
                </div>
                <div className="mt-1" style={{ fontFamily: MONO, fontSize: '14px' }}>
                  {[eventDateLabel(event, lang), event.venue, event.city, seasonLabel].filter(Boolean).join(' · ')}
                </div>
                <span className="mt-2 inline-block" style={{ fontFamily: MONO, fontWeight: 700, fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase' }}>
                  {es ? 'Cartel, horarios y todas las sesiones →' : 'Line-up, times and all sets →'}
                </span>
              </Link>
            </section>
          )}

          {siblings.length > 0 && event && (
            <section className="mt-12">
              <Heading>{es ? `Más sesiones de ${eventLabel}` : `More sets from ${eventLabel}`}</Heading>
              <MixSessionGrid mixes={siblings.slice(0, 12)} lang={lang} />
            </section>
          )}

          <nav className="mt-12 flex flex-wrap gap-2" aria-label={es ? 'Más mixes' : 'More mixes'}>
            <Link href={`/${lang}/mixes`} className="cutout outline no-underline text-[var(--ink)]">
              {es ? 'Todas las sesiones y mixes →' : 'All sets and mixes →'}
            </Link>
            <Link href={`/${lang}/festivals`} className="cutout outline no-underline text-[var(--ink)]">
              {es ? 'Festivales de breakbeat →' : 'Breakbeat festivals →'}
            </Link>
          </nav>
        </div>
      </div>
    </>
  )
}
