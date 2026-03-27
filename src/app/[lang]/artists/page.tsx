// ============================================
// OPTIMAL BREAKS — Artists Page
// ============================================

import Link from 'next/link'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import { ARTIST_ERAS, FEATURED_ARTISTS, type FeaturedCategory } from '@/lib/artists-timeline'

export const dynamic = 'force-dynamic'

const ACCENT = [
  'var(--yellow)',
  'var(--red)',
  'var(--blue)',
  'var(--orange)',
  'var(--acid)',
  'var(--pink)',
  'var(--uv)',
] as const

function filterParam(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : 'all'
}

export default async function ArtistsPage({
  params,
  searchParams,
}: {
  params: { lang: Locale }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const a = dict.artists as typeof dict.artists & {
    timeline_tag: string
    timeline_title: string
    timeline_intro: string
    timeline_footer: string
    featured_title: string
    featured_subtitle: string
  }

  const activeFilter = filterParam(searchParams?.filter) as FeaturedCategory | 'all'
  const validFilters: (FeaturedCategory | 'all')[] = ['all', 'pioneers', 'uk', 'us', 'andalusia', 'current']
  const filter = validFilters.includes(activeFilter) ? activeFilter : 'all'

  const filtered =
    filter === 'all' ? [...FEATURED_ARTISTS] : FEATURED_ARTISTS.filter((x) => x.category === filter)

  const filters = Object.entries(a.filters) as [string, string][]

  return (
    <div className="lined min-h-screen">
      <section className="px-3 sm:px-6 py-12 sm:py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">ARTISTS</div>
        <h1 className="sec-title">
          {a.title}
          <br />
          <span className="hl">{lang === 'es' ? 'CLAVE' : 'KEY'}</span>
        </h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 'clamp(15px, 3.6vw, 17px)', lineHeight: 1.8, maxWidth: '760px', color: 'var(--dim)' }}>
          {a.subtitle}
        </p>

        <div className="flex flex-wrap gap-2 mt-8">
          {filters.map(([key, label]) => {
            const href =
              key === 'all' ? `/${lang}/artists` : `/${lang}/artists?filter=${encodeURIComponent(key)}`
            const isOn = filter === key
            return (
              <Link
                key={key}
                href={href}
                scroll={false}
                className={`cutout ${isOn ? 'red' : 'outline'}`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </section>

      {/* Cronología por lustros (Historia del break.txt) */}
      <section className="px-3 sm:px-6 py-10 sm:py-16 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">{a.timeline_tag}</div>
        <h2 className="sec-title mt-2" style={{ fontSize: 'clamp(28px, 5vw, 44px)' }}>
          {a.timeline_title}
        </h2>
        <p
          className="mt-4 mb-12"
          style={{
            fontFamily: "'Special Elite', monospace",
            fontSize: '15px',
            lineHeight: 1.85,
            maxWidth: '820px',
            color: 'var(--dim)',
          }}
        >
          {a.timeline_intro}
        </p>

        <div className="flex flex-col gap-0 max-w-[1000px] border-[3px] border-[var(--ink)]">
          {ARTIST_ERAS.map((era, i) => {
            const color = ACCENT[i % ACCENT.length]
            const blurb = era.blurbs[lang]
            return (
              <article
                key={era.id}
                id={`era-${era.id}`}
                className="p-6 md:p-8 border-b-[3px] border-[var(--ink)] last:border-b-0 bg-[var(--paper)]"
              >
                <div className="flex flex-wrap items-baseline gap-3 gap-y-1 mb-4">
                  <span style={{ fontFamily: "'Permanent Marker', cursive", fontSize: 'clamp(22px, 4vw, 30px)', color }}>
                    {era.period}
                  </span>
                </div>
                <p
                  className="mb-5"
                  style={{
                    fontFamily: "'Special Elite', monospace",
                    fontSize: '14px',
                    lineHeight: 1.75,
                    color: 'var(--ink)',
                    maxWidth: '720px',
                  }}
                >
                  {blurb}
                </p>
                <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
                  {era.names.map((name) => (
                    <li key={name}>
                      <span
                        className="inline-block border-2 border-[var(--ink)] px-2 py-1"
                        style={{
                          fontFamily: "'Courier Prime', monospace",
                          fontSize: '10px',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {name}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>

        <p
          className="mt-10"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '12px',
            letterSpacing: '0.04em',
            color: 'var(--dim)',
            maxWidth: '820px',
            lineHeight: 1.6,
          }}
        >
          {a.timeline_footer}
        </p>
      </section>

      {/* Fichas destacadas */}
      <section className="px-3 sm:px-6 py-10 sm:py-16">
        <h2 className="sec-title" style={{ fontSize: 'clamp(26px, 4vw, 40px)' }}>
          {a.featured_title}
        </h2>
        <p className="mt-2 mb-10" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--dim)', maxWidth: '640px' }}>
          {a.featured_subtitle}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-4 border-[var(--ink)]">
          {filtered.map((artist, i) => (
            <Link
              key={artist.slug}
              href={`/${lang}/artists/${artist.slug}`}
              className="block p-[22px_30px] border-r-[3px] border-b-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group max-md:!border-r-0 no-underline text-inherit"
            >
              <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '36px', color: 'var(--red)', lineHeight: 1 }}>
                #{i + 1}
              </div>
              <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                {artist.name}
              </div>
              <div className="flex flex-wrap gap-1 mt-[6px]">
                {artist.genres.map((g, gi) => (
                  <span
                    key={gi}
                    className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white"
                    style={{
                      fontFamily: "'Courier Prime', monospace",
                      fontWeight: 700,
                      fontSize: '9px',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      padding: '2px 7px',
                    }}
                  >
                    {g}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex justify-between items-center gap-2">
                <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                  {artist.era}
                </span>
                <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', color: 'var(--red)', textTransform: 'uppercase' }}>
                  {lang === 'es' ? 'ficha →' : 'profile →'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
