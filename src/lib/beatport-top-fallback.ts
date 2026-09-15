// ============================================
// OPTIMAL BREAKS — Fallback de enlaces compartidos `?play=beatport:<id>`
// --------------------------------------------
// Regla de producto (sep 2026, decisión de Narciso): un enlace compartido de
// un tema que estuvo en la web NUNCA se queda mudo. Los Top 10 de Beatport de
// las fichas (artists/labels.beatport_top_tracks) ROTAN con cada re-scrape;
// si el corte compartido ya no está en el JSONB actual de la ficha donde
// aterriza el enlace, este helper (SOLO SERVIDOR) recupera sus datos de donde
// sigan existiendo, en este orden:
//   1. `chart_tracks` (40 Breaks Vitales) por `beatport_url` — catálogo
//      público, leído vía Data Cache (createCachedSupabase, regla
//      supabase-cache-lecturas-publicas).
//   2. `chart_featured_tracks` (New Releases) por `link_url` de Beatport.
//   3. Snapshots de `saved_chart_tracks` (saves `beatport_top`) — necesita
//      service role porque la tabla es RLS owner-only; cualquier save de
//      cualquier usuario nos vale: el snapshot congeló título, artistas,
//      carátula y sample al pulsar «+».
// Devuelve un BeatportTopTrack sintético (position 0) que la ficha pasa a
// <BeatportTopTracks fallbackTrack>: el componente arma el modal «Toca para
// escuchar» con una cola de un solo tema y el tap del receptor lo reproduce.
// Si tampoco existe en esas tres fuentes, null → la ficha abre sin modal
// (igual que antes de esta mejora).
// ============================================

import { createCachedSupabase } from './supabase-server'
import { createServiceSupabase } from './supabase-admin'
import type {
  BeatportTopTrack,
  ChartFeaturedTrack,
  ChartTrack,
  SavedChartTrackSnapshot,
} from '@/types/database'

/** LIKE que ancla el ID numérico al final de una URL de track de Beatport. */
function beatportUrlPattern(beatportId: string): string {
  return `%beatport.com/track/%/${beatportId}`
}

function fromChartRow(row: ChartTrack): BeatportTopTrack {
  return {
    position: 0,
    title: row.title,
    mix_name: row.mix_name || '',
    artists: (row.artists || []).map((a) => ({ name: a.name, beatport_url: a.beatport_url || '' })),
    label: row.label || '',
    bpm: row.bpm ?? null,
    key: row.music_key || '',
    beatport_url: row.beatport_url || '',
    artwork_url: row.artwork_url ?? null,
    sample_url: row.sample_url ?? null,
    release_year: row.release_year ?? null,
    release_date: row.release_date ?? null,
    spotify_url: row.spotify_url ?? null,
    tidal_url: row.tidal_url ?? null,
  }
}

function fromFeaturedRow(row: ChartFeaturedTrack): BeatportTopTrack {
  return {
    position: 0,
    title: row.title,
    mix_name: row.mix_name || '',
    artists: (row.artists || []).map((a) => ({ name: a.name, beatport_url: a.url || '' })),
    label: row.label || '',
    bpm: row.bpm ?? null,
    key: row.music_key || '',
    beatport_url: row.link_url || '',
    artwork_url: row.artwork_url ?? null,
    // Exclusivas cedidas: preferir el audio completo alojado, como en ChartView.
    sample_url: row.full_audio_url || row.sample_url || null,
    release_year: row.release_year ?? null,
    release_date: row.release_date ?? null,
    spotify_url: row.spotify_url ?? null,
    tidal_url: row.tidal_url ?? null,
  }
}

function fromSnapshot(snap: SavedChartTrackSnapshot): BeatportTopTrack | null {
  const title = (snap.title || '').trim()
  const beatportUrl = (snap.beatport_url || '').trim()
  if (!title || !beatportUrl) return null
  const artistNames = (snap.artists || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    position: 0,
    title,
    mix_name: snap.mix_name || '',
    artists: artistNames.map((name) => ({ name, beatport_url: '' })),
    label: snap.label || '',
    bpm: snap.bpm ?? null,
    key: snap.music_key || '',
    beatport_url: beatportUrl,
    artwork_url: snap.artwork_url ?? null,
    sample_url: snap.full_audio_url || snap.sample_url || null,
    release_year: snap.year ?? null,
    release_date: snap.release_date ?? null,
    spotify_url: snap.spotify_url ?? null,
    tidal_url: snap.tidal_url ?? null,
  }
}

/**
 * Busca un track de Beatport por su ID numérico fuera del Top 10 vigente de
 * la ficha. Solo se llama en el caso raro «enlace compartido viejo»: cuando
 * `?play=beatport:<id>` no resuelve en el JSONB actual.
 */
export async function findBeatportTopFallbackTrack(
  beatportId: string,
): Promise<BeatportTopTrack | null> {
  if (!/^\d+$/.test(beatportId)) return null
  const pattern = beatportUrlPattern(beatportId)
  const cached = createCachedSupabase()

  // 1. 40 Breaks Vitales (datos más ricos: artistas con URL, bpm, key…).
  {
    const { data } = await cached
      .from('chart_tracks')
      .select('*')
      .like('beatport_url', pattern)
      .limit(1)
    const row = (data as ChartTrack[] | null)?.[0]
    if (row) return fromChartRow(row)
  }

  // 2. New Releases (el link del pick es la URL de la tienda).
  {
    const { data } = await cached
      .from('chart_featured_tracks')
      .select('*')
      .like('link_url', pattern)
      .limit(1)
    const row = (data as ChartFeaturedTrack[] | null)?.[0]
    if (row) return fromFeaturedRow(row)
  }

  // 3. Snapshot de cualquier save `beatport_top` (RLS owner-only → service
  //    role). try/catch: si faltara la clave de servicio en algún entorno,
  //    la ficha debe abrir igual (sin modal), nunca un 500.
  try {
    const service = createServiceSupabase()
    const { data } = await service
      .from('saved_chart_tracks')
      .select('snapshot')
      .eq('track_source', 'beatport_top')
      .like('snapshot->>beatport_url', pattern)
      .limit(1)
    const snap = (data as { snapshot: SavedChartTrackSnapshot | null }[] | null)?.[0]?.snapshot
    if (snap) return fromSnapshot(snap)
  } catch {
    // Sin service role: seguimos sin fallback de snapshots.
  }

  return null
}
