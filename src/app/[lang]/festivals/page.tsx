// ============================================
// OPTIMAL BREAKS — Índice de festivales (/festivals)
// Orden: primero los que tienen fecha próxima (la más cercana), luego el resto
// por la última fecha. No es alfabético. Encima, las próximas fechas de
// festival agrupadas por mes (carteles, no teselas de /agenda).
// ============================================

import type { Metadata } from 'next'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n-config'
import { breadcrumbJsonLd, detailPageMetadata, siteNameForLang, SITE_URL } from '@/lib/seo'
import {
  eventsOfBrand,
  eventsOfSeries,
  FESTIVAL_BRANDS,
  FESTIVAL_SERIES,
  seriesOfBrand,
  isUpcomingOrOngoing,
  MIN_SERIES_EDITIONS,
  todayYmdMadrid,
} from '@/lib/event-series'
import { cityDisplayName, monthLabel, shortDateRange, slugifyCity } from '@/lib/event-agenda'
import { loadAgendaEvents, type AgendaEventFull } from '@/lib/agenda-data'
import { imageCacheVersion, versionedImageUrl } from '@/lib/image-url'
import { isEventCancelled } from '@/types/database'
import AgendaEventGrid from '@/components/AgendaEventGrid'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: Promise<{ lang: Locale }> }

const MONO = "'Courier Prime', monospace"
const TYPE = "'Special Elite', monospace"

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  const siteName = await siteNameForLang(lang)
  return detailPageMetadata(
    lang,
    '/festivals',
    siteName,
    lang === 'es' ? 'Festivales breakbeat: fechas, carteles y ediciones' : 'Breakbeat festivals: dates, line-ups and editions',
    lang === 'es'
      ? 'Los festivales breakbeat que sigue Optimal Breaks, por próxima fecha: carteles, ediciones y la agenda de las citas anunciadas.'
      : 'The breakbeat festivals followed by Optimal Breaks, by next date: posters, editions and the upcoming festival calendar.',
  )
}

function Heading({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(20px, 3.5vw, 26px)', letterSpacing: '2px', margin: 0 }}>
          {children}
        </h2>
        <div className="mt-1 h-[3px] w-12 bg-[var(--red)]" />
      </div>
      {note}
    </div>
  )
}

