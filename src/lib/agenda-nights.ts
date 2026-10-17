// ============================================
// OPTIMAL BREAKS — Citas de un artículo de agenda
// Las noches se leen en vivo (caché 5 min del cliente público): un alta
// posterior entra en la ficha sin regenerar el texto.
// ============================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { displayArtistImageUrl } from '@/lib/artist-public-portrait'
import { buildFullArtistSlugMap, normalizeArtistKey } from '@/lib/artist-slug-map'
import { getCommunityArtistBoard } from '@/lib/community-top-artists'
import { imageCacheVersion, versionedImageUrl } from '@/lib/image-url'
import { normalizePlace, provinceAt, provinceFromText } from '@/lib/spain-map'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { eventLineupNames, eventNoticeKind, type Database } from '@/types/database'

/** Mismo corte que el tablero de artistas de /top100. */
const TOP_ARTISTS = 50

export type AgendaStar = { rank: number; name: string; slug: string | null; image: string | null }

export type AgendaNight = {
  slug: string
  name: string
  /** YYYY-MM-DD */
  date: string
  dateEnd: string | null
  place: string
  venue: string
  city: string
  country: string
  lineup: string[]
  postponed: boolean
  image: string | null
  festival: boolean
  vinyl: boolean
  coords: { lat: number; lng: number } | null
  /** Provincia española; null si es fuera de España o no se sabe. */
  province: string | null
  abroad: boolean
  /** Artistas del Top 100 en el cartel, por puesto. */
  stars: AgendaStar[]
  /** Línea del cartel → mejor puesto del Top 100 que contiene. */
  starEntries: Record<string, number>
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
  event_type: string | null
  coords: { lat?: unknown; lng?: unknown } | null
  updated_at: string | null
}

const SELECT =
  'id, slug, name, date_start, date_end, city, venue, country, location, lineup, stages, image_url, tags, event_type, coords, updated_at'

const SPAIN = new Set(['spain', 'espana', 'es', 'esp'])

/** Clave de `digest.places` (la rellena el generador al geocodificar). */
export function agendaPlaceKey(city: string, country: string): string {
  return `${normalizePlace(city)}|${normalizePlace(country)}`
}

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

function coordsOf(raw: EventRow['coords']): { lat: number; lng: number } | null {
  const lat = Number(raw?.lat)
  const lng = Number(raw?.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null
}

function toNight(row: EventRow, places: Record<string, { lat: number; lng: number }>): AgendaNight | null {
  if (eventNoticeKind(row) === 'cancelled') return null
  const date = ymd(row.date_start)
  if (!date || !row.slug || !row.name) return null
  const dateEnd = ymd(row.date_end)
  const city = String(row.city || '').trim()
  const country = String(row.country || '').trim()
  const coords = coordsOf(row.coords) ?? places[agendaPlaceKey(city, country)] ?? null
  const abroad = !!country && !SPAIN.has(normalizePlace(country))
  const province = abroad
    ? null
    : (coords ? provinceAt(coords.lat, coords.lng) : null) ?? provinceFromText(city, row.location)
  return {
    slug: row.slug,
    name: row.name,
    date,
    dateEnd: dateEnd && dateEnd !== date ? dateEnd : null,
    place: placeOf(row),
    venue: String(row.venue || '').trim(),
    city,
    country,
    lineup: eventLineupNames(row),
    postponed: eventNoticeKind(row) === 'postponed',
    image: versionedImageUrl(row.image_url, imageCacheVersion(row.updated_at)),
    festival: row.event_type === 'festival',
    vinyl: (row.tags || []).some((t) => /vinyl|vinilo/i.test(t)) || /vinyl|vinilo/i.test(row.name),
    coords,
    province,
    abroad,
    stars: [],
    starEntries: {},
  }
}

/** Nombres sueltos de una línea de cartel: «Mbreaks vs Bowser», «Bad Legs & Seekflow ft. JTT». */
export function lineupArtistKeys(entry: string): { key: string; label: string }[] {
  const clean = entry.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = clean.split(/\s+(?:vs\.?|b2b|&|x|and|y|ft\.?|feat\.?|featuring)\s+|,|\//i)
  const out = new Map<string, string>()
  for (const label of [clean, ...parts]) {
    const key = normalizeArtistKey(label)
    if (key && !out.has(key)) out.set(key, label.trim())
  }
  return Array.from(out, ([key, label]) => ({ key, label }))
}

/** Hoy inclusive hasta `until`. Sin cancelados. También una noche ya empezada cuyo fin cae dentro. */
export async function loadAgendaNights(
  supabase: SupabaseClient<Database>,
  from: string,
  until: string,
  places: Record<string, { lat: number; lng: number }> = {},
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
    const night = toNight(row, places)
    if (!night) continue
    const end = night.dateEnd || night.date
    if (end < from || night.date > until) continue
    nights.push(night)
  }
  nights.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'es'))
  if (nights.length) await attachStars(supabase, nights)
  return nights
}

/** Orden de los destacados: más artistas del Top 100, mejor puesto, cartel más largo. */
export function compareAgendaHighlights(a: AgendaNight, b: AgendaNight): number {
  return (
    b.stars.length - a.stars.length ||
    (a.stars[0]?.rank ?? 999) - (b.stars[0]?.rank ?? 999) ||
    b.lineup.length - a.lineup.length ||
    a.date.localeCompare(b.date)
  )
}

/** Cartel de portada / OG del artículo: el de la noche destacada nº 1. */
export function agendaCoverImage(nights: AgendaNight[]): string | null {
  return [...nights].sort(compareAgendaHighlights).find((n) => n.image)?.image ?? null
}

type ArtistRow = { slug: string; name: string | null; name_display: string | null; image_url: string | null }

/** Puesto en el tablero de artistas de /top100 (mismos saltos de auto-voto). */
async function attachStars(supabase: SupabaseClient<Database>, nights: AgendaNight[]) {
  const board = await getCommunityArtistBoard()
  const ranked = Object.entries(board)
    .sort(
      (a, b) =>
        b[1].saves - a[1].saves || b[1].fans - a[1].fans || b[1].tracks - a[1].tracks || a[0].localeCompare(b[0]),
    )
    .slice(0, TOP_ARTISTS)
  if (!ranked.length) return
  const rankByKey = new Map(ranked.map(([key], i) => [key, i + 1]))

  let artists: ArtistRow[] = []
  try {
    artists = await fetchAllPages<ArtistRow>((a, b) =>
      supabase.from('artists').select('slug, name, name_display, image_url').order('slug').range(a, b),
    )
  } catch (err) {
    console.warn('[agenda-stars]', err instanceof Error ? err.message : err)
  }
  const slugMap = buildFullArtistSlugMap(artists)
  const bySlug = new Map(artists.map((r) => [r.slug, r]))

  for (const night of nights) {
    const seen = new Map<number, AgendaStar>()
    for (const entry of night.lineup) {
      for (const { key, label } of lineupArtistKeys(entry)) {
        const rank = rankByKey.get(key)
        if (!rank) continue
        night.starEntries[entry] = Math.min(night.starEntries[entry] ?? rank, rank)
        if (seen.has(rank)) continue
        const slug = slugMap[key] ?? slugMap[key.startsWith('the ') ? key.slice(4) : `the ${key}`] ?? null
        const row = slug ? bySlug.get(slug) : undefined
        seen.set(rank, {
          rank,
          name: row?.name_display || row?.name || label,
          slug,
          image: displayArtistImageUrl(slug, row?.image_url) ?? null,
        })
      }
    }
    night.stars = Array.from(seen.values()).sort((a, b) => a.rank - b.rank)
  }
}
