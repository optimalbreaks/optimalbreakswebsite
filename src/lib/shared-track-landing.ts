// ============================================
// OPTIMAL BREAKS — Aterrizaje directo de un tema compartido (servidor)
// ----------------------------------------------
// Un enlace compartido (`/charts?play=featured:<id>` | `chart:<id>` |
// `vinyl:<id>`) se resuelve AQUÍ, en la primera respuesta del servidor, con
// una consulta ligera y cacheada por id. La página pinta el emergente
// «Toca para escuchar» en el HTML inicial, FUERA del Suspense de los charts:
// ya no depende del cargador, de la descarga de ChartView, de localizar la
// semana ni de bajar el año completo del archivo.
//
// Estados:
//  - audio     → preview/tema completo reproducible en el reproductor global
//  - video     → vinilo con YouTube (se reproduce dentro del emergente)
//  - no_audio  → el tema existe pero no tiene audio: se ofrece el enlace externo
//  - missing   → no existe o no está publicado: se avisa (nunca silencio)
//  - null      → sin `?play=` válido, o error de red (ChartView hace lo de siempre)
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { parsePlayParam } from '@/lib/share-track'
import { locateChartTrack } from '@/lib/charts-sections'

type Sb = SupabaseClient<Database>

type ArtistsJson = Array<{ name?: string | null } | string> | null

export type SharedLandingAudio = {
  status: 'audio'
  source: 'chart' | 'featured'
  id: string
  /** Igual que en ChartView (`chart-row-<id>`): permite ampliar la cola sin cortar. */
  rowKey: string
  /** Grupo de la cola: el mismo que usa ChartView para esa semana/año. */
  sectionKey: string
  weekDate: string | null
  title: string
  mixName: string | null
  artists: string
  label: string | null
  artworkUrl: string | null
  /** Misma URL que construye ChartView (proxy Beatport / Bandcamp / audio completo). */
  src: string
  isFull: boolean
  externalUrl: string | null
}

export type SharedLandingVideo = {
  status: 'video'
  id: string
  title: string
  mixName: string | null
  artists: string
  label: string | null
  artworkUrl: string | null
  youtubeId: string
  externalUrl: string | null
}

export type SharedLandingNoAudio = {
  status: 'no_audio'
  title: string
  mixName: string | null
  artists: string
  artworkUrl: string | null
  externalUrl: string | null
}

export type SharedLandingMissing = { status: 'missing' }

export type SharedLanding =
  | SharedLandingAudio
  | SharedLandingVideo
  | SharedLandingNoAudio
  | SharedLandingMissing

function artistsText(arr: ArtistsJson): string {
  if (!Array.isArray(arr)) return ''
  return arr
    .map((a) => (a && typeof a === 'object' ? a.name : a))
    .filter((n): n is string => typeof n === 'string' && !!n.trim())
    .join(', ')
}

