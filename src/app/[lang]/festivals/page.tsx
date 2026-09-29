// ============================================
// OPTIMAL BREAKS — Índice de festivales (/festivals)
// Orden: primero los que tienen fecha próxima (la más cercana), luego el resto
// por la última fecha. Con pocas citas próximas, una fila ancha; a partir de
// tres, agrupadas por mes.
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
import { monthLabel, shortDateRange } from '@/lib/event-agenda'
import { loadAgendaEvents, type AgendaEventFull } from '@/lib/agenda-data'
import { imageCacheVersion, versionedImageUrl } from '@/lib/image-url'
import { isEventCancelled } from '@/types/database'
import AgendaEventGrid from '@/components/AgendaEventGrid'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: Promise<{ lang: Locale }> }

const MONO = "'Courier Prime', monospace"

/** Por debajo de esto, las próximas citas van en fila ancha. A partir de aquí, por mes. */
const MONTH_GROUP_MIN = 3

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  const siteName = await siteNameForLang(lang)
  return detailPageMetadata(
    lang,
    '/festivals',
    siteName,
    lang === 'es' ? 'Festivales breakbeat: fechas y carteles' : 'Breakbeat festivals: dates and posters',
    lang === 'es'
      ? 'Los festivales breakbeat que sigue Optimal Breaks: próxima fecha, cartel y el archivo de cada marca.'
      : 'The breakbeat festivals followed by Optimal Breaks: next date, poster and the archive of each brand.',
  )
}

