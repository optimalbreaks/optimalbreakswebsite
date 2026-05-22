// ============================================
// OPTIMAL BREAKS — Open Graph estático por sección (listados)
// Imágenes en public/images/opengraph/sections/*.png
// Generación: npm run og:sections (arte IA) · npm run og:screenshot (mixes/charts captura)
// ============================================

import type { Locale } from '@/lib/i18n-config'

export const SECTION_OG_BASE = '/images/opengraph/sections' as const

/** Mayoría de PNG generados por el script: 1200×1000. */
export const SECTION_OG_PIXEL_WIDTH = 1200 as const
export const SECTION_OG_PIXEL_HEIGHT = 1000 as const

export const SECTION_OG_KEYS = [
  'artists',
  'labels',
  'events',
  'scenes',
  'blog',
  'mixes',
  'charts',
  'about',
] as const

export type SectionOgKey = (typeof SECTION_OG_KEYS)[number]

/** Archivo por sección (about/events: arte manual `*-og-alternate.png`; mixes/charts: screenshot). */
const SECTION_OG_FILE: Record<SectionOgKey, string> = {
  artists: 'artists.png',
  labels: 'labels.png',
  events: 'events-og-alternate.png',
  scenes: 'scenes.png',
  blog: 'blog.png',
  mixes: 'mixes-screenshot.png',
  charts: 'charts-screenshot.png',
  about: 'about-og-alternate.png',
}

/**
 * Variantes en inglés (sufijo `-en` antes de la extensión). Si la entrada
 * existe (generada por `npm run og:promo`), se sirve en `/en/<sección>`;
 * si no, se cae al archivo principal (compatibilidad con assets antiguos).
 *
 * El runtime no comprueba existencia (los meta tags se construyen estáticos):
 * es responsabilidad del script de generación dejar siempre las dos variantes
 * cuando un asset se actualiza al nuevo flujo bilingüe.
 */
const SECTION_OG_LANG_OVERRIDES: Partial<Record<SectionOgKey, true>> = {}

/** Dimensiones reales del PNG servido (Meta og:image width/height). */
export const SECTION_OG_PIXELS: Record<SectionOgKey, { width: number; height: number }> = {
  artists: { width: SECTION_OG_PIXEL_WIDTH, height: SECTION_OG_PIXEL_HEIGHT },
  labels: { width: SECTION_OG_PIXEL_WIDTH, height: SECTION_OG_PIXEL_HEIGHT },
  events: { width: 1764, height: 1264 },
  scenes: { width: SECTION_OG_PIXEL_WIDTH, height: SECTION_OG_PIXEL_HEIGHT },
  blog: { width: SECTION_OG_PIXEL_WIDTH, height: SECTION_OG_PIXEL_HEIGHT },
  mixes: { width: 1200, height: 630 },
  charts: { width: 1200, height: 630 },
  about: { width: 1764, height: 1264 },
}

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
    es: 'Optimal Breaks — Tu página de sesiones breaks favorita',
    en: 'Optimal Breaks — Your favorite breaks sessions page',
  },
  charts: {
    es: 'Optimal Breaks — Tu radio de break favorita',
    en: 'Optimal Breaks — Your favorite break radio',
  },
  about: {
    es: 'Optimal Breaks — Sobre el proyecto',
    en: 'Optimal Breaks — About the project',
  },
}

export function sectionOgImagePath(key: SectionOgKey, lang?: Locale): string {
  const file = SECTION_OG_FILE[key]
  if (lang === 'en' && SECTION_OG_LANG_OVERRIDES[key]) {
    const dot = file.lastIndexOf('.')
    if (dot > 0) {
      return `${SECTION_OG_BASE}/${file.slice(0, dot)}-en${file.slice(dot)}`
    }
  }
  return `${SECTION_OG_BASE}/${file}`
}

/**
 * Marca una sección como "tiene variante EN ya generada". El script
 * `generar-og-promo.mjs` añadirá la sección aquí mediante codemod cuando
 * exporte la versión EN; por ahora se gestiona manualmente.
 */
export function hasEnglishVariant(key: SectionOgKey): boolean {
  return Boolean(SECTION_OG_LANG_OVERRIDES[key])
}

export function sectionOgImageAlt(key: SectionOgKey, lang: Locale): string {
  return lang === 'es' ? ALTS[key].es : ALTS[key].en
}
