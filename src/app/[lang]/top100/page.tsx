// ============================================
// OPTIMAL BREAKS — Top 100 de la Comunidad (página propia)
// ----------------------------------------------
// Ranking público «all-time» de las canciones más añadidas a Mis Tracks por
// toda la comunidad. Antes vivía como sección 4 dentro de `/[lang]/charts`;
// se sacó a su propia URL para darle entidad y SEO propios. El componente
// `CommunityMonthlyTop` (slug histórico) se reutiliza tal cual.
// ============================================

import Link from 'next/link'
import type { Metadata } from 'next'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import { staticPageMetadata } from '@/lib/seo'
import { sectionOgImageAlt, sectionOgImagePath } from '@/lib/og-section-images'
import CommunityMonthlyTop from '@/components/CommunityMonthlyTop'

const TOP100_KEYWORDS: Record<Locale, string[]> = {
  es: [
    'top 100 breakbeat',
    'ranking breakbeat comunidad',
    'tracks favoritos breakbeat',
    'optimal breaks comunidad',
  ],
  en: [
    'breakbeat top 100',
    'community breakbeat ranking',
    'favorite breakbeat tracks',
    'optimal breaks community',
  ],
}

export async function generateMetadata({
  params,
}: {
  params: { lang: Locale }
}): Promise<Metadata> {
  const { lang } = params
  return staticPageMetadata(lang, '/top100', 'top100', {
    ogImagePath: sectionOgImagePath('charts', lang),
    ogImageAlt: sectionOgImageAlt('charts', lang),
    extraKeywords: TOP100_KEYWORDS[lang],
  })
}

export default async function Top100Page({
  params,
}: {
  params: { lang: Locale }
}) {
  const lang = params.lang
  const dict = await getDictionary(lang)

  const backLabel = lang === 'es' ? '← Volver a Charts' : '← Back to Charts'

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-0 sm:px-4 py-6 sm:py-10">
        <nav className="px-4 sm:px-0 mb-6">
          <Link
            href={`/${lang}/charts`}
            className="inline-flex items-center gap-1.5 text-[11px] font-black tracking-wider text-[var(--ink)]/70 hover:text-[var(--red)] transition-colors no-underline"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {backLabel}
          </Link>
        </nav>

        <CommunityMonthlyTop lang={lang} dict={dict} />
      </div>
    </main>
  )
}
