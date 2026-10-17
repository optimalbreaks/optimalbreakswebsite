// ============================================
// OPTIMAL BREAKS — Citas de un artículo de agenda
// Las noches se leen en vivo (caché 5 min del cliente público): un alta
// posterior entra en la ficha sin regenerar el texto.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { imageCacheVersion, versionedImageUrl } from '@/lib/image-url'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { eventLineupNames, eventNoticeKind, type Database } from '@/types/database'

export type AgendaNight = {
  slug: string
  name: string
  /** YYYY-MM-DD */
  date: string
  dateEnd: string | null
  place: string
  city: string
  country: string
  lineup: string[]
  postponed: boolean
  image: string | null
}

type EventRow = {
  id: string
  slug: string
  name: string
  date_start: string | null
  date_end: string | null
  city: string | null
  venue: string | null
  country: string | null
  location: string | null
  lineup: string[] | null
  stages: { lineup?: string[] | null }[] | null
  image_url: string | null
  tags: string[] | null
  updated_at: string | null
}

const SELECT =
  'id, slug, name, date_start, date_end, city, venue, country, location, lineup, stages, image_url, tags, updated_at'

function ymd(iso: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(iso || ''))
  return m ? m[1] : null
}

function addDays(day: string, days: number): string {
  const dt = new Date(`${day}T12:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function placeOf(row: EventRow): string {
  const parts = [row.venue, row.city, row.country].map((s) => String(s || '').trim()).filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  if (out.length) return out.join(' · ')
  return String(row.location || '').trim()
}

function toNight(row: EventRow): AgendaNight | null {
  if (eventNoticeKind(row) === 'cancelled') return null
  const date = ymd(row.date_start)
  if (!date || !row.slug || !row.name) return null
  const dateEnd = ymd(row.date_end)
  return {
    slug: row.slug,
    name: row.name,
    date,
    dateEnd: dateEnd && dateEnd !== date ? dateEnd : null,
    place: placeOf(row),
    city: String(row.city || '').trim(),
    country: String(row.country || '').trim(),
    lineup: eventLineupNames(row),
    postponed: eventNoticeKind(row) === 'postponed',
    image: versionedImageUrl(row.image_url, imageCacheVersion(row.updated_at)),
  }
}

/** Hoy inclusive hasta `until`. Sin cancelados. También una noche ya empezada cuyo fin cae dentro. */
export async function loadAgendaNights(
  supabase: SupabaseClient<Database>,
  from: string,
  until: string,
): Promise<AgendaNight[]> {
  const next = addDays(until, 1)
  const [starting, running] = await Promise.all([
    fetchAllPages<EventRow>((a, b) =>
      supabase.from('events').select(SELECT).gte('date_start', from).lt('date_start', next).order('id').range(a, b),
    ),
    fetchAllPages<EventRow>((a, b) =>
      supabase.from('events').select(SELECT).lt('date_start', from).gte('date_end', from).order('id').range(a, b),
    ),
  ])
  const byId = new Map<string, EventRow>()
  for (const row of [...starting, ...running]) byId.set(row.id, row)
  const nights: AgendaNight[] = []
  for (const row of byId.values()) {
    const night = toNight(row)
    if (!night) continue
    const end = night.dateEnd || night.date
    if (end < from || night.date > until) continue
    nights.push(night)
  }
  nights.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'es'))
  return nights
}
