// ============================================
// OPTIMAL BREAKS — Página permanente de festival (/festivals/<serie>)
// ----------------------------------------------
// URL fija por marca que acumula la fuerza SEO de todas las ediciones y
// siempre destaca las próximas (todas las anunciadas, no solo la primera:
// una marca puede tener edición de invierno y de verano anunciadas a la vez).
// Si la serie define temporadas (`seasons` en FESTIVAL_SERIES), el archivo y
// las FAQ se agrupan por temporada.
// Todo el contenido sale de datos reales; el texto editorial opcional vive en
// FESTIVAL_SERIES (`@/lib/event-series`).
// ============================================

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Locale } from '@/lib/i18n-config'
import {
  breadcrumbJsonLd,
  detailPageMetadata,
  faqPageJsonLd,
  siteNameForLang,
  SITE_URL,
} from '@/lib/seo'
import {
  eventsOfSeries,
  festivalSeriesBySlug,
  isUpcomingOrOngoing,
  MIN_SERIES_EDITIONS,
  seasonOfEvent,
  todayYmdMadrid,
  type FestivalSeries,
  type SeriesSeason,
} from '@/lib/event-series'
import {
  buildCityBuckets,
  cityDisplayName,
  isAndalusianCity,
  shortDateRange,
  slugifyCity,
} from '@/lib/event-agenda'
import { loadAgendaEvents, type AgendaEventFull } from '@/lib/agenda-data'
import { createCachedSupabase } from '@/lib/supabase-server'
import {
  buildArtistSlugLookup,
  fetchAllArtistLinkRows,
  flattenLineupArtistNames,
  resolveArtistSlug,
} from '@/lib/artist-entity-match'
import { imageCacheVersion, versionedImageUrl } from '@/lib/image-url'
import { isEventCancelled } from '@/types/database'
import AgendaEventGrid from '@/components/AgendaEventGrid'
import CardThumbnail from '@/components/CardThumbnail'
import { MixSessionGrid } from '@/components/MixesExplorer'
import { eventLabelWithYear, loadMixesForEvents } from '@/lib/mix-sessions'

type Props = { params: Promise<{ lang: Locale; slug: string }> }

type SeasonGroup = { season: SeriesSeason | null; editions: AgendaEventFull[] }

type SeriesData = {
  series: FestivalSeries
  editions: AgendaEventFull[]
  /** Todas las próximas / en curso, no canceladas, por fecha ascendente. */
  upcoming: AgendaEventFull[]
  latest: AgendaEventFull
  cities: string[]
  venues: string[]
  firstYear: string | null
  /** Solo si la serie tiene temporadas: archivo agrupado (temporadas en orden de config, «otras» al final). */
  seasonGroups: SeasonGroup[]
}

async function loadSeries(slug: string): Promise<SeriesData | null> {
  const series = festivalSeriesBySlug(slug)
  if (!series) return null
  const editions = eventsOfSeries(series, await loadAgendaEvents())
  // Con una sola edición la ficha del evento ya cubre la búsqueda: no publicar.
  if (editions.length < MIN_SERIES_EDITIONS) return null
  const today = todayYmdMadrid()
  const upcoming = editions
    .filter((e) => !isEventCancelled(e) && isUpcomingOrOngoing(e, today))
    .sort((a, b) => String(a.date_start ?? '').localeCompare(String(b.date_start ?? '')))
  const byCity = new Map<string, AgendaEventFull[]>()
  for (const e of editions) {
    const k = slugifyCity(e.city)
    if (!k) continue
    byCity.set(k, [...(byCity.get(k) ?? []), e])
  }
  const cities = Array.from(byCity.values()).map((list) => cityDisplayName(list)).filter(Boolean)
  const venues = Array.from(new Set(editions.map((e) => (e.venue ?? '').trim()).filter(Boolean)))
  const years = editions.map((e) => (e.date_start ?? '').slice(0, 4)).filter(Boolean).sort()

  const seasonGroups: SeasonGroup[] = []
  if (series.seasons?.length) {
    for (const season of series.seasons) {
      const list = editions.filter((e) => seasonOfEvent(series, e)?.key === season.key)
      if (list.length) seasonGroups.push({ season, editions: list })
    }
    const others = editions.filter((e) => seasonOfEvent(series, e) === null)
    if (others.length) seasonGroups.push({ season: null, editions: others })
  }

  return {
    series,
    editions,
    upcoming,
    latest: editions[0],
    cities,
    venues,
    firstYear: years[0] ?? null,
    seasonGroups,
  }
}

