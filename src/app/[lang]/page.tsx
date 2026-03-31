// ============================================
// OPTIMAL BREAKS — Home Page
// Full responsive: mobile-first
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import { HOME_OG_IMAGE, homeOgImageAlt, staticPageMetadata } from '@/lib/seo'
import { createServerSupabase } from '@/lib/supabase-server'
import type { Artist, BlogPost, BreakEvent } from '@/types/database'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import DjDeck from '@/components/DjDeck'
import Marquee from '@/components/Marquee'
import Timeline from '@/components/Timeline'
import ArtistCard from '@/components/ArtistCard'
import EventFlyer from '@/components/EventFlyer'

type HomeExplore = {
  tag: string
  title_1: string
  title_2: string
  intro: string
  items: { href: string; label: string; hint: string }[]
}

const FEATURED_ARTISTS: {
  slug: string
  name: string
  genres: string[]
  desc_en: string
  desc_es: string
  image_url?: string | null
}[] = [
  { slug: 'dj-kool-herc', name: 'DJ KOOL HERC', genres: ['Origins', 'Hip-Hop', 'Breaks'], desc_en: 'The DJ logic of stretching breaks begins here. Without Herc, the whole map looks different.', desc_es: 'Aquí empieza la lógica DJ de alargar breaks. Sin Herc, todo el mapa posterior cambia.' },
  { slug: 'the-prodigy', name: 'THE PRODIGY', genres: ['Rave', 'Big Beat', 'Punk'], desc_en: 'They made British rave aggression legible to the world and turned broken rhythm into mass culture.', desc_es: 'Volvieron legible al mundo la agresión rave británica e hicieron del ritmo roto cultura de masas.' },
  { slug: 'the-chemical-brothers', name: 'CHEMICAL BROTHERS', genres: ['Big Beat', 'Psychedelic'], desc_en: 'They pushed breaks into psychedelic scale and crossover visibility.', desc_es: 'Llevaron los breaks a una escala psicodélica y de gran cruce popular.' },
  { slug: 'stanton-warriors', name: 'STANTON WARRIORS', genres: ['Nu Skool', 'Bass'], desc_en: 'One of the names that best define the international face of nu skool breaks.', desc_es: 'Uno de los nombres que mejor define la cara internacional del nu skool breaks.' },
  { slug: 'krafty-kuts', name: 'KRAFTY KUTS', genres: ['Breaks', 'Hip-Hop', 'DJ'], desc_en: 'A key bridge between breakbeat, DJ culture and the years of digital continuity.', desc_es: 'Puente clave entre breakbeat, cultura DJ y los años de continuidad digital.' },
  { slug: 'lady-waks', name: 'LADY WAKS', genres: ['Breaks', 'Radio', 'Community'], desc_en: 'Proof that the scene kept breathing through regular mixes, radio and online presence.', desc_es: 'Prueba de que la escena siguió respirando gracias a mixes regulares, radio y presencia online.' },
]

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '', 'home', {
    ogImagePath: HOME_OG_IMAGE,
    ogImageAlt: homeOgImageAlt(lang),
  })
}

/** Solo si no hay filas en `events` (BD vacía o entorno sin datos). */
const FALLBACK_HOME_EVENTS: {
  date_en: string
  date_es: string
  name: string
  location: string
  type: string
  image_url?: string | null
}[] = [
  { date_en: '1973', date_es: '1973', name: 'BRONX BLOCK PARTIES', location: 'Bronx — New York', type: 'ORIGIN' },
  { date_en: '1988-1992', date_es: '1988-1992', name: 'UK WAREHOUSE RAVES', location: 'London and beyond', type: 'RAVE' },
  { date_en: '2003-2015', date_es: '2003-2015', name: 'BREAKSPOLL', location: 'Fabric / Cable / Manchester', type: 'AWARDS' },
  { date_en: '2 Mar 2002', date_es: '2 Mar 2002', name: 'MARTIN CARPENA', location: 'Malaga — Andalusia', type: 'TURNING' },
]

type HomeEventRow = Pick<
  BreakEvent,
  'id' | 'slug' | 'name' | 'date_start' | 'date_end' | 'venue' | 'city' | 'country' | 'event_type' | 'image_url'
