// ============================================
// OPTIMAL BREAKS — Event Detail Page (redesigned)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { breadcrumbJsonLd, detailPageMetadata, eventJsonLd, siteNameForLang, SITE_URL } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'
import type { Artist, BreakEvent, EventStage, EventScheduleSlot, Organization } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import FanCounter from '@/components/FanCounter'
import FavoriteButton from '@/components/FavoriteButton'
import EventStatusButton from '@/components/EventStatusButton'
import EventReviewButton from '@/components/EventReviewButton'
import EventPosterLightbox from '@/components/EventPosterLightbox'
import {
  splitBioParagraphs,
  splitFestivalDescriptionSections,
  splitProseForDisplay,
} from '@/lib/bio-format'
import { getDictionary } from '@/lib/dictionaries'

type Props = {
  params: Promise<{ lang: Locale; slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}
type EventSeoRow = Pick<
  BreakEvent,
  | 'name'
  | 'description_en'
  | 'description_es'
  | 'image_url'
  | 'og_image_url'
  | 'date_start'
  | 'date_end'
  | 'venue'
  | 'city'
  | 'country'
>
type EventPageRow = BreakEvent & {
  promoter: Pick<Organization, 'slug' | 'name'> | null
}

function formatDate(dateStr: string | null, lang: Locale): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function isMonsterTicketUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const host = new URL(url.trim()).hostname.toLowerCase()
    return (
      host === 'www.monsterticket.com' ||
      host === 'monsterticket.com' ||
      host === 'www.monsterticket.es' ||
      host === 'monsterticket.es' ||
      host.endsWith('.monsterticket.com') ||
      host.endsWith('.monsterticket.es')
    )
  } catch {
    return false
  }
}

/** Plataformas de venta habituales (Skiddle, Dice, etc.): el CTA del hero debe mostrarse también con club_night. */
function isKnownTicketingSiteUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const host = new URL(url.trim()).hostname.toLowerCase()
    if (isMonsterTicketUrl(url)) return true
    return (
      host === 'skiddle.com' ||
      host.endsWith('.skiddle.com') ||
      host === 'dice.fm' ||
      host.endsWith('.dice.fm') ||
      host.includes('eventbrite.') ||
      host.includes('ticketmaster.') ||
      host.includes('seetickets.com') ||
      host.includes('gigantic.com') ||
      host.includes('axs.com') ||
      host.includes('fourvenues.com') ||
      host.includes('see-tickets.com')
    )
  } catch {
    return false
  }
}

function parseEventDayStart(iso: string | null | undefined): number | null {
  if (!iso) return null
  const part = String(iso).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return null
  const [y, m, d] = part.split('-').map(Number)
  const t = new Date(y, m - 1, d).setHours(0, 0, 0, 0)
  return Number.isNaN(t) ? null : t
}

