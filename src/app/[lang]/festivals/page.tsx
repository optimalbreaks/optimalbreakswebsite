// ============================================
// OPTIMAL BREAKS — Índice de festivales (/festivals)
// Enlaza las páginas permanentes por marca: próxima fecha o última edición.
// ============================================

import type { Metadata } from 'next'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n-config'
import { breadcrumbJsonLd, detailPageMetadata, siteNameForLang, SITE_URL } from '@/lib/seo'
import {
  eventsOfSeries,
  FESTIVAL_SERIES,
  isUpcomingOrOngoing,
  MIN_SERIES_EDITIONS,
  todayYmdMadrid,
} from '@/lib/event-series'
import { shortDateRange } from '@/lib/event-agenda'
import { loadAgendaEvents } from '@/lib/agenda-data'
import { imageCacheVersion, versionedImageUrl } from '@/lib/image-url'
import { isEventCancelled } from '@/types/database'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: Promise<{ lang: Locale }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  const siteName = await siteNameForLang(lang)
  return detailPageMetadata(
    lang,
    '/festivals',
    siteName,
    lang === 'es' ? 'Festivales breakbeat: fechas, carteles y ediciones' : 'Breakbeat festivals: dates, line-ups and editions',
    lang === 'es'
      ? 'Los festivales y ciclos breakbeat que sigue Optimal Breaks: próxima edición, carteles y el archivo de todas sus ediciones.'
      : 'The breakbeat festivals and series followed by Optimal Breaks: next edition, line-ups and the archive of every edition.',
  )
}

export default async function FestivalsIndexPage({ params }: Props) {
  const { lang } = await params
  const es = lang === 'es'
  const today = todayYmdMadrid()
  const all = await loadAgendaEvents()

  const rows = FESTIVAL_SERIES.map((series) => {
    const editions = eventsOfSeries(series, all)
    if (editions.length < MIN_SERIES_EDITIONS) return null
    const next =
      editions
        .filter((e) => !isEventCancelled(e) && isUpcomingOrOngoing(e, today))
        .sort((a, b) => String(a.date_start ?? '').localeCompare(String(b.date_start ?? '')))[0] ?? null
    return { series, editions, next, show: next ?? editions[0] }
  })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    // Primero los que tienen próxima edición (por fecha), luego el resto por nº de ediciones.
    .sort((a, b) => {
      if (a.next && !b.next) return -1
      if (!a.next && b.next) return 1
      if (a.next && b.next) return String(a.next.date_start).localeCompare(String(b.next.date_start))
      return b.editions.length - a.editions.length
    })

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
          <p className="mt-4 max-w-[720px]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>
            {es
              ? 'Cada festival tiene aquí una página fija con su próxima edición, el archivo de todas las anteriores y los artistas que han pasado por su cartel.'
              : 'Each festival has a permanent page here with its next edition, the archive of every previous one and the artists who have played it.'}
          </p>

          <ul className="list-none m-0 p-0 mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map(({ series, editions, next, show }) => (
              <li key={series.slug}>
                <Link
                  href={`/${lang}/festivals/${series.slug}`}
                  className="flex gap-4 border-[3px] border-[var(--ink)] bg-[var(--paper)] p-3 no-underline text-[var(--ink)] transition-all hover:bg-[var(--yellow)] sm:hover:shadow-[6px_6px_0_var(--ink)]"
                >
                  <div className="w-[84px] shrink-0 border-[2px] border-[var(--ink)]">
                    <CardThumbnail
                      src={versionedImageUrl(show.image_url, imageCacheVersion(show.updated_at))}
                      alt=""
                      aspectClass="aspect-poster w-full"
                      frameClass=""
                      sizes="84px"
                    />
                  </div>
                  <div className="min-w-0">
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '16px', lineHeight: 1.1, textTransform: 'uppercase' }}>
                      {series.name}
                    </div>
                    <div className="mt-2" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '15px', color: next ? 'var(--red)' : 'var(--dim)' }}>
                      {next
                        ? `${es ? 'Próxima: ' : 'Next: '}${shortDateRange(next.date_start, next.date_end, lang)}`
                        : `${es ? 'Última: ' : 'Latest: '}${shortDateRange(show.date_start, show.date_end, lang)}`}
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--text-muted)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                      {editions.length} {es ? (editions.length === 1 ? 'edición' : 'ediciones') : editions.length === 1 ? 'edition' : 'editions'}
                      {show.city ? ` · ${show.city}` : ''}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-10">
            <Link href={`/${lang}/agenda`} className="btn-back">
              {es ? 'Agenda breakbeat por ciudad y mes →' : 'Breakbeat listings by city and month →'}
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
