// ============================================
// OPTIMAL BREAKS — Agenda por ciudad y por mes
// ----------------------------------------------
// /[lang]/agenda/<ciudad>  → «Eventos breakbeat en Sevilla»
// /[lang]/agenda/<AAAA-MM> → «Agenda breakbeat octubre 2026»
//
// Se generan con los eventos reales de la BD. Para no publicar páginas
// pobres, solo existen (y solo van al sitemap) las que superan un mínimo de
// eventos: ver CITY_MIN_EVENTS / MONTH_MIN_EVENTS. Por debajo → 404.
// ============================================

import type { BreakEvent } from '@/types/database'
import { isUpcomingOrOngoing, todayYmdMadrid } from '@/lib/event-series'

/** Ciudad: mínimo de eventos en total, y al menos uno próximo o de los últimos 12 meses. */
export const CITY_MIN_EVENTS = 3
/** Mes: mínimo de eventos que empiezan o siguen en curso ese mes. */
export const MONTH_MIN_EVENTS = 3
/** Meses publicables: del actual a +MONTHS_AHEAD. Los pasados no (contenido caducado). */
export const MONTHS_AHEAD = 5

export type AgendaEvent = Pick<
  BreakEvent,
  | 'id'
  | 'slug'
  | 'name'
  | 'date_start'
  | 'date_end'
  | 'venue'
  | 'city'
  | 'country'
  | 'event_type'
  | 'image_url'
  | 'tags'
  | 'updated_at'
>

export const AGENDA_EVENT_COLUMNS =
  'id, slug, name, date_start, date_end, venue, city, country, event_type, image_url, tags, updated_at' as const

/** Variantes de nombre que son la misma ciudad (clave = slug normalizado). */
const CITY_ALIASES: Record<string, string> = {
  seville: 'sevilla',
  cordova: 'cordoba',
  cadis: 'cadiz',
  londres: 'london',
  'nueva-york': 'new-york',
  'new-york-city': 'new-york',
  nyc: 'new-york',
}

