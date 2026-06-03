// ============================================
// OPTIMAL BREAKS — Última actividad real (admin usuarios)
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const ENGAGEMENT_TABLES = [
  'favorite_artists',
  'favorite_labels',
  'favorite_events',
  'saved_mixes',
  'saved_chart_tracks',
  'artist_sightings',
  'event_attendance',
  'event_ratings',
] as const

function maxIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

/**
 * Para cada user_id: la marca de tiempo más reciente entre inicio de sesión (Auth),
 * edición de perfil y cualquier acción de engagement (favoritos, saves, valoraciones…).
 */
export async function buildLastActivityAtByUserId(
  sb: SupabaseClient<Database>,
  userIds: string[],
  signInByUserId: Record<string, string | null | undefined> = {},
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (const id of userIds) {
    out[id] = signInByUserId[id] ?? null
  }
  if (userIds.length === 0) return out

  const merge = (userId: string, iso: string | null | undefined) => {
    if (!userId || !iso) return
    out[userId] = maxIso(out[userId], iso)
  }

  const { data: profs } = await sb
    .from('profiles')
    .select('id, updated_at')
    .in('id', userIds)
  for (const p of profs || []) {
    merge(p.id, p.updated_at)
  }

  const pageSize = 1000
  for (const table of ENGAGEMENT_TABLES) {
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from(table)
        .select('user_id, created_at')
        .in('user_id', userIds)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)
      if (error || !data?.length) break
      for (const row of data as Array<{ user_id: string; created_at: string }>) {
        merge(row.user_id, row.created_at)
      }
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  return out
}
