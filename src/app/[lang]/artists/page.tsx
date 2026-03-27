// ============================================
// OPTIMAL BREAKS — Artists Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'

const PLACEHOLDER_ARTISTS = [
  { name: 'THE PRODIGY', category: 'uk', genres: ['Big Beat', 'Rave'], era: '1990s' },
  { name: 'FATBOY SLIM', category: 'uk', genres: ['Big Beat', 'Funk'], era: '1990s' },
  { name: 'CHEMICAL BROTHERS', category: 'uk', genres: ['Big Beat', 'Psychedelic'], era: '1990s' },
  { name: 'STANTON WARRIORS', category: 'uk', genres: ['Nu Skool', 'Bass'], era: '2000s' },
  { name: 'ADAM FREELAND', category: 'uk', genres: ['Progressive', 'Breaks'], era: '2000s' },
  { name: 'KRAFTY KUTS', category: 'uk', genres: ['Breaks', 'Hip-Hop'], era: '2000s' },
  { name: 'PLUMP DJS', category: 'uk', genres: ['Nu Skool', 'Breaks'], era: '2000s' },
  { name: 'LADY WAKS', category: 'current', genres: ['Breaks', 'Bass'], era: '2010s' },
  { name: 'DJ ICEY', category: 'us', genres: ['Florida Breaks'], era: '1990s' },
  { name: 'FREESTYLERS', category: 'uk', genres: ['Breaks', 'Hip-Hop'], era: '1990s' },
  { name: 'SOUL OF MAN', category: 'uk', genres: ['Breaks', 'Funk'], era: '2000s' },
  { name: 'DEEKLINE', category: 'uk', genres: ['Breaks', 'Jungle'], era: '2000s' },
]

export default async function ArtistsPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  const filters = Object.entries(dict.artists.filters) as [string, string][]

  return (
    <div className="lined min-h-screen">
      <section className="px-6 py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">ARTISTS</div>
        <h1 className="sec-title">
          {dict.artists.title}
          <br />
          <span className="hl">{lang === 'es' ? 'CLAVE' : 'KEY'}</span>
        </h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>
          {dict.artists.subtitle}
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-8">
          {filters.map(([key, label]) => (
            <span key={key} className={`cutout ${key === 'all' ? 'red' : 'outline'}`}>
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Artists grid */}
      <section className="px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-4 border-[var(--ink)]">
          {PLACEHOLDER_ARTISTS.map((a, i) => (
            <div
              key={i}
              className="p-[22px_30px] border-r-[3px] border-b-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group max-md:!border-r-0"
            >
              <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '36px', color: 'var(--red)', lineHeight: 1 }}>
                #{i + 1}
              </div>
              <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                {a.name}
              </div>
              <div className="flex flex-wrap gap-1 mt-[6px]">
                {a.genres.map((g, gi) => (
                  <span key={gi} className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', padding: '2px 7px' }}>
                    {g}
                  </span>
                ))}
              </div>
              <div className="mt-2" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                {a.era}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
