// ============================================
// OPTIMAL BREAKS — Agenda breakbeat por ciudad o por mes
// ----------------------------------------------
// /[lang]/agenda/sevilla  → «Eventos breakbeat en Sevilla»
// /[lang]/agenda/2026-10  → «Agenda breakbeat octubre de 2026»
// Solo existen las páginas que superan el mínimo de eventos
// (`@/lib/event-agenda`); el resto responde 404 y no va al sitemap.
// Todo el texto se genera con datos reales, sin relleno inventado.
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
  buildCityBuckets,
  buildMonthBuckets,
  isAndalusianCity,
  MONTH_KEY_RE,
  monthLabel,
  shortDateRange,
  slugifyCity,
  type AgendaEvent,
  type CityBucket,
  type MonthBucket,
} from '@/lib/event-agenda'
import {
  eventsOfSeries,
  festivalSeriesForEventName,
  MIN_SERIES_EDITIONS,
  todayYmdMadrid,
  type FestivalSeries,
} from '@/lib/event-series'
import { loadAgendaEvents } from '@/lib/agenda-data'
import { isEventCancelled } from '@/types/database'
import AgendaEventGrid from '@/components/AgendaEventGrid'

type Props = { params: Promise<{ lang: Locale; slug: string }> }

type Resolved =
  | { kind: 'city'; city: CityBucket; cities: CityBucket[]; months: MonthBucket[] }
  | { kind: 'month'; month: MonthBucket; cities: CityBucket[]; months: MonthBucket[] }

async function resolveAgenda(slug: string): Promise<Resolved | null> {
  const events = (await loadAgendaEvents()).filter((e) => !isEventCancelled(e))
  const cities = buildCityBuckets(events)
  const months = buildMonthBuckets(events)
  if (MONTH_KEY_RE.test(slug)) {
    const month = months.find((m) => m.key === slug)
    return month ? { kind: 'month', month, cities, months } : null
  }
  const city = cities.find((c) => c.slug === slugifyCity(slug) && c.slug === slug)
  return city ? { kind: 'city', city, cities, months } : null
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function topVenues(events: AgendaEvent[], max = 4): string[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    const v = (e.venue ?? '').trim()
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, max).map(([v]) => v)
}

function seriesIn(events: AgendaEvent[]): FestivalSeries[] {
  const seen = new Map<string, FestivalSeries>()
  for (const e of events) {
    const s = festivalSeriesForEventName(e.name)
    if (s && !seen.has(s.slug)) seen.set(s.slug, s)
  }
  return Array.from(seen.values())
}

function listJoin(items: string[], lang: Locale): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${lang === 'es' ? 'y' : 'and'} ${items[items.length - 1]}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const r = await resolveAgenda(slug)
  if (!r) return { title: lang === 'es' ? 'Agenda no encontrada' : 'Listings not found', robots: { index: false, follow: true } }
  const siteName = await siteNameForLang(lang)
  const es = lang === 'es'
  if (r.kind === 'city') {
    const { city } = r
    const year = todayYmdMadrid().slice(0, 4)
    const title = es
      ? `Eventos breakbeat en ${city.name} ${year}: agenda, fiestas y festivales`
      : `Breakbeat events in ${city.name} ${year}: listings, parties and festivals`
    const nextBit = city.upcoming[0]
      ? es
        ? ` Próximo: ${city.upcoming[0].name} (${shortDateRange(city.upcoming[0].date_start, city.upcoming[0].date_end, lang)}).`
        : ` Next up: ${city.upcoming[0].name} (${shortDateRange(city.upcoming[0].date_start, city.upcoming[0].date_end, lang)}).`
      : ''
    const description = es
      ? `${city.upcoming.length} eventos breakbeat próximos en ${city.name}: fechas, carteles, recintos y entradas.${nextBit}`
      : `${city.upcoming.length} upcoming breakbeat events in ${city.name}: dates, line-ups, venues and tickets.${nextBit}`
    return detailPageMetadata(lang, `/agenda/${slug}`, siteName, title, description)
  }
  const label = monthLabel(r.month.key, lang)
  const title = es
    ? `Agenda breakbeat ${label}: fiestas y festivales`
    : `Breakbeat events ${label}: parties and festivals`
  const cityNames = Array.from(new Set(r.month.events.map((e) => e.city).filter(Boolean))).slice(0, 4)
  const description = es
    ? `${r.month.events.length} eventos breakbeat en ${label}${cityNames.length ? ` (${listJoin(cityNames, lang)}…)` : ''}: fechas, carteles y entradas.`
    : `${r.month.events.length} breakbeat events in ${label}${cityNames.length ? ` (${listJoin(cityNames, lang)}…)` : ''}: dates, line-ups and tickets.`
  return detailPageMetadata(lang, `/agenda/${slug}`, siteName, title, description)
}

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

