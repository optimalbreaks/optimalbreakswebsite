// ============================================
// OPTIMAL BREAKS — Series de festivales (páginas fijas por marca)
// ----------------------------------------------
// Cada edición de un festival tiene su propia ficha (/events/<slug>), que
// caduca cuando pasa. Las páginas /festivals/<serie> son URLs PERMANENTES por
// marca («Raveart Summer Festival», «Retro Halloween»…) que acumulan la fuerza
// SEO de todas las ediciones y siempre destacan la próxima.
//
// Cómo se agrupan las ediciones: por el «stem» del nombre del evento (sin años
// ni puntuación, ver `eventSeriesStem`). Una edición pertenece a una serie si
// su stem contiene alguno de los `aliases` de la serie como palabras
// completas. No hace falta columna nueva en BD.
//
// Añadir una serie: nueva entrada en FESTIVAL_SERIES. Si ninguna edición
// encaja, la página responde 404 y no sale en el sitemap (no hay riesgo de
// publicar páginas vacías). `intro_es` / `intro_en` son opcionales: si están
// vacíos la página genera un texto a partir de los datos reales (ediciones,
// ciudades, artistas), sin inventar nada.
// ============================================

import type { BreakEvent } from '@/types/database'

/** Stem de serie: quita años y puntuación (Raveart Retro Halloween 2026 ↔ 2025). */
export function eventSeriesStem(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stemTokenOverlap(a: string, b: string): number {
  const ta = a.split(' ').filter((t) => t.length > 2)
  const tb = new Set(b.split(' ').filter((t) => t.length > 2))
  if (ta.length === 0 || tb.size === 0) return 0
  let hit = 0
  for (const t of ta) if (tb.has(t)) hit++
  return hit / Math.max(ta.length, tb.size)
}

/** Heurística de «misma serie» entre dos eventos (usada en «Otras ediciones»). */
export function isSameSeries(stemA: string, stemB: string): boolean {
  if (!stemA || !stemB) return false
  if (stemA === stemB) return true
  if (stemA.includes(stemB) || stemB.includes(stemA)) {
    const shorter = stemA.length <= stemB.length ? stemA : stemB
    // Evitar matches demasiado cortos ("raveart" solo)
    return shorter.split(' ').filter((t) => t.length > 2).length >= 2
  }
  return stemTokenOverlap(stemA, stemB) >= 0.75
}

export type SeriesSeason = {
  /** Clave estable (verano, invierno…). */
  key: string
  label_es: string
  label_en: string
  /** Stems que identifican la temporada en el nombre de la edición («open air», «winter»…). */
  aliases: string[]
  /**
   * Meses (1–12) de respaldo: si el nombre no dice la temporada, se asigna
   * por el mes de inicio de la edición.
   */
  months?: number[]
}

export type FestivalSeries = {
  /** URL permanente: /[lang]/festivals/<slug>. No cambiar una vez publicada. */
  slug: string
  /** Nombre de marca, sin año. */
  name: string
  /**
   * Stems (minúsculas, sin tildes ni años) que identifican la serie dentro
   * del nombre de cada edición. Palabras completas.
   */
  aliases: string[]
  /** Stems que, aunque encaje un alias, NO son edición de la serie (colaboraciones, fiestas satélite…). */
  exclude?: string[]
  /**
   * Temporadas de una MISMA marca sin nombre propio: una sola página, con
   * próximas ediciones y archivo agrupados por temporada. Si una variante se
   * busca como marca propia (Raveart Summer / Winter, Olibass Open Air / Snow
   * Edition), va como serie independiente, no como temporada.
   */
  seasons?: SeriesSeason[]
  /** Texto editorial opcional (1–3 párrafos, separados por línea en blanco). */
  intro_es?: string
  intro_en?: string
}

export const FESTIVAL_SERIES: FestivalSeries[] = [
  { slug: 'raveart-summer-festival', name: 'Raveart Summer Festival', aliases: ['raveart summer'] },
  { slug: 'raveart-winter-festival', name: 'Raveart Winter Festival', aliases: ['raveart winter'] },
  { slug: 'retro-halloween', name: 'Raveart Retro Halloween', aliases: ['retro halloween'] },
  { slug: 'hibrida-fest', name: 'Híbrida Fest', aliases: ['hibrida'], exclude: ['ritmika'] },
  { slug: 'oshun-festival', name: 'Oshun Festival', aliases: ['oshun'] },
  { slug: 'floridance-festival', name: 'Floridance Festival', aliases: ['floridance'] },
  { slug: 'circus-nation', name: 'Circus Nation', aliases: ['circus nation'] },
  { slug: 'olibass-open-air', name: 'Olibass Open Air', aliases: ['olibass'], exclude: ['snow', 'winter', 'invierno'] },
  { slug: 'olibass-snow-edition', name: 'Olibass Snow Edition', aliases: ['olibass snow', 'olibass music festival snow', 'olibass winter', 'olibass invierno'] },
  { slug: 'farewell-summer-festival', name: 'Farewell Summer Festival', aliases: ['farewell summer'] },
  { slug: 'dreambeach', name: 'Dreambeach', aliases: ['dreambeach'] },
  { slug: 'andalucia-breakbeat-festival', name: 'Andalucía Breakbeat Festival', aliases: ['andalucia breakbeat festival'] },
  { slug: 'solaris-fest', name: 'Solaris Fest', aliases: ['solaris fest'] },
  { slug: 'aqua-breaks', name: 'Aqua Breaks', aliases: ['aqua breaks'] },
  { slug: 'electrolunch', name: 'Electrolunch', aliases: ['electrolunch'] },
  { slug: 'surbreak', name: 'Surbreak', aliases: ['surbreak'] },
  { slug: 'breiki-electronic-festival', name: 'Breiki Electronic Festival', aliases: ['breiki'] },
  { slug: 'made-in-spain-festival', name: 'Made in Spain Festival', aliases: ['made in spain festival'] },
  { slug: 'breakfest', name: 'Breakfest', aliases: ['breakfest'] },
  { slug: 'heat-closing-boiler-xl', name: 'Heat Closing Boiler XL', aliases: ['heat closing'] },
  { slug: 'heat-opening', name: 'Heat Opening', aliases: ['heat opening'] },
  // Noches de HEAT entre el Opening y el Closing: después de las dos anteriores
  // para que «heat opening» / «heat closing» ganen primero.
  { slug: 'heat-temporada', name: 'HEAT Temporada', aliases: ['heat'] },
  { slug: 'zutopia-music-and-arts-festival', name: 'Zutopia Music and Arts Festival', aliases: ['zutopia'] },
]

/**
 * Mínimo de ediciones para PUBLICAR la página de una serie (index + sitemap +
 * enlaces desde fichas). Con una sola edición, la página del festival competiría
 * con la propia ficha del evento por la misma búsqueda. Las series se publican
 * solas en cuanto entra la segunda edición en la BD.
 */
export const MIN_SERIES_EDITIONS = 2

/**
 * Eventos de marca que NO son ediciones (presentaciones de cartel, fiestas de
 * lanzamiento…). Siguen en la BD, en la agenda y en la página de la
 * promotora; solo no cuentan como edición de ninguna serie.
 */
const SERIES_GLOBAL_EXCLUDE = ['presentacion oficial', 'presentacion del cartel', 'official presentation']

export function festivalSeriesBySlug(slug: string): FestivalSeries | null {
  return FESTIVAL_SERIES.find((s) => s.slug === slug) ?? null
}

/**
 * Tres niveles: FESTIVAL (marca: Raveart, Olibass) › EDICIÓN (formato que se
 * repite: Raveart Summer Festival, Olibass Snow Edition = cada FESTIVAL_SERIES)
 * › EVENTO (el día con su cartel: /events/<slug>, sin cambios).
 * Una marca con un solo formato (Dreambeach, Oshun…) no va aquí: su página de
 * edición ya es la del festival. Un evento suelto no pertenece a ninguna.
 * El slug de una marca no puede coincidir con el de una edición.
 */
export type FestivalBrand = {
  slug: string
  name: string
  /** Slugs de FESTIVAL_SERIES, en el orden en que se muestran. */
  editions: string[]
  intro_es?: string
  intro_en?: string
}

export const FESTIVAL_BRANDS: FestivalBrand[] = [
  { slug: 'raveart', name: 'Raveart', editions: ['raveart-summer-festival', 'raveart-winter-festival', 'retro-halloween'] },
  { slug: 'olibass-music-festival', name: 'Olibass Music Festival', editions: ['olibass-open-air', 'olibass-snow-edition'] },
  { slug: 'heat', name: 'HEAT', editions: ['heat-opening', 'heat-temporada', 'heat-closing-boiler-xl'] },
]

export function festivalBrandBySlug(slug: string): FestivalBrand | null {
  return FESTIVAL_BRANDS.find((b) => b.slug === slug) ?? null
}

export function festivalBrandOfSeries(seriesSlug: string | null | undefined): FestivalBrand | null {
  if (!seriesSlug) return null
  return FESTIVAL_BRANDS.find((b) => b.editions.includes(seriesSlug)) ?? null
}

export function seriesOfBrand(brand: FestivalBrand): FestivalSeries[] {
  return brand.editions.map(festivalSeriesBySlug).filter((s): s is FestivalSeries => s !== null)
}

/** Eventos de todas las ediciones de la marca, más reciente primero. */
export function eventsOfBrand<T extends SeriesEventLike>(brand: FestivalBrand, events: T[]): T[] {
  const slugs = new Set(brand.editions)
  return events
    .filter((e) => slugs.has(festivalSeriesForEventName(e.name)?.slug ?? ''))
    .sort((a, b) => String(b.date_start ?? '').localeCompare(String(a.date_start ?? '')))
}

/** Temporada de una edición: primero por el nombre, si no por el mes de inicio. */
export function seasonOfEvent(
  series: FestivalSeries,
  e: Pick<BreakEvent, 'name' | 'date_start'>,
): SeriesSeason | null {
  if (!series.seasons?.length) return null
  const stem = ` ${eventSeriesStem(e.name)} `
  const byName = series.seasons.find((s) => s.aliases.some((a) => stem.includes(` ${a} `)))
  if (byName) return byName
  const month = Number((e.date_start ?? '').slice(5, 7))
  if (!month) return null
  return series.seasons.find((s) => s.months?.includes(month)) ?? null
}

/** Serie a la que pertenece un evento por su nombre (la primera que encaje). */
export function festivalSeriesForEventName(name: string): FestivalSeries | null {
  const stem = ` ${eventSeriesStem(name)} `
  if (SERIES_GLOBAL_EXCLUDE.some((x) => stem.includes(` ${x} `))) return null
  for (const series of FESTIVAL_SERIES) {
    if (!series.aliases.some((alias) => stem.includes(` ${alias} `))) continue
    if (series.exclude?.some((x) => stem.includes(` ${x} `))) continue
    return series
  }
  return null
}

type SeriesEventLike = Pick<BreakEvent, 'name' | 'date_start' | 'date_end'>

/** Filtra y ordena (más reciente primero) las ediciones de una serie. */
export function eventsOfSeries<T extends SeriesEventLike>(series: FestivalSeries, events: T[]): T[] {
  return events
    .filter((e) => festivalSeriesForEventName(e.name)?.slug === series.slug)
    .sort((a, b) => String(b.date_start ?? '').localeCompare(String(a.date_start ?? '')))
}

/** YYYY-MM-DD de hoy en Madrid (coherente en SSR). */
export function todayYmdMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

/** Evento en curso o futuro (último día ≥ hoy). */
export function isUpcomingOrOngoing(e: Pick<BreakEvent, 'date_start' | 'date_end'>, today = todayYmdMadrid()): boolean {
  const last = (e.date_end || e.date_start || '').slice(0, 10)
  return Boolean(last) && last >= today
}
