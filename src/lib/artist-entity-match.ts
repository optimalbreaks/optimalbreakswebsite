// ============================================
// OPTIMAL BREAKS — Enlazar nombres de artistas con slugs (related_artists, etc.)
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Artist, Database } from '@/types/database'

export type ArtistLinkRow = Pick<Artist, 'name' | 'name_display' | 'slug'>

/** Normaliza para comparar nombres con filas de BD (apóstrofos, acentos, espacios). */
export function normalizeForEntityMatch(s: string): string {
  if (!s || typeof s !== 'string') return ''
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''´`]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Índice nombre → slug. Orden corto→largo para que "Zinc" gane la clave `zinc`
 * antes que el alias sin prefijo de "DJ Zinc", y no al revés.
 */
export function buildArtistSlugLookup(rows: ArtistLinkRow[]): Map<string, string> {
  const sorted = [...rows].sort(
    (a, b) => normalizeForEntityMatch(a.name).length - normalizeForEntityMatch(b.name).length,
  )
  const map = new Map<string, string>()
  for (const row of sorted) {
    const keys = new Set<string>()
    const n = normalizeForEntityMatch(row.name)
    const nd = row.name_display ? normalizeForEntityMatch(row.name_display) : ''
    if (n) keys.add(n)
    if (nd && nd !== n) keys.add(nd)
    Array.from(keys).forEach((key) => {
      if (!map.has(key)) map.set(key, row.slug)
      const depref = key.replace(/^(dj|mc|the)\s+/, '')
      if (depref && depref !== key && !map.has(depref)) map.set(depref, row.slug)
    })
  }
  return map
}

/** Resuelve slug; prueba nombre normalizado y sin prefijo DJ/MC/The. */
export function resolveArtistSlug(
  displayName: string,
  slugByNormalizedName: Map<string, string>,
): string | undefined {
  const n = normalizeForEntityMatch(displayName)
  if (!n) return undefined
  if (slugByNormalizedName.has(n)) return slugByNormalizedName.get(n)
  const stripped = n.replace(/^(dj|mc|the)\s+/, '')
  if (stripped !== n && slugByNormalizedName.has(stripped)) {
    return slugByNormalizedName.get(stripped)
  }
  return undefined
}

/**
 * "A & B" en related_artists → dos nombres enlazables. No parte "Shut Up and Dance".
 */
export function splitRelatedArtistNames(relatedName: string): string[] {
  const t = relatedName.trim()
  if (!t) return []
  if (/\s&\s/.test(t)) {
    return t.split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean)
  }
  return [t]
}

const PAGE = 1000

export async function fetchAllArtistLinkRows(
  supabase: SupabaseClient<Database>,
): Promise<ArtistLinkRow[]> {
  const all: ArtistLinkRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('artists')
      .select('name, name_display, slug')
      .order('slug', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...(data as ArtistLinkRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}