function startOfLocalTodayEventPage(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Último día del evento antes que hoy → ya pasó (no mostrar CTA de compra en hero). */
function isEventPastByDate(event: Pick<BreakEvent, 'date_start' | 'date_end'>): boolean {
  const last = parseEventDayStart(event.date_end) ?? parseEventDayStart(event.date_start)
  if (last == null) return false
  return last < startOfLocalTodayEventPage()
}

/** Prioriza URL de MonsterTicket si existe (tickets o web). */
function preferredHeroTicketUrl(ev: Pick<BreakEvent, 'tickets_url' | 'website'>): string {
  const t = (ev.tickets_url ?? '').trim()
  const w = (ev.website ?? '').trim()
  if (isMonsterTicketUrl(t)) return t
  if (isMonsterTicketUrl(w)) return w
  return t || w
}

/** Etiqueta del enlace principal de compra (MonsterTicket = copy acordado con el sitio). */
function primaryTicketCtaLabel(
  ticketsUrl: string | null | undefined,
  websiteUrl: string | null | undefined,
  lang: Locale,
): string {
  if (isMonsterTicketUrl(ticketsUrl) || isMonsterTicketUrl(websiteUrl)) {
    return lang === 'es' ? 'Compra de entradas' : 'Buy tickets'
  }
  return lang === 'es' ? 'Comprar entradas' : 'Get tickets'
}

function websiteLinkLabel(url: string, lang: Locale): string {
  if (isMonsterTicketUrl(url)) {
    return lang === 'es' ? 'Compra de entradas' : 'Buy tickets'
  }
  return 'Web'
}

function secondaryTicketsLinkLabel(url: string, lang: Locale): string {
  if (isMonsterTicketUrl(url)) {
    return lang === 'es' ? 'Compra de entradas' : 'Buy tickets'
  }
  return lang === 'es' ? 'Entradas' : 'Tickets'
}

function eventTypeLabel(type: string, lang: Locale): string {
  const map: Record<string, { es: string; en: string }> = {
    festival: { es: 'Festival', en: 'Festival' },
    club_night: { es: 'Club Night', en: 'Club Night' },
    past_iconic: { es: 'Evento Historico', en: 'Past Iconic' },
    upcoming: { es: 'Proximo Evento', en: 'Upcoming' },
  }
  return lang === 'es' ? map[type]?.es || type : map[type]?.en || type
}

function mapsUrl(coords: { lat: number; lng: number } | null, address: string | null): string | null {
  if (coords) return `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
  if (address) return `https://www.google.com/maps/search/${encodeURIComponent(address)}`
  return null
}

/** Postgres TIME devuelve a veces "16:00:00"; en UI mostramos "16:00". */
function formatDoorTime(t: string | null | undefined): string {
  if (!t) return ''
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : t
}

function dateStampParts(dateStr: string | null, lang: Locale): { day: string; month: string; line: string } | null {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return {
      day: String(d.getDate()),
      month: d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { month: 'short' }).replace('.', '').toUpperCase(),
      line: d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    }
  } catch {
    return null
  }
}

/** Fecha corta para meta description: "5 sept 2026" o "5–7 sept 2026". */
function metaDateLabel(start: string | null, end: string | null, lang: Locale): string {
  if (!start) return ''
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  try {
    const dStart = new Date(start + 'T12:00:00')
    if (Number.isNaN(dStart.getTime())) return ''
    const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    const startLabel = fmt.format(dStart).replace('.', '')
    if (end && end !== start) {
      const dEnd = new Date(end + 'T12:00:00')
      if (!Number.isNaN(dEnd.getTime())) {
        const sameMonthYear =
          dEnd.getFullYear() === dStart.getFullYear() && dEnd.getMonth() === dStart.getMonth()
        if (sameMonthYear) {
          return `${dStart.getDate()}–${fmt.format(dEnd).replace('.', '')}`
        }
        return `${startLabel} → ${fmt.format(dEnd).replace('.', '')}`
      }
    }
    return startLabel
  } catch {
    return ''
  }
}

