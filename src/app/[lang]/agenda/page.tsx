// ============================================
// OPTIMAL BREAKS — Índice de agenda (/agenda)
// Hub de enlaces internos a las agendas por mes y por ciudad publicables.
// ============================================

import type { Metadata } from 'next'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n-config'
import { breadcrumbJsonLd, detailPageMetadata, siteNameForLang, SITE_URL } from '@/lib/seo'
import { buildCityBuckets, buildMonthBuckets, monthLabel } from '@/lib/event-agenda'
import { loadAgendaEvents } from '@/lib/agenda-data'
import { isEventCancelled } from '@/types/database'

type Props = { params: Promise<{ lang: Locale }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  const siteName = await siteNameForLang(lang)
  return detailPageMetadata(
    lang,
    '/agenda',
    siteName,
    lang === 'es' ? 'Agenda breakbeat por ciudad y por mes' : 'Breakbeat listings by city and month',
    lang === 'es'
      ? 'Fiestas y festivales breakbeat por ciudad (Sevilla, Málaga, Granada, Córdoba…) y por mes, con fechas, carteles y entradas.'
      : 'Breakbeat parties and festivals by city and by month, with dates, line-ups and tickets.',
  )
}

export default async function AgendaIndexPage({ params }: Props) {
  const { lang } = await params
  const es = lang === 'es'
  const events = (await loadAgendaEvents()).filter((e) => !isEventCancelled(e))
  const cities = buildCityBuckets(events)
  const months = buildMonthBuckets(events)
  const jsonLd = breadcrumbJsonLd([
    { name: es ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
    { name: es ? 'Agenda' : 'Listings', url: `${SITE_URL}/${lang}/agenda` },
  ])
  const cardCls =
    'block border-[3px] border-[var(--ink)] bg-[var(--paper)] px-4 py-3 no-underline text-[var(--ink)] transition-all hover:bg-[var(--yellow)] sm:hover:shadow-[5px_5px_0_var(--ink)]'

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <div className="home-wrap">
          <div className="sec-tag">{es ? 'AGENDA' : 'LISTINGS'}</div>
          <h1 className="sec-title sec-title--compact">
            {es ? 'Agenda ' : 'Breakbeat '}<span className="hl">{es ? 'breakbeat' : 'listings'}</span>
          </h1>
          <p className="mt-4 max-w-[720px]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>
            {es
              ? 'Todas las fiestas y festivales breakbeat que recoge Optimal Breaks, ordenados por mes y por ciudad.'
              : 'Every breakbeat party and festival on Optimal Breaks, organised by month and by city.'}
          </p>

          {months.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', letterSpacing: '2px' }}>
                {es ? 'Por mes' : 'By month'}
              </h2>
              <ul className="list-none m-0 p-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {months.map((m) => (
                  <li key={m.key}>
                    <Link href={`/${lang}/agenda/${m.key}`} className={cardCls}>
                      <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase' }}>
                        {monthLabel(m.key, lang)}
                      </div>
                      <div className="text-[12px] text-[var(--text-muted)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        {m.events.length} {es ? 'eventos' : 'events'}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className="mb-3" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', letterSpacing: '2px' }}>
              {es ? 'Por ciudad' : 'By city'}
            </h2>
            <ul className="list-none m-0 p-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {cities.map((c) => (
                <li key={c.slug}>
                  <Link href={`/${lang}/agenda/${c.slug}`} className={cardCls}>
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase' }}>
                      {c.name}
                    </div>
                    <div className="text-[12px] text-[var(--text-muted)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                      {c.upcoming.length} {es ? 'próximos' : 'upcoming'} · {c.events.length} {es ? 'en total' : 'total'}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-10 flex flex-wrap gap-3">
            <Link href={`/${lang}/festivals`} className="btn-back">{es ? 'Festivales →' : 'Festivals →'}</Link>
            <Link href={`/${lang}/events`} className="btn-back">{es ? 'Todos los eventos →' : 'All events →'}</Link>
          </p>
        </div>
      </div>
    </>
  )
}
