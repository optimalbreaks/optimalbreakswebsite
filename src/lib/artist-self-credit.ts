// Exclusión de auto-voto: Top de artistas + Almas Gemelas.
// Fase 2: fichaje editorial (`editorial_artist_marks`) o claim aprobado
// (`artists.claimed_by`). El save sigue en Mis Tracks y en el Top 100 de
// canciones. En el tablero de artistas no suma a *su* nombre (colabs sí).
// En Almas Gemelas ese mismo tema no entra en el set Jaccard del fichado.
// Fase 3 (bookings) no vive aquí: solo `claimed_by` + `accepts_bookings`.

import { normalizeArtistKey, splitArtistDisplayLine } from '@/lib/artist-slug-map'
import { extractRemixerNames } from '@/lib/remixer-credits'
import type { createServiceSupabase } from '@/lib/supabase-admin'

export type SelfCreditSkipMap = Map<string, Set<string>>

type ServiceClient = ReturnType<typeof createServiceSupabase>

function addSkipKey(map: SelfCreditSkipMap, userId: string | null | undefined, raw: string | null | undefined) {
  const id = (userId || '').trim()
  const key = normalizeArtistKey(raw || '')
  if (!id || !key) return
  let set = map.get(id)
  if (!set) {
    set = new Set()
    map.set(id, set)
  }
  set.add(key)
}

/** Partes de un crédito para el tablero de artistas (`A, B` y `A & B` / `and` / `x` / `vs`). */
export function splitArtistCreditsForRanking(artists: string): string[] {
  const names = splitArtistDisplayLine(artists)
  const out: string[] = []
  for (const n of names) {
    const parts = n.split(/\s+(?:&|and|x|vs\.?)\s+/i).map((s) => s.trim()).filter(Boolean)
    if (parts.length) out.push(...parts)
    else if (n) out.push(n)
  }
  return out
}

export async function loadSelfCreditSkipMap(sb: ServiceClient): Promise<SelfCreditSkipMap> {
  const map: SelfCreditSkipMap = new Map()

  const { data: marks } = await sb
    .from('editorial_artist_marks')
    .select('user_id, artist_key, artist_name')
  for (const row of (marks || []) as {
    user_id: string
    artist_key: string | null
    artist_name: string | null
  }[]) {
    addSkipKey(map, row.user_id, row.artist_key)
    addSkipKey(map, row.user_id, row.artist_name)
  }

  const { data: claimed } = await sb
    .from('artists')
    .select('claimed_by, name, name_display, slug')
    .not('claimed_by', 'is', null)
  for (const row of (claimed || []) as {
    claimed_by: string | null
    name: string | null
    name_display: string | null
    slug: string | null
  }[]) {
    if (!row.claimed_by) continue
    addSkipKey(map, row.claimed_by, row.name)
    addSkipKey(map, row.claimed_by, row.name_display)
    addSkipKey(map, row.claimed_by, (row.slug || '').replace(/-/g, ' '))
  }

  return map
}

export function shouldSkipArtistSelfCredit(
  map: SelfCreditSkipMap,
  userId: string,
  artistName: string,
): boolean {
  const keys = map.get(userId)
  if (!keys || keys.size === 0) return false
  return keys.has(normalizeArtistKey(artistName))
}

/** True si este save es un auto-voto: el usuario fichado/reclamado está en el crédito (artists o remixer). */
export function isArtistSelfCreditSave(
  map: SelfCreditSkipMap,
  userId: string,
  artistsLine: string | null | undefined,
  mixName?: string | null,
): boolean {
  if (!map.get(userId)?.size) return false
  const names = splitArtistCreditsForRanking(artistsLine || '')
  for (let i = 0; i < names.length; i++) {
    if (shouldSkipArtistSelfCredit(map, userId, names[i])) return true
  }
  const remixers = extractRemixerNames(mixName)
  for (let i = 0; i < remixers.length; i++) {
    if (shouldSkipArtistSelfCredit(map, userId, remixers[i])) return true
  }
  return false
}