/** "Venue, City, Country" sin duplicados (algunos eventos repiten city en venue). */
function metaPlaceLabel(venue: string | null, city: string | null, country: string | null): string {
  const bits = [venue, city, country].map((s) => s?.trim() || '').filter(Boolean)
  const seen = new Set<string>()
  return bits
    .filter((b) => {
      const k = b.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .join(', ')
}

/** Title corto y rico: "Nombre — fecha · ciudad". Trunca el nombre si hace
 *  falta para que el `<title>` total quepa en el ancho típico de SERP (≈60). */
function buildEventSeoTitle(
  name: string,
  dateLabel: string,
  city: string | null,
  siteName: string,
): string {
  const cityBit = city?.trim() || ''
  const tail = [dateLabel, cityBit].filter(Boolean).join(' · ')
  // Reservamos ~13 chars para " | Optimal Breaks". Total objetivo ≤ 65.
  const room = 65 - (siteName.length + 3) // " | "
  const head = tail ? `${name} — ${tail}` : name
  if (head.length <= room) return `${head} | ${siteName}`
  // Si no cabe, sacrificamos primero el city, luego la fecha; nunca el nombre.
  const onlyDate = dateLabel ? `${name} — ${dateLabel}` : name
  if (onlyDate.length <= room) return `${onlyDate} | ${siteName}`
  return `${name} | ${siteName}`
}

/** ISO local (sin Z) para `event:start_time` / `event:end_time` (Open Graph). */
function ogEventDateTime(date: string | null | undefined, time: string | null | undefined): string | null {
  if (!date) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (!time) return date
  const m = String(time).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return date
  const hh = String(parseInt(m[1] ?? '0', 10)).padStart(2, '0')
  const mm = (m[2] ?? '00').padStart(2, '0')
  return `${date}T${hh}:${mm}:00`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: raw } = await supabase
    .from('events')
    .select(
      'name, description_en, description_es, image_url, og_image_url, date_start, date_end, venue, city, country, doors_open, doors_close',
    )
    .eq('slug', slug)
    .single()
  const data = raw as
    | (EventSeoRow & { doors_open: string | null; doors_close: string | null })
    | null
  if (!data?.name)
    return {
      title: lang === 'es' ? 'Evento no encontrado' : 'Event not found',
      robots: { index: false, follow: true },
    }
  const siteName = await siteNameForLang(lang)

  const dateLabel = metaDateLabel(data.date_start ?? null, data.date_end ?? null, lang)
  const placeLabel = metaPlaceLabel(data.venue ?? null, data.city ?? null, data.country ?? null)
  const head = [dateLabel, placeLabel].filter(Boolean).join(' · ')
  const longDesc = (lang === 'es' ? data.description_es : data.description_en)?.trim() || ''
  // Componemos "FECHA · LUGAR — descripción larga". detailPageMetadata aplica
  // smartTruncate(160) sin cortar palabras: la cabecera siempre se conserva
  // y se recorta primero la descripción larga, que es lo "que quepa".
  const description = [head, longDesc].filter(Boolean).join(' — ') || undefined

  const seoTitle = buildEventSeoTitle(data.name, dateLabel, data.city ?? null, siteName)

  // OG events: emitir `event:start_time` / `event:end_time` cuando hay datos.
  const ogStart = ogEventDateTime(data.date_start, data.doors_open)
  const ogEnd = ogEventDateTime(data.date_end ?? data.date_start, data.doors_close)
  const extraOgTags: Record<string, string> = {}
  if (ogStart) extraOgTags['event:start_time'] = ogStart
  if (ogEnd && ogEnd !== ogStart) extraOgTags['event:end_time'] = ogEnd

  return detailPageMetadata(
    lang,
    `/events/${slug}`,
    siteName,
    seoTitle,
    description,
    'event',
    null,
    undefined,
    true,
    extraOgTags,
  )
}

function firstSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v[0] : v
}

