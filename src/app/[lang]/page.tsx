// ============================================
// OPTIMAL BREAKS — Home Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import DjDeck from '@/components/DjDeck'
import Marquee from '@/components/Marquee'
import Timeline from '@/components/Timeline'
import ArtistCard from '@/components/ArtistCard'
import EventFlyer from '@/components/EventFlyer'

// Placeholder artists for home (will come from Supabase later)
const FEATURED_ARTISTS = [
  { name: 'THE PRODIGY', genres: ['Big Beat', 'Rave', 'Punk'], desc_en: 'Liam Howlett and crew redefined live electronic music. Aggressive, wild and absolutely iconic.', desc_es: 'Liam Howlett y crew redefinieron la electrónica en directo. Agresivos, salvajes y absolutamente icónicos.' },
  { name: 'FATBOY SLIM', genres: ['Big Beat', 'Funk'], desc_en: 'Norman Cook turned breaks into a planetary party. Anthems that define entire festivals.', desc_es: 'Norman Cook convirtió los breaks en fiesta planetaria. Himnos que definen festivales enteros.' },
  { name: 'CHEMICAL BROTHERS', genres: ['Big Beat', 'Psychedelic'], desc_en: 'Tom and Ed mixed breaks with psychedelia and rock. A sound universe beyond labels.', desc_es: 'Tom y Ed mezclaron breaks con psicodelia y rock. Un universo sonoro sin etiquetas.' },
  { name: 'STANTON WARRIORS', genres: ['Nu Skool', 'Bass'], desc_en: 'Fat bass, clever samples and devastating sets. Nu skool with its own name.', desc_es: 'Bass gordo, samples listos y sets que arrasan. Nu skool con nombre propio.' },
  { name: 'ADAM FREELAND', genres: ['Progressive', 'Breaks'], desc_en: 'Marine Parade. Elegance and power. Pushed breaks into new territories.', desc_es: 'Marine Parade. Elegancia y contundencia. Empujó el break hacia nuevos territorios.' },
  { name: 'KRAFTY KUTS', genres: ['Breaks', 'Hip-Hop'], desc_en: 'The bridge between breaks and hip-hop. Scratching, sampling and flow over broken rhythms.', desc_es: 'El puente entre breaks y hip-hop. Scratching, sampling y flow sobre ritmos rotos.' },
]

const FEATURED_EVENTS = [
  { date_en: '12 April 2026', date_es: '12 Abril 2026', name: 'BREAKPOINT FESTIVAL', location: 'Warehouse BCN — Barcelona', type: 'FESTIVAL' },
  { date_en: '23 May 2026', date_es: '23 Mayo 2026', name: 'NU BREAKS SESSIONS', location: 'Fabric — London', type: 'CLUB' },
  { date_en: '15 June 2026', date_es: '15 Junio 2026', name: 'AMEN GATHERING', location: 'Tresor — Berlin', type: 'RAVE' },
  { date_en: '08 Sept 2026', date_es: '08 Sept 2026', name: 'OPTIMAL BREAKS SHOWCASE', location: 'Sala B — Murcia', type: 'HOME' },
]