/** Copia exacta de `previewAudioSrc` de ChartView (la URL debe coincidir). */
function proxiedSample(sampleUrl: string): string {
  try {
    const host = new URL(sampleUrl).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(sampleUrl)}`
    }
  } catch { /* url cruda */ }
  return sampleUrl
}

function youtubeIdOf(url: string | null | undefined): string | null {
  if (!url) return null
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

type EditionEmbed =
  | { week_date?: string | null; is_published?: boolean | null }
  | { week_date?: string | null; is_published?: boolean | null }[]
  | null

function edition(embed: EditionEmbed) {
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

export async function resolveSharedLanding(
  supabase: Sb,
  playParam: string | null | undefined,
): Promise<SharedLanding | null> {
  const parsed = parsePlayParam(playParam)
  if (!parsed || (parsed.kind !== 'track' && parsed.kind !== 'vinyl')) return null

  try {
    // ── Vinilo (YouTube) ────────────────────────────────────────────────
    if (parsed.kind === 'vinyl') {
      const { data, error } = await supabase
        .from('chart_vinyl_tracks')
        .select('id, title, mix_name, artists, label, artwork_url, youtube_url, discogs_url, chart_editions!inner(is_published)')
        .eq('id', parsed.id)
        .maybeSingle()
      if (error) return null
      const row = data as unknown as null | {
        id: string; title: string | null; mix_name: string | null; artists: ArtistsJson
        label: string | null; artwork_url: string | null; youtube_url: string | null
        discogs_url: string | null; chart_editions: EditionEmbed
      }
      if (!row?.title || edition(row.chart_editions)?.is_published === false) return { status: 'missing' }
      const ytId = youtubeIdOf(row.youtube_url)
      const base = {
        title: row.title,
        mixName: (row.mix_name || '').trim() || null,
        artists: artistsText(row.artists),
        artworkUrl: row.artwork_url || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null),
      }
      if (!ytId) return { status: 'no_audio', ...base, externalUrl: row.discogs_url || null }
      return {
        status: 'video',
        id: row.id,
        ...base,
        label: row.label || null,
        youtubeId: ytId,
        externalUrl: row.youtube_url || null,
      }
    }

    // ── New Releases / archivo digital (chart_featured_tracks) ──────────
    if (parsed.source === 'featured') {
      const [res, target] = await Promise.all([
        supabase
          .from('chart_featured_tracks')
          .select('id, title, mix_name, artists, label, artwork_url, sample_url, full_audio_url, platform, link_url, chart_editions!inner(week_date, is_published)')
          .eq('id', parsed.id)
          .maybeSingle(),
        locateChartTrack(supabase, parsed.id).catch(() => null),
      ])
      if (res.error) return null
      const row = res.data as unknown as null | {
        id: string; title: string | null; mix_name: string | null; artists: ArtistsJson
        label: string | null; artwork_url: string | null; sample_url: string | null
        full_audio_url: string | null; platform: string | null; link_url: string | null
        chart_editions: EditionEmbed
      }
      const ed = edition(row?.chart_editions ?? null)
      if (!row?.title || ed?.is_published === false) return { status: 'missing' }

      // Mismo orden que `buildFeaturedBundle` de ChartView.
      let src = ''
      if (row.platform === 'bandcamp' && row.link_url) {
        src = `/api/bandcamp-preview?track=${encodeURIComponent(row.link_url)}`
      } else if (row.full_audio_url) {
        src = row.full_audio_url
      } else if (row.sample_url) {
        src = proxiedSample(row.sample_url)
      }
      const common = {
        title: row.title,
        mixName: (row.mix_name || '').trim() || null,
        artists: artistsText(row.artists),
        artworkUrl: row.artwork_url || null,
      }
      const externalUrl = row.platform !== 'hosted' ? (row.link_url || null) : null
      if (!src) return { status: 'no_audio', ...common, externalUrl }

      const sectionKey = target?.kind === 'picks'
        ? `picks-${target.week}`
        : target?.kind === 'archive'
          ? `archive-${target.year}`
          : `shared-featured-${row.id}`
      return {
        status: 'audio',
        source: 'featured',
        id: row.id,
        rowKey: `chart-row-${row.id}`,
        sectionKey,
        weekDate: target?.kind === 'picks' ? target.week : (ed?.week_date ?? null),
        ...common,
        label: row.label || null,
        src,
        isFull: !!row.full_audio_url,
        externalUrl,
      }
    }

    // ── 40 Breaks Vitales (chart_tracks) ────────────────────────────────
    // La sección ya no se pinta en /charts, pero hay enlaces compartidos
    // antiguos y el Top 100 sigue generándolos: antes no llevaban a nada.
    const { data, error } = await supabase
      .from('chart_tracks')
      .select('id, title, mix_name, artists, label, artwork_url, sample_url, beatport_url, chart_editions!inner(week_date, is_published)')
      .eq('id', parsed.id)
      .maybeSingle()
    if (error) return null
    const row = data as unknown as null | {
      id: string; title: string | null; mix_name: string | null; artists: ArtistsJson
      label: string | null; artwork_url: string | null; sample_url: string | null
      beatport_url: string | null; chart_editions: EditionEmbed
    }
    const ed = edition(row?.chart_editions ?? null)
    if (!row?.title || ed?.is_published === false) return { status: 'missing' }
    const common = {
      title: row.title,
      mixName: (row.mix_name || '').trim() || null,
      artists: artistsText(row.artists),
      artworkUrl: row.artwork_url || null,
    }
    if (!row.sample_url) return { status: 'no_audio', ...common, externalUrl: row.beatport_url || null }
    return {
      status: 'audio',
      source: 'chart',
      id: row.id,
      rowKey: `chart-row-${row.id}`,
      sectionKey: `shared-chart-${row.id}`,
      weekDate: ed?.week_date ?? null,
      ...common,
      label: row.label || null,
      src: proxiedSample(row.sample_url),
      isFull: false,
      externalUrl: row.beatport_url || null,
    }
  } catch {
    // Error de red / Supabase: sin aterrizaje; ChartView sigue su flujo normal.
    return null
  }
}
