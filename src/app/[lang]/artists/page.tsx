// ============================================
// OPTIMAL BREAKS — Artists Page (Supabase)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { Artist } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import { staticPageMetadata } from '@/lib/seo'
import { ARTIST_ERAS, FEATURED_ARTISTS } from '@/lib/artists-timeline'

const FEATURED_ARTIST_DESCRIPTIONS: Record<string, { es: string; en: string; country: string }> = {
  'DJ KOOL HERC': {
    es: 'Alargar los breaks con dos copias del mismo disco cambió para siempre la lógica de la pista.',
    en: 'Stretching breaks with two copies of the same record changed dancefloor logic forever.',
    country: 'US',
  },
  'PUBLIC ENEMY': {
    es: 'El sampleo agresivo y el collage sonoro ayudan a explicar cómo el break se vuelve lenguaje.',
    en: 'Aggressive sampling and sonic collage help explain how the break becomes a language.',
    country: 'US',
  },
  'RENEGADE SOUNDWAVE': {
    es: 'Pieza clave para entender el cruce británico entre electro, dub, hip hop y futura rave.',
    en: 'A key piece for understanding the British crossover of electro, dub, hip hop and future rave.',
    country: 'UK',
  },
  'SHUT UP AND DANCE': {
    es: 'Uno de los nombres esenciales del caldo rave británico del que salen muchas mutaciones del break.',
    en: 'One of the essential names in the British rave broth from which many break mutations emerge.',
    country: 'UK',
  },
  'THE PRODIGY': {
    es: 'Condensaron rave, hip hop, punk y caos británico en una versión masiva y brutal del break.',
    en: 'They condensed rave, hip hop, punk and British chaos into a massive, brutal version of the break.',
    country: 'UK',
  },
  'KRAFTY KUTS': {
    es: 'Símbolo de continuidad: sets, edits, comunidad y energía de cabina cuando el género salió del centro.',
    en: 'A symbol of continuity: sets, edits, community and booth energy after the genre left the centre.',
    country: 'UK',
  },
  'LADY WAKS': {
    es: 'Figura clave en la etapa de resistencia, con radio, mixes regulares y presencia sostenida.',
    en: 'A key figure of the resistance era, with radio, regular mixes and sustained presence.',
    country: 'RU',
  },
  PENDULUM: {
    es: 'Sirven para recordar que Australia también fue semillero real de cultura bass y breaks.',
    en: 'A reminder that Australia was also a real breeding ground for bass and breaks culture.',
    country: 'AU/UK',
  },
  'ESCENA ANDALUZA': {
    es: 'Más que un solo artista, un fenómeno colectivo que merece capítulo propio dentro de la historia del género.',
    en: 'More than a single artist, a collective phenomenon deserving its own chapter within the genre’s history.',
    country: 'ES',
  },
}

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/artists', 'artists')
}

export default async function ArtistsPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  // Try Supabase, fallback to empty
  const supabase = createServerSupabase()
  const { data: artists } = await supabase
    .from('artists')
    .select('slug, name, name_display, country, category, styles, era, is_featured, sort_order')
    .order('sort_order', { ascending: true })

  type ArtistListRow = Pick<
    Artist,
    'slug' | 'name' | 'name_display' | 'country' | 'category' | 'styles' | 'era' | 'is_featured' | 'sort_order'
  >
  const list = (artists || []) as ArtistListRow[]
  const filters = Object.entries(dict.artists.filters) as [string, string][]

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 py-14 sm:py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">ARTISTS</div>
        <h1 className="sec-title">
          {dict.artists.title}<br />
          <span className="hl">{lang === 'es' ? 'CLAVE' : 'KEY'}</span>
        </h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>
          {dict.artists.subtitle}
        </p>
        <div className="flex flex-wrap gap-2 mt-8">
          {filters.map(([key, label]) => (
            <span key={key} className={`cutout ${key === 'all' ? 'red' : 'outline'}`}>{label}</span>
          ))}
        </div>
      </section>

      <section className="px-4 sm:px-6 py-12 sm:py-16">
        {list.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-0 border-4 border-[var(--ink)]">
            {list.map((a, i) => (
              <Link
                key={a.slug}
                href={`/${lang}/artists/${a.slug}`}
                className="p-5 sm:p-[22px_30px] border-b-[3px] sm:border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)]"
              >
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 5vw, 36px)', color: 'var(--red)', lineHeight: 1 }}>
                  #{i + 1}
                </div>
                <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(16px, 3vw, 20px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                  {a.name_display || a.name}
                </div>
                <div className="flex flex-wrap gap-1 mt-[6px]">
                  {a.styles?.map((s: string, si: number) => (
                    <span key={si} className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', padding: '2px 7px' }}>
                      {s}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.country}</span>
                  <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.era}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="max-w-[860px]">
              <div className="sec-tag">{dict.artists.featured_title}</div>
              <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8, color: 'var(--dim)' }}>
                {dict.artists.featured_subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-0 border-4 border-[var(--ink)]">
              {FEATURED_ARTISTS.map((artist, i) => {
                const description = FEATURED_ARTIST_DESCRIPTIONS[artist.name]
                return (
                <Link
                  key={artist.name}
                  href={`/${lang}/artists/${artist.slug}`}
                  className="p-5 sm:p-[22px_30px] border-b-[3px] sm:border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] no-underline text-[var(--ink)]"
                >
                  <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 5vw, 36px)', color: 'var(--red)', lineHeight: 1 }}>
                    #{i + 1}
                  </div>
                  <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(16px, 3vw, 20px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                    {artist.name}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-[6px]">
                    {artist.genres.map((style, styleIndex) => (
                      <span key={styleIndex} className="bg-[var(--ink)] text-[var(--paper)]" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', padding: '2px 7px' }}>
                        {style}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{description?.country || 'INTL'}</span>
                    <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{artist.era}</span>
                  </div>
                  <p className="mt-3" style={{ fontSize: '14px', lineHeight: 1.6, color: 'rgba(26,26,26,0.6)' }}>
                    {lang === 'es' ? description?.es : description?.en}
                  </p>
                </Link>
              )})}
            </div>
          </div>
        )}
      </section>

      <section className="px-4 sm:px-6 py-4 sm:py-8">
        <div className="max-w-[900px]">
          <div className="sec-tag">{dict.artists.timeline_tag}</div>
          <h2 className="sec-title">{dict.artists.timeline_title}</h2>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8, color: 'var(--dim)' }}>
            {dict.artists.timeline_intro}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 mt-8 border-4 border-[var(--ink)]">
          {ARTIST_ERAS.map((period, index) => (
            <div key={period.id} className="p-6 sm:p-8 border-b-[3px] lg:border-r-[3px] border-[var(--ink)] bg-[var(--paper)]">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(16px, 3vw, 22px)', color: 'var(--red)' }}>
                {period.period}
              </div>
              <p className="mt-3" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'var(--dim)' }}>
                {period.blurbs[lang]}
              </p>
              <div className="artist-era-names flex flex-wrap gap-2 sm:gap-3 mt-4">
                {period.names.map((name) => (
                  <span key={`${period.period}-${name}`} className={`cutout ${index % 2 === 0 ? 'red' : 'fill'}`}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', color: 'var(--dim)' }}>
          {dict.artists.timeline_footer}
        </p>
      </section>
    </div>
  )
}
