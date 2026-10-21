// ============================================
// OPTIMAL BREAKS — Top histórico (página propia)
// ----------------------------------------------
// Ranking público de las canciones más añadidas a Mis Tracks desde el día uno.
// La URL es /topalltimes. /top100 redirige aquí (next.config.js).
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
    'top histórico breakbeat',
    'ranking breakbeat comunidad',
    'tracks favoritos breakbeat',
    'optimal breaks comunidad',
  ],
  en: [
    'breakbeat all-time top',
    'community breakbeat ranking',
    'favorite breakbeat tracks',
    'optimal breaks community',
  ],
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>
}): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/topalltimes', 'top100', {
    ogImagePath: sectionOgImagePath('top100', lang),
    ogImageAlt: sectionOgImageAlt('top100', lang),
    extraKeywords: TOP100_KEYWORDS[lang],
  })
}

export default async function TopAllTimesPage({
  params,
}: {
  params: Promise<{ lang: Locale }>
}) {
  const { lang } = await params
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
