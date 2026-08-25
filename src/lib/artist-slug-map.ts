// ============================================
// OPTIMAL BREAKS — Mapa nombre de artista → slug (charts, Mis tracks, etc.)
// ============================================

export type ArtistSlugRow = {
  slug: string
  name: string | null
  name_display: string | null
}

/** Misma normalización que ChartView y /charts (ilike / slugMap). */
export function normalizeArtistKey(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Sufijos habituales de Beatport vs ficha («Skint» ↔ «Skint Records»). */
const LABEL_NAME_SUFFIXES = ['recordings', 'records', 'record', 'music'] as const

export type SlugLookupOptions = {
  /** También prueba / indexa el nombre con y sin «Records» / «Music». */
  labelSuffixes?: boolean
}

/**
 * Claves con las que un crédito (Beatport «J-Break», ficha «J-BREAK», slug `j-break`)
 * tiene que resolver al mismo slug. El mapa de la ficha de artista se indexaba con
 * `normalizeForEntityMatch` (conserva el guion: `j-break`) y `findArtistSlug` buscaba
 * con `normalizeArtistKey` (`j break`) → no había match y el nombre se iba a Beatport.
 */
export function slugLookupKeys(raw: string, opts?: SlugLookupOptions): string[] {
  const keys = new Set<string>()
  const spaced = normalizeArtistKey(raw)
  if (spaced) {
    keys.add(spaced)
    const compact = spaced.replace(/\s+/g, '')
    if (compact && compact !== spaced) keys.add(compact)
    if (spaced.startsWith('the ')) keys.add(spaced.slice(4))
    else keys.add(`the ${spaced}`)
    if (opts?.labelSuffixes) {
      for (const suf of LABEL_NAME_SUFFIXES) {
        if (spaced.endsWith(` ${suf}`)) {
          const bare = spaced.slice(0, -(suf.length + 1)).trim()
          if (bare) keys.add(bare)
        } else {
          keys.add(`${spaced} ${suf}`)
        }
      }
    }
  }
  const hyphenKept = (raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''´`]/g, '')
    .replace(/\s+/g, ' ')
  if (hyphenKept) keys.add(hyphenKept)
  return Array.from(keys).filter(Boolean)
}

function addSlugKeys(
  map: Record<string, string>,
  raw: string | null | undefined,
  slug: string,
  opts?: SlugLookupOptions,
) {
  if (!raw || !slug) return
  for (const key of slugLookupKeys(raw, opts)) {
    if (!map[key]) map[key] = slug
  }
}

/** Índice completo nombre normalizado → slug (todos los artistas de BD). */
export function buildFullArtistSlugMap(rows: ArtistSlugRow[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const r of rows) {
    addSlugKeys(map, r.name, r.slug)
    addSlugKeys(map, r.name_display, r.slug)
    addSlugKeys(map, r.slug, r.slug)
  }
  return map
}

/** Igual que el de artistas, con alias «Records» / «Music» para créditos de sello. */
export function buildFullLabelSlugMap(rows: ArtistSlugRow[]): Record<string, string> {
  const map: Record<string, string> = {}
  const opts: SlugLookupOptions = { labelSuffixes: true }
  for (const r of rows) {
    addSlugKeys(map, r.name, r.slug, opts)
    addSlugKeys(map, r.name_display, r.slug, opts)
    addSlugKeys(map, r.slug, r.slug, opts)
  }
  return map
}

/**
 * Subconjunto del mapa solo para nombres que aparecen en la lista actual
 * (menos datos en cliente / HTML).
 */
export function filterArtistSlugMapForNames(
  fullMap: Record<string, string>,
  displayNames: Iterable<string>,
  opts?: SlugLookupOptions,
): Record<string, string> {
  const filtered: Record<string, string> = {}
  for (const raw of Array.from(displayNames)) {
    const slug = findArtistSlug(raw, fullMap, opts)
    if (!slug) continue
    for (const key of slugLookupKeys(raw, opts)) {
      filtered[key] = slug
    }
  }
  return filtered
}

export function findArtistSlug(
  name: string,
  slugMap: Record<string, string> | undefined,
  opts?: SlugLookupOptions,
): string | null {
  if (!slugMap || !name) return null
  for (const key of slugLookupKeys(name, opts)) {
    if (slugMap[key]) return slugMap[key]
  }
  return null
}

export function findLabelSlug(
  name: string,
  slugMap: Record<string, string> | undefined,
): string | null {
  return findArtistSlug(name, slugMap, { labelSuffixes: true })
}

/** "Shade K, Terrie Kynd" → nombres para enlazar. */
export function splitArtistDisplayLine(artists: string): string[] {
  if (!artists.trim()) return []
  return artists
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