function listJoin(items: string[], lang: Locale): string {
  if (items.length <= 1) return items[0] ?? ''
  const last = items[items.length - 1]
  return `${items.slice(0, -1).join(', ')} ${lang === 'es' ? 'y' : 'and'} ${last}`
}

function editionLine(e: AgendaEventFull, lang: Locale): string {
  const where = [e.venue, e.city].filter(Boolean).join(', ')
  return `${e.name} (${shortDateRange(e.date_start, e.date_end, lang)}${where ? `, ${where}` : ''})`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const data = await loadSeries(slug)
  if (!data) {
    return { title: lang === 'es' ? 'Festival no encontrado' : 'Festival not found', robots: { index: false, follow: true } }
  }
  const siteName = await siteNameForLang(lang)
  const { series, upcoming, latest, cities, editions } = data
  const next = upcoming[0] ?? null
  const year = (next?.date_start ?? latest.date_start ?? '').slice(0, 4)
  const title =
    lang === 'es'
      ? `${series.name}${year ? ` ${year}` : ''}: fechas, cartel y entradas`
      : `${series.name}${year ? ` ${year}` : ''}: dates, line-up and tickets`
  const where = cities.length ? listJoin(cities.slice(0, 3), lang) : ''
  const upcomingBit =
    upcoming.length > 1
      ? lang === 'es'
        ? `Próximas ediciones: ${upcoming.slice(0, 3).map((e) => shortDateRange(e.date_start, e.date_end, lang)).join(' y ')}.`
        : `Upcoming editions: ${upcoming.slice(0, 3).map((e) => shortDateRange(e.date_start, e.date_end, lang)).join(' and ')}.`
      : next
        ? lang === 'es'
          ? `Próxima edición: ${shortDateRange(next.date_start, next.date_end, lang)}${next.city ? ` en ${next.city}` : ''}.`
          : `Next edition: ${shortDateRange(next.date_start, next.date_end, lang)}${next.city ? ` in ${next.city}` : ''}.`
        : ''
  const description = upcomingBit
    ? lang === 'es'
      ? `${series.name}: ${upcomingBit} Cartel, horarios, entradas y las ${editions.length} ediciones en Optimal Breaks.`
      : `${series.name}: ${upcomingBit} Line-up, times, tickets and all ${editions.length} editions on Optimal Breaks.`
    : lang === 'es'
      ? `Todas las ediciones de ${series.name}${where ? ` (${where})` : ''}: carteles, artistas y fechas. La próxima edición aparecerá aquí en cuanto se anuncie.`
      : `Every edition of ${series.name}${where ? ` (${where})` : ''}: posters, artists and dates. The next edition appears here as soon as it is announced.`
  const posterEvent = next ?? latest
  return detailPageMetadata(
    lang,
    `/festivals/${slug}`,
    siteName,
    title,
    description,
    'website',
    versionedImageUrl(posterEvent.image_url, imageCacheVersion(posterEvent.updated_at)),
  )
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

function NextEditionCard({ e, lang, seasonLabel }: { e: AgendaEventFull; lang: Locale; seasonLabel: string | null }) {
  const es = lang === 'es'
  return (
    <Link
      href={`/${lang}/events/${e.slug}`}
      className="group flex flex-col sm:flex-row gap-5 border-4 border-[var(--ink)] bg-[var(--yellow)] p-4 sm:p-5 no-underline text-[var(--ink)] shadow-[6px_6px_0_var(--ink)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_var(--ink)]"
    >
      <div className="w-full sm:w-[180px] shrink-0 border-[3px] border-[var(--ink)]">
        <CardThumbnail
          src={versionedImageUrl(e.image_url, imageCacheVersion(e.updated_at))}
          alt={es ? `Cartel de ${e.name}` : `${e.name} poster`}
          aspectClass="aspect-poster w-full"
          frameClass=""
          sizes="180px"
          preload
        />
      </div>
      <div className="min-w-0">
        {seasonLabel ? (
          <span className="cutout fill" style={{ margin: 0 }}>{seasonLabel}</span>
        ) : null}
        <div className="mt-2" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '20px', color: 'var(--red)' }}>
          {shortDateRange(e.date_start, e.date_end, lang)}
        </div>
        <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 26px)', lineHeight: 1.05, textTransform: 'uppercase' }}>
          {e.name}
        </div>
        <div className="mt-2" style={{ fontFamily: MONO, fontSize: '14px' }}>
          {[e.venue, e.city, e.country].filter(Boolean).join(' · ')}
        </div>
        <span
          className="mt-4 inline-block border-[3px] border-[var(--ink)] bg-[var(--red)] px-4 py-2 text-white"
          style={{ fontFamily: MONO, fontWeight: 700, fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase' }}
        >
          {es ? 'Cartel, horarios y entradas →' : 'Line-up, times and tickets →'}
        </span>
      </div>
    </Link>
  )
}