function Heading({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
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

function NextDateRow({
  e,
  festivalName,
  festivalHref,
  lang,
}: {
  e: AgendaEventFull
  festivalName: string
  festivalHref: string
  lang: Locale
}) {
  const es = lang === 'es'
  return (
    <article className="flex flex-col sm:flex-row gap-5 border-4 border-[var(--ink)] bg-[var(--yellow)] p-4 sm:p-5 shadow-[6px_6px_0_var(--ink)]">
      <Link href={`/${lang}/events/${e.slug}`} className="w-full sm:w-[200px] shrink-0 border-[3px] border-[var(--ink)] no-underline">
        <CardThumbnail
          src={versionedImageUrl(e.image_url, imageCacheVersion(e.updated_at))}
          alt={es ? `Cartel de ${e.name}` : `${e.name} poster`}
          aspectClass="aspect-poster w-full"
          frameClass=""
          sizes="200px"
          preload
        />
      </Link>
      <div className="min-w-0 flex flex-col">
        <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 4vw, 40px)', color: 'var(--red)', lineHeight: 1 }}>
          {shortDateRange(e.date_start, e.date_end, lang)}
        </div>
        <Link
          href={`/${lang}/events/${e.slug}`}
          className="mt-2 no-underline text-[var(--ink)] hover:text-[var(--red)] transition-colors"
          style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 26px)', lineHeight: 1.05, textTransform: 'uppercase' }}
        >
          {e.name}
        </Link>
        <div className="mt-2" style={{ fontFamily: MONO, fontSize: '15px' }}>
          {[e.venue, e.city].filter(Boolean).join(' · ')}
        </div>
        <div className="mt-auto pt-4 flex flex-wrap gap-2">
          <Link
            href={`/${lang}/events/${e.slug}`}
            className="inline-block border-[3px] border-[var(--ink)] bg-[var(--red)] px-4 py-2 text-white no-underline"
            style={{ fontFamily: MONO, fontWeight: 700, fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase' }}
          >
            {es ? 'Cartel y entradas →' : 'Poster and tickets →'}
          </Link>
          <Link href={festivalHref} className="cutout outline no-underline text-[var(--ink)]" style={{ margin: 0 }}>
            {festivalName}
          </Link>
        </div>
      </div>
    </article>
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
      const years = r.editions.map((e) => (e.date_start ?? '').slice(0, 4)).filter(Boolean).sort()
      return { ...r, upcoming, next, latest, show: next ?? latest, firstYear: years[0] ?? null }
    })
    .sort((a, b) => {
      if (a.next && !b.next) return -1
      if (!a.next && b.next) return 1
      if (a.next && b.next) return String(a.next.date_start).localeCompare(String(b.next.date_start))
      return String(b.latest.date_start ?? '').localeCompare(String(a.latest.date_start ?? ''))
    })

  const featured = rows.flatMap((r) =>
    r.upcoming.map((e) => ({ event: e, name: r.name, href: `/${lang}/festivals/${r.slug}` })),
  )
  const byMonth = featured.length >= MONTH_GROUP_MIN
  const monthGroups = byMonth
    ? Array.from(
        featured.reduce((map, item) => {
          const key = (item.event.date_start ?? '').slice(0, 7)
          if (!key) return map
          map.set(key, [...(map.get(key) ?? []), item.event])
          return map
        }, new Map<string, AgendaEventFull[]>()),
      ).sort(([a], [b]) => a.localeCompare(b))
    : []

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

          {featured.length > 0 && !byMonth && (
            <section className="mt-8">
              <Heading>
                {featured.length > 1
                  ? es ? 'Próximas fechas' : 'Upcoming dates'
                  : es ? 'Próxima fecha' : 'Next date'}
              </Heading>
              <div className="flex flex-col gap-5">
                {featured.map((item) => (
                  <NextDateRow
                    key={item.event.slug}
                    e={item.event}
                    festivalName={item.name}
                    festivalHref={item.href}
                    lang={lang}
                  />
                ))}
              </div>
            </section>
          )}

          {byMonth &&
            monthGroups.map(([key, list]) => (
              <section key={key} id={`mes-${key}`} className="mt-10 scroll-mt-24">
                <Heading
                  note={
                    <Link
                      href={`/${lang}/agenda/${key}`}
                      className="no-underline text-[var(--ink)] hover:text-[var(--red)]"
                      style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 700 }}
                    >
                      {es ? 'Agenda del mes →' : 'Month listings →'}
                    </Link>
                  }
                >
                  {monthLabel(key, lang)}
                </Heading>
                <AgendaEventGrid events={list} lang={lang} />
              </section>
            ))}

          <section id="festivales" className="mt-12 scroll-mt-24">
            <Heading>{es ? 'Todos los festivales' : 'All festivals'}</Heading>
            <ul className="list-none m-0 p-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {rows.map((r) => (
                <li key={r.slug} className="flex flex-col border-[3px] border-[var(--ink)] bg-[var(--paper)] transition-shadow hover:shadow-[6px_6px_0_var(--ink)]">
                  <Link href={`/${lang}/festivals/${r.slug}`} className="group flex flex-1 flex-col no-underline text-[var(--ink)]">
                    <div className="border-b-[3px] border-[var(--ink)]">
                      <CardThumbnail
                        src={versionedImageUrl(r.show.image_url, imageCacheVersion(r.show.updated_at))}
                        alt={es ? `Cartel de ${r.show.name}` : `${r.show.name} poster`}
                        aspectClass="aspect-[4/5] w-full"
                        frameClass=""
                        sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '26px', lineHeight: 1, color: r.next ? 'var(--red)' : 'var(--dim)' }}>
                        {shortDateRange(r.show.date_start, r.show.date_end, lang)}
                      </div>
                      <div className="mt-1" style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700 }}>
                        {r.next ? (es ? 'Próxima' : 'Next') : es ? 'Última' : 'Latest'}
                      </div>
                      <div
                        className="mt-2 group-hover:text-[var(--red)] transition-colors"
                        style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '19px', lineHeight: 1.1, textTransform: 'uppercase' }}
                      >
                        {r.name}
                      </div>
                      <div className="mt-2" style={{ fontFamily: MONO, fontSize: '13px' }}>
                        {[r.show.venue, r.show.city].filter(Boolean).join(' · ')}
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

          <p className="mt-10">
            <Link href={`/${lang}/agenda`} className="no-underline text-[var(--ink)] hover:text-[var(--red)]" style={{ fontFamily: MONO, fontSize: '14px', fontWeight: 700 }}>
              {es ? 'Agenda por ciudad y mes →' : 'Listings by city and month →'}
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
