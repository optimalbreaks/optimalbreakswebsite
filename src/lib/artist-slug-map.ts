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

/** Índice completo nombre normalizado → slug (todos los artistas de BD). */
export function buildFullArtistSlugMap(rows: ArtistSlugRow[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const r of rows) {
    for (const raw of [r.name, r.name_display]) {
      const key = normalizeArtistKey(raw || '')
      if (key && !map[key]) map[key] = r.slug
    }
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
): Record<string, string> {
  const filtered: Record<string, string> = {}
  for (const raw of displayNames) {
    const key = normalizeArtistKey(raw)
    if (!key) continue
    if (fullMap[key]) filtered[key] = fullMap[key]
    const withoutThe = key.startsWith('the ') ? key.slice(4) : `the ${key}`
    if (!filtered[key] && fullMap[withoutThe]) filtered[key] = fullMap[withoutThe]
  }
  return filtered
}

export function findArtistSlug(
  name: string,
  slugMap: Record<string, string> | undefined,
): string | null {
  if (!slugMap || !name) return null
  const n = normalizeArtistKey(name)
  if (!n) return null
  if (slugMap[n]) return slugMap[n]
  const noThe = n.startsWith('the ') ? n.slice(4) : `the ${n}`
  return slugMap[noThe] || null
}

/** "Shade K, Terrie Kynd" → nombres para enlazar. */
export function splitArtistDisplayLine(artists: string): string[] {
  if (!artists.trim()) return []
  return artists
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
