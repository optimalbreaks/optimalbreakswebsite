// ============================================
// OPTIMAL BREAKS — About Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import {
  SECTION_OG_PIXEL_HEIGHT,
  SECTION_OG_PIXEL_WIDTH,
  sectionOgImageAlt,
  sectionOgImagePath,
} from '@/lib/og-section-images'
import { staticPageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'
import Image from 'next/image'

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/about', 'about', {
    ogImagePath: sectionOgImagePath('about'),
    ogImageAlt: sectionOgImageAlt('about', lang),
  })
}

export default async function AboutPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  return (
    <div className="lined min-h-screen">
      <section className="px-3 sm:px-6 pt-10 pb-10 sm:pt-16 sm:pb-12 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">ABOUT</div>
        <h1 className="sec-title">
          {dict.about.title}
          <br />
          <span className="hl">OPTIMAL//BREAKS</span>
        </h1>
        <div className="mt-8 sm:mt-10 max-w-4xl mx-auto">
          <Image
            src={sectionOgImagePath('about')}
            alt={sectionOgImageAlt('about', lang)}
            width={SECTION_OG_PIXEL_WIDTH}
            height={SECTION_OG_PIXEL_HEIGHT}
            className="w-full h-auto border-4 border-[var(--ink)]"
            sizes="(max-width: 896px) 100vw, 896px"
            priority
          />
        </div>
      </section>

      <section className="px-3 sm:px-6 py-10 sm:py-16 max-w-[800px] mx-auto">
        {/* Description */}
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 'clamp(16px, 4vw, 19px)', lineHeight: 1.8, marginBottom: 'clamp(24px, 6vw, 40px)' }}>
          {dict.about.description}
        </p>

        {/* Manifesto block */}
        <div className="bg-[var(--ink)] text-[var(--paper)] p-4 sm:p-10 relative border-4 border-[var(--ink)]">
          <div
            className="absolute -top-[6px] left-[30px] w-[80px] h-[20px]"
            style={{ background: 'var(--tape)', transform: 'rotate(-2deg)' }}
          />
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(20px, 5vw, 28px)', color: 'var(--yellow)', marginBottom: '15px' }}>
            {lang === 'es' ? '¿POR QUÉ?' : 'WHY?'}
          </div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8, color: 'rgba(232,220,200,0.7)' }}>
            {lang === 'es'
              ? 'Porque el breakbeat merece un archivo, una memoria y un espacio propio. La informacion mas estable vive en Historia, Artistas, Escenas, Sellos, Eventos y Mixes; el Blog queda para interpretar, comparar y contar la memoria de escena. Optimal Breaks existe para que nada de eso desaparezca.'
              : 'Because breakbeat deserves an archive, a memory, and a space of its own. The most stable material lives in History, Artists, Scenes, Labels, Events and Mixes, while the Blog is used to interpret, compare and narrate scene memory. Optimal Breaks exists so none of that disappears.'}
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
