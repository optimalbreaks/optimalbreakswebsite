// ============================================
// OPTIMAL BREAKS — About Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'

export default async function AboutPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  return (
    <div className="lined min-h-screen">
      <section className="px-6 py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">ABOUT</div>
        <h1 className="sec-title">
          {dict.about.title}
          <br />
          <span className="hl">OPTIMAL//BREAKS</span>
        </h1>
      </section>

      <section className="px-6 py-16 max-w-[800px]">
        {/* Description */}
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '19px', lineHeight: 1.8, marginBottom: '40px' }}>
          {dict.about.description}
        </p>

        {/* Manifesto block */}
        <div className="bg-[var(--ink)] text-[var(--paper)] p-10 relative border-4 border-[var(--ink)]">
          <div
            className="absolute -top-[6px] left-[30px] w-[80px] h-[20px]"
            style={{ background: 'var(--tape)', transform: 'rotate(-2deg)' }}
          />
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '28px', color: 'var(--yellow)', marginBottom: '15px' }}>
            {lang === 'es' ? '¿POR QUÉ?' : 'WHY?'}
          </div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8, color: 'rgba(232,220,200,0.7)' }}>
            {lang === 'es'
              ? 'Porque el breakbeat merece un archivo, una memoria y un espacio propio. Porque la historia de este género se está perdiendo en foros cerrados, vinilos olvidados y memorias que se apagan. Optimal Breaks existe para que nada de eso desaparezca.'
              : 'Because breakbeat deserves an archive, a memory, and a space of its own. Because the history of this genre is being lost in closed forums, forgotten vinyl and fading memories. Optimal Breaks exists so none of that disappears.'}
          </p>
        </div>

        {/* Action items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 mt-12 border-4 border-[var(--ink)]">
          {[
            { label: dict.about.contact, icon: '✉', color: 'var(--red)' },
            { label: dict.about.collaborate, icon: '⚡', color: 'var(--acid)' },
            { label: dict.about.submit_event, icon: '📅', color: 'var(--uv)' },
            { label: dict.about.suggest_artist, icon: '🎧', color: 'var(--pink)' },
          ].map((item, i) => (
            <div
              key={i}
              className="p-6 border-r-[3px] border-b-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] cursor-pointer max-md:!border-r-0"
            >
              <span className="text-3xl">{item.icon}</span>
              <div
                className="mt-2"
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontWeight: 900,
                  fontSize: '18px',
                  textTransform: 'uppercase',
                  letterSpacing: '-0.5px',
                }}
              >
                {item.label}
              </div>
              <div className="mt-1" style={{ fontSize: '13px', color: 'var(--dim)' }}>
                {lang === 'es' ? 'Próximamente' : 'Coming soon'}
              </div>
            </div>
          ))}
        </div>

        {/* Credits */}
        <div className="mt-16 pt-8 border-t-4 border-dashed border-[var(--ink)]">
          <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '2px', color: 'var(--dim)' }}>
            {lang === 'es'
              ? 'OPTIMAL BREAKS ES UN PROYECTO INDEPENDIENTE. HECHO CON BREAKS Y RUIDO DESDE MURCIA, ESPAÑA.'
              : 'OPTIMAL BREAKS IS AN INDEPENDENT PROJECT. MADE WITH BREAKS AND NOISE FROM MURCIA, SPAIN.'}
          </p>
          <p className="mt-2" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '2px', color: 'var(--dim)' }}>
            NEXT.JS · SUPABASE · TAILWIND CSS · 2026
          </p>
        </div>
      </section>
    </div>
  )
}