>

/** «Hoy» calendario (sitio centrado en España; coherente en SSR). */
const HOME_EVENTS_TZ = 'Europe/Madrid'

function todayYmdHome(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: HOME_EVENTS_TZ })
}

/** Próximos = aún no han terminado: último día del evento ≥ hoy. Sin fechas = se mantiene (TBA). */
function isEventUpcomingForHomeSection(e: Pick<HomeEventRow, 'date_start' | 'date_end'>): boolean {
  if (!e.date_start && !e.date_end) return true
  const lastYmd = String(e.date_end || e.date_start || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastYmd)) return true
  return lastYmd >= todayYmdHome()
}

function filterUpcomingHomeEvents(rows: HomeEventRow[]): HomeEventRow[] {
  return rows.filter(isEventUpcomingForHomeSection)
}

function sortEventsForHome<T extends { event_type?: string; date_start?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.event_type === 'upcoming' && b.event_type !== 'upcoming') return -1
    if (a.event_type !== 'upcoming' && b.event_type === 'upcoming') return 1
    const aTime = a.date_start ? Date.parse(a.date_start) : Number.NEGATIVE_INFINITY
    const bTime = b.date_start ? Date.parse(b.date_start) : Number.NEGATIVE_INFINITY
    return bTime - aTime
  })
}

function formatHomeEventDate(dateStart: string | null, dateEnd: string | null, lang: Locale): string {
  const tba = lang === 'es' ? 'Por confirmar' : 'TBA'
  if (!dateStart) return tba
  try {
    const d = new Date(`${dateStart}T12:00:00`)
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
    const locale = lang === 'es' ? 'es-ES' : 'en-GB'
    const start = d.toLocaleDateString(locale, opts)
    if (dateEnd && dateEnd !== dateStart) {
      const d2 = new Date(`${dateEnd}T12:00:00`)
      const end = d2.toLocaleDateString(locale, opts)
      return `${start} — ${end}`
    }
    return start
  } catch {
    return dateStart
  }
}

function eventTypeLabelHome(type: string, lang: Locale): string {
  const map: Record<string, { es: string; en: string }> = {
    festival: { es: 'Festival', en: 'Festival' },
    club_night: { es: 'Club night', en: 'Club night' },
    past_iconic: { es: 'Histórico', en: 'Past iconic' },
    upcoming: { es: 'Próximo', en: 'Upcoming' },
  }
  return lang === 'es' ? map[type]?.es ?? type.replace(/_/g, ' ') : map[type]?.en ?? type.replace(/_/g, ' ')
}

function eventLocationLine(e: Pick<BreakEvent, 'venue' | 'city' | 'country'>): string {
  const place = [e.city, e.country].filter(Boolean).join(', ')
  const parts = [e.venue, place].filter(Boolean)
  return parts.length ? parts.join(' — ') : '—'
}

type HomeBlogRow = Pick<
  BlogPost,
  'slug' | 'title_en' | 'title_es' | 'excerpt_en' | 'excerpt_es' | 'category' | 'published_at' | 'image_url'
>