export default async function HomePage({
  params,
}: {
  params: { lang: Locale }
}) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const h = dict.home

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="lined relative px-6 pt-10 pb-8 border-b-[5px] border-[var(--ink)]">
        {/* Stamp */}
        <div
          className="absolute top-[25px] right-[35px] z-[5] hidden md:block animate-stamp"
          style={{
            fontFamily: "'Permanent Marker', cursive",
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

        {/* Title */}
        <div className="text-center mb-6 relative z-[2]">
          <h1
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(40px, 8vw, 90px)',
              textTransform: 'uppercase',
              letterSpacing: '-2px',
              lineHeight: 0.9,
            }}
          >
            <span style={{ WebkitTextStroke: '3px var(--ink)', WebkitTextFillColor: 'transparent' }}>
              OPTIMAL
            </span>{' '}
            <span className="hl">BREAKS</span>
          </h1>
          <p
            className="mt-3"
            style={{
              fontFamily: "'Special Elite', monospace",
              fontSize: '14px',
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
        </div>

        {/* DJ Deck */}
        <DjDeck dict={h} />

        {/* Genre tags */}
        <div className="mt-5 text-center">
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
      <section className="lined px-6 py-20 relative z-[1]">
        <div className="sec-tag">{h.section_what.tag}</div>
        <h2 className="sec-title">
          {h.section_what.title_1}
          <br />
          <span className="hl">{h.section_what.title_2}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 relative">
          {/* !!! decoration */}
          <div
            className="absolute -top-[25px] right-[25px] hidden md:block"
            style={{
              fontFamily: "'Permanent Marker', cursive",
              fontSize: '55px',
              color: 'var(--red)',
              transform: 'rotate(10deg)',
            }}
          >
            !!!
          </div>

          {/* Text side */}
          <div className="p-[30px] border-[3px] border-[var(--ink)]">
            <p className="text-[17px] leading-[1.8] mb-3" dangerouslySetInnerHTML={{ __html: h.section_what.p1 }} />
            <p className="text-[17px] leading-[1.8]" dangerouslySetInnerHTML={{ __html: h.section_what.p2 }} />
          </div>

          {/* Dark side with BPM */}
          <div className="p-[30px] bg-[var(--ink)] text-[var(--paper)] flex flex-col justify-center items-center relative">
            {/* Tape */}
            <div
              className="absolute -top-[6px] left-[20px] w-[70px] h-[20px]"
              style={{ background: 'var(--tape)', transform: 'rotate(-3deg)' }}
            />
            <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '100px', lineHeight: 1, color: 'var(--red)' }}>
              135
            </div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '5px', color: 'var(--dim)' }}>
              BEATS PER MINUTE
            </div>
            <div className="flex flex-wrap gap-[5px] mt-6 justify-center">
              {(h.genres as string[]).map((g: string, i: number) => {
                const cls = ['red', 'acid', 'fill', 'pink', 'uv', 'blue']
                const extra = i === 2 ? 'style="background:var(--paper);color:var(--ink);"' : ''
                return (
                  <span key={i} className={`cutout ${cls[i % cls.length]}`}>
                    {g}
                  </span>
                )
              })}
            </div>
          </div>
        </div>

        {/* Facts row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 mt-10">
          {[
            { num: '1970', label: h.facts.origin },
            { num: '6"', label: h.facts.amen },
            { num: '135', label: h.facts.bpm },
            { num: '∞', label: h.facts.subgenres },
          ].map((fact, i) => (
            <div
              key={i}
              className="p-6 border-[3px] border-[var(--ink)] -mt-[1.5px] -ml-[1.5px] text-center transition-all duration-100 hover:bg-[var(--yellow)] hover:animate-[shake_0.3s]"
            >
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '42px', lineHeight: 1 }}>
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
      />

      {/* ===== ARTISTS ===== */}
      <section className="lined px-6 py-20 relative z-[1]">
        <div className="sec-tag">{h.section_artists.tag}</div>
        <h2 className="sec-title">
          {h.section_artists.title_1}
          <br />
          <span className="hl">{h.section_artists.title_2}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 mt-10 border-4 border-[var(--ink)]">
          {FEATURED_ARTISTS.map((a, i) => (
            <ArtistCard
              key={i}
              num={i + 1}
              name={a.name}
              genres={a.genres}
              desc={lang === 'es' ? a.desc_es : a.desc_en}
            />
          ))}
        </div>
      </section>

      {/* ===== EVENTS ===== */}
      <section className="px-6 py-20 relative z-[1]">
        <div className="sec-tag">{h.section_events.tag}</div>
        <h2 className="sec-title">
          {h.section_events.title_1}
          <br />
          <span className="hl">{h.section_events.title_2}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] mt-10">
          {FEATURED_EVENTS.map((e, i) => (
            <EventFlyer
              key={i}
              date={lang === 'es' ? e.date_es : e.date_en}
              name={e.name}
              location={e.location}
              type={e.type}
            />
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <div className="text-center px-6 py-[100px] bg-[var(--red)] text-white -mx-0 border-t-8 border-b-8 border-[var(--ink)]">
        <h2
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(44px, 9vw, 110px)',
            textTransform: 'uppercase',
            lineHeight: 0.85,
            letterSpacing: '-2px',
          }}
        >
          <span style={{ WebkitTextStroke: '3px white', WebkitTextFillColor: 'transparent' }}>
            {h.cta.title_1}
          </span>
          <br />
          {h.cta.title_2}
        </h2>
        <a
          href="#"
          className="inline-block mt-8 px-[50px] py-[14px] bg-white text-[var(--red)] border-4 border-white hover:bg-transparent hover:text-white transition-all duration-100 no-underline"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: '16px',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          {h.cta.button} →
        </a>
      </div>
    </>
  )
}