export default async function EventDetailPage({ params, searchParams }: Props) {
  const { lang, slug } = await params
  const sp: Record<string, string | string[] | undefined> = await (searchParams ?? Promise.resolve({}))
  const autoOpenEventReview = firstSearchParam(sp.editReview) === '1'
  const supabase = createServerSupabase()
  const { data: rawEvent } = await supabase
    .from('events')
    .select('*, promoter:organizations!events_promoter_organization_id_fkey(slug, name)')
    .eq('slug', slug)
    .single()
  const event = rawEvent as EventPageRow | null

  if (!event) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <Link href={`/${lang}/events`} className="btn-back">
          <span className="arrow">←</span> {lang === 'es' ? 'Volver a Eventos' : 'Back to Events'}
        </Link>
        <div className="sec-tag">EVENT</div>
        <h1 className="sec-title">
          <span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span>
        </h1>
        <div className="mt-6 p-4 sm:p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>
            {lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}
          </div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>
            {lang === 'es' ? 'Detalle del evento en preparación.' : 'Event details in preparation.'}
          </p>
        </div>
      </div>
    )
  }

  const dict = await getDictionary(lang)
  const ev = dict.events as {
    poster_zoom_aria: string
    poster_close: string
    poster_lightbox_title: string
  }

  const stages = (event.stages ?? []) as EventStage[]
  const schedule = (event.schedule ?? []) as EventScheduleSlot[]
  const tags = (event.tags ?? []) as string[]
  const mapLink = mapsUrl(event.coords as { lat: number; lng: number } | null, event.address ?? event.location)
  const ticketHeroHref = preferredHeroTicketUrl(event)
  // Texto descriptivo del cartel para alt + Google Images: "Cartel de X · Ciudad · 4 julio 2026".
  const posterDateLabel = metaDateLabel(event.date_start, event.date_end, lang)
  const posterAltBits = [
    lang === 'es' ? `Cartel de ${event.name}` : `${event.name} poster`,
    event.city || null,
    posterDateLabel || null,
  ].filter(Boolean) as string[]
  const posterAlt = posterAltBits.join(' · ')
  const hasMonsterTicketLink =
    isMonsterTicketUrl(event.tickets_url) || isMonsterTicketUrl(event.website)
  const hasPartnerTicketingLink =
    hasMonsterTicketLink ||
    isKnownTicketingSiteUrl(event.tickets_url) ||
    isKnownTicketingSiteUrl(event.website)
  /** Hero: CTA rojo si hay URL de compra y (upcoming, MonsterTicket u otro ticketer conocido p. ej. Skiddle). */
  const showHeroTicketCta =
    ticketHeroHref.length > 0 &&
    !isEventPastByDate(event) &&
    (event.event_type === 'upcoming' || hasPartnerTicketingLink)

  const scheduleByStage = new Map<string, EventScheduleSlot[]>()
  for (const slot of schedule) {
    const key = slot.stage || 'General'
    if (!scheduleByStage.has(key)) scheduleByStage.set(key, [])
    scheduleByStage.get(key)!.push(slot)
  }

  const allArtistNames = new Set<string>()
  for (const s of stages) s.lineup?.forEach((a) => allArtistNames.add(a))
  event.lineup?.forEach((a: string) => allArtistNames.add(a))
  for (const slot of schedule) if (slot.artist) allArtistNames.add(slot.artist)

  const artistSlugs = new Map<string, string>()
  if (allArtistNames.size > 0) {
    const { data: matchedArtists } = await supabase
      .from('artists')
      .select('name, slug')
      .in('name', Array.from(allArtistNames))
    const rows = (matchedArtists ?? []) as Pick<Artist, 'name' | 'slug'>[]
    for (const a of rows) artistSlugs.set(a.name, a.slug)
  }

  const rawDesc = lang === 'es' ? event.description_es : event.description_en

  // ── JSON-LD: Event/MusicEvent/Festival + BreadcrumbList ──
  const performersForLd = Array.from(allArtistNames).map((name) => ({
    name,
    slug: artistSlugs.get(name) ?? null,
  }))
  const eventLd = eventJsonLd(
    {
      slug: event.slug,
      name: event.name,
      description: rawDesc,
      dateStart: event.date_start,
      dateEnd: event.date_end,
      doorsOpen: event.doors_open,
      doorsClose: event.doors_close,
      city: event.city,
      country: event.country,
      venue: event.venue,
      address: event.address ?? event.location ?? null,
      coords: (event.coords as { lat: number; lng: number } | null) ?? null,
      imageUrl: event.og_image_url || event.image_url || null,
      ticketsUrl: event.tickets_url,
      website: event.website,
      capacity: event.capacity,
      eventType: event.event_type,
      promoterName: event.promoter?.name ?? null,
      promoterSlug: event.promoter?.slug ?? null,
      performers: performersForLd,
    },
    lang,
  )
  const breadcrumbLd = breadcrumbJsonLd([
    { name: lang === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
    { name: lang === 'es' ? 'Eventos' : 'Events', url: `${SITE_URL}/${lang}/events` },
    { name: event.name, url: `${SITE_URL}/${lang}/events/${slug}` },
  ])
  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [eventLd, breadcrumbLd],
  }

  let festivalSections = splitFestivalDescriptionSections(rawDesc, lang === 'es' ? 'es' : 'en')
  const lineupDupTitles =
    lang === 'es'
      ? new Set(['Primera confirmación', 'Segunda confirmación'])
      : new Set(['First wave', 'Second wave'])
  const hasFlatLineup = (event.lineup?.length ?? 0) > 0
  const hasStageLineups = stages.some((s) => (s.lineup?.length ?? 0) > 0)
  if (festivalSections?.length && (hasFlatLineup || hasStageLineups)) {
    festivalSections = festivalSections.filter((s) => !lineupDupTitles.has(s.title))
  }
  if (!festivalSections || festivalSections.length < 2) {
    festivalSections = null
  }
  const useFestivalSpark =
    hasFlatLineup || stages.length > 0 || event.event_type === 'festival'
  const hasLineupAnchor = stages.length > 0 || hasFlatLineup
  const stamp = dateStampParts(event.date_start, lang)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph) }}
      />
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
      <Link href={`/${lang}/events`} className="btn-back">
        <span className="arrow">←</span> {lang === 'es' ? 'Volver a Eventos' : 'Back to Events'}
      </Link>

      {/* ── HERO ── */}
      <header className="mb-8 md:mb-10 border-b-[3px] border-[var(--ink)] pb-8 md:pb-10">
        <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8 lg:gap-10 items-stretch md:items-start">
          {/* Poster */}
          <div className="w-full max-w-[min(100%,360px)] sm:max-w-[400px] md:max-w-[min(420px,40vw)] shrink-0 mx-auto md:mx-0">
            <EventPosterLightbox
              src={event.image_url}
              alt={posterAlt}
              zoomAria={ev.poster_zoom_aria}
              closeLabel={ev.poster_close}
              lightboxTitle={ev.poster_lightbox_title}
            />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1 flex flex-col justify-center md:justify-start md:pt-0">
            <div className="sec-tag w-fit">{eventTypeLabel(event.event_type, lang).toUpperCase()}</div>
            <h1 className="sec-title mt-2 md:mt-3">
              <span className="hl">{event.name}</span>
            </h1>

            {/* Date */}
            {event.date_start && (
              <div
                className="mt-2 break-words"
                style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 4vw, 24px)', color: 'var(--red)' }}
              >
                {formatDate(event.date_start, lang)}
                {event.date_end && event.date_end !== event.date_start && ` — ${formatDate(event.date_end, lang)}`}
              </div>
            )}

            {/* Doors */}
            {(event.doors_open || event.doors_close) && (
              <div className="mt-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '14px', color: 'var(--dim)' }}>
                {event.doors_open && <>{lang === 'es' ? 'Apertura: ' : 'Doors: '}{formatDoorTime(event.doors_open)}</>}
                {event.doors_open && event.doors_close && ' — '}
                {event.doors_close && <>{lang === 'es' ? 'Cierre: ' : 'Close: '}{formatDoorTime(event.doors_close)}</>}
              </div>
            )}

            {/* Tags / pills */}
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="cutout fill">{event.city}, {event.country}</span>
              {event.venue && <span className="cutout outline">{event.venue}</span>}
              {event.promoter && (
                <Link
                  href={`/${lang}/organizations/${event.promoter.slug}`}
                  className="cutout outline no-underline text-[var(--ink)]"
                >
                  {lang === 'es' ? 'Promueve: ' : 'By: '}{event.promoter.name}
                </Link>
              )}
              {event.age_restriction && <span className="cutout red">{event.age_restriction}</span>}
              {event.capacity && (
                <span className="cutout outline">
                  {lang === 'es' ? 'Aforo: ' : 'Capacity: '}{event.capacity.toLocaleString()}
                </span>
              )}
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {tags.map((t) => (
                  <span key={t} className="cutout acid" style={{ fontSize: '10px', padding: '2px 8px' }}>
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Favorite + attendance + fan counter + share */}
            <div className="flex flex-wrap items-center gap-3 mt-5">
              <FavoriteButton type="event" entityId={event.id} size="md" lang={lang} />
              <EventStatusButton eventId={event.id} lang={lang} />
              <EventReviewButton
                eventId={event.id}
                eventName={event.name}
                lang={lang}
                defaultDate={event.date_start}
                defaultVenue={event.venue}
                defaultCity={event.city}
                defaultCountry={event.country}
                autoOpenForm={autoOpenEventReview}
              />
              <FanCounter type="event" entityId={event.id} lang={lang} />
              <ShareButtons url={`/${lang}/events/${slug}`} title={`${event.name} | Optimal Breaks`} lang={lang} />
            </div>

            {/* CTA: tickets (upcoming, MonsterTicket u otros ticketers conocidos + URL) */}
            {showHeroTicketCta && (
              <a
                href={ticketHeroHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 block w-full max-w-xl border-4 border-[var(--ink)] bg-[var(--red)] px-6 py-3.5 text-center text-white shadow-[4px_4px_0_var(--ink)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_var(--ink)] no-underline"
                style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', letterSpacing: '1px', textTransform: 'uppercase' }}
              >
                {primaryTicketCtaLabel(event.tickets_url, event.website, lang)} →
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── PULSO: cinta tipo festival (no es bio de artista: datos + saltos a lineup/mapa) ── */}
      {useFestivalSpark && (
        <EventFestivalPulse
          lang={lang}
          stamp={stamp}
          doorsOpen={event.doors_open}
          doorsClose={event.doors_close}
          lineupCount={event.lineup?.length ?? 0}
          showLineupLink={hasLineupAnchor}
          venue={event.venue}
          city={event.city}
          hasMap={Boolean(mapLink)}
        />
      )}

      {/* ── TEXTO: tarjetas troceadas si el copy encaja; si no, párrafos como antes ── */}
      <section className="mb-10">
        <SectionHeading>{lang === 'es' ? 'NOTAS DE PISTA' : 'FLOOR NOTES'}</SectionHeading>
        {festivalSections ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {festivalSections.map((s, i) => (
              <div
                key={i}
                className="border-4 border-[var(--ink)] bg-[var(--paper)] p-5 sm:p-6 shadow-[5px_5px_0_var(--ink)] transition-transform sm:hover:-rotate-[0.5deg] sm:hover:shadow-[7px_7px_0_var(--ink)]"
              >
                <div
                  className="inline-block mb-3 cutout red"
                  style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '2px', padding: '4px 10px', margin: 0 }}
                >
                  {s.title}
                </div>
                <p
                  style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.82 }}
                  className="text-[var(--ink)]"
                >
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-w-[760px] border-4 border-[var(--ink)] bg-[var(--paper)] p-6 sm:p-8 shadow-[6px_6px_0_var(--ink)]">
            <div className="space-y-0">
              {splitProseForDisplay(rawDesc).map((para, i) => (
                <div key={i} className={i > 0 ? 'mt-6 pt-6 border-t-[3px] border-[var(--ink)]/15' : ''}>
                  <p
                    style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.85 }}
                    className="text-[var(--ink)]"
                  >
                    {para}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── STAGES + LINEUP ── */}
      {stages.length > 0 ? (
        <section id="event-lineup" className="mb-10 scroll-mt-24">
          <SectionHeading>{lang === 'es' ? 'ESCENARIOS' : 'STAGES'}</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stages.map((stage, i) => (
              <div key={i} className="border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] p-5 sm:p-6">
                <h3 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '20px', color: 'var(--yellow)', marginBottom: '4px', marginTop: 0 }}>
                  {stage.name}
                </h3>
                {(lang === 'es' ? stage.description_es : stage.description_en) && (
                  <div className="mb-4 space-y-3">
                    {splitBioParagraphs(lang === 'es' ? stage.description_es : stage.description_en).map((para, pi) => (
                      <p key={pi} style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px', lineHeight: 1.7, color: 'rgba(232,220,200,0.65)' }}>
                        {para}
                      </p>
                    ))}
                  </div>
                )}
                {stage.lineup && stage.lineup.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {stage.lineup.map((a, j) => {
                      const aSlug = artistSlugs.get(a)
                      return aSlug
                        ? <Link key={j} href={`/${lang}/artists/${aSlug}`} className="cutout red no-underline">{a}</Link>
                        : <span key={j} className="cutout red">{a}</span>
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : event.lineup?.length > 0 ? (
        <section id="event-lineup" className="mb-10 scroll-mt-24">
          <SectionHeading>LINEUP</SectionHeading>
          <div className="p-5 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
            <div className="flex flex-wrap gap-2">
              {event.lineup.map((a: string, i: number) => {
                const aSlug = artistSlugs.get(a)
                return aSlug
                  ? <Link key={i} href={`/${lang}/artists/${aSlug}`} className="cutout red no-underline">{a}</Link>
                  : <span key={i} className="cutout red">{a}</span>
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── SCHEDULE / HORARIOS ── */}
      {schedule.length > 0 && (
        <section className="mb-10">
          <SectionHeading>{lang === 'es' ? 'HORARIOS' : 'SCHEDULE'}</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from(scheduleByStage.entries()).map(([stageName, slots]) => (
              <div key={stageName} className="border-4 border-[var(--ink)] overflow-hidden">
                <div className="bg-[var(--ink)] px-4 py-2">
                  <h3 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--yellow)', margin: 0 }}>
                    {stageName}
                  </h3>
                </div>
                <div className="divide-y divide-[var(--ink)]/15">
                  {slots.map((slot, i) => (
                    <div key={i} className="flex items-baseline gap-3 px-4 py-2.5">
                      <span
                        className="shrink-0 w-[52px] text-right"
                        style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '14px', color: 'var(--red)' }}
                      >
                        {slot.time}
                      </span>
                      <span
                        className="flex-1 min-w-0"
                        style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 800, fontSize: '15px' }}
                      >
                        {(() => {
                          const aSlug = artistSlugs.get(slot.artist)
                          return aSlug
                            ? <Link href={`/${lang}/artists/${aSlug}`} className="no-underline text-inherit hover:text-[var(--red)] transition-colors">{slot.artist}</Link>
                            : slot.artist
                        })()}
                        {slot.is_b2b && (
                          <span className="ml-1.5 text-[10px] font-bold tracking-wider text-[var(--red)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                            B2B
                          </span>
                        )}
                      </span>
                      {slot.duration_min && (
                        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                          {slot.duration_min}min
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── LOCATION / MAP ── */}
      {(event.address || event.location || mapLink) && (
        <section id="event-location" className="mb-10 scroll-mt-24">
          <SectionHeading>{lang === 'es' ? 'UBICACIÓN' : 'LOCATION'}</SectionHeading>
          <div className="border-4 border-[var(--ink)] p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex-1 min-w-0">
                {event.venue && (
                  <h3 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '20px', margin: 0 }}>
                    {event.venue}
                  </h3>
                )}
                <div className="mt-1" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.7, color: 'var(--dim)' }}>
                  {event.address || event.location}
                </div>
                <div className="mt-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', color: 'var(--dim)' }}>
                  {event.city}, {event.country}
                </div>
              </div>
              {mapLink && (
                <a
                  href={mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-2 border-4 border-[var(--ink)] bg-[var(--yellow)] px-4 py-2 text-[var(--ink)] shadow-[3px_3px_0_var(--ink)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_var(--ink)]"
                  style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                  {lang === 'es' ? 'VER MAPA' : 'VIEW MAP'}
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── LINKS / SOCIALS ── */}
      {(event.website || event.tickets_url || Object.keys(event.socials ?? {}).length > 0) && (
        <section className="mb-10">
          <SectionHeading>LINKS</SectionHeading>
          <div className="border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] p-5 sm:p-6">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {event.website && (
                <a
                  href={event.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--cyan)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase' }}
                >
                  {websiteLinkLabel(event.website, lang)} →
                </a>
              )}
              {event.tickets_url && event.tickets_url !== event.website && (
                <a
                  href={event.tickets_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--yellow)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase' }}
                >
                  {secondaryTicketsLinkLabel(event.tickets_url, lang)} →
                </a>
              )}
              {Object.entries(event.socials ?? {}).map(([key, url]) => (
                <a
                  key={key}
                  href={url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--cyan)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase' }}
                >
                  {key} →
                </a>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
    </>
  )
}

function PulseCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-5 min-h-[112px] flex flex-col justify-start ${className}`}>{children}</div>
}

function EventFestivalPulse({
  lang,
  stamp,
  doorsOpen,
  doorsClose,
  lineupCount,
  showLineupLink,
  venue,
  city,
  hasMap,
}: {
  lang: Locale
  stamp: ReturnType<typeof dateStampParts>
  doorsOpen: string | null
  doorsClose: string | null
  lineupCount: number
  showLineupLink: boolean
  venue: string | null
  city: string
  hasMap: boolean
}) {
  const doors =
    doorsOpen || doorsClose
      ? `${formatDoorTime(doorsOpen) || '—'} → ${formatDoorTime(doorsClose) || '—'}`
      : null

  return (
    <div className="mb-10 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] shadow-[8px_8px_0_rgba(24,20,16,0.2)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b-2 border-[var(--paper)]/12">
        <span
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '4px', color: 'var(--yellow)' }}
        >
          {lang === 'es' ? 'PULSO DEL EVENTO' : 'EVENT PULSE'}
        </span>
        <span
          className="text-[var(--cyan)]/90 max-sm:hidden"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '2px' }}
        >
          {lang === 'es' ? 'DATOS · SALTO A CARTEL Y MAPA' : 'FACTS · JUMP TO LINEUP & MAP'}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[var(--paper)]/12">
        <PulseCell>
          {stamp ? (
            <>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontWeight: 900,
                    fontSize: 'clamp(36px, 9vw, 56px)',
                    lineHeight: 1,
                    color: 'var(--yellow)',
                  }}
                >
                  {stamp.day}
                </span>
                <span
                  style={{
                    fontFamily: "'Courier Prime', monospace",
                    fontWeight: 700,
                    fontSize: '13px',
                    color: 'var(--red)',
                    letterSpacing: '2px',
                  }}
                >
                  {stamp.month}
                </span>
              </div>
              <p
                className="mt-2 capitalize opacity-85"
                style={{ fontFamily: "'Special Elite', monospace", fontSize: '12px', lineHeight: 1.45 }}
              >
                {stamp.line}
              </p>
            </>
          ) : (
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', opacity: 0.6 }}>—</span>
          )}
        </PulseCell>
        <PulseCell>
          <div
            style={{
              fontFamily: "'Darker Grotesque', sans-serif",
              fontWeight: 900,
              fontSize: '12px',
              color: 'var(--yellow)',
              letterSpacing: '2px',
            }}
          >
            {lang === 'es' ? 'PUERTAS' : 'DOORS'}
          </div>
          {doors ? (
            <p
              className="mt-2"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: 'clamp(15px, 3.5vw, 20px)', fontWeight: 700 }}
            >
              {doors}
            </p>
          ) : (
            <p className="mt-2 opacity-60" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}>
              —
            </p>
          )}
        </PulseCell>
        <PulseCell className="col-span-2 lg:col-span-1">
          {showLineupLink ? (
            <Link href="#event-lineup" className="group block no-underline text-inherit">
              <div
                style={{
                  fontFamily: "'Darker Grotesque', sans-serif",
                  fontWeight: 900,
                  fontSize: '12px',
                  color: 'var(--yellow)',
                  letterSpacing: '2px',
                }}
              >
                LINE-UP
              </div>
              <p
                className="mt-2 group-hover:text-[var(--cyan)] transition-colors"
                style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(22px, 5vw, 32px)', lineHeight: 1.1 }}
              >
                {lineupCount > 0
                  ? `${lineupCount} ${lang === 'es' ? 'NOMBRES' : 'ACTS'}`
                  : '—'}
              </p>
              <span
                className="inline-block mt-2"
                style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '1px', color: 'var(--cyan)' }}
              >
                {lang === 'es' ? 'VER CARTEL ↓' : 'SEE LINEUP ↓'}
              </span>
            </Link>
          ) : (
            <div>
              <div
                style={{
                  fontFamily: "'Darker Grotesque', sans-serif",
                  fontWeight: 900,
                  fontSize: '12px',
                  color: 'var(--yellow)',
                  letterSpacing: '2px',
                }}
              >
                LINE-UP
              </div>
              <p
                className="mt-2 opacity-80"
                style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.35 }}
              >
                {lang === 'es' ? 'Cartel por confirmar.' : 'Lineup TBA.'}
              </p>
            </div>
          )}
        </PulseCell>
        <PulseCell className="col-span-2 lg:col-span-1">
          {hasMap ? (
            <Link href="#event-location" className="group block no-underline text-inherit">
              <div
                style={{
                  fontFamily: "'Darker Grotesque', sans-serif",
                  fontWeight: 900,
                  fontSize: '12px',
                  color: 'var(--yellow)',
                  letterSpacing: '2px',
                }}
              >
                {lang === 'es' ? 'RECINTO' : 'VENUE'}
              </div>
              {venue && (
                <p
                  className="mt-2 group-hover:text-[var(--cyan)] transition-colors"
                  style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.35 }}
                >
                  {venue}
                </p>
              )}
              <p className="mt-1 opacity-75" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px' }}>
                {city}
              </p>
              <span
                className="inline-block mt-2"
                style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '1px', color: 'var(--cyan)' }}
              >
                {lang === 'es' ? 'MAPA ↓' : 'MAP ↓'}
              </span>
            </Link>
          ) : (
            <>
              <div
                style={{
                  fontFamily: "'Darker Grotesque', sans-serif",
                  fontWeight: 900,
                  fontSize: '12px',
                  color: 'var(--yellow)',
                  letterSpacing: '2px',
                }}
              >
                {lang === 'es' ? 'RECINTO' : 'VENUE'}
              </div>
              {venue && (
                <p className="mt-2" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.35 }}>
                  {venue}
                </p>
              )}
              <p className="mt-1 opacity-75" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px' }}>
                {city}
              </p>
            </>
          )}
        </PulseCell>
      </div>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2
        style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(20px, 3.5vw, 26px)', letterSpacing: '2px', margin: 0 }}
      >
        {children}
      </h2>
      <div className="mt-1 h-[3px] w-12 bg-[var(--red)]" />
    </div>
  )
}