function formatBlogPublishedAt(publishedAt: string, lang: Locale): string {
  try {
    const d = new Date(publishedAt)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

export default async function HomePage({
  params,
}: {
  params: { lang: Locale }
}) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const h = dict.home
  const explore =
    'section_explore' in h ? (h as { section_explore: HomeExplore }).section_explore : null

  const supabase = createServerSupabase()
  const featuredSlugs = FEATURED_ARTISTS.map((a) => a.slug)
  const { data: artistRows } = await supabase
    .from('artists')
    .select('id, slug, name_display, image_url, styles')
    .in('slug', featuredSlugs)

  const artistBySlug = new Map(
    ((artistRows || []) as Pick<Artist, 'id' | 'slug' | 'name_display' | 'image_url' | 'styles'>[]).map((r) => [
      r.slug,
      r,
    ]),
  )

  const resolvedArtists = FEATURED_ARTISTS.map((a) => {
    const row = artistBySlug.get(a.slug)
    const styles = row?.styles?.filter(Boolean) ?? []
    return {
      ...a,
      id: row?.id ?? null,
      name: row?.name_display?.trim() || a.name,
      image_url: row?.image_url ?? a.image_url ?? null,
      genres: styles.length > 0 ? styles.slice(0, 5) : a.genres,
    }
  })

  const { data: featuredEventsRaw } = await supabase
    .from('events')
    .select('id, slug, name, date_start, date_end, venue, city, country, event_type, image_url')
    .eq('is_featured', true)

  let homeEvents = filterUpcomingHomeEvents((featuredEventsRaw || []) as HomeEventRow[])
  if (homeEvents.length === 0) {
    const { data: anyEvents } = await supabase
      .from('events')
      .select('id, slug, name, date_start, date_end, venue, city, country, event_type, image_url')
      .limit(48)
    homeEvents = filterUpcomingHomeEvents((anyEvents || []) as HomeEventRow[])
    homeEvents = sortEventsForHome(homeEvents).slice(0, 4)
  } else {
    homeEvents = sortEventsForHome(homeEvents).slice(0, 4)
  }

  const displayEvents =
    homeEvents.length > 0
      ? homeEvents.map((e) => ({
          key: e.slug,
          id: e.id,
          date: formatHomeEventDate(e.date_start, e.date_end, lang),
          name: e.name,
          location: eventLocationLine(e),
          type: eventTypeLabelHome(e.event_type, lang),
          imageUrl: e.image_url,
          href: `/${lang}/events/${e.slug}`,
        }))
      : FALLBACK_HOME_EVENTS.map((e, i) => ({
          key: `fallback-${i}`,
          id: undefined as string | undefined,
          date: lang === 'es' ? e.date_es : e.date_en,
          name: e.name,
          location: e.location,
          type: e.type,
          imageUrl: e.image_url ?? null,
          href: undefined as string | undefined,
        }))

  const { data: featuredBlogRaw } = await supabase
    .from('blog_posts')
    .select('slug, title_en, title_es, excerpt_en, excerpt_es, category, published_at, image_url')
    .eq('is_published', true)
    .eq('is_featured', true)
    .order('published_at', { ascending: false })
    .limit(3)

  const featuredBlogPosts = (featuredBlogRaw || []) as HomeBlogRow[]

  const sectionBlog =
    'section_blog' in h
      ? (h as { section_blog: { tag: string; title_1: string; title_2: string; see_all: string } }).section_blog
      : null

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="lined relative px-3 sm:px-6 pt-6 sm:pt-10 pb-6 sm:pb-8 border-b-[5px] border-[var(--ink)]">
        {/* Stamp — desktop only */}
        <div
          className="absolute top-[25px] right-[35px] z-[5] hidden md:block animate-stamp"
          style={{
            fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900,
            fontSize: '16px',
            color: 'var(--red)',
            border: '4px solid var(--red)',
            padding: '6px 18px',
            transform: 'rotate(-12deg)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          {dict.common.since}
        </div>

        {/* Título = logo (mismo asset que OG; h1 semántico para SEO y accesibilidad) */}
        <div className="text-center mb-4 sm:mb-6 relative z-[2] px-1 min-w-0">
          <h1 className="m-0 flex justify-center mx-auto max-w-full">
            <Image
              src="/images/logo_punk_brutalism.png"
              alt="Optimal Breaks"
              width={720}
              height={240}
              className="w-[min(100%,720px)] max-h-[clamp(76px,22vw,168px)] h-auto object-contain object-center"
              priority
              sizes="(max-width: 768px) 100vw, 720px"
            />
          </h1>
          <p
            className="mt-2 sm:mt-3"
            style={{
              fontFamily: "'Special Elite', monospace",
              fontSize: 'clamp(11px, 2vw, 14px)',
              letterSpacing: '3px',
              color: 'var(--dim)',
            }}
          >
            {h.hero_subtitle}{' '}
            <span
              className="animate-flicker"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '10px',
                background: 'var(--red)',
                color: 'white',
                padding: '2px 8px',
                letterSpacing: '2px',
              }}
            >
              ● {h.live}
            </span>
          </p>
          <div className="mt-5 sm:mt-6 animate-bounce">
            <span
              className="inline-block border-[3px] border-[var(--ink)] shadow-[4px_4px_0_var(--ink)]"
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontWeight: 900,
                fontSize: '14px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: 'var(--yellow)',
                background: 'var(--red)',
                padding: '8px 16px',
                transform: 'rotate(-2deg)'
              }}
            >
              {h.press_play}
            </span>
          </div>
        </div>

        {/* DJ Deck — ancla #dj-deck (el logo va en el h1 de arriba) */}
        <div id="dj-deck" className="scroll-mt-24">
          <DjDeck dict={h} />
        </div>

        {/* Genre tags */}
        <div className="mt-4 sm:mt-5 text-center">
          {(h.genres as string[]).map((g: string, i: number) => {
            const colors = ['fill', 'red', 'blue', 'fill', 'pink', 'acid', 'uv']
            return (
              <span key={i} className={`cutout ${colors[i % colors.length]}`}>
                {g}
              </span>
            )
          })}
        </div>
      </section>

      {/* ===== MARQUEE ===== */}
      <Marquee items={h.marquee} />

      {/* ===== WHAT IS BREAKBEAT ===== */}
      <section className="lined px-3 sm:px-6 py-12 sm:py-20 relative z-[1]">
        <div className="sec-tag">{h.section_what.tag}</div>
        <h2 className="sec-title">
          {h.section_what.title_1}
          <br />
          <span className="hl">{h.section_what.title_2}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 relative">
          {/* !!! decoration — desktop only */}
          <div
            className="absolute -top-[25px] right-[25px] hidden md:block"
            style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '55px', color: 'var(--red)', transform: 'rotate(10deg)' }}
          >
            !!!
          </div>

          {/* Text */}
          <div className="p-5 sm:p-[30px] border-[3px] border-[var(--ink)]">
            <p className="text-[15px] sm:text-[17px] leading-[1.8] mb-3" dangerouslySetInnerHTML={{ __html: h.section_what.p1 }} />
            <p className="text-[15px] sm:text-[17px] leading-[1.8] mb-3" dangerouslySetInnerHTML={{ __html: h.section_what.p2 }} />
            {'p3' in h.section_what && typeof (h.section_what as { p3?: string }).p3 === 'string' ? (
              <p
                className="text-[15px] sm:text-[17px] leading-[1.8] text-[var(--dim)]"
                dangerouslySetInnerHTML={{ __html: (h.section_what as { p3: string }).p3 }}
              />
            ) : null}
          </div>

          {/* BPM dark side */}
          <div className="p-5 sm:p-[30px] bg-[var(--ink)] text-[var(--paper)] flex flex-col justify-center items-center relative">
            <div className="absolute -top-[6px] left-[20px] w-[70px] h-[20px] hidden sm:block" style={{ background: 'var(--tape)', transform: 'rotate(-3deg)' }} />
            <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(60px, 15vw, 100px)', lineHeight: 1, color: 'var(--red)' }}>
              135
            </div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '5px', color: 'var(--dim)' }}>
              BEATS PER MINUTE
            </div>
            <div className="flex flex-wrap gap-[5px] mt-4 sm:mt-6 justify-center">
              {(h.genres as string[]).map((g: string, i: number) => {
                const cls = ['red', 'acid', 'fill', 'pink', 'uv', 'blue']
                return <span key={i} className={`cutout ${cls[i % cls.length]}`}>{g}</span>
              })}
            </div>
          </div>
        </div>

        {/* Facts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 mt-8 sm:mt-10">
          {[
            { num: '1970', label: h.facts.origin },
            { num: '6"', label: h.facts.amen },
            { num: '135', label: h.facts.bpm },
            { num: '∞', label: h.facts.subgenres },
          ].map((fact, i) => (
            <div key={i} className="p-4 sm:p-6 border-[3px] border-[var(--ink)] -mt-[1.5px] -ml-[1.5px] text-center transition-all duration-100 hover:bg-[var(--yellow)]">
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 6vw, 42px)', lineHeight: 1 }}>
                {fact.num}
              </div>
              <div className="mt-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '2px', color: 'var(--dim)' }}>
                {fact.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== HISTORY TIMELINE ===== */}
      <Timeline
        tag={h.section_history.tag}
        title1={h.section_history.title_1}
        title2={h.section_history.title_2}
        items={h.section_history.items}
        footerLink={{
          href: `/${lang}/history`,
          label: (h as { timeline_footer?: string }).timeline_footer ?? 'History',
        }}
      />

      {/* ===== EXPLORE HUB (SEO + retención) ===== */}
      {explore ? (
        <section className="lined px-3 sm:px-6 py-12 sm:py-20 relative z-[1] border-b-[5px] border-[var(--ink)]">
          <div className="sec-tag">{explore.tag}</div>
          <h2 className="sec-title">
            {explore.title_1}
            <br />
            <span className="hl">{explore.title_2}</span>
          </h2>
          <p
            className="mt-4 max-w-[720px] text-[15px] sm:text-[17px] leading-[1.8] text-[var(--dim)]"
            style={{ fontFamily: "'Special Elite', monospace" }}
          >
            {explore.intro}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 mt-8 sm:mt-10 border-4 border-[var(--ink)]">
            {explore.items.map((item) => (
              <Link
                key={item.href}
                href={`/${lang}${item.href}`}
                className="group p-4 sm:p-5 border-b-[3px] sm:border-r-[3px] border-[var(--ink)] no-underline text-[var(--ink)] transition-colors hover:bg-[var(--yellow)] min-h-[100px] flex flex-col"
              >
                <span
                  className="group-hover:text-[var(--red)]"
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontWeight: 800,
                    fontSize: 'clamp(13px, 2.5vw, 16px)',
                    textTransform: 'uppercase',
                    letterSpacing: '-0.3px',
                  }}
                >
                  {item.label} →
                </span>
                <span
                  className="mt-2 flex-grow"
                  style={{
                    fontFamily: "'Courier Prime', monospace",
                    fontSize: '11px',
                    lineHeight: 1.5,
                    color: 'var(--text-muted)',
                  }}
                >
                  {item.hint}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ===== ARTISTS ===== */}
      <section className="lined px-3 sm:px-6 py-12 sm:py-20 relative z-[1]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-2">
          <div>
            <div className="sec-tag">{h.section_artists.tag}</div>
            <h2 className="sec-title mt-0">
              {h.section_artists.title_1}
              <br />
              <span className="hl">{h.section_artists.title_2}</span>
            </h2>
          </div>
          {'see_all' in h.section_artists ? (
            <Link
              href={`/${lang}/artists`}
              className="shrink-0 inline-block no-underline border-[3px] border-[var(--ink)] px-4 py-2 bg-[var(--paper)] hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-colors"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: 'var(--ink)',
              }}
            >
              {(h.section_artists as { see_all: string }).see_all}
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-0 mt-8 sm:mt-10 border-4 border-[var(--ink)]">
          {resolvedArtists.map((a, i) => (
            <ArtistCard
              key={a.slug}
              num={i + 1}
              name={a.name}
              genres={a.genres}
              desc={lang === 'es' ? a.desc_es : a.desc_en}
              href={`/${lang}/artists/${a.slug}`}
              imageUrl={a.image_url}
              entityId={a.id ?? undefined}
              lang={lang}
            />
          ))}
        </div>
      </section>

      {/* ===== EVENTS ===== */}
      <section className="px-3 sm:px-6 py-12 sm:py-20 relative z-[1]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-2">
          <div>
            <div className="sec-tag">{h.section_events.tag}</div>
            <h2 className="sec-title mt-0">
              {h.section_events.title_1}
              <br />
              <span className="hl">{h.section_events.title_2}</span>
            </h2>
          </div>
          {'see_all' in h.section_events ? (
            <Link
              href={`/${lang}/events`}
              className="shrink-0 inline-block no-underline border-[3px] border-[var(--ink)] px-4 py-2 bg-[var(--paper)] hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-colors"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: 'var(--ink)',
              }}
            >
              {(h.section_events as { see_all: string }).see_all}
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-[18px] mt-8 sm:mt-10">
          {displayEvents.map((e) => (
            <EventFlyer
              key={e.key}
              date={e.date}
              name={e.name}
              location={e.location}
              type={e.type}
              imageUrl={e.imageUrl}
              href={e.href}
              entityId={e.id}
              lang={lang}
            />
          ))}
        </div>
      </section>

      {sectionBlog && featuredBlogPosts.length > 0 ? (
        <section className="lined px-3 sm:px-6 py-12 sm:py-20 relative z-[1] border-t-[5px] border-[var(--ink)]">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-2">
            <div>
              <div className="sec-tag">{sectionBlog.tag}</div>
              <h2 className="sec-title mt-0">
                {sectionBlog.title_1}
                <br />
                <span className="hl">{sectionBlog.title_2}</span>
              </h2>
            </div>
            <Link
              href={`/${lang}/blog`}
              className="shrink-0 inline-block no-underline border-[3px] border-[var(--ink)] px-4 py-2 bg-[var(--paper)] hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-colors"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: 'var(--ink)',
              }}
            >
              {sectionBlog.see_all}
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-[18px] mt-8 sm:mt-10">
            {featuredBlogPosts.map((p) => {
              const title = lang === 'es' ? p.title_es : p.title_en
              const excerpt = lang === 'es' ? p.excerpt_es : p.excerpt_en
              const dateStr = formatBlogPublishedAt(p.published_at, lang)
              return (
                <Link
                  key={p.slug}
                  href={`/${lang}/blog/${p.slug}`}
                  className="group flex flex-col border-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] no-underline text-[var(--ink)] overflow-hidden h-full min-w-0"
                >
                  <CardThumbnail
                    src={p.image_url}
                    alt={title}
                    aspectClass="aspect-[16/9] w-full"
                    frameClass="border-b-[3px] border-[var(--ink)]"
                  />
                  <div className="flex flex-col flex-grow p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="cutout red" style={{ margin: 0 }}>
                        {p.category}
                      </span>
                      {dateStr ? (
                        <span
                          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}
                        >
                          {dateStr}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="mt-3 line-clamp-3"
                      style={{
                        fontFamily: "'Unbounded', sans-serif",
                        fontWeight: 900,
                        fontSize: 'clamp(15px, 2.5vw, 18px)',
                        textTransform: 'uppercase',
                        letterSpacing: '-0.5px',
                        lineHeight: 1.15,
                      }}
                    >
                      {title}
                    </div>
                    <p
                      className="mt-2 line-clamp-3 flex-grow"
                      style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px', color: 'var(--dim)', lineHeight: 1.5 }}
                    >
                      {excerpt}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* ===== CTA ===== */}
      <div className="text-center px-3 sm:px-6 py-12 sm:py-[100px] bg-[var(--red)] text-white border-t-8 border-b-8 border-[var(--ink)]">
        <h2
          className="break-words max-w-full mx-auto px-1"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(26px, 10vw, 110px)',
            textTransform: 'uppercase',
            lineHeight: 0.88,
            letterSpacing: 'clamp(-1.5px, -0.4vw, -2px)',
          }}
        >
          <span style={{ WebkitTextStroke: 'clamp(2px, 0.4vw, 3px) white', WebkitTextFillColor: 'transparent' }}>
            {h.cta.title_1}
          </span>
          <br />
          {h.cta.title_2}
        </h2>
        {'sub' in h.cta && (h.cta as { sub?: string }).sub ? (
          <p
            className="mt-4 max-w-[520px] mx-auto px-2 opacity-90"
            style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.65 }}
          >
            {(h.cta as { sub: string }).sub}
          </p>
        ) : null}
        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
          <Link
            href={`/${lang}/history`}
            className="inline-block px-8 sm:px-[50px] py-3 sm:py-[14px] bg-white text-[var(--red)] border-4 border-white hover:bg-transparent hover:text-white transition-all duration-100 no-underline"
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(12px, 2vw, 16px)',
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}
          >
            {h.cta.button} →
          </Link>
          {'secondary' in h.cta && (h.cta as { secondary?: string }).secondary ? (
            <Link
              href={`/${lang}/blog`}
              className="inline-block px-6 py-3 border-4 border-white text-white no-underline hover:bg-white hover:text-[var(--red)] transition-all duration-100"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '12px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              {(h.cta as { secondary: string }).secondary} →
            </Link>
          ) : null}
        </div>
      </div>
    </>
  )
}