export function slugifyCity(city: string | null | undefined): string {
  const base = (city ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return CITY_ALIASES[base] ?? base
}

/** Nombre visible de una ciudad: la grafía más usada en la BD (con tildes). */
export function cityDisplayName(events: Pick<BreakEvent, 'city'>[]): string {
  const counts = new Map<string, number>()
  for (const e of events) {
    const c = (e.city ?? '').trim()
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  let best = ''
  let bestN = -1
  for (const [name, n] of Array.from(counts.entries())) {
    // A igualdad, preferir la grafía con tildes (Córdoba > Cordoba).
    const accentBonus = name !== name.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ? 0.5 : 0
    if (n + accentBonus > bestN) {
      best = name
      bestN = n + accentBonus
    }
  }
  return best
}

/** Ciudades andaluzas → enlazan a la escena /scenes/andalusian-breakbeat. */
const ANDALUSIAN_CITIES = new Set([
  'sevilla', 'malaga', 'cordoba', 'granada', 'cadiz', 'huelva', 'almeria', 'jaen',
  'jerez-de-la-frontera', 'marbella', 'conil-de-la-frontera', 'algeciras', 'torredonjimeno',
  'dos-hermanas', 'motril', 'antequera', 'ronda', 'estepona', 'torremolinos', 'lepe', 'matalascanas',
])

export function isAndalusianCity(citySlug: string): boolean {
  return ANDALUSIAN_CITIES.has(citySlug)
}

export type CityBucket = {
  slug: string
  name: string
  country: string
  events: AgendaEvent[]
  upcoming: AgendaEvent[]
  past: AgendaEvent[]
}

function monthsAgoYmd(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

/** Agrupa por ciudad y devuelve solo las publicables, ordenadas por nº de eventos. */
export function buildCityBuckets(events: AgendaEvent[]): CityBucket[] {
  const today = todayYmdMadrid()
  const recentCut = monthsAgoYmd(12)
  const byCity = new Map<string, AgendaEvent[]>()
  for (const e of events) {
    const slug = slugifyCity(e.city)
    if (!slug) continue
    const list = byCity.get(slug) ?? []
    list.push(e)
    byCity.set(slug, list)
  }
  const out: CityBucket[] = []
  for (const [slug, list] of Array.from(byCity.entries())) {
    if (list.length < CITY_MIN_EVENTS) continue
    const upcoming = list
      .filter((e) => isUpcomingOrOngoing(e, today))
      .sort((a, b) => String(a.date_start ?? '').localeCompare(String(b.date_start ?? '')))
    const past = list
      .filter((e) => !isUpcomingOrOngoing(e, today))
      .sort((a, b) => String(b.date_start ?? '').localeCompare(String(a.date_start ?? '')))
    const alive = upcoming.length > 0 || past.some((e) => (e.date_start ?? '') >= recentCut)
    if (!alive) continue
    const countryCounts = new Map<string, number>()
    for (const e of list) {
      const c = (e.country ?? '').trim()
      if (c) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1)
    }
    const country = Array.from(countryCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    out.push({ slug, name: cityDisplayName(list), country, events: list, upcoming, past })
  }
  return out.sort((a, b) => b.upcoming.length - a.upcoming.length || b.events.length - a.events.length)
}

export const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export function currentMonthKey(): string {
  return todayYmdMadrid().slice(0, 7)
}

function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Meses publicables (actual … +MONTHS_AHEAD). */
export function publishableMonthKeys(): string[] {
  const start = currentMonthKey()
  return Array.from({ length: MONTHS_AHEAD + 1 }, (_, i) => addMonths(start, i))
}

/** Eventos que empiezan ese mes o siguen en curso durante él. Sin cancelados fuera. */
export function eventsInMonth(events: AgendaEvent[], key: string): AgendaEvent[] {
  const first = `${key}-01`
  const next = `${addMonths(key, 1)}-01`
  return events
    .filter((e) => {
      const start = (e.date_start ?? '').slice(0, 10)
      if (!start) return false
      const end = (e.date_end ?? e.date_start ?? '').slice(0, 10)
      return start < next && end >= first
    })
    .sort((a, b) => String(a.date_start ?? '').localeCompare(String(b.date_start ?? '')))
}

export function monthLabel(key: string, lang: 'es' | 'en'): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 15))
  return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export type MonthBucket = { key: string; events: AgendaEvent[] }

export function buildMonthBuckets(events: AgendaEvent[]): MonthBucket[] {
  return publishableMonthKeys()
    .map((key) => ({ key, events: eventsInMonth(events, key) }))
    .filter((b) => b.events.length >= MONTH_MIN_EVENTS)
}

/** Fecha corta «3 oct 2026» / «3–5 oct 2026». */
export function shortDateRange(start: string | null, end: string | null, lang: 'es' | 'en'): string {
  if (!start) return lang === 'es' ? 'Por confirmar' : 'TBA'
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const fmt = (s: string) =>
    new Date(`${s.slice(0, 10)}T12:00:00`)
      .toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
      .replace('.', '')
  if (end && end.slice(0, 10) !== start.slice(0, 10)) return `${fmt(start)} — ${fmt(end)}`
  return fmt(start)
}

export function eventTypeShortLabel(type: string, lang: 'es' | 'en'): string {
  const map: Record<string, { es: string; en: string }> = {
    festival: { es: 'Festival', en: 'Festival' },
    club_night: { es: 'Club night', en: 'Club night' },
    past_iconic: { es: 'Histórico', en: 'Past iconic' },
    upcoming: { es: 'Próximo', en: 'Upcoming' },
  }
  return map[type]?.[lang] ?? type.replace(/_/g, ' ')
}

/** «Venue — Ciudad, País» sin huecos. */
export function eventLocationLabel(e: Pick<BreakEvent, 'venue' | 'city' | 'country'>): string {
  const place = [e.city, e.country].filter(Boolean).join(', ')
  return [e.venue, place].filter(Boolean).join(' — ') || '—'
}
