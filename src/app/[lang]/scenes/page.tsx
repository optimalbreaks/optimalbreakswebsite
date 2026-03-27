// ============================================
// OPTIMAL BREAKS — Scenes Page (Supabase)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { Scene } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import { staticPageMetadata } from '@/lib/seo'

type FallbackScene = {
  name_es: string
  name_en: string
  era: string
  region: string
  desc_es: string
  desc_en: string
}

const FALLBACK_SCENES: FallbackScene[] = [
  {
    name_es: 'Bronx y Nueva York',
    name_en: 'Bronx and New York',
    era: '1970s-1980s',
    region: 'US',
    desc_es: 'El break nace como tecnica DJ y cultura de sampleo: block parties, funk, soul y los primeros cimientos del hip hop.',
    desc_en: 'The break is born as DJ technique and sampling culture: block parties, funk, soul and the first foundations of hip hop.',
  },
  {
    name_es: 'Reino Unido rave',
    name_en: 'Rave United Kingdom',
    era: '1988-2005',
    region: 'London / Bristol / Manchester / Sheffield',
    desc_es: 'Aqui el breakbeat se vuelve columna vertebral de la rave: hardcore, jungle, big beat y nu skool.',
    desc_en: 'Here breakbeat becomes a backbone of rave: hardcore, jungle, big beat and nu skool.',
  },
  {
    name_es: 'Florida y breaks estadounidenses',
    name_en: 'Florida and American breaks',
    era: '1990s-2000s',
    region: 'Miami / South Florida / West Coast',
    desc_es: 'EE. UU. mantiene escenas breaks muy potentes, aunque mas regionales y menos centrales que la narrativa UK.',
    desc_en: 'The US sustains powerful breaks scenes, though more regional and less central than the UK narrative.',
  },
  {
    name_es: 'Andalucia',
    name_en: 'Andalusia',
    era: '1992-2002',
    region: 'Sur de Espana',
    desc_es: 'Caso singular: el breakbeat pasa de nicho a fenomeno generacional, con radios, macrofiestas y memoria colectiva propia.',
    desc_en: 'A singular case: breakbeat moves from niche to generational phenomenon, with radio, mega-parties and its own shared memory.',
  },
  {
    name_es: 'Perth y Australia',
    name_en: 'Perth and Australia',
    era: '2001-hoy',
    region: 'Australia',
    desc_es: 'Escena solida y duradera, con eventos como Breakfest y una conexion clara con la cultura bass internacional.',
    desc_en: 'A solid, durable scene, with events like Breakfest and a clear link to international bass culture.',
  },
  {
    name_es: 'Escena digital global',
    name_en: 'Global digital scene',
    era: '2010s-hoy',
    region: 'Beatport / YouTube / Mixcloud / SoundCloud',
    desc_es: 'Cuando el genero sale del centro, internet toma el relevo: charts, podcasts, canales y comunidades mantienen viva la red.',
    desc_en: 'When the genre leaves the centre, the internet takes over: charts, podcasts, channels and communities keep the network alive.',
  },
]

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/scenes', 'scenes')
}

export default async function ScenesPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const supabase = createServerSupabase()
  const { data: scenes } = await supabase.from('scenes').select('*').order('era', { ascending: true })
  const list = (scenes || []) as Scene[]

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 py-14 sm:py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">SCENES</div>
        <h1 className="sec-title">{dict.scenes.title}<br /><span className="hl">{lang === 'es' ? 'MUNDO' : 'WORLD'}</span></h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>{dict.scenes.subtitle}</p>
      </section>
      <section className="px-4 sm:px-6 py-12 sm:py-16">
        {list.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
            {list.map((s) => (
              <Link key={s.slug} href={`/${lang}/scenes/${s.slug}`} className="p-6 sm:p-8 border-r-[3px] border-b-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] no-underline text-[var(--ink)] max-md:!border-r-0">
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>{s.era}</div>
                <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                  {lang === 'es' ? s.name_es : s.name_en}
                </div>
                <div className="mt-1" style={{ fontSize: '14px', color: 'var(--dim)' }}>{s.region || s.country}</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
            {FALLBACK_SCENES.map((scene) => (
              <div key={scene.name_en} className="p-6 sm:p-8 border-r-[3px] border-b-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] text-[var(--ink)] max-md:!border-r-0">
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>{scene.era}</div>
                <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                  {lang === 'es' ? scene.name_es : scene.name_en}
                </div>
                <div className="mt-1" style={{ fontSize: '14px', color: 'var(--dim)' }}>{scene.region}</div>
                <p className="mt-3" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.7, color: 'var(--dim)' }}>
                  {lang === 'es' ? scene.desc_es : scene.desc_en}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