function Faq({ items, title }: { items: { question: string; answer: string }[]; title: string }) {
  if (items.length === 0) return null
  return (
    <section className="mt-12">
      <Heading>{title}</Heading>
      <div className="border-4 border-[var(--ink)] divide-y-[3px] divide-[var(--ink)] max-w-[860px]">
        {items.map((item, i) => (
          <div key={i} className="p-5 bg-[var(--paper)]">
            <h3 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', margin: 0 }}>{item.question}</h3>
            <p className="mt-2" style={{ fontFamily: TYPE, fontSize: '15px', lineHeight: 1.7 }}>{item.answer}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Chips({ lang, cities, months, currentSlug }: { lang: Locale; cities: CityBucket[]; months: MonthBucket[]; currentSlug: string }) {
  const es = lang === 'es'
  return (
    <nav className="mt-12 space-y-4" aria-label={es ? 'Más agenda' : 'More listings'}>
      {months.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {months.filter((m) => m.key !== currentSlug).map((m) => (
            <Link key={m.key} href={`/${lang}/agenda/${m.key}`} className="cutout outline no-underline text-[var(--ink)]">
              {capitalize(monthLabel(m.key, lang))} ({m.events.length})
            </Link>
          ))}
        </div>
      )}
      {cities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cities.filter((c) => c.slug !== currentSlug).slice(0, 16).map((c) => (
            <Link key={c.slug} href={`/${lang}/agenda/${c.slug}`} className="cutout fill no-underline">
              {c.name} ({c.upcoming.length})
            </Link>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/${lang}/festivals`} className="cutout red no-underline">{es ? 'Festivales →' : 'Festivals →'}</Link>
        <Link href={`/${lang}/events`} className="cutout red no-underline">{es ? 'Todos los eventos →' : 'All events →'}</Link>
        <Link href={`/${lang}/breakbeat`} className="cutout red no-underline">{es ? '¿Qué es el breakbeat? →' : 'What is breakbeat? →'}</Link>
      </div>
    </nav>
  )
}

export default async function AgendaPage({ params }: Props) {
  const { lang, slug } = await params
  const r = await resolveAgenda(slug)
  if (!r) notFound()
  const es = lang === 'es'
  const url = `${SITE_URL}/${lang}/agenda/${slug}`

  if (r.kind === 'city') {
    const { city } = r
    const festivals = city.events.filter((e) => e.event_type === 'festival').length
    const years = city.events.map((e) => (e.date_start ?? '').slice(0, 4)).filter(Boolean).sort()
    const venues = topVenues(city.events)
    // Solo festivales con página publicada (≥ MIN_SERIES_EDITIONS ediciones).
    const allAgenda = await loadAgendaEvents()
    const series = seriesIn(city.events).filter((s) => eventsOfSeries(s, allAgenda).length >= MIN_SERIES_EDITIONS)
    const recentPast = city.past.slice(0, 18)

    const intro = es
      ? `Aquí está toda la agenda breakbeat de ${city.name} que recoge Optimal Breaks: ${city.upcoming.length === 0 ? 'ahora mismo no hay fechas anunciadas' : `${city.upcoming.length} ${city.upcoming.length === 1 ? 'evento próximo' : 'eventos próximos'}`} y ${city.events.length} en total${years[0] ? ` desde ${years[0]}` : ''}${festivals ? `, ${festivals} de ellos festivales` : ''}.${venues.length ? ` Los recintos que más se repiten son ${listJoin(venues, lang)}.` : ''}`
      : `This is every breakbeat listing in ${city.name} on Optimal Breaks: ${city.upcoming.length === 0 ? 'no dates announced right now' : `${city.upcoming.length} upcoming ${city.upcoming.length === 1 ? 'event' : 'events'}`} and ${city.events.length} in total${years[0] ? ` since ${years[0]}` : ''}${festivals ? `, ${festivals} of them festivals` : ''}.${venues.length ? ` The most frequent venues are ${listJoin(venues, lang)}.` : ''}`

    const faq: { question: string; answer: string }[] = [
      {
        question: es ? `¿Qué eventos breakbeat hay en ${city.name}?` : `What breakbeat events are on in ${city.name}?`,
        answer: city.upcoming.length
          ? (es ? 'Próximas fechas: ' : 'Upcoming dates: ') +
            city.upcoming.slice(0, 6).map((e) => `${e.name} (${shortDateRange(e.date_start, e.date_end, lang)})`).join('; ') +
            (city.upcoming.length > 6 ? '…' : '.')
          : es
            ? `Ahora mismo no hay fechas anunciadas en ${city.name}. El último evento fue ${city.past[0]?.name ?? '—'}.`
            : `No dates are announced in ${city.name} right now. The latest event was ${city.past[0]?.name ?? '—'}.`,
      },
    ]
    if (venues.length) {
      faq.push({
        question: es ? `¿Dónde se hacen fiestas breakbeat en ${city.name}?` : `Where are breakbeat parties held in ${city.name}?`,
        answer: es ? `Los recintos más habituales son ${listJoin(venues, lang)}.` : `The most common venues are ${listJoin(venues, lang)}.`,
      })
    }
    if (series.length) {
      faq.push({
        question: es ? `¿Qué festivales breakbeat se celebran en ${city.name}?` : `Which breakbeat festivals take place in ${city.name}?`,
        answer: listJoin(series.map((s) => s.name), lang) + '.',
      })
    }
    const faqLd = faqPageJsonLd(faq)
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'ItemList',
          name: es ? `Eventos breakbeat en ${city.name}` : `Breakbeat events in ${city.name}`,
          url,
          itemListElement: city.upcoming.slice(0, 30).map((e, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE_URL}/${lang}/events/${e.slug}`,
            name: e.name,
          })),
        },
        breadcrumbJsonLd([
          { name: es ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
          { name: es ? 'Agenda' : 'Listings', url: `${SITE_URL}/${lang}/agenda` },
          { name: city.name, url },
        ]),
        ...(faqLd ? [faqLd] : []),
      ],
    }

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
          <div className="home-wrap">
            <Link href={`/${lang}/agenda`} className="btn-back">
              <span className="arrow">←</span> {es ? 'Agenda' : 'Listings'}
            </Link>
            <div className="sec-tag">{es ? 'AGENDA POR CIUDAD' : 'LISTINGS BY CITY'}</div>
            <h1 className="sec-title sec-title--compact">
              {es ? 'Eventos breakbeat en ' : 'Breakbeat events in '}<span className="hl">{city.name}</span>
            </h1>
            <p className="mt-4 max-w-[760px]" style={{ fontFamily: TYPE, fontSize: '16px', lineHeight: 1.8 }}>{intro}</p>
            {isAndalusianCity(city.slug) && (
              <p className="mt-3">
                <Link href={`/${lang}/scenes/andalusian-breakbeat`} className="cutout outline no-underline text-[var(--ink)]">
                  {es ? `${city.name} en la historia del breakbeat andaluz →` : `${city.name} in the history of Andalusian breakbeat →`}
                </Link>
              </p>
            )}

            <section className="mt-10">
              <Heading>{es ? `Próximos eventos en ${city.name}` : `Upcoming in ${city.name}`}</Heading>
              {city.upcoming.length ? (
                <AgendaEventGrid events={city.upcoming} lang={lang} />
              ) : (
                <p style={{ fontFamily: TYPE, fontSize: '15px' }}>
                  {es ? 'No hay fechas anunciadas ahora mismo. Vuelve pronto o mira la agenda del mes.' : 'No dates announced right now. Check back soon or see the monthly listings.'}
                </p>
              )}
            </section>

            {series.length > 0 && (
              <section className="mt-12">
                <Heading>{es ? `Festivales en ${city.name}` : `Festivals in ${city.name}`}</Heading>
                <div className="flex flex-wrap gap-2">
                  {series.map((s) => (
                    <Link key={s.slug} href={`/${lang}/festivals/${s.slug}`} className="cutout red no-underline">
                      {s.name} →
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {recentPast.length > 0 && (
              <section className="mt-12">
                <Heading>{es ? `Últimos eventos en ${city.name}` : `Recent events in ${city.name}`}</Heading>
                <AgendaEventGrid events={recentPast} lang={lang} />
              </section>
            )}

            <Faq items={faq} title={es ? 'Preguntas frecuentes' : 'FAQ'} />
            <Chips lang={lang} cities={r.cities} months={r.months} currentSlug={slug} />
          </div>
        </div>
      </>
    )
  }

  // ── Mes ──
  const { month } = r
  const label = monthLabel(month.key, lang)
  const byCity = new Map<string, number>()
  for (const e of month.events) {
    const c = (e.city ?? '').trim()
    if (c) byCity.set(c, (byCity.get(c) ?? 0) + 1)
  }
  const topCities = Array.from(byCity.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c)
  const festivals = month.events.filter((e) => e.event_type === 'festival')
  const intro = es
    ? `${month.events.length} eventos breakbeat en ${label}${topCities.length ? `, con ${listJoin(topCities, lang)} a la cabeza` : ''}${festivals.length ? ` y ${festivals.length} ${festivals.length === 1 ? 'festival' : 'festivales'}` : ''}. Ordenados por fecha; cada cartel lleva a la ficha con horarios y entradas.`
    : `${month.events.length} breakbeat events in ${label}${topCities.length ? `, led by ${listJoin(topCities, lang)}` : ''}${festivals.length ? ` and ${festivals.length} ${festivals.length === 1 ? 'festival' : 'festivals'}` : ''}. Sorted by date; each poster links to the page with times and tickets.`
  const faq: { question: string; answer: string }[] = [
    {
      question: es ? `¿Qué eventos breakbeat hay en ${label}?` : `What breakbeat events are on in ${label}?`,
      answer:
        month.events.slice(0, 8).map((e) => `${e.name} (${shortDateRange(e.date_start, e.date_end, lang)}${e.city ? `, ${e.city}` : ''})`).join('; ') +
        (month.events.length > 8 ? '…' : '.'),
    },
    ...(festivals.length
      ? [{
          question: es ? `¿Qué festivales breakbeat hay en ${label}?` : `Which breakbeat festivals are on in ${label}?`,
          answer: festivals.map((e) => `${e.name} (${e.city || '—'})`).join('; ') + '.',
        }]
      : []),
  ]
  const faqLd = faqPageJsonLd(faq)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: es ? `Agenda breakbeat ${label}` : `Breakbeat events ${label}`,
        url,
        itemListElement: month.events.slice(0, 40).map((e, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE_URL}/${lang}/events/${e.slug}`,
          name: e.name,
        })),
      },
      breadcrumbJsonLd([
        { name: es ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
        { name: es ? 'Agenda' : 'Listings', url: `${SITE_URL}/${lang}/agenda` },
        { name: capitalize(label), url },
      ]),
      ...(faqLd ? [faqLd] : []),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <div className="home-wrap">
          <Link href={`/${lang}/agenda`} className="btn-back">
            <span className="arrow">←</span> {es ? 'Agenda' : 'Listings'}
          </Link>
          <div className="sec-tag">{es ? 'AGENDA DEL MES' : 'MONTHLY LISTINGS'}</div>
          <h1 className="sec-title sec-title--compact">
            {es ? 'Agenda breakbeat ' : 'Breakbeat events '}<span className="hl">{label}</span>
          </h1>
          <p className="mt-4 max-w-[760px]" style={{ fontFamily: TYPE, fontSize: '16px', lineHeight: 1.8 }}>{intro}</p>
          <section className="mt-10">
            <AgendaEventGrid events={month.events} lang={lang} />
          </section>
          <Faq items={faq} title={es ? 'Preguntas frecuentes' : 'FAQ'} />
          <Chips lang={lang} cities={r.cities} months={r.months} currentSlug={slug} />
        </div>
      </div>
    </>
  )
}
