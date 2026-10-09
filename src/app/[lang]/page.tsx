// ============================================
// OPTIMAL BREAKS — Home Page
// Full responsive: mobile-first
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import {
  HOME_OG_IMAGE,
  SITE_URL,
  homeOgImageAlt,
  staticPageMetadata,
} from '@/lib/seo'
import { createCachedSupabase } from '@/lib/supabase-server'
import { fetchBlogSpotlight, type BlogSpotlightRow } from '@/lib/blog-spotlight'
import type { BreakEvent } from '@/types/database'
import { eventNoticeKind, isEventCancelled } from '@/types/database'
import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import { proxyCatalogArtworkForDisplay } from '@/lib/share-track'
import Marquee from '@/components/Marquee'
import Timeline from '@/components/Timeline'
import EventFlyer from '@/components/EventFlyer'
import HomeCommunityTop10, { type HomeTop10Dict } from '@/components/HomeCommunityTop10'

const DjDeck = dynamic(() => import('@/components/DjDeck'), {
  loading: () => (
    <div
      className="relative z-[2] w-full min-w-0 max-w-[960px] mx-auto min-h-[320px] sm:min-h-[380px] bg-[#1a1a1c] rounded-lg border-[4px] border-[var(--ink)] shadow-[10px_10px_0_rgba(0,0,0,0.3)]"
      aria-hidden
    />
  ),
})

type HomeExplore = {
  tag: string
  title_1: string
  title_2: string
  intro: string
  items: { href: string; label: string; hint: string }[]
}

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '', 'home', {
    ogImagePath: HOME_OG_IMAGE,
    ogImageAlt: homeOgImageAlt(lang),
    extraKeywords: [
      'breakbeat',
      lang === 'es' ? 'música breakbeat' : 'breakbeat music',
      lang === 'es' ? 'historia breakbeat' : 'breakbeat history',
    ],
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
  | 'id'
  | 'slug'
  | 'name'
  | 'date_start'
  | 'date_end'
  | 'venue'
  | 'city'
  | 'country'
  | 'event_type'
  | 'image_url'
  | 'tags'
  | 'is_featured'
>

/** «Hoy» calendario (sitio centrado en España; coherente en SSR). */
const HOME_EVENTS_TZ = 'Europe/Madrid'

/** Carteles en la home: 6 = una fila en desktop (xl), 2×3 en tablet, 3×2 en móvil. */
const HOME_EVENTS_COUNT = 6

const HOME_BTN_CLASS =
  'shrink-0 inline-block no-underline border-[3px] border-[var(--ink)] px-4 py-2 bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-colors'

const HOME_BTN_STYLE = {
  fontFamily: "'Courier Prime', monospace",
  fontWeight: 700,
  fontSize: '11px',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
}

/**
 * Cabecera de sección de la home: etiqueta + título de UNA línea + «ver todo»
 * alineado a la derecha. El único título a pantalla completa es el del hero.
 */
function SectionHead({
  tag,
  title1,
  title2,
  action,
}: {
  tag: string
  title1: string
  title2: string
  action?: { href: string; label: string } | null
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div className="min-w-0">
        <div className="sec-tag">{tag}</div>
        <h2 className="sec-title sec-title--compact">
          {title1} <span className="hl">{title2}</span>
        </h2>
      </div>
      {action ? (
        <Link href={action.href} className={HOME_BTN_CLASS} style={HOME_BTN_STYLE}>
          {action.label} →
        </Link>
      ) : null}
    </div>
  )
}

function todayYmdHome(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: HOME_EVENTS_TZ })
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

