// ============================================
// OPTIMAL BREAKS — Mixes Page (Supabase)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { Mix } from '@/types/database'
import type { Metadata } from 'next'
import { staticPageMetadata } from '@/lib/seo'

type FallbackMix = {
  type: string
  year: string
  duration: string
  title_es: string
  title_en: string
  artist: string
  desc_es: string
  desc_en: string
  platform: string
}

const FALLBACK_MIXES: FallbackMix[] = [
  {
    type: 'RADIO / MIX',
    year: '2000s-2020s',
    duration: 'SERIE',
    title_es: 'LADY WAKS IN DA MIX',
    title_en: 'LADY WAKS IN DA MIX',
    artist: 'Lady Waks',
    desc_es: 'Ejemplo perfecto de continuidad: mezcla regular, comunidad y presencia sostenida cuando el breakbeat deja de ocupar el centro.',
    desc_en: 'A perfect example of continuity: regular mixing, community and sustained presence after breakbeat left the centre.',
    platform: 'YOUTUBE',
  },
  {
    type: 'DJ CULTURE',
    year: '2000s-2020s',
    duration: 'ONGOING',
    title_es: 'SESIONES Y ARCHIVO DE KRAFTY KUTS',
    title_en: 'KRAFTY KUTS SESSIONS AND ARCHIVE',
    artist: 'Krafty Kuts',
    desc_es: 'Su figura sirve para leer la resistencia del género desde la cabina, el edit y la circulación constante de mixes.',
    desc_en: 'His role helps read the genre’s resistance through the booth, edits and the steady circulation of mixes.',
    platform: 'MIXCLOUD',
  },
  {
    type: 'PIRATE RADIO',
    year: '1990s-2000s',
    duration: 'N/A',
    title_es: 'RADIO PIRATA Y BREAKS FM',
    title_en: 'PIRATE RADIO AND BREAKS FM',
    artist: 'Scene infrastructure',
    desc_es: 'Antes del algoritmo, muchas sesiones clave pasaban por radios y emisoras especializadas que definían qué sonaba caliente.',
    desc_en: 'Before the algorithm, many key mixes passed through radio and specialist stations that defined what sounded hot.',
    platform: 'RADIO',
  },
  {
    type: 'DIGITAL ERA',
    year: '2010s-2020s',
    duration: 'NETWORK',
    title_es: 'YOUTUBE, SOUNDCLOUD Y MIXCLOUD',
    title_en: 'YOUTUBE, SOUNDCLOUD AND MIXCLOUD',
    artist: 'Distributed scene',
    desc_es: 'La lógica del mixtape se desplaza a plataformas donde el género sobrevive como nicho activo, no como museo.',
    desc_en: 'Mixtape logic shifts to platforms where the genre survives as an active niche, not as a museum piece.',
    platform: 'ONLINE',
  },
  {
    type: 'LIVE SET',
    year: '2000s',
    duration: 'CLUB ERA',
    title_es: 'NU SKOOL BREAKS EN CABINA',
    title_en: 'NU SKOOL BREAKS IN THE BOOTH',
    artist: 'Stanton Warriors / Plump DJs / Freestylers',
    desc_es: 'La época en la que los sets funcionan como carta de presentación de un sonido internacional muy reconocible.',
    desc_en: 'The era when sets function as the calling card of a highly recognisable international sound.',
    platform: 'CLUB',
  },
  {
    type: 'ARCHIVE',
    year: 'HOY',
    duration: 'LIVING',
    title_es: 'MIXES COMO MEMORIA DE ESCENA',
    title_en: 'MIXES AS SCENE MEMORY',
    artist: 'DJs, radios y canales',
    desc_es: 'Una parte esencial de la historia del break no está solo en los tracks, sino en quién los mezcló, cuándo y para qué público.',
    desc_en: 'A key part of break history lives not only in tracks, but in who mixed them, when, and for which crowd.',
    platform: 'ARCHIVE',
  },
]

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/mixes', 'mixes')
}

export default async function MixesPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const supabase = createServerSupabase()
  const { data: mixes } = await supabase.from('mixes').select('*').order('year', { ascending: false })
  const list = (mixes || []) as Mix[]

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 py-14 sm:py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">MIXES</div>
        <h1 className="sec-title">{dict.mixes.title}<br /><span className="hl">{lang === 'es' ? 'ESENCIALES' : 'ESSENTIAL'}</span></h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>{dict.mixes.subtitle}</p>
      </section>
      <section className="px-4 sm:px-6 py-12 sm:py-16">
        {list.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
            {list.map((m) => (
              <div
                key={m.slug}
                className="border-[3px] border-[var(--ink)] p-5 sm:p-7 relative transition-all duration-150 bg-[var(--paper)] hover:rotate-[-1deg] hover:shadow-[6px_6px_0_var(--ink)]"
              >
                <div className="absolute -top-[6px] left-[20px] w-[60px] h-[18px]" style={{ background: 'var(--tape)', transform: 'rotate(-2deg)' }} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="cutout red" style={{ margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                  <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                    {m.year} · {m.duration_minutes} min
                  </span>
                </div>
                <div className="mt-3" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  {m.title}
                </div>
                <div className="mt-2" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>
                  {m.artist_name}
                </div>
                {m.embed_url && (
                  <a href={m.embed_url} target="_blank" rel="noopener noreferrer" className="absolute bottom-3 right-3 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', padding: '4px 12px', transform: 'rotate(2deg)' }}>
                    ▶ PLAY
                  </a>
                )}
                {!m.embed_url && (
                  <div className="absolute bottom-3 right-3 bg-[var(--ink)] text-[var(--yellow)]" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', padding: '4px 12px', transform: 'rotate(2deg)' }}>
                    ▶ {m.platform?.toUpperCase()}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="max-w-[860px] p-5 sm:p-7 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>
                {lang === 'es' ? 'QUIÉN MANTUVO LA LLAMA' : 'WHO KEPT THE FLAME ALIVE'}
              </div>
              <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.72)' }}>
                {lang === 'es'
                  ? 'Esta seccion no va solo de sets famosos. Tambien va de radio, podcasts, canales y sesiones regulares que sostuvieron la cultura break durante los años de latencia.'
                  : 'This section is not only about famous sets. It is also about radio, podcasts, channels and regular sessions that sustained break culture during the latency years.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
              {FALLBACK_MIXES.map((mix) => (
                <div
                  key={`${mix.artist}-${mix.title_en}`}
                  className="border-[3px] border-[var(--ink)] p-5 sm:p-7 relative transition-all duration-150 bg-[var(--paper)] hover:rotate-[-1deg] hover:shadow-[6px_6px_0_var(--ink)]"
                >
                  <div className="absolute -top-[6px] left-[20px] w-[60px] h-[18px]" style={{ background: 'var(--tape)', transform: 'rotate(-2deg)' }} />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cutout red" style={{ margin: 0 }}>{mix.type}</span>
                    <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                      {mix.year} · {mix.duration}
                    </span>
                  </div>
                  <div className="mt-3" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                    {lang === 'es' ? mix.title_es : mix.title_en}
                  </div>
                  <div className="mt-2" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>
                    {mix.artist}
                  </div>
                  <p className="mt-4 pr-16" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.7, color: 'var(--dim)' }}>
                    {lang === 'es' ? mix.desc_es : mix.desc_en}
                  </p>
                  <div className="absolute bottom-3 right-3 bg-[var(--ink)] text-[var(--yellow)]" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', padding: '4px 12px', transform: 'rotate(2deg)' }}>
                    ▶ {mix.platform}
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
