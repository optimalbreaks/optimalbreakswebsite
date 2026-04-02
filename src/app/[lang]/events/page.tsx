// ============================================
// OPTIMAL BREAKS — Events Page (Supabase)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { BreakEvent } from '@/types/database'
import type { Metadata } from 'next'
import {
  SECTION_OG_PIXEL_HEIGHT,
  SECTION_OG_PIXEL_WIDTH,
  sectionOgImageAlt,
  sectionOgImagePath,
} from '@/lib/og-section-images'
import { staticPageMetadata } from '@/lib/seo'
import CardThumbnail from '@/components/CardThumbnail'
import Image from 'next/image'
import EventsExplorer from '@/components/EventsExplorer'

type FallbackEvent = {
  date_es: string
  date_en: string
  name_es: string
  name_en: string
  location_es: string
  location_en: string
  type: string
  desc_es: string
  desc_en: string
}

const FALLBACK_EVENTS: FallbackEvent[] = [
  {
    date_es: '1973',
    date_en: '1973',
    name_es: 'BLOCK PARTIES DEL BRONX',
    name_en: 'BRONX BLOCK PARTIES',
    location_es: 'Bronx, Nueva York',
    location_en: 'Bronx, New York',
    type: 'ORIGIN',
    desc_es: 'El lugar simbólico donde Kool Herc alarga los breaks y cambia la historia del ritmo de pista.',
    desc_en: 'The symbolic place where Kool Herc stretches breaks and changes dancefloor rhythm history.',
  },
  {
    date_es: '1988-1992',
    date_en: '1988-1992',
    name_es: 'RAVES Y WAREHOUSES UK',
    name_en: 'UK RAVES AND WAREHOUSES',
    location_es: 'Londres y Reino Unido',
    location_en: 'London and the United Kingdom',
    type: 'RAVE',
    desc_es: 'La mutación británica del house y el techno en fiestas ilegales, radios pirata y cultura soundsystem.',
    desc_en: 'The British mutation of house and techno through illegal parties, pirate radio and soundsystem culture.',
  },
  {
    date_es: '2003-2015',
    date_en: '2003-2015',
    name_es: 'BREAKSPOLL / INTERNATIONAL BREAKBEAT AWARDS',
    name_en: 'BREAKSPOLL / INTERNATIONAL BREAKBEAT AWARDS',
    location_es: 'Fabric, Cable, Fire y Manchester',
    location_en: 'Fabric, Cable, Fire and Manchester',
    type: 'AWARDS',
    desc_es: 'Sirve como termómetro de la centralidad del género: institucionalización fuerte y luego desplazamiento de foco.',
    desc_en: 'A thermometer of the genre’s centrality: strong institutionalisation followed by a gradual loss of focus.',
  },
  {
    date_es: '2 MAR 2002',
    date_en: '2 MAR 2002',
    name_es: 'MARTÍN CARPENA',
    name_en: 'MARTIN CARPENA',
    location_es: 'Málaga, Andalucía',
    location_en: 'Malaga, Andalusia',
    type: 'TURNING POINT',
    desc_es: 'Hito trágico y punto de inflexión del breakbeat andaluz: después de esa noche la escena quedó muy estigmatizada.',
    desc_en: 'A tragic landmark and turning point for Andalusian breakbeat: after that night the scene became heavily stigmatised.',
  },
  {
    date_es: '2001-2025',
    date_en: '2001-2025',
    name_es: 'BREAKFEST',
    name_en: 'BREAKFEST',
    location_es: 'Perth, Australia',
    location_en: 'Perth, Australia',
    type: 'FESTIVAL',
    desc_es: 'Prueba de que Australia no fue una nota al pie, sino una escena con continuidad, comunidad y escala festival.',
    desc_en: 'Proof that Australia was not a footnote, but a scene with continuity, community and festival scale.',
  },
  {
    date_es: 'HOY',
    date_en: 'NOW',
    name_es: 'SESIÓN, PODCAST Y NICHO DIGITAL',
    name_en: 'SESSION, PODCAST AND DIGITAL NICHE',
    location_es: 'Beatport / YouTube / Mixcloud',
    location_en: 'Beatport / YouTube / Mixcloud',
    type: 'CURRENT',
    desc_es: 'El evento contemporáneo muchas veces ya no es macro, sino red distribuida de canales, mixes y comunidad.',
    desc_en: 'The contemporary event is often no longer macro-scale, but a distributed network of channels, mixes and community.',
  },
]

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/events', 'events', {
    ogImagePath: sectionOgImagePath('events'),
    ogImageAlt: sectionOgImageAlt('events', lang),
  })
}