type HomeBlogRow = BlogSpotlightRow

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
  params: Promise<{ lang: Locale }>
}) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const h = dict.home
  const explore =
    'section_explore' in h ? (h as { section_explore: HomeExplore }).section_explore : null

  const supabase = createCachedSupabase()

  // Próximos + en curso. Destacados (`is_featured`) primero, luego fecha;
  // a igualdad de día, por nombre (orden estable entre renders).
  const todayHome = todayYmdHome()
  const { data: upcomingEventsRaw } = await supabase
    .from('events')
    .select('id, slug, name, date_start, date_end, venue, city, country, event_type, image_url, tags, is_featured')
    .or(`date_start.gte.${todayHome},date_end.gte.${todayHome}`)
    .order('is_featured', { ascending: false })
    .order('date_start', { ascending: true })
    .order('name', { ascending: true })
    .limit(16)

  let homeEvents = ((upcomingEventsRaw || []) as HomeEventRow[]).filter((e) => !isEventCancelled(e)).slice(0, HOME_EVENTS_COUNT)
  if (homeEvents.length === 0) {
    const { data: anyEvents } = await supabase
      .from('events')
      .select('id, slug, name, date_start, date_end, venue, city, country, event_type, image_url, tags, is_featured')
      .order('date_start', { ascending: false })
      .limit(16)
    homeEvents = ((anyEvents || []) as HomeEventRow[]).filter((e) => !isEventCancelled(e)).slice(0, HOME_EVENTS_COUNT)
  }

  const displayEvents =
    homeEvents.length > 0
      ? homeEvents.map((e) => ({
          key: e.slug,
          id: e.id as string | undefined,
          date: formatHomeEventDate(e.date_start, e.date_end, lang),
          name: e.name,
          location: eventLocationLine(e),
          type: eventTypeLabelHome(e.event_type, lang),
          imageUrl: e.image_url,
          href: `/${lang}/events/${e.slug}` as string | undefined,
          cancelled: isEventCancelled(e),
          postponed: eventNoticeKind(e) === 'postponed',
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
          cancelled: false,
          postponed: false,
        }))

  const { posts: featuredBlogPosts } = await fetchBlogSpotlight(supabase)

  const sectionBlog =
    'section_blog' in h
      ? (h as { section_blog: { tag: string; title_1: string; title_2: string; see_all: string } }).section_blog
      : null

  const seoHome = dict.seo.home as { title: string; description: string }
  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}/${lang}#webpage`,
        url: `${SITE_URL}/${lang}`,
        name: seoHome.title,
        description: seoHome.description,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: {
          '@type': 'Thing',
          name: 'Breakbeat',
          sameAs: 'https://en.wikipedia.org/wiki/Breakbeat',
        },
        inLanguage: lang === 'es' ? 'es-ES' : 'en-US',
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
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

        {/* Título brutalista: sombras solo con offset (sin blur / glow) */}
        <div className="text-center mb-4 sm:mb-6 relative z-[2] px-2 min-w-0 max-w-full overflow-x-clip">
          <h1
            className="m-0 mx-auto max-w-full inline-block text-balance max-sm:whitespace-normal sm:whitespace-nowrap sm:min-w-min"
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(15px, 5.2vw, 90px)',
              textTransform: 'uppercase',
              letterSpacing: 'clamp(-1.5px, -0.35vw, -2px)',
              lineHeight: 1,
            }}
          >
            <span className="sr-only">{lang === 'es' ? 'Breakbeat — ' : 'Breakbeat — '}</span>
            <span
              className="inline"
              style={{
                WebkitTextStroke: 'clamp(2px, 0.35vw, 3px) var(--ink)',
                WebkitTextFillColor: 'transparent',
                filter:
                  'drop-shadow(2px 2px 0 var(--ink)) drop-shadow(4px 4px 0 rgba(214, 40, 40, 0.55))',
              }}
            >
              OPTIMAL
            </span>{' '}
            <span
              className="hl inline"
              style={{
                color: 'var(--red)',
                textShadow:
                  '2px 2px 0 var(--ink), 4px 4px 0 var(--ink)',
              }}
            >
              BREAKS
            </span>
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
          <div className="mt-5 sm:mt-6 mb-6 sm:mb-8">
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

        {/* DJ Deck — ancla #dj-deck */}
        <div id="dj-deck" className="scroll-mt-24">
          <DjDeck dict={h} />
        </div>

        <div className="mt-6 sm:mt-8 flex flex-row items-stretch justify-center gap-3 max-w-[960px] mx-auto">
          <Link
            href={`/${lang}/charts`}
            className="flex-1 sm:flex-none min-h-12 inline-flex items-center justify-center no-underline border-[3px] border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] px-4 sm:px-8 shadow-[4px_4px_0_var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--yellow)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--ink)] transition-all"
            style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 3.4vw, 16px)', letterSpacing: '1px', textTransform: 'uppercase' }}
          >
            {h.hero_charts}
          </Link>
          <Link
            href={`/${lang}/top100`}
            className="flex-1 sm:flex-none min-h-12 inline-flex items-center justify-center no-underline border-[3px] border-[var(--ink)] bg-[var(--red)] text-white px-4 sm:px-8 shadow-[4px_4px_0_var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--yellow)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--ink)] transition-all"
            style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 3.4vw, 16px)', letterSpacing: '1px', textTransform: 'uppercase' }}
          >
            {h.hero_top100}
          </Link>
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

        <div className="mt-6">
          <Link
            href={`/${lang}/breakbeat`}
            className="inline-block no-underline border-[3px] border-[var(--ink)] px-5 py-3 bg-[var(--ink)] text-[var(--paper)] shadow-[4px_4px_0_var(--red)] hover:bg-[var(--red)] hover:text-white transition-colors"
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase' }}
          >
            {lang === 'es' ? 'Guía completa: qué es el breakbeat →' : 'Full guide: what is breakbeat →'}
          </Link>
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

      {/* ===== EVENTS — lo vivo, justo después del «qué es» ===== */}
      <section className="px-3 sm:px-6 py-10 sm:py-14 relative z-[1] border-t-[5px] border-[var(--ink)]">
        <div className="home-wrap">
          <SectionHead
            tag={h.section_events.tag}
            title1={h.section_events.title_1}
            title2={h.section_events.title_2}
            action={
              'see_all' in h.section_events
                ? { href: `/${lang}/events`, label: (h.section_events as { see_all: string }).see_all }
                : null
            }
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mt-6 sm:mt-8">
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
                cancelled={e.cancelled}
                postponed={e.postponed}
                compact
              />
            ))}
          </div>
        </div>
      </section>

      {/* ===== TOP 10 ARTISTAS DE LA COMUNIDAD — sustituye al antiguo
          showcase de 6 artistas fijos ===== */}
      {'section_top10' in h ? (
        <HomeCommunityTop10 lang={lang} t={(h as { section_top10: HomeTop10Dict }).section_top10} />
      ) : null}

      {/* ===== HISTORY — rejilla cronológica compacta ===== */}
      <Timeline
        variant="compact"
        tag={h.section_history.tag}
        title1={h.section_history.title_1}
        title2={h.section_history.title_2}
        items={h.section_history.items}
        footerLink={{
          href: `/${lang}/history`,
          label: (h as { timeline_footer?: string }).timeline_footer ?? 'History',
        }}
      />

      {sectionBlog && featuredBlogPosts.length > 0 ? (
        <section className="lined px-3 sm:px-6 py-10 sm:py-14 relative z-[1]">
          <div className="home-wrap">
          <SectionHead
            tag={sectionBlog.tag}
            title1={sectionBlog.title_1}
            title2={sectionBlog.title_2}
            action={{ href: `/${lang}/blog`, label: sectionBlog.see_all }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-[18px] mt-6 sm:mt-8">
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
                  {/* Mismo marco apaisado para todas: los carteles ya no alargan su tarjeta */}
                  <CardThumbnail
                    src={proxyCatalogArtworkForDisplay(p.image_url) || p.image_url}
                    alt={title}
                    aspectClass="aspect-[16/10] w-full"
                    fit="cover"
                    frameClass="border-b-[3px] border-[var(--ink)]"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 460px"
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
          </div>
        </section>
      ) : null}

      {/* ===== EXPLORA — franja fina de accesos (SEO interno) en vez de un
          bloque entero que repetía el menú ===== */}
      {explore ? (
        <nav
          aria-label={explore.tag}
          className="px-3 sm:px-6 py-6 sm:py-8 relative z-[1] border-t-[5px] border-[var(--ink)] bg-[var(--paper-dark)]"
        >
          <div className="home-wrap flex flex-wrap items-center gap-2">
            <span
              className="mr-2"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase' }}
            >
              {explore.tag.replace(/^\d+\s*—\s*/, '')} →
            </span>
            {explore.items.map((item) => (
              <Link
                key={item.href}
                href={`/${lang}${item.href}`}
                title={item.hint}
                className={HOME_BTN_CLASS}
                style={{ ...HOME_BTN_STYLE, padding: '6px 12px' }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      {/* ===== CTA ===== */}
      <div className="text-center px-3 sm:px-6 py-12 sm:py-16 bg-[var(--red)] text-white border-t-8 border-b-8 border-[var(--ink)]">
        <h2
          className="break-words max-w-full mx-auto px-1"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(26px, 7vw, 76px)',
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