export default async function FestivalsIndexPage({ params }: Props) {
  const { lang } = await params
  const es = lang === 'es'
  const today = todayYmdMadrid()
  const all = await loadAgendaEvents()

  const upcomingOf = (list: typeof all) =>
    list
      .filter((e) => !isEventCancelled(e) && isUpcomingOrOngoing(e, today))
      .sort((a, b) => String(a.date_start ?? '').localeCompare(String(b.date_start ?? '')))
  const inBrand = new Set(FESTIVAL_BRANDS.flatMap((b) => b.editions))

  const rows = [
    ...FESTIVAL_BRANDS.map((brand) => {
      const editions = eventsOfBrand(brand, all)
      if (editions.length < MIN_SERIES_EDITIONS) return null
      const subs = seriesOfBrand(brand)
        .map((s) => ({ series: s, n: eventsOfSeries(s, editions).length }))
        .filter((x) => x.n > 0)
      return { slug: brand.slug, name: brand.name, editions, subs }
    }),
    ...FESTIVAL_SERIES.filter((s) => !inBrand.has(s.slug)).map((series) => {
      const editions = eventsOfSeries(series, all)
      if (editions.length < MIN_SERIES_EDITIONS) return null
      return { slug: series.slug, name: series.name, editions, subs: [] as { series: typeof series; n: number }[] }
    }),
  ]
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => {
      const upcoming = upcomingOf(r.editions)
      const next = upcoming[0] ?? null
      const latest = r.editions[0]
      const cities = Array.from(new Set(r.editions.map((e) => slugifyCity(e.city)).filter(Boolean))).map((c) =>
        cityDisplayName(r.editions.filter((e) => slugifyCity(e.city) === c)),
      )
      const years = r.editions.map((e) => (e.date_start ?? '').slice(0, 4)).filter(Boolean).sort()
      return { ...r, upcoming, next, latest, show: next ?? latest, cities, firstYear: years[0] ?? null }
    })
    .sort((a, b) => {
      if (a.next && !b.next) return -1
      if (!a.next && b.next) return 1
      if (a.next && b.next) return String(a.next.date_start).localeCompare(String(b.next.date_start))
      return String(b.latest.date_start ?? '').localeCompare(String(a.latest.date_start ?? ''))
    })

  const upcomingFestivalEvents = rows.flatMap((r) => r.upcoming)
    .sort((a, b) => String(a.date_start ?? '').localeCompare(String(b.date_start ?? '')))
  const byMonth = new Map<string, AgendaEventFull[]>()
  for (const e of upcomingFestivalEvents) {
    const key = (e.date_start ?? '').slice(0, 7)
    if (!key) continue
    byMonth.set(key, [...(byMonth.get(key) ?? []), e])
  }
  const monthGroups = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b))

  const jsonLd = breadcrumbJsonLd([
    { name: es ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
    { name: es ? 'Festivales' : 'Festivals', url: `${SITE_URL}/${lang}/festivals` },
  ])

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <div className="home-wrap">
          <div className="sec-tag">{es ? 'FESTIVALES' : 'FESTIVALS'}</div>
          <h1 className="sec-title sec-title--compact">
            {es ? 'Festivales ' : 'Breakbeat '}<span className="hl">{es ? 'breakbeat' : 'festivals'}</span>
          </h1>
          <p className="mt-4 max-w-[760px]" style={{ fontFamily: TYPE, fontSize: '16px', lineHeight: 1.8 }}>
            {es
              ? 'Primero las próximas citas, por fecha. Cada festival tiene su página fija con todas las fechas, carteles, sesiones y artistas. Las noches de club que no son festival están en la agenda.'
              : 'Upcoming dates first, by date. Each festival has a permanent page with every date, posters, sets and artists. Club nights that are not a festival live in the listings.'}
          </p>
          <nav className="mt-5 flex flex-wrap gap-2" aria-label={es ? 'En esta página' : 'On this page'}>
            {monthGroups.map(([key, list]) => (
              <a key={key} href={`#mes-${key}`} className="cutout red no-underline">
                {monthLabel(key, lang)} · {list.length}
              </a>
            ))}
            <a href="#festivales" className="cutout fill no-underline">
              {es ? 'Todos los festivales' : 'All festivals'} · {rows.length}
            </a>
          </nav>

          {monthGroups.map(([key, list]) => (
            <section key={key} id={`mes-${key}`} className="mt-10 scroll-mt-24">
              <Heading
                note={
                  <Link href={`/${lang}/agenda/${key}`} className="cutout outline no-underline text-[var(--ink)]" style={{ margin: 0 }}>
                    {es ? 'Toda la agenda del mes →' : 'Full month listings →'}
                  </Link>
                }
              >
                {monthLabel(key, lang)}
              </Heading>
              <AgendaEventGrid events={list} lang={lang} />
            </section>
          ))}

          <section id="festivales" className="mt-12 scroll-mt-24">
            <Heading
              note={
                <span style={{ fontFamily: MONO, fontSize: '12px', color: 'var(--dim)' }}>
                  {es ? 'Por próxima fecha' : 'By next date'}
                </span>
              }
            >
              {es ? 'Todos los festivales' : 'All festivals'}
            </Heading>
            <ul className="list-none m-0 p-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {rows.map((r) => (
                <li key={r.slug} className="flex flex-col border-[3px] border-[var(--ink)] bg-[var(--paper)] transition-shadow hover:shadow-[6px_6px_0_var(--ink)]">
                  <Link href={`/${lang}/festivals/${r.slug}`} className="group flex flex-1 flex-col no-underline text-[var(--ink)]">
                    <div className="relative border-b-[3px] border-[var(--ink)]">
                      <CardThumbnail
                        src={versionedImageUrl(r.show.image_url, imageCacheVersion(r.show.updated_at))}
                        alt={es ? `Cartel de ${r.show.name}` : `${r.show.name} poster`}
                        aspectClass="aspect-[4/5] w-full"
                        frameClass=""
                        sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                      />
                      <span
                        className="absolute left-3 top-3 border-[2px] border-[var(--ink)] px-2 py-1"
                        style={{
                          fontFamily: MONO,
                          fontWeight: 700,
                          fontSize: '11px',
                          letterSpacing: '1.5px',
                          textTransform: 'uppercase',
                          background: r.next ? 'var(--red)' : 'var(--paper)',
                          color: r.next ? '#fff' : 'var(--ink)',
                        }}
                      >
                        {r.next
                          ? `${es ? 'Próxima' : 'Next'} · ${shortDateRange(r.next.date_start, r.next.date_end, lang)}`
                          : `${es ? 'Última' : 'Latest'} · ${shortDateRange(r.show.date_start, r.show.date_end, lang)}`}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div
                        className="group-hover:text-[var(--red)] transition-colors"
                        style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '19px', lineHeight: 1.1, textTransform: 'uppercase' }}
                      >
                        {r.name}
                      </div>
                      <div className="mt-2" style={{ fontFamily: MONO, fontSize: '13px' }}>
                        {r.cities.slice(0, 3).join(' · ')}
                      </div>
                      <div className="mt-1" style={{ fontFamily: MONO, fontSize: '12px', color: 'var(--dim)' }}>
                        {r.subs.length > 0 ? `${r.subs.length} ${es ? 'ediciones' : 'editions'} · ` : ''}
                        {r.editions.length} {es ? 'eventos' : 'events'}
                        {r.firstYear ? ` · ${es ? 'desde' : 'since'} ${r.firstYear}` : ''}
                      </div>
                    </div>
                  </Link>
                  {r.subs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 border-t-[2px] border-dashed border-[var(--ink)] px-4 py-3">
                      {r.subs.map(({ series: s, n }) => (
                        <Link
                          key={s.slug}
                          href={n >= MIN_SERIES_EDITIONS ? `/${lang}/festivals/${s.slug}` : `/${lang}/festivals/${r.slug}#edition-${s.slug}`}
                          className={n >= MIN_SERIES_EDITIONS ? 'cutout fill no-underline' : 'cutout outline no-underline text-[var(--ink)]'}
                          style={{ margin: 0 }}
                        >
                          {s.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-12 flex flex-wrap gap-3">
            <Link href={`/${lang}/agenda`} className="btn-back">
              {es ? 'Agenda por ciudad y mes (todas las fiestas) →' : 'Listings by city and month (every night) →'}
            </Link>
            <Link href={`/${lang}/events`} className="btn-back">{es ? 'Todos los eventos →' : 'All events →'}</Link>
          </p>
        </div>
      </div>
    </>
  )
}