export default async function EventsPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const supabase = createServerSupabase()
  const { data: events } = await supabase.from('events').select('*').order('date_start', { ascending: false })
  const list = ((events || []) as BreakEvent[]).sort((a, b) => {
    if (a.event_type === 'upcoming' && b.event_type !== 'upcoming') return -1
    if (a.event_type !== 'upcoming' && b.event_type === 'upcoming') return 1
    const aTime = a.date_start ? Date.parse(a.date_start) : Number.NEGATIVE_INFINITY
    const bTime = b.date_start ? Date.parse(b.date_start) : Number.NEGATIVE_INFINITY
    return bTime - aTime
  })
  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 pt-10 pb-10 sm:pt-16 sm:pb-12 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">EVENTS</div>
        <h1 className="sec-title">{dict.events.title}<br /><span className="hl">BREAKBEAT</span></h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>{dict.events.subtitle}</p>
        <div className="mt-8 sm:mt-10 max-w-4xl mx-auto">
          <Image
            src={sectionOgImagePath('events')}
            alt={sectionOgImageAlt('events', lang)}
            width={SECTION_OG_PIXEL_WIDTH}
            height={SECTION_OG_PIXEL_HEIGHT}
            className="w-full h-auto border-4 border-[var(--ink)]"
            sizes="(max-width: 896px) 100vw, 896px"
            priority
          />
        </div>
      </section>
      <section className="px-4 sm:px-6 py-10 sm:py-12">
        {list.length > 0 ? (
          <EventsExplorer events={list} dict={dict.events} lang={lang} />
        ) : (
          <div className="space-y-8">
            <div className="max-w-[860px] p-5 sm:p-7 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>
                {lang === 'es' ? 'EVENTOS COMO INFRAESTRUCTURA' : 'EVENTS AS INFRASTRUCTURE'}
              </div>
              <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.72)' }}>
                {lang === 'es'
                  ? 'Aqui no solo cuentan festivales o agendas futuras: tambien los lugares, premios, noches y puntos de inflexion que ayudaron a crear, consolidar o romper una escena.'
                  : 'What matters here is not only future festivals or listings, but also the places, awards, nights and turning points that helped build, consolidate or break a scene.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
              {FALLBACK_EVENTS.map((event) => (
                <div key={`${event.type}-${event.name_en}`} className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] sm:hover:rotate-[-1deg] sm:hover:shadow-[6px_6px_0_var(--ink)] text-[var(--ink)] overflow-hidden group">
                  <CardThumbnail
                    src={null}
                    alt={lang === 'es' ? event.name_es : event.name_en}
                    aspectClass="aspect-poster w-full"
                    fit="contain"
                  />
                  <div className="p-5 sm:p-7 relative">
                  <div className="absolute -top-[6px] right-[25px] w-[50px] sm:w-[60px] h-[16px] sm:h-[18px] z-[1]" style={{ background: 'var(--tape)', transform: 'rotate(2deg)' }} />
                  <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2vw, 16px)', color: 'var(--red)' }}>
                    {lang === 'es' ? event.date_es : event.date_en}
                  </div>
                  <div className="mt-2 leading-none" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                    {lang === 'es' ? event.name_es : event.name_en}
                  </div>
                  <div className="mt-2" style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: 'var(--text-muted)' }}>
                    {lang === 'es' ? event.location_es : event.location_en}
                  </div>
                  <p className="mt-4 pr-16" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.7, color: 'var(--dim)' }}>
                    {lang === 'es' ? event.desc_es : event.desc_en}
                  </p>
                  <div className="absolute bottom-3 right-3 bg-[var(--red)] text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', padding: '3px 10px', transform: 'rotate(3deg)' }}>
                    {event.type}
                  </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
