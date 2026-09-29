// ============================================
// OPTIMAL BREAKS — Organization Detail Page
// ----------------------------------------------
// Para promotoras (Raveart…) es el PARAGUAS de la marca: sus festivales
// (series con página fija /festivals/<serie>), todas sus próximas fechas y el
// archivo, incluidos los eventos sueltos que no son serie (noches de club,
// fiestas temáticas…). Para sellos/medios mantiene la ficha de siempre.
//
// «Próximo» se decide por FECHA (último día ≥ hoy), no por `event_type`:
// antes un festival futuro con event_type='festival' caía en el archivo.
// ============================================

import { createCachedSupabase } from '@/lib/supabase-server'
import { breadcrumbJsonLd, detailPageMetadata, siteNameForLang, SITE_URL } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'
import type { Label, Organization } from '@/types/database'
import { isEventCancelled } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ShareButtons from '@/components/ShareButtons'
import { splitBioParagraphs } from '@/lib/bio-format'
import CardThumbnail from '@/components/CardThumbnail'
import AgendaEventGrid from '@/components/AgendaEventGrid'
import { AGENDA_EVENT_COLUMNS, shortDateRange, type AgendaEvent } from '@/lib/event-agenda'
import {
  eventsOfSeries,
  festivalSeriesForEventName,
  isUpcomingOrOngoing,
  MIN_SERIES_EDITIONS,
  todayYmdMadrid,
  type FestivalSeries,
} from '@/lib/event-series'
import { loadAgendaEvents } from '@/lib/agenda-data'

type Props = { params: Promise<{ lang: Locale; slug: string }> }
type OrganizationSeoRow = Pick<Organization, 'id' | 'name' | 'description_en' | 'description_es' | 'image_url' | 'roles' | 'base_city'>
type LabelPreview = Pick<Label, 'slug' | 'name' | 'country' | 'founded_year' | 'is_active'>

/** Eventos de la promotora (columnas ligeras, más reciente primero). */
async function loadPromoterEvents(orgId: string): Promise<AgendaEvent[]> {
  const supabase = createCachedSupabase()
  const { data } = await supabase
    .from('events')
    .select(AGENDA_EVENT_COLUMNS)
    .eq('promoter_organization_id', orgId)
    .order('date_start', { ascending: false, nullsFirst: false })
    .limit(500)
  return ((data ?? []) as unknown) as AgendaEvent[]
}

type SeriesSummary = { series: FestivalSeries; count: number; next: AgendaEvent | null; latest: AgendaEvent }

function summarizeSeries(events: AgendaEvent[], today: string): SeriesSummary[] {
  const map = new Map<string, { series: FestivalSeries; list: AgendaEvent[] }>()
  for (const e of events) {
    const s = festivalSeriesForEventName(e.name)
    if (!s) continue
    const entry = map.get(s.slug) ?? { series: s, list: [] }
    entry.list.push(e)
    map.set(s.slug, entry)
  }
  return Array.from(map.values())
    .map(({ series, list }) => {
      const next =
        list
          .filter((e) => !isEventCancelled(e) && isUpcomingOrOngoing(e, today))
          .sort((a, b) => String(a.date_start ?? '').localeCompare(String(b.date_start ?? '')))[0] ?? null
      return { series, count: list.length, next, latest: list[0] }
    })
    .sort((a, b) => {
      if (a.next && !b.next) return -1
      if (!a.next && b.next) return 1
      return b.count - a.count
    })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createCachedSupabase()
  const { data: raw } = await supabase
    .from('organizations')
    .select('id, name, description_en, description_es, image_url, roles, base_city')
    .eq('slug', slug)
    .single()
  const data = raw as OrganizationSeoRow | null
  if (!data?.name) return { title: lang === 'es' ? 'Organizacion no encontrada' : 'Organization not found', robots: { index: false, follow: true } }
  const siteName = await siteNameForLang(lang)
  const isPromoter = (data.roles ?? []).includes('promoter')
  const es = lang === 'es'

  if (!isPromoter) {
    const description = (es ? data.description_es : data.description_en)?.slice(0, 160)
    return detailPageMetadata(lang, `/organizations/${slug}`, siteName, data.name, description, 'website', data.image_url)
  }

  const events = await loadPromoterEvents(data.id)
  const today = todayYmdMadrid()
  const upcoming = events.filter((e) => !isEventCancelled(e) && isUpcomingOrOngoing(e, today))
  const series = summarizeSeries(events, today)
  const title = es
    ? `${data.name}: eventos, festivales y próximas fechas`
    : `${data.name}: events, festivals and upcoming dates`
  const seriesBit = series.length ? series.slice(0, 3).map((s) => s.series.name).join(', ') : ''
  const description = es
    ? `Todos los eventos de ${data.name}${data.base_city ? ` (${data.base_city})` : ''}: ${upcoming.length} próximas fechas${seriesBit ? `, festivales como ${seriesBit}` : ''} y el archivo completo con carteles.`
    : `Every ${data.name} event${data.base_city ? ` (${data.base_city})` : ''}: ${upcoming.length} upcoming dates${seriesBit ? `, festivals such as ${seriesBit}` : ''} and the full archive with posters.`
  return detailPageMetadata(lang, `/organizations/${slug}`, siteName, title, description, 'website', data.image_url)
}

