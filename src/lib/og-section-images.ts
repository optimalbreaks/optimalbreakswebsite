// ============================================
// OPTIMAL BREAKS — Open Graph estático por sección (listados)
// Imágenes en public/images/opengraph/sections/*.png
// Generación: npm run og:sections
// ============================================

import type { Locale } from '@/lib/i18n-config'

export const SECTION_OG_BASE = '/images/opengraph/sections' as const

export const SECTION_OG_KEYS = [
  'artists',
  'labels',
  'events',
  'scenes',
  'blog',
  'mixes',
  'about',
] as const

export type SectionOgKey = (typeof SECTION_OG_KEYS)[number]

const ALTS: Record<SectionOgKey, { es: string; en: string }> = {
  artists: {
    es: 'Optimal Breaks — Artistas: DJs, productores y archivo del breakbeat',
    en: 'Optimal Breaks — Artists: DJs, producers and breakbeat archive',
  },
  labels: {
    es: 'Optimal Breaks — Sellos: sellos e imprints de breakbeat',
    en: 'Optimal Breaks — Labels: breakbeat labels and imprints',
  },
  events: {
    es: 'Optimal Breaks — Eventos: festivales y noches',
    en: 'Optimal Breaks — Events: festivals and club nights',
  },
  scenes: {
    es: 'Optimal Breaks — Escenas: ciudades y colectivos',
    en: 'Optimal Breaks — Scenes: cities and crews',
  },
  blog: {
    es: 'Optimal Breaks — Blog: artículos y ensayos',
    en: 'Optimal Breaks — Blog: articles and essays',
  },
  mixes: {
    es: 'Optimal Breaks — Mixes: sesiones y DJ sets',
    en: 'Optimal Breaks — Mixes: DJ sets and sessions',
  },
  about: {
    es: 'Optimal Breaks — Sobre el proyecto',
    en: 'Optimal Breaks — About the project',
  },
}

export function sectionOgImagePath(key: SectionOgKey): string {
  return `${SECTION_OG_BASE}/${key}.png`
}

export function sectionOgImageAlt(key: SectionOgKey, lang: Locale): string {
  return lang === 'es' ? ALTS[key].es : ALTS[key].en
}
