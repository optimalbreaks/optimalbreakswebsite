// ============================================
// OPTIMAL BREAKS — Sesiones (mixes) ligadas a eventos
// ----------------------------------------------
// `mixes.event_id` (migración 083) cuelga una sesión de la edición donde se
// grabó. La ficha del evento, la serie /festivals/<serie> y la ficha propia
// /mixes/<slug> leen de aquí. Sin 'use client' ni imports de servidor: lo usan
// páginas RSC y componentes cliente.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Mix } from '@/types/database'
import type { Locale } from '@/lib/i18n-config'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { mixSortTimestamp } from '@/lib/mix-datetime-local'

export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

function soundCloudUrl(m: Pick<Mix, 'embed_url'>): string | null {
  const u = m.embed_url?.trim()
  return u && /soundcloud\.com\//i.test(u) ? u : null
}

/** Sesiones de uno o varios eventos, más recientes primero. */
export async function loadMixesForEvents(
  supabase: SupabaseClient<Database>,
  eventIds: string[],
): Promise<Mix[]> {
  const ids = Array.from(new Set(eventIds.filter(Boolean)))
  if (!ids.length) return []
  const rows = await fetchAllPages<Mix>((from, to) =>
    supabase
      .from('mixes')
      .select('*')
      .in('event_id', ids)
      .order('id', { ascending: true })
      .range(from, to),
  ).catch(() => [] as Mix[])
  return rows.sort((a, b) => mixSortTimestamp(b) - mixSortTimestamp(a))
}

export function mixDescription(m: Pick<Mix, 'description_es' | 'description_en'>, lang: Locale): string {
  return ((lang === 'es' ? m.description_es : m.description_en) || m.description_es || m.description_en || '').trim()
}

export function mixThumbnailUrl(m: Pick<Mix, 'image_url' | 'video_url'>): string | null {
  if (m.image_url?.startsWith('https://')) return m.image_url
  const yt = extractYouTubeId(m.video_url)
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null
}

/** Nombre del evento con el año si no lo lleva («OLIBASS Music Festival | Open Air 2026»). */
export function eventLabelWithYear(name: string, dateStart: string | null | undefined): string {
  const year = (dateStart ?? '').slice(0, 4)
  return year && !name.includes(year) ? `${name} ${year}` : name
}

function uploadDateOf(m: Mix, fallbackYmd: string | null | undefined): string {
  if (m.published_at) return m.published_at
  if (fallbackYmd) return fallbackYmd.slice(0, 10)
  if (m.year) return `${m.year}-06-15`
  return m.created_at
}

/**
 * VideoObject (YouTube) o AudioObject (SoundCloud) de una sesión. Con evento,
 * `recordedAt` le dice a Google en qué edición se grabó.
 */
export function mixMediaJsonLd(
  m: Mix,
  opts: {
    lang: Locale
    pageUrl: string
    event?: { name: string; url: string; dateStart: string | null; city?: string | null; venue?: string | null } | null
  },
): Record<string, unknown> | null {
  const description = mixDescription(m, opts.lang) || m.title
  const thumb = mixThumbnailUrl(m)
  const recordedAt = opts.event
    ? {
        '@type': 'Event',
        name: opts.event.name,
        url: opts.event.url,
        ...(opts.event.dateStart ? { startDate: opts.event.dateStart } : {}),
        ...(opts.event.city || opts.event.venue
          ? {
              location: {
                '@type': 'Place',
                name: opts.event.venue || opts.event.city,
                ...(opts.event.city ? { address: { '@type': 'PostalAddress', addressLocality: opts.event.city } } : {}),
              },
            }
          : {}),
      }
    : null
  const common = {
    name: m.title,
    description,
    url: opts.pageUrl,
    uploadDate: uploadDateOf(m, opts.event?.dateStart),
    ...(thumb ? { thumbnailUrl: [thumb] } : {}),
    ...(m.duration_minutes ? { duration: `PT${Math.round(m.duration_minutes)}M` } : {}),
    ...(m.artist_name ? { creator: { '@type': 'Person', name: m.artist_name } } : {}),
    ...(recordedAt ? { recordedAt } : {}),
  }
  const yt = extractYouTubeId(m.video_url)
  if (yt) {
    return { '@type': 'VideoObject', ...common, embedUrl: `https://www.youtube.com/embed/${yt}` }
  }
  const sc = soundCloudUrl(m)
  if (sc) {
    return {
      '@type': 'AudioObject',
      ...common,
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(sc)}`,
    }
  }
  return null
}