function socialLabel(key: string, lang: Locale) {
  const normalized = key.toLowerCase()
  const labels: Record<string, { es: string; en: string }> = {
    website: { es: 'Web oficial', en: 'Official site' },
    records: { es: 'Records', en: 'Records' },
    tickets: { es: 'Entradas', en: 'Tickets' },
    instagram: { es: 'Instagram', en: 'Instagram' },
    facebook: { es: 'Facebook', en: 'Facebook' },
    beatport: { es: 'Beatport', en: 'Beatport' },
    soundcloud: { es: 'SoundCloud', en: 'SoundCloud' },
  }
  const entry = labels[normalized]
  return lang === 'es' ? entry?.es || key : entry?.en || key
}

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

export default async function OrganizationDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const es = lang === 'es'
  const supabase = createCachedSupabase()
  const { data: rawOrganization } = await supabase.from('organizations').select('*').eq('slug', slug).single()
  const organization = rawOrganization as Organization | null

  if (!organization) notFound()

  const isPromoter = (organization.roles ?? []).includes('promoter')
  const [{ data: rawLabels }, events] = await Promise.all([
    supabase
      .from('labels')
      .select('slug, name, country, founded_year, is_active')
      .eq('organization_id', organization.id)
      .order('founded_year', { ascending: true }),
    loadPromoterEvents(organization.id),
  ])

  const labels = (rawLabels || []) as LabelPreview[]
  const today = todayYmdMadrid()
  const upcomingEvents = events
    .filter((e) => isUpcomingOrOngoing(e, today))
    .sort((a, b) => String(a.date_start ?? '').localeCompare(String(b.date_start ?? '')))
  const archiveEvents = events.filter((e) => !isUpcomingOrOngoing(e, today))
  const series = summarizeSeries(events, today)
  // Solo series con página publicada (≥ MIN_SERIES_EDITIONS ediciones en toda la BD).
  const allAgenda = await loadAgendaEvents()
  const publishedSeries = series.filter((s) => eventsOfSeries(s.series, allAgenda).length >= MIN_SERIES_EDITIONS)
  const archiveGrid = archiveEvents.slice(0, 24)
  const archiveRest = archiveEvents.slice(24)
  const socials = Object.entries(organization.socials || {}).filter(([, value]) => typeof value === 'string' && value)

  const url = `${SITE_URL}/${lang}/organizations/${slug}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: organization.name,
        url,
        ...(organization.image_url ? { logo: organization.image_url } : {}),
        ...(organization.founded_year ? { foundingDate: String(organization.founded_year) } : {}),
        ...(organization.base_city
          ? { address: { '@type': 'PostalAddress', addressLocality: organization.base_city, addressCountry: organization.country } }
          : {}),
        ...(socials.length ? { sameAs: socials.map(([, v]) => v) } : {}),
        ...(upcomingEvents.length
          ? {
              event: upcomingEvents.slice(0, 20).map((e) => ({
                '@type': 'Event',
                name: e.name,
                ...(e.date_start ? { startDate: e.date_start } : {}),
                url: `${SITE_URL}/${lang}/events/${e.slug}`,
                location: { '@type': 'Place', name: e.venue || e.city, address: { '@type': 'PostalAddress', addressLocality: e.city, addressCountry: e.country } },
              })),
            }
          : {}),
      },
      breadcrumbJsonLd([
        { name: es ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
        isPromoter
          ? { name: es ? 'Festivales' : 'Festivals', url: `${SITE_URL}/${lang}/festivals` }
          : { name: es ? 'Sellos' : 'Labels', url: `${SITE_URL}/${lang}/labels` },
        { name: organization.name, url },
      ]),
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <div className="home-wrap">
          {isPromoter ? (
            <Link href={`/${lang}/festivals`} className="btn-back"><span className="arrow">←</span> {es ? 'Festivales' : 'Festivals'}</Link>
          ) : (
            <Link href={`/${lang}/labels`} className="btn-back"><span className="arrow">←</span> {es ? 'Volver a Sellos' : 'Back to Labels'}</Link>
          )}
          <div className="sec-tag">{isPromoter ? (es ? 'PROMOTORA' : 'PROMOTER') : 'ORGANIZATION'}</div>
          <h1 className="sec-title sec-title--compact"><span className="hl">{organization.name}</span></h1>
          {isPromoter && (
            <p className="mt-2" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '14px', color: 'var(--dim)' }}>
              {es
                ? `${upcomingEvents.length} próximas fechas · ${publishedSeries.length} ${publishedSeries.length === 1 ? 'festival' : 'festivales'} · ${events.length} eventos en el archivo`
                : `${upcomingEvents.length} upcoming dates · ${publishedSeries.length} ${publishedSeries.length === 1 ? 'festival' : 'festivals'} · ${events.length} events on record`}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-4 mb-6">
            <ShareButtons url={`/${lang}/organizations/${slug}`} title={`${organization.name} | Optimal Breaks`} lang={lang} />
          </div>

          {organization.image_url && (
            <div className="mb-8 -mx-4 sm:mx-0 border-y-[3px] border-[var(--ink)] overflow-hidden">
              <CardThumbnail src={organization.image_url} alt={organization.name} heightClass="h-44 sm:h-52 md:h-56" frameClass="border-0" />
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-8">
            {organization.roles?.map((role) => (
              <span key={role} className="cutout red">{role.replace('_', ' ')}</span>
            ))}
            <span className="cutout fill">{organization.country}</span>
            {organization.base_city && <span className="cutout outline">{organization.base_city}</span>}
            {organization.founded_year && <span className="cutout outline">Est. {organization.founded_year}</span>}
          </div>

          <div className="max-w-[760px] space-y-5">
            {splitBioParagraphs(es ? organization.description_es : organization.description_en).map((para, i) => (
              <p key={i} style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.85 }} className="text-[var(--ink)]">
                {para}
              </p>
            ))}
          </div>

          {/* Próximas fechas (por fecha real, con cartel) */}
          {upcomingEvents.length > 0 && (
            <section className="mt-10">
              <Heading>{es ? `Próximas fechas de ${organization.name}` : `Upcoming ${organization.name} dates`}</Heading>
              <AgendaEventGrid events={upcomingEvents} lang={lang} />
            </section>
          )}

          {/* Sus festivales: enlace a cada página fija */}
          {publishedSeries.length > 0 && (
            <section className="mt-12">
              <Heading>{es ? `Festivales de ${organization.name}` : `${organization.name} festivals`}</Heading>
              <ul className="list-none m-0 p-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {publishedSeries.map(({ series: s, count, next, latest }) => (
                  <li key={s.slug}>
                    <Link
                      href={`/${lang}/festivals/${s.slug}`}
                      className="block border-[3px] border-[var(--ink)] bg-[var(--paper)] px-4 py-3 no-underline text-[var(--ink)] transition-all hover:bg-[var(--yellow)] sm:hover:shadow-[5px_5px_0_var(--ink)]"
                    >
                      <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '15px', textTransform: 'uppercase' }}>
                        {s.name} →
                      </div>
                      <div className="mt-1" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '15px', color: next ? 'var(--red)' : 'var(--dim)' }}>
                        {next
                          ? `${es ? 'Próxima: ' : 'Next: '}${shortDateRange(next.date_start, next.date_end, lang)}`
                          : `${es ? 'Última: ' : 'Latest: '}${shortDateRange(latest.date_start, latest.date_end, lang)}`}
                      </div>
                      <div className="text-[12px] text-[var(--text-muted)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        {count} {es ? (count === 1 ? 'edición' : 'ediciones') : count === 1 ? 'edition' : 'editions'}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {socials.length > 0 && (
            <div className="mt-10 p-4 sm:p-6 border-4 border-[var(--ink)]">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--red)', marginBottom: '12px' }}>
                {es ? 'ENLACES' : 'LINKS'}
              </div>
              <div className="flex flex-wrap gap-2">
                {socials.map(([key, value]) => (
                  <a key={key} href={value} target="_blank" rel="noreferrer" className="cutout outline no-underline text-[var(--ink)]">
                    {socialLabel(key, lang)}
                  </a>
                ))}
              </div>
            </div>
          )}

          {labels.length > 0 && (
            <div className="mt-8 p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>
                {es ? 'SELLOS RELACIONADOS' : 'RELATED LABELS'}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {labels.map((label) => (
                  <Link key={label.slug} href={`/${lang}/labels/${label.slug}`} className="border-2 border-[var(--paper)] p-4 no-underline text-[var(--paper)]">
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '18px', textTransform: 'uppercase' }}>
                      {label.name}
                    </div>
                    <div className="mt-2 text-[13px]" style={{ color: 'rgba(232,220,200,0.78)' }}>
                      {label.country}{label.founded_year ? ` · Est. ${label.founded_year}` : ''} · {label.is_active ? 'ACTIVE' : 'ARCHIVE'}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Archivo: carteles de los últimos 24 y el resto en lista compacta */}
          {archiveEvents.length > 0 && (
            <section className="mt-12">
              <Heading>{es ? 'Archivo de eventos' : 'Event archive'}</Heading>
              <AgendaEventGrid events={archiveGrid} lang={lang} />
              {archiveRest.length > 0 && (
                <ul className="list-none m-0 p-0 mt-6 border-[3px] border-[var(--ink)] divide-y-2 divide-[var(--ink)]/15 bg-[var(--paper)]">
                  {archiveRest.map((e) => (
                    <li key={e.slug}>
                      <Link href={`/${lang}/events/${e.slug}`} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 no-underline text-[var(--ink)] hover:bg-[var(--yellow)]/30">
                        <span style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>
                          {shortDateRange(e.date_start, e.date_end, lang)}
                        </span>
                        <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '13px', textTransform: 'uppercase' }}>{e.name}</span>
                        <span className="text-[12px] text-[var(--text-muted)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                          {[e.venue, e.city].filter(Boolean).join(' · ')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