export default async function FestivalSeriesPage({ params }: Props) {
  const { lang, slug } = await params
  const data = await loadSeries(slug)
  if (!data) notFound()
  const { series, editions, upcoming, latest, cities, venues, firstYear, seasonGroups } = data
  const es = lang === 'es'
  const seasonLabel = (s: SeriesSeason | null) => (s ? (es ? s.label_es : s.label_en) : null)

  // Artistas que han pasado por el festival (por nº de ediciones).
  const supabase = createCachedSupabase()
  const lookup = buildArtistSlugLookup(await fetchAllArtistLinkRows(supabase))
  const artistCount = new Map<string, number>()
  for (const e of editions) {
    const unique = Array.from(new Set(flattenLineupArtistNames(e.lineup ?? [])))
    for (const name of unique) artistCount.set(name, (artistCount.get(name) ?? 0) + 1)
  }
  const artists = Array.from(artistCount.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => ({ name, n, slug: resolveArtistSlug(name, lookup) ?? null }))

  // Sesiones grabadas en las ediciones, agrupadas por edición (más reciente primero).
  const sessions = await loadMixesForEvents(supabase, editions.map((e) => e.id))
  const sessionGroups = editions
    .map((e) => ({ edition: e, mixes: sessions.filter((m) => m.event_id === e.id) }))
    .filter((g) => g.mixes.length > 0)

  // Texto: editorial si existe; si no, generado solo con datos reales.
  const editorial = (es ? series.intro_es : series.intro_en)?.trim()
  const nEd = editions.length
  const seasonNames = seasonGroups.map((g) => seasonLabel(g.season)).filter((s): s is string => Boolean(s))
  const seasonBit = seasonNames.length > 1
    ? es
      ? ` Tiene ediciones de ${listJoin(seasonNames.map((s) => s.toLowerCase()), lang)}.`
      : ` It runs ${listJoin(seasonNames.map((s) => s.toLowerCase()), lang)} editions.`
    : ''
  const autoIntro = es
    ? `${series.name} es una de las citas que sigue la agenda de Optimal Breaks${cities.length ? `, con ediciones en ${listJoin(cities, lang)}` : ''}. Tenemos registradas ${nEd} ${nEd === 1 ? 'edición' : 'ediciones'}${firstYear ? ` desde ${firstYear}` : ''}${artists.length ? ` y ${artists.length} artistas han pasado por su cartel` : ''}${venues.length ? `, en recintos como ${listJoin(venues.slice(0, 3), lang)}` : ''}.${seasonBit}`
    : `${series.name} is one of the dates followed by the Optimal Breaks calendar${cities.length ? `, with editions in ${listJoin(cities, lang)}` : ''}. We have ${nEd} ${nEd === 1 ? 'edition' : 'editions'} on record${firstYear ? ` since ${firstYear}` : ''}${artists.length ? ` and ${artists.length} artists have played it` : ''}${venues.length ? `, at venues such as ${listJoin(venues.slice(0, 3), lang)}` : ''}.${seasonBit}`
  const nextLine = upcoming.length > 1
    ? es
      ? `Próximas ediciones anunciadas: ${upcoming.map((e) => editionLine(e, lang)).join('; ')}.`
      : `Upcoming editions announced: ${upcoming.map((e) => editionLine(e, lang)).join('; ')}.`
    : upcoming.length === 1
      ? es
        ? `La próxima edición es ${editionLine(upcoming[0], lang)}.`
        : `The next edition is ${editionLine(upcoming[0], lang)}.`
      : es
        ? `Todavía no hay fecha anunciada para la próxima edición. La última fue ${editionLine(latest, lang)}.`
        : `No date has been announced for the next edition yet. The latest was ${editionLine(latest, lang)}.`
  const paragraphs = [...(editorial ? editorial.split(/\n\s*\n/) : [autoIntro]), nextLine]

  // FAQ
  const faq: { question: string; answer: string }[] = [
    { question: es ? `¿Cuándo es el próximo ${series.name}?` : `When is the next ${series.name}?`, answer: nextLine },
  ]
  for (const g of seasonGroups) {
    if (!g.season) continue
    const label = seasonLabel(g.season) ?? ''
    const nextOfSeason = upcoming.find((e) => seasonOfEvent(series, e)?.key === g.season?.key)
    const lastOfSeason = g.editions.find((e) => !isUpcomingOrOngoing(e))
    faq.push({
      question: es
        ? `¿Cuándo es ${series.name} de ${label.toLowerCase()}?`
        : `When is the ${label.toLowerCase()} edition of ${series.name}?`,
      answer: nextOfSeason
        ? es
          ? `La próxima edición de ${label.toLowerCase()} es ${editionLine(nextOfSeason, lang)}.`
          : `The next ${label.toLowerCase()} edition is ${editionLine(nextOfSeason, lang)}.`
        : lastOfSeason
          ? es
            ? `Aún no hay fecha para la próxima edición de ${label.toLowerCase()}. La última fue ${editionLine(lastOfSeason, lang)}.`
            : `No date yet for the next ${label.toLowerCase()} edition. The latest was ${editionLine(lastOfSeason, lang)}.`
          : es
            ? `Aún no hay fecha anunciada para la edición de ${label.toLowerCase()}.`
            : `No date announced yet for the ${label.toLowerCase()} edition.`,
    })
  }
  const placeList = cities.length ? cities : venues
  if (placeList.length) {
    faq.push({
      question: es ? `¿Dónde se celebra ${series.name}?` : `Where does ${series.name} take place?`,
      answer: es
        ? `${series.name} se ha celebrado en ${listJoin(placeList, lang)}${cities.length && venues.length ? ` (recintos: ${listJoin(venues.slice(0, 4), lang)})` : ''}.`
        : `${series.name} has taken place in ${listJoin(placeList, lang)}${cities.length && venues.length ? ` (venues: ${listJoin(venues.slice(0, 4), lang)})` : ''}.`,
    })
  }
  if (artists.length) {
    const names = artists.slice(0, 12).map((a) => a.name).join(', ')
    faq.push({
      question: es ? `¿Qué artistas han tocado en ${series.name}?` : `Which artists have played ${series.name}?`,
      answer: es ? `Entre otros: ${names}${artists.length > 12 ? '…' : '.'}` : `Among others: ${names}${artists.length > 12 ? '…' : '.'}`,
    })
  }
  if (sessionGroups.length) {
    const byEdition = sessionGroups
      .map((g) => `${eventLabelWithYear(g.edition.name, g.edition.date_start)} (${g.mixes.length})`)
      .join('; ')
    faq.push({
      question: es ? `¿Hay sesiones grabadas de ${series.name}?` : `Are there recorded sets from ${series.name}?`,
      answer: es
        ? `Sí: ${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'} para escuchar en Optimal Breaks, por edición: ${byEdition}.`
        : `Yes: ${sessions.length} ${sessions.length === 1 ? 'set' : 'sets'} to play on Optimal Breaks, by edition: ${byEdition}.`,
    })
  }
  faq.push({
    question: es ? `¿Cuántas ediciones de ${series.name} hay?` : `How many editions of ${series.name} have there been?`,
    answer: es
      ? `Optimal Breaks tiene registradas ${nEd} ${nEd === 1 ? 'edición' : 'ediciones'}${firstYear ? ` desde ${firstYear}` : ''}.`
      : `Optimal Breaks has ${nEd} ${nEd === 1 ? 'edition' : 'editions'} on record${firstYear ? ` since ${firstYear}` : ''}.`,
  })

  const url = `${SITE_URL}/${lang}/festivals/${slug}`
  const faqLd = faqPageJsonLd(faq)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'EventSeries',
        name: series.name,
        url,
        description: paragraphs.join(' '),
        subEvent: editions.slice(0, 25).map((e) => ({
          '@type': 'Event',
          name: e.name,
          ...(e.date_start ? { startDate: e.date_start } : {}),
          ...(e.date_end ? { endDate: e.date_end } : {}),
          url: `${SITE_URL}/${lang}/events/${e.slug}`,
          location: {
            '@type': 'Place',
            name: e.venue || e.city,
            address: { '@type': 'PostalAddress', addressLocality: e.city, addressCountry: e.country },
          },
        })),
      },
      breadcrumbJsonLd([
        { name: es ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
        { name: es ? 'Festivales' : 'Festivals', url: `${SITE_URL}/${lang}/festivals` },
        { name: series.name, url },
      ]),
      ...(faqLd ? [faqLd] : []),
    ],
  }

  const citySlugs = Array.from(new Set(editions.map((e) => slugifyCity(e.city)).filter(Boolean)))
  const andalusian = citySlugs.some(isAndalusianCity)
  // Solo enlazar agendas de ciudad que existen (superan el mínimo de eventos).
  const publishableCities = new Set(
    buildCityBuckets((await loadAgendaEvents()).filter((e) => !isEventCancelled(e))).map((b) => b.slug),
  )
  const agendaCitySlugs = citySlugs.filter((c) => publishableCities.has(c))

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <div className="home-wrap">
          <Link href={`/${lang}/festivals`} className="btn-back">
            <span className="arrow">←</span> {es ? 'Todos los festivales' : 'All festivals'}
          </Link>

          <div className="sec-tag">{es ? 'FESTIVAL · TODAS LAS EDICIONES' : 'FESTIVAL · ALL EDITIONS'}</div>
          <h1 className="sec-title sec-title--compact">
            <span className="hl">{series.name}</span>
          </h1>

          <div className="mt-5 max-w-[760px] space-y-3">
            {paragraphs.map((p, i) => (
              <p key={i} style={{ fontFamily: TYPE, fontSize: '16px', lineHeight: 1.8 }}>{p}</p>
            ))}
          </div>

          {/* Próximas ediciones: TODAS las anunciadas (p. ej. invierno y verano a la vez) */}
          {upcoming.length > 0 && (
            <section className="mt-10">
              <Heading>
                {upcoming.length > 1
                  ? es ? 'Próximas ediciones' : 'Upcoming editions'
                  : es ? 'Próxima edición' : 'Next edition'}
              </Heading>
              <div className={upcoming.length > 1 ? 'grid grid-cols-1 lg:grid-cols-2 gap-5' : ''}>
                {upcoming.map((e) => (
                  <NextEditionCard key={e.slug} e={e} lang={lang} seasonLabel={seasonLabel(seasonOfEvent(series, e))} />
                ))}
              </div>
            </section>
          )}

          {/* Archivo: por temporada si la serie las tiene; si no, todo junto */}
          {seasonGroups.length > 0 ? (
            seasonGroups.map((g) => (
              <section key={g.season?.key ?? 'otras'} className="mt-12">
                <Heading>
                  {g.season
                    ? es
                      ? `${series.name} · ${seasonLabel(g.season)}`
                      : `${series.name} · ${seasonLabel(g.season)}`
                    : es
                      ? 'Otras ediciones'
                      : 'Other editions'}
                </Heading>
                <AgendaEventGrid events={g.editions} lang={lang} />
              </section>
            ))
          ) : (
            <section className="mt-12">
              <Heading>{es ? `Ediciones de ${series.name}` : `${series.name} editions`}</Heading>
              <AgendaEventGrid events={editions} lang={lang} />
            </section>
          )}

          {/* Sesiones por edición */}
          {sessionGroups.length > 0 && (
            <section id="festival-sessions" className="mt-12 scroll-mt-24">
              <Heading>{es ? `Sesiones de ${series.name}` : `${series.name} sets`}</Heading>
              <div className="space-y-10">
                {sessionGroups.map(({ edition, mixes }) => {
                  const season = seasonLabel(seasonOfEvent(series, edition))
                  return (
                    <div key={edition.id}>
                      <h3 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '20px', margin: '0 0 12px' }}>
                        <Link href={`/${lang}/events/${edition.slug}`} className="no-underline text-[var(--ink)] hover:text-[var(--red)] transition-colors">
                          {eventLabelWithYear(edition.name, edition.date_start)}
                          {season ? ` · ${season}` : ''}
                        </Link>
                        <span className="ml-2" style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 700, color: 'var(--dim)' }}>
                          {shortDateRange(edition.date_start, edition.date_end, lang)} · {mixes.length}{' '}
                          {es ? (mixes.length === 1 ? 'sesión' : 'sesiones') : mixes.length === 1 ? 'set' : 'sets'}
                        </span>
                      </h3>
                      <MixSessionGrid mixes={mixes} lang={lang} />
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Artistas */}
          {artists.length > 0 && (
            <section className="mt-12">
              <Heading>{es ? `Artistas que han pasado por ${series.name}` : `Artists who have played ${series.name}`}</Heading>
              <div className="flex flex-wrap gap-1.5">
                {artists.slice(0, 80).map((a) =>
                  a.slug ? (
                    <Link key={a.name} href={`/${lang}/artists/${a.slug}`} className="cutout red no-underline">
                      {a.name}{a.n > 1 ? ` ×${a.n}` : ''}
                    </Link>
                  ) : (
                    <span key={a.name} className="cutout fill">{a.name}{a.n > 1 ? ` ×${a.n}` : ''}</span>
                  ),
                )}
              </div>
            </section>
          )}

          {/* FAQ */}
          <section className="mt-12">
            <Heading>{es ? 'Preguntas frecuentes' : 'FAQ'}</Heading>
            <div className="border-4 border-[var(--ink)] divide-y-[3px] divide-[var(--ink)] max-w-[860px]">
              {faq.map((item, i) => (
                <div key={i} className="p-5 bg-[var(--paper)]">
                  <h3 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', margin: 0 }}>{item.question}</h3>
                  <p className="mt-2" style={{ fontFamily: TYPE, fontSize: '15px', lineHeight: 1.7 }}>{item.answer}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Enlaces internos */}
          <nav className="mt-12 flex flex-wrap gap-2" aria-label={es ? 'Más agenda' : 'More listings'}>
            {agendaCitySlugs.slice(0, 4).map((c) => (
              <Link key={c} href={`/${lang}/agenda/${c}`} className="cutout outline no-underline text-[var(--ink)]">
                {es ? 'Agenda breakbeat en ' : 'Breakbeat events in '}
                {cityDisplayName(editions.filter((e) => slugifyCity(e.city) === c))} →
              </Link>
            ))}
            {andalusian && (
              <Link href={`/${lang}/scenes/andalusian-breakbeat`} className="cutout outline no-underline text-[var(--ink)]">
                {es ? 'La escena del breakbeat andaluz →' : 'The Andalusian breakbeat scene →'}
              </Link>
            )}
            <Link href={`/${lang}/breakbeat`} className="cutout outline no-underline text-[var(--ink)]">
              {es ? '¿Qué es el breakbeat? →' : 'What is breakbeat? →'}
            </Link>
          </nav>
        </div>
      </div>
    </>
  )
}
