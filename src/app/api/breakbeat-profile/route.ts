import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database, SavedChartTrackSnapshot, BreakbeatProfileStats, BreakbeatProfileBehavior, BreakbeatListeningCadence } from '@/types/database'
import { artistEraToReferenceYear, normalizeArtistEraToDecade } from '@/lib/breakbeat-profile-era'
import { createServiceSupabase, fetchAllRows, selectByIds } from '@/lib/supabase-admin'

// =============================================
// POST /api/breakbeat-profile
// Generates the user's breakbeat DNA profile
// =============================================

// Los modelos "reasoning" (gpt-5, o1, o3) tardan 20-40s en responder y aquí
// lanzamos DOS llamadas en paralelo (ES y EN). El tiempo total es max(ES,EN)
// pero con margen de cola puede acercarse a 50s. Ampliamos el timeout a 60s
// para evitar que Vercel corte la función antes de que respondan.
export const maxDuration = 60

// Permite overridear el modelo del ADN breakbeatero con una env var específica
// (OPENAI_MODEL_PROFILE) sin afectar al resto de agentes. Si falla por modelo
// inexistente/forbidden, reintentamos con OPENAI_MODEL_PROFILE_FALLBACK (por
// defecto gpt-4o) antes de caer al texto determinista de reglas.
const OPENAI_MODEL_PRIMARY =
  process.env.OPENAI_MODEL_PROFILE?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  'gpt-5.6-terra'
const OPENAI_MODEL_FALLBACK =
  process.env.OPENAI_MODEL_PROFILE_FALLBACK?.trim() || 'gpt-4o'

type ArtistProfileInput = {
  name: string
  styles: string[]
  country: string
  era: string
  category: string
  essential_tracks: string[]
  recommended_mixes: string[]
  key_releases: { title: string; year?: number | null; note?: string }[]
}

type LabelProfileInput = {
  name: string
  country: string
  founded_year: number | null
  is_active: boolean
  key_artists: string[]
  key_releases: string[]
}

type EventProfileInput = {
  id: string
  name: string
  event_type: string
  country: string
  city: string
  venue: string | null
  lineup: string[]
  date_start: string | null
  tags: string[]
}

type MixProfileInput = {
  title: string
  artist_name: string
  mix_type: string
  year: number | null
  platform?: string | null
  duration_minutes?: number | null
}

type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'

/**
 * Track guardado por el usuario en "Mis Tracks". Unificamos las cuatro fuentes
 * (40 Breaks, New Releases, vinilo retro y Top 10 Beatport de ficha) para que
 * el ADN no trate el «+» de charts como si fuera toda la caja.
 */
type ChartTrackProfileInput = {
  source: ChartTrackSource
  title: string
  mix_name: string
  artist_names: string[]
  label: string
  year: number | null
  bpm: number | null
  created_at: string | null
}

type SavedTrackRow = {
  track_source: ChartTrackSource
  track_id: string
  canonical_url: string | null
  snapshot: SavedChartTrackSnapshot | null
  created_at: string | null
}

async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch { /* server component limitation */ }
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  return { user, supabase }
}

function hashInputs(ids: string[]): string {
  const sorted = [...ids].sort().join(',')
  let h = 0
  for (let i = 0; i < sorted.length; i++) {
    h = ((h << 5) - h + sorted.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

function artistsToNames(raw: unknown): string[] {
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (!Array.isArray(raw)) return []
  return raw
    .map((a) => {
      if (!a) return ''
      if (typeof a === 'string') return a
      if (typeof a === 'object' && a && 'name' in (a as object)) return String((a as { name?: unknown }).name || '')
      return ''
    })
    .map((s) => s.trim())
    .filter(Boolean)
}

function yearFromRelease(year: number | null | undefined, releaseDate?: string | null): number | null {
  if (year != null && Number.isFinite(year) && year > 0) return year
  if (releaseDate && /^\d{4}/.test(releaseDate)) return parseInt(releaseDate.slice(0, 4), 10)
  return null
}

function trackFromSnapshot(
  source: ChartTrackSource,
  snap: SavedChartTrackSnapshot | Record<string, unknown> | null | undefined,
  createdAt: string | null,
): ChartTrackProfileInput | null {
  if (!snap || typeof snap !== 'object') return null
  const title = String((snap as SavedChartTrackSnapshot).title || '').trim()
  const artistNames = artistsToNames((snap as SavedChartTrackSnapshot).artists)
  if (!title && artistNames.length === 0) return null
  const year = yearFromRelease(
    (snap as SavedChartTrackSnapshot).year ?? null,
    (snap as SavedChartTrackSnapshot).release_date ?? null,
  )
  return {
    source,
    title,
    mix_name: String((snap as SavedChartTrackSnapshot).mix_name || ''),
    artist_names: artistNames,
    label: String((snap as SavedChartTrackSnapshot).label || ''),
    year,
    bpm: (snap as SavedChartTrackSnapshot).bpm ?? null,
    created_at: createdAt,
  }
}

/** Muestra para el prompt: recientes primero, mezclando fuentes (no las 10 primeras del Top 40). */
function pickSampleSavedTrackLines(tracks: ChartTrackProfileInput[], limit = 24): string[] {
  const sorted = [...tracks].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const buckets: Record<ChartTrackSource, ChartTrackProfileInput[]> = {
    featured: [],
    chart: [],
    vinyl: [],
    beatport_top: [],
  }
  for (const t of sorted) buckets[t.source].push(t)

  const out: string[] = []
  const seen = new Set<string>()
  const sources: ChartTrackSource[] = ['featured', 'chart', 'vinyl', 'beatport_top']
  for (let i = 0; out.length < limit; i++) {
    let added = false
    for (const src of sources) {
      const t = buckets[src][i]
      if (!t) continue
      const line = chartTrackContextLine(t, 'es')
      const key = line.replace(/\s*\[[^\]]+\]\s*$/, '').trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(line)
      added = true
      if (out.length >= limit) break
    }
    if (!added) break
  }
  return out
}

function takeUniqueNonEmpty(values: Array<string | null | undefined>, limit = 5): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = String(value || '').trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
    if (out.length >= limit) break
  }
  return out
}

function inferSceneHints(args: {
  topStyles: { name: string; count: number; pct: number }[]
  topCountries: { name: string; count: number; pct: number }[]
  eraDistribution: Record<string, number>
  categoryBreakdown: Record<string, number>
}): string[] {
  const styles = new Set(args.topStyles.map((s) => s.name))
  const countries = new Set(args.topCountries.map((c) => c.name))
  const eras = new Set(Object.keys(args.eraDistribution))
  const hints: string[] = []

  const push = (hint: string) => {
    if (!hints.includes(hint)) hints.push(hint)
  }

  if (countries.has('UK')) {
    if (
      styles.has('nu_skool') ||
      styles.has('big_beat') ||
      styles.has('bassline') ||
      styles.has('progressive_breaks') ||
      styles.has('acid_breaks')
    ) {
      push('continuo británico de rave y breakbeat de club entre los 90 y los 2000')
    }
    if (styles.has('uk_garage') || styles.has('bass')) {
      push('eje UK garage, bass music y cultura soundsystem británica')
    }
  }

  if (countries.has('ES') || (args.categoryBreakdown.andalusian || 0) > 0) {
    push('escena andaluza de breaks y su circuito Cádiz-Sevilla/club-radio-coche')
  }

  if (countries.has('US')) {
    if (styles.has('florida_breaks')) {
      push('tradición Florida breaks y su lectura más de pista')
    }
    if (styles.has('electro') || eras.has('1980s')) {
      push('raíces electro, hip-hop temprano y primeras culturas del break en Nueva York')
    }
  }

  if (countries.has('AU')) {
    push('rama australiana del breakbeat de club y sus cruces con bass music')
  }

  if (styles.has('big_beat')) {
    push('big beat y cruce entre cultura de club, rock sampleado y breaks de finales de los 90')
  }

  if (styles.has('nu_skool')) {
    push('nu skool breaks como reformulación moderna del breakbeat clásico')
  }

  return hints.slice(0, 3)
}

/** Claves internas de `mix_type` → lenguaje natural (nunca mostrar snake_case al usuario). */
function formatMixTypeForPrompt(mixType: string, lang: 'es' | 'en'): string {
  const t = (mixType || 'unknown').trim().toLowerCase()
  const map: Record<string, { es: string; en: string }> = {
    essential_mix: { es: 'mix esencial (p. ej. Essential Mix u obra similar)', en: 'essential-style mix (e.g. Essential Mix or similar)' },
    classic_set: { es: 'set clásico de club o pista', en: 'classic club-floor set' },
    radio_show: { es: 'programa o episodio de radio', en: 'radio show or episode' },
    youtube_session: { es: 'sesión larga en vídeo (grabada, no el nombre de una plataforma)', en: 'long recorded video session (describe the format, not the brand)' },
    podcast: { es: 'podcast o mix en formato podcast', en: 'podcast or podcast-format mix' },
    unknown: { es: 'mix sin tipo definido', en: 'unspecified mix type' },
  }
  const row = map[t] || { es: 'otro formato de sesión', en: 'another session format' }
  return lang === 'es' ? row.es : row.en
}

function mixTasteForDataBlock(stats: BreakbeatProfileStats, lang: 'es' | 'en'): string {
  return Object.entries(stats.mix_taste)
    .sort(([, a], [, b]) => b - a)
    .map(([type, n]) => `${formatMixTypeForPrompt(type, lang)}: ${n}`)
    .join(', ')
}

/**
 * Etiqueta natural por fuente de track guardada.
 * Nada de `chart_featured_tracks` visible al usuario: se traduce siempre.
 */
function formatChartTrackSource(source: ChartTrackProfileInput['source'], lang: 'es' | 'en'): string {
  const map: Record<ChartTrackProfileInput['source'], { es: string; en: string }> = {
    chart: { es: 'top semanal', en: 'weekly top' },
    featured: { es: 'new release', en: 'new release' },
    vinyl: { es: 'vinilo retro', en: 'retro vinyl' },
    beatport_top: { es: 'top beatport de ficha', en: 'profile Beatport top' },
  }
  const row = map[source] || { es: 'track guardado', en: 'saved track' }
  return lang === 'es' ? row.es : row.en
}

/**
 * Línea compacta de track para el prompt:
 *   "DJ Icey — Escape (1997) [vinilo retro]"
 * Evita duplicar el artista cuando el título ya lo incluye.
 */
function chartTrackContextLine(t: ChartTrackProfileInput, lang: 'es' | 'en'): string {
  const title = [t.title, t.mix_name].filter(Boolean).join(' — ')
  const artistStr = t.artist_names.filter(Boolean).join(', ')
  const year = t.year != null ? ` (${t.year})` : ''
  const sourceLabel = ` [${formatChartTrackSource(t.source, lang)}]`
  const label = t.label ? `, ${t.label}` : ''
  if (artistStr && title) {
    const tl = title.toLowerCase()
    const al = artistStr.toLowerCase()
    if (tl === al || tl.startsWith(`${al} —`) || tl.startsWith(`${al} -`)) {
      return `${title}${year}${label}${sourceLabel}`
    }
    return `${artistStr} — ${title}${year}${label}${sourceLabel}`
  }
  return `${artistStr || title}${year}${label}${sourceLabel}`
}

function mixContextLine(m: MixProfileInput): string {
  const artist = (m.artist_name || '').trim()
  let title = (m.title || '').trim()
  const y = m.year != null ? String(m.year) : ''
  if (artist && title) {
    const al = artist.toLowerCase()
    const tl = title.toLowerCase()
    if (tl === al || tl.startsWith(`${al} —`) || tl.startsWith(`${al} -`) || tl.startsWith(`${al}–`)) {
      // Título ya lleva el artista; evita "Artista — Artista — …"
    } else {
      title = `${artist} — ${title}`
    }
  } else if (!title) {
    title = artist
  }
  return [title, y].filter(Boolean).join(' — ')
}

/**
 * Mínimos para considerar que la respuesta del LLM es suficientemente sustantiva
 * (si no lo es, caemos al fallback determinista). Se relaja respecto del valor
 * previo (3200 chars / 8 párrafos) porque estaba descartando respuestas
 * razonables (p. ej. 6-7 párrafos densos en 3000 chars) y metiendo al usuario
 * en la plantilla de reglas.
 */
function isStrongEnoughAnalysis(text: string): boolean {
  const normalized = text.trim()
  if (normalized.length < 2400) return false
  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean)
  return paragraphs.length >= 6
}

function formatYearLabel(date: string | null | undefined): string {
  if (!date) return ''
  const year = date.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : ''
}

/**
 * Formatea un release para consumo tanto del prompt como del fallback.
 *
 * Antes: "Title (Year), nota que se continúa en otro release, Title2 (Year2)…"
 * El note se pegaba con coma, y luego los releases se unían con coma también,
 * lo que provocaba que el texto visible aplanara título + nota + siguiente
 * título en una sola frase ilegible. Ahora usamos ` · ` para separar el note,
 * de modo que las comas externas (join) no se confundan con las internas.
 */
function formatArtistRelease(release: { title: string; year?: number | null; note?: string } | null | undefined): string {
  if (!release?.title) return ''
  const year = release.year ? ` (${release.year})` : ''
  const note = release.note ? ` · ${release.note}` : ''
  return `${release.title}${year}${note}`
}

/**
 * Quita los marcadores de fuente (`[top semanal]`, `[new release]`, `[vinilo
 * retro]` y sus equivalentes en inglés) de las líneas de track para mostrarlas
 * en texto final al usuario. Los marcadores se mantienen para el prompt del
 * LLM porque le aportan contexto, pero nunca deberían aparecer en el texto
 * que ve el usuario.
 */
function stripTrackSourceTag(line: string): string {
  return line
    .replace(/\s*\[(top semanal|new release|vinilo retro|weekly top|retro vinyl|top beatport de ficha|profile Beatport top|saved track|track guardado)\]\s*$/i, '')
    .trim()
}

function topPctEntries(obj: Record<string, number>, limit: number): Array<{ name: string; pct: number }> {
  return Object.entries(obj)
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, pct]) => ({ name, pct }))
}

function topYearEntries(obj: Record<string, number> | undefined, limit: number): Array<{ year: string; pct: number }> {
  return Object.entries(obj || {})
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([year, pct]) => ({ year, pct }))
}

function pctLabel(pct: number): string {
  return `${Math.round(pct * 100)}%`
}

const DAY_MS = 86_400_000

function normCredit(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function countSince(stamps: Array<string | null | undefined>, days: number, now: number): number {
  const cut = now - days * DAY_MS
  let n = 0
  for (const stamp of stamps) {
    const t = stamp ? Date.parse(stamp) : NaN
    if (Number.isFinite(t) && t >= cut) n++
  }
  return n
}

function activeDays(stamps: number[], since: number): number {
  const days = new Set<string>()
  for (const t of stamps) {
    if (t >= since) days.add(new Date(t).toISOString().slice(0, 10))
  }
  return days.size
}

function styleLabel(name: string): string {
  return name.replace(/_/g, ' ')
}

function topStyleLine(styles: { name: string; pct?: number }[], limit = 3): string {
  return styles.slice(0, limit).map((s) => styleLabel(s.name)).join(', ')
}

type CatalogTasteRow = {
  name: string
  name_display: string | null
  styles: string[] | null
  country: string | null
}

function crateStylesFromTracks(
  tracks: ChartTrackProfileInput[],
  catalog: CatalogTasteRow[],
): { name: string; count: number; pct: number }[] {
  const byCredit = new Map<string, { styles: string[] }>()
  for (const row of catalog) {
    const taste = { styles: row.styles || [] }
    for (const raw of [row.name, row.name_display]) {
      const key = normCredit(raw)
      if (key && !byCredit.has(key)) byCredit.set(key, taste)
    }
  }
  const counts: Record<string, number> = {}
  for (const track of tracks) {
    const seen = new Set<string>()
    for (const credit of track.artist_names) {
      const taste = byCredit.get(normCredit(credit))
      if (!taste) continue
      for (const style of taste.styles) {
        if (!style || seen.has(style)) continue
        seen.add(style)
        counts[style] = (counts[style] || 0) + 1
      }
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) / 100 }))
}

function crateCountriesFromTracks(
  tracks: ChartTrackProfileInput[],
  catalog: CatalogTasteRow[],
): { name: string; count: number; pct: number }[] {
  const countryByCredit = new Map<string, string>()
  for (const row of catalog) {
    const country = (row.country || '').trim()
    if (!country) continue
    for (const raw of [row.name, row.name_display]) {
      const key = normCredit(raw)
      if (key && !countryByCredit.has(key)) countryByCredit.set(key, country)
    }
  }
  const counts: Record<string, number> = {}
  for (const track of tracks) {
    const seen = new Set<string>()
    for (const credit of track.artist_names) {
      const country = countryByCredit.get(normCredit(credit))
      if (!country || seen.has(country)) continue
      seen.add(country)
      counts[country] = (counts[country] || 0) + 1
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) / 100 }))
}

function listeningCadence(
  playTimes: number[],
  now: number,
): BreakbeatListeningCadence {
  if (playTimes.length === 0) return 'none'
  const last = playTimes[playTimes.length - 1]
  if (now - last > 60 * DAY_MS) return 'dormant'
  const days90 = activeDays(playTimes, now - 90 * DAY_MS)
  const days30 = activeDays(playTimes, now - 30 * DAY_MS)
  const plays30 = playTimes.filter((t) => t >= now - 30 * DAY_MS).length
  if (days90 >= 12 || (plays30 >= 8 && days30 >= 4)) return 'habitual'
  if (days90 >= 4) return 'regular'
  return 'occasional'
}

type AttendanceStatus = 'wishlist' | 'attending' | 'attended'

function buildBehavior(args: {
  favoriteArtists: number
  favoriteLabels: number
  favoriteEvents: number
  savedMixes: number
  tracks: ChartTrackProfileInput[]
  events: EventProfileInput[]
  attendance: { event_id: string; status: AttendanceStatus }[]
  sightings: { name: string; event_name: string; city: string }[]
  catalog: CatalogTasteRow[]
  trackPlayStamps: string[]
  mixPlayStamps: string[]
  playsReadable: boolean
  favoriteStyles: { name: string }[]
  now?: number
}): BreakbeatProfileBehavior {
  const now = args.now ?? Date.now()
  const saveStamps = args.tracks.map((t) => t.created_at)
  const saveTimes = saveStamps
    .map((s) => (s ? Date.parse(s) : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  const saves30 = countSince(saveStamps, 30, now)
  const saves90 = countSince(saveStamps, 90, now)

  const byEvent = new Map(args.events.map((e) => [e.id, e]))
  const bucket = {
    festivals_attended: [] as string[],
    festivals_going: [] as string[],
    festivals_wishlist: [] as string[],
    club_attended: [] as string[],
    club_going: [] as string[],
    club_wishlist: [] as string[],
  }
  for (const row of args.attendance) {
    const ev = byEvent.get(row.event_id)
    const name = ev?.name || ''
    const fest = ev?.event_type === 'festival'
    const club = ev?.event_type === 'club_night'
    if (row.status === 'attended') {
      if (fest) bucket.festivals_attended.push(name)
      else if (club) bucket.club_attended.push(name)
    } else if (row.status === 'attending') {
      if (fest) bucket.festivals_going.push(name)
      else if (club) bucket.club_going.push(name)
    } else if (row.status === 'wishlist') {
      if (fest) bucket.festivals_wishlist.push(name)
      else if (club) bucket.club_wishlist.push(name)
    }
  }

  const crateStyles = crateStylesFromTracks(args.tracks, args.catalog)
  const crateCountries = crateCountriesFromTracks(args.tracks, args.catalog)
  const trackTimes = args.trackPlayStamps.map((s) => Date.parse(s)).filter((t) => Number.isFinite(t))
  const mixTimes = args.mixPlayStamps.map((s) => Date.parse(s)).filter((t) => Number.isFinite(t))
  const playTimes = [...trackTimes, ...mixTimes].sort((a, b) => a - b)
  const cadence: BreakbeatListeningCadence = args.playsReadable ? listeningCadence(playTimes, now) : 'unknown'
  const lastPlay = playTimes.length ? new Date(playTimes[playTimes.length - 1]).toISOString() : null
  const plays30 = playTimes.filter((t) => t >= now - 30 * DAY_MS).length
  const plays90 = playTimes.filter((t) => t >= now - 90 * DAY_MS).length
  const days90 = activeDays(playTimes, now - 90 * DAY_MS)

  const named = (names: string[]) => {
    const line = takeUniqueNonEmpty(names, 4).join(', ')
    return line ? ` (${line})` : ''
  }
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

  const favEs = args.favoriteArtists + args.favoriteLabels + args.savedMixes + args.favoriteEvents === 0
    ? 'No tienes favoritos declarados. El canon no sale de fichas marcadas.'
    : `Has marcado ${n(args.favoriteArtists, 'artista', 'artistas')}, ${n(args.favoriteLabels, 'sello', 'sellos')} y ${n(args.savedMixes, 'mix', 'mixes')} como favoritos${args.favoriteEvents ? `, más ${n(args.favoriteEvents, 'evento', 'eventos')} en favoritos` : ''}. Eso es el canon que declaras.`
  const favEn = args.favoriteArtists + args.favoriteLabels + args.savedMixes + args.favoriteEvents === 0
    ? 'You have no declared favourites. The canon does not come from starred fichas.'
    : `You have starred ${n(args.favoriteArtists, 'artist', 'artists')}, ${n(args.favoriteLabels, 'label', 'labels')} and ${n(args.savedMixes, 'mix', 'mixes')}${args.favoriteEvents ? `, plus ${n(args.favoriteEvents, 'event', 'events')} saved as favourites` : ''}. That is the canon you declare.`

  const saved = args.tracks.length
  const favTop = args.favoriteStyles[0]?.name || ''
  const crateTop = crateStyles[0]?.name || ''
  let crateEs: string
  let crateEn: string
  if (saved === 0) {
    crateEs = 'No tienes temas en Mis Tracks. El gusto musical declarado sale de los favoritos, no de un cajón.'
    crateEn = 'You have no tracks in My Tracks. Declared taste comes from favourites, not from a crate.'
  } else {
    const depthEs = saved <= 8 ? 'cajón corto' : saved <= 40 ? 'cajón ya formado' : 'cajón profundo'
    const depthEn = saved <= 8 ? 'a short crate' : saved <= 40 ? 'a formed crate' : 'a deep crate'
    const lastSave = saveTimes.length ? saveTimes[saveTimes.length - 1] : null
    const quiet = lastSave != null && now - lastSave > 90 * DAY_MS
    const rhythmEs = quiet
      ? ' La última vez que guardaste fue hace más de tres meses: el cajón está quieto.'
      : saves30 >= 5
        ? ` En los últimos 30 días has guardado ${saves30}: el cajón sigue creciendo.`
        : saves90 > 0
          ? ` En 90 días has guardado ${saves90}.`
          : ''
    const rhythmEn = quiet
      ? ' The last save was more than three months ago: the crate is quiet.'
      : saves30 >= 5
        ? ` In the last 30 days you saved ${saves30}: the crate is still growing.`
        : saves90 > 0
          ? ` In 90 days you saved ${saves90}.`
          : ''
    let alignEs = ''
    let alignEn = ''
    if (crateTop && favTop && crateTop !== favTop) {
      alignEs = ` Los favoritos abren por ${styleLabel(favTop)} y el cajón por ${styleLabel(crateTop)}: no es el mismo centro.`
      alignEn = ` Favourites open on ${styleLabel(favTop)} and the crate on ${styleLabel(crateTop)}: not the same centre.`
    } else if (crateTop && favTop) {
      alignEs = ` Favoritos y cajón coinciden en ${styleLabel(crateTop)}.`
      alignEn = ` Favourites and the crate meet on ${styleLabel(crateTop)}.`
    } else if (!crateTop) {
      alignEs = ' Los créditos del cajón no cruzan con fichas del catálogo, así que el subgénero sigue saliendo de los artistas favoritos.'
      alignEn = ' Crate credits do not match catalogue fichas, so subgenre still comes from favourite artists.'
    }
    const weighEs = crateStyles.length > 1 ? ` En el cajón pesan ${topStyleLine(crateStyles)}.` : ''
    const weighEn = crateStyles.length > 1 ? ` In the crate the weight sits on ${topStyleLine(crateStyles)}.` : ''
    const countryLine = crateCountries.slice(0, 3).map((c) => c.name).join(', ')
    const geoEs = countryLine ? ` Los países que más salen en esos temas son ${countryLine}.` : ''
    const geoEn = countryLine ? ` The countries that come up most in those tracks are ${countryLine}.` : ''
    crateEs = `Tienes ${saved} temas guardados: ${depthEs}.${rhythmEs}${alignEs}${weighEs}${geoEs}`
    crateEn = `You have ${saved} saved tracks: ${depthEn}.${rhythmEn}${alignEn}${weighEn}${geoEn}`
  }

  const noLive = bucket.festivals_attended.length + bucket.festivals_going.length + bucket.festivals_wishlist.length
    + bucket.club_attended.length + bucket.club_going.length + args.sightings.length === 0
  let liveEs: string
  let liveEn: string
  if (noLive) {
    liveEs = 'No marcas asistencia a festivales ni a clubes, y no tienes vistos en vivo. El perfil es de escucha en casa. Guardar un evento en favoritos no cuenta como haber ido.'
    liveEn = 'You mark no festival or club attendance, and no seen-live artists. The profile is a home listener. Saving an event as a favourite is not the same as having been there.'
  } else {
    const bitsEs: string[] = []
    const bitsEn: string[] = []
    if (bucket.festivals_attended.length) {
      bitsEs.push(`Has asistido a ${n(bucket.festivals_attended.length, 'festival', 'festivales')}${named(bucket.festivals_attended)}.`)
      bitsEn.push(`You have attended ${n(bucket.festivals_attended.length, 'festival', 'festivals')}${named(bucket.festivals_attended)}.`)
    } else {
      bitsEs.push('No has marcado ningún festival como asistido.')
      bitsEn.push('You have not marked any festival as attended.')
    }
    if (bucket.festivals_going.length) {
      bitsEs.push(`Tienes ${n(bucket.festivals_going.length, 'festival', 'festivales')} en «voy a ir»${named(bucket.festivals_going)}: intención, todavía no asistencia.`)
      bitsEn.push(`You have ${n(bucket.festivals_going.length, 'festival', 'festivals')} set to going${named(bucket.festivals_going)}: intent, not attendance yet.`)
    } else if (bucket.festivals_wishlist.length && !bucket.festivals_attended.length) {
      bitsEs.push(`Hay ${n(bucket.festivals_wishlist.length, 'festival', 'festivales')} en «quiero ir»${named(bucket.festivals_wishlist)}, sin asistencia marcada.`)
      bitsEn.push(`${n(bucket.festivals_wishlist.length, 'festival is', 'festivals are')} on the wishlist${named(bucket.festivals_wishlist)}, with no attendance marked.`)
    }
    if (bucket.club_attended.length) {
      bitsEs.push(`En clubes sí consta asistencia: ${n(bucket.club_attended.length, 'noche', 'noches')}${named(bucket.club_attended)}.`)
      bitsEn.push(`Club attendance is on record: ${n(bucket.club_attended.length, 'night', 'nights')}${named(bucket.club_attended)}.`)
    }
    if (args.sightings.length) {
      const seen = takeUniqueNonEmpty(args.sightings.map((s) => {
        const where = [s.event_name, s.city].filter(Boolean).join(', ')
        return where ? `${s.name} (${where})` : s.name
      }), 4).join(', ')
      bitsEs.push(`Vistos en vivo: ${args.sightings.length}${seen ? ` (${seen})` : ''}.`)
      bitsEn.push(`Seen live: ${args.sightings.length}${seen ? ` (${seen})` : ''}.`)
    }
    liveEs = bitsEs.join(' ')
    liveEn = bitsEn.join(' ')
  }

  const splitEs = `${args.trackPlayStamps.length} de temas y ${args.mixPlayStamps.length} de mixes`
  const splitEn = `${args.trackPlayStamps.length} track plays and ${args.mixPlayStamps.length} mix plays`
  const lastDay = lastPlay ? lastPlay.slice(0, 10) : ''
  let listenEs: string
  let listenEn: string
  if (!args.playsReadable) {
    listenEs = 'No se ha podido leer el historial de reproducciones de esta cuenta. No inventes cada cuánto oye.'
    listenEn = 'This account’s play history could not be read. Do not invent how often they listen.'
  } else if (cadence === 'none') {
    listenEs = 'Con la sesión iniciada no hay ninguna reproducción de tema ni de mix. En la web no consta hábito de escucha; guardar temas no es lo mismo que oírlos aquí.'
    listenEn = 'With the session signed in there is no track or mix play. The site has no listening habit on record; saving tracks is not the same as hearing them here.'
  } else if (cadence === 'dormant') {
    listenEs = `Llegaste a oír en la web (${splitEs}), pero la última reproducción fue el ${lastDay}: ahora mismo esa escucha está parada.`
    listenEn = `You did listen on the site (${splitEn}), but the last play was ${lastDay}: that listening is paused.`
  } else if (cadence === 'habitual') {
    listenEs = `Oyes a menudo en la web: ${plays30} reproducciones en 30 días y ${days90} días distintos en 90 (${splitEs}). La última fue el ${lastDay}.`
    listenEn = `You listen often on the site: ${plays30} plays in 30 days and ${days90} distinct days in 90 (${splitEn}). The last was ${lastDay}.`
  } else if (cadence === 'regular') {
    listenEs = `Oyes con ritmo, no a diario: ${days90} días con música en los últimos 90 (${splitEs}). La última fue el ${lastDay}.`
    listenEn = `You listen with a rhythm, not daily: ${days90} days with music in the last 90 (${splitEn}). The last was ${lastDay}.`
  } else {
    listenEs = `Oyes de vez en cuando: ${plays90} reproducciones en 90 días, en ${days90} días (${splitEs}). La última fue el ${lastDay}.`
    listenEn = `You listen now and then: ${plays90} plays in 90 days, across ${days90} days (${splitEn}). The last was ${lastDay}.`
  }

  return {
    favorite_artists: args.favoriteArtists,
    favorite_labels: args.favoriteLabels,
    favorite_events: args.favoriteEvents,
    saved_mixes: args.savedMixes,
    saved_tracks: saved,
    saves_last_30d: saves30,
    saves_last_90d: saves90,
    festivals_attended: bucket.festivals_attended.length,
    festivals_going: bucket.festivals_going.length,
    festivals_wishlist: bucket.festivals_wishlist.length,
    club_attended: bucket.club_attended.length,
    club_going: bucket.club_going.length,
    club_wishlist: bucket.club_wishlist.length,
    sightings: args.sightings.length,
    track_plays: args.trackPlayStamps.length,
    mix_plays: args.mixPlayStamps.length,
    plays_last_30d: plays30,
    plays_last_90d: plays90,
    active_days_90d: days90,
    last_play_at: lastPlay,
    listening_cadence: cadence,
    crate_styles: crateStyles,
    crate_countries: crateCountries,
    favorites_reading_es: favEs,
    favorites_reading_en: favEn,
    crate_reading_es: crateEs,
    crate_reading_en: crateEn,
    live_reading_es: liveEs,
    live_reading_en: liveEn,
    listening_reading_es: listenEs,
    listening_reading_en: listenEn,
  }
}

async function loadOwnPlayStamps(userId: string): Promise<{ tracks: string[]; mixes: string[]; ok: boolean }> {
  try {
    const admin = createServiceSupabase()
    const [tracks, mixes] = await Promise.all([
      fetchAllRows<{ created_at: string }>((from, to) =>
        admin
          .from('track_play_events')
          .select('created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<{ created_at: string }>((from, to) =>
        admin
          .from('mix_play_events')
          .select('created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
    ])
    if (tracks.error || mixes.error) {
      console.error('[breakbeat-profile] play events:', tracks.error || mixes.error)
      return { tracks: [], mixes: [], ok: false }
    }
    return {
      tracks: tracks.data.map((r) => r.created_at),
      mixes: mixes.data.map((r) => r.created_at),
      ok: true,
    }
  } catch (err) {
    console.error('[breakbeat-profile] play events unavailable:', err)
    return { tracks: [], mixes: [], ok: false }
  }
}

function computeStats(
  artists: ArtistProfileInput[],
  labels: LabelProfileInput[],
  events: EventProfileInput[],
  mixes: MixProfileInput[],
  chartTracks: ChartTrackProfileInput[] = [],
): BreakbeatProfileStats {
  const styleCounts: Record<string, number> = {}
  const countryCounts: Record<string, number> = {}
  const eraCounts: Record<string, number> = {}
  const yearCounts: Record<number, number> = {}
  const catCounts: Record<string, number> = {}
  const maxYear = new Date().getFullYear() + 1

  const bumpYear = (y: number) => {
    if (!Number.isFinite(y) || y < 1970 || y > maxYear) return
    yearCounts[y] = (yearCounts[y] || 0) + 1
  }

  for (const a of artists) {
    for (const s of a.styles || []) styleCounts[s] = (styleCounts[s] || 0) + 1
    if (a.country) countryCounts[a.country] = (countryCounts[a.country] || 0) + 1
    if (a.era) {
      const eraBucket = normalizeArtistEraToDecade(a.era) || a.era.trim()
      eraCounts[eraBucket] = (eraCounts[eraBucket] || 0) + 1
      const refY = artistEraToReferenceYear(a.era)
      if (refY != null) bumpYear(refY)
    }
    if (a.category) catCounts[a.category] = (catCounts[a.category] || 0) + 1
  }

  for (const l of labels) {
    if (l.country) countryCounts[l.country] = (countryCounts[l.country] || 0) + 1
    if (l.founded_year) {
      const decade = `${Math.floor(l.founded_year / 10) * 10}s`
      eraCounts[decade] = (eraCounts[decade] || 0) + 1
      bumpYear(l.founded_year)
    }
  }

  const labelDecades: Record<string, number> = {}
  for (const l of labels) {
    if (l.founded_year) {
      const decade = `${Math.floor(l.founded_year / 10) * 10}s`
      labelDecades[decade] = (labelDecades[decade] || 0) + 1
    }
  }

  const totalStyles = Object.values(styleCounts).reduce((a, b) => a + b, 0) || 1
  const topStyles = Object.entries(styleCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / totalStyles) * 100) / 100 }))

  const totalCountries = Object.values(countryCounts).reduce((a, b) => a + b, 0) || 1
  const topCountries = Object.entries(countryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / totalCountries) * 100) / 100 }))

  let festivals = 0, clubNights = 0
  const eventCountries: Set<string> = new Set()
  for (const ev of events) {
    if (ev.event_type === 'festival') festivals++
    if (ev.event_type === 'club_night') clubNights++
    if (ev.country) eventCountries.add(ev.country)
  }

  const mixTaste: Record<string, number> = {}
  for (const m of mixes) {
    const t = m.mix_type || 'unknown'
    mixTaste[t] = (mixTaste[t] || 0) + 1
    if (m.year) {
      const decade = `${Math.floor(m.year / 10) * 10}s`
      eraCounts[decade] = (eraCounts[decade] || 0) + 1
      bumpYear(m.year)
    }
  }

  // =============================================
  // TRACKS GUARDADAS POR EL USUARIO (Mis Tracks)
  // =============================================
  // Las tracks refuerzan con fuerza:
  //   - el histograma de años (especialmente la sección de retro-vinilo: 80s/90s reales)
  //   - los sellos (muchas tracks cargan label textual aunque no tengamos FK al sello)
  //   - la firma de artistas recurrentes (crate-digging vs. one-off)
  const trackLabelCounts: Record<string, number> = {}
  const trackLabelDisplay: Record<string, string> = {}
  const trackArtistCounts: Record<string, number> = {}
  const trackArtistDisplay: Record<string, string> = {}
  for (const t of chartTracks) {
    if (t.year) {
      const decade = `${Math.floor(t.year / 10) * 10}s`
      eraCounts[decade] = (eraCounts[decade] || 0) + 1
      bumpYear(t.year)
    }
    const lbl = (t.label || '').trim()
    if (lbl) {
      const key = lbl.toLowerCase()
      trackLabelCounts[key] = (trackLabelCounts[key] || 0) + 1
      if (!(key in trackLabelDisplay)) trackLabelDisplay[key] = lbl
    }
    for (const name of t.artist_names) {
      const trimmed = (name || '').trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      trackArtistCounts[key] = (trackArtistCounts[key] || 0) + 1
      if (!(key in trackArtistDisplay)) trackArtistDisplay[key] = trimmed
    }
  }

  const toTopCounts = (
    counts: Record<string, number>,
    display: Record<string, string>,
    limit: number,
  ): { name: string; count: number }[] => {
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([k, n]) => ({ name: display[k] || k, count: n }))
  }

  const savedTrackLabels = toTopCounts(trackLabelCounts, trackLabelDisplay, 12)
  const savedTrackArtists = toTopCounts(trackArtistCounts, trackArtistDisplay, 12)

  const totalEras = Object.values(eraCounts).reduce((a, b) => a + b, 0) || 1
  const eraDistribution: Record<string, number> = {}
  for (const [era, count] of Object.entries(eraCounts)) {
    eraDistribution[era] = Math.round((count / totalEras) * 100) / 100
  }

  const totalYear = Object.values(yearCounts).reduce((a, b) => a + b, 0) || 1
  const yearDistribution: Record<string, number> = {}
  for (const [y, count] of Object.entries(yearCounts)) {
    yearDistribution[y] = Math.round((count / totalYear) * 100) / 100
  }

  const sceneHints = inferSceneHints({
    topStyles,
    topCountries,
    eraDistribution,
    categoryBreakdown: catCounts,
  })

  const sampleArtistReleases = takeUniqueNonEmpty(
    artists.flatMap((a) => (a.key_releases || []).map((r) => formatArtistRelease(r))),
    8,
  )
  const sampleTracks = takeUniqueNonEmpty(
    artists.flatMap((a) => a.essential_tracks || []),
    8,
  )
  const sampleRecommendedMixes = takeUniqueNonEmpty(
    artists.flatMap((a) => a.recommended_mixes || []),
    6,
  )
  const sampleLabelReleases = takeUniqueNonEmpty(
    labels.flatMap((l) => l.key_releases || []),
    8,
  )
  const sampleLabelArtists = takeUniqueNonEmpty(
    labels.flatMap((l) => l.key_artists || []),
    8,
  )
  const sampleEventLineup = takeUniqueNonEmpty(
    events.flatMap((e) => e.lineup || []),
    8,
  )
  const sampleEventContexts = takeUniqueNonEmpty(
    events.map((e) => [e.name, e.city, e.venue || '', formatYearLabel(e.date_start)].filter(Boolean).join(' — ')),
    6,
  )
  const sampleMixContexts = takeUniqueNonEmpty(mixes.map((m) => mixContextLine(m)), 6)
  // Contextos de "Mis Tracks": una lista en ES rica en evidencias para el prompt.
  // El idioma concreto lo resuelve el prompt al inyectar los datos; aquí dejamos
  // una única serialización ya legible.
  const sampleSavedChartTracks = pickSampleSavedTrackLines(chartTracks, 24)
  const dominantEras = topPctEntries(eraDistribution, 5)
  const dominantYears = topYearEntries(yearDistribution, 6)

  return {
    top_styles: topStyles,
    top_countries: topCountries,
    era_distribution: eraDistribution,
    year_distribution: yearDistribution,
    category_breakdown: catCounts,
    event_profile: { festivals, club_nights: clubNights, countries: Array.from(eventCountries) },
    mix_taste: mixTaste,
    label_decades: labelDecades,
    total_data_points:
      artists.length + labels.length + events.length + mixes.length + chartTracks.length,
    sample_artists: takeUniqueNonEmpty(artists.map((a) => a.name), 6),
    sample_labels: takeUniqueNonEmpty(labels.map((l) => l.name), 5),
    sample_events: takeUniqueNonEmpty(events.map((e) => e.name), 4),
    sample_mixes: takeUniqueNonEmpty(mixes.map((m) => m.title), 4),
    sample_tracks: sampleTracks,
    sample_saved_chart_tracks: sampleSavedChartTracks,
    saved_track_labels: savedTrackLabels,
    saved_track_artists: savedTrackArtists,
    saved_chart_tracks_count: chartTracks.length,
    sample_artist_releases: sampleArtistReleases,
    sample_label_releases: sampleLabelReleases,
    sample_label_artists: sampleLabelArtists,
    sample_recommended_mixes: sampleRecommendedMixes,
    sample_event_lineup: sampleEventLineup,
    sample_event_contexts: sampleEventContexts,
    sample_mix_contexts: sampleMixContexts,
    dominant_eras: dominantEras,
    dominant_years: dominantYears,
    scene_hints: sceneHints,
  }
}

async function generateAIText(stats: BreakbeatProfileStats, lang: 'es' | 'en'): Promise<{
  text: string
  archetype: string
  method: 'openai' | 'rules'
}> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn(`[breakbeat-profile] OPENAI_API_KEY missing (${lang}); falling back to rules. Configura OPENAI_API_KEY en tu .env / Vercel para activar el LLM.`)
    return generateRulesText(stats, lang)
  }

  const stylesStr = stats.top_styles.map(s => `${s.name} (${Math.round(s.pct * 100)}%)`).join(', ')
  const countriesStr = stats.top_countries.map(c => `${c.name} (${Math.round(c.pct * 100)}%)`).join(', ')
  const erasStr = Object.entries(stats.era_distribution)
    .sort(([, a], [, b]) => b - a)
    .map(([era, pct]) => `${era}: ${Math.round(pct * 100)}%`)
    .join(', ')
  const yearsStr = Object.entries(stats.year_distribution || {})
    .filter(([, pct]) => pct > 0)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .map(([y, pct]) => `${y}: ${Math.round(pct * 100)}%`)
    .join(', ')
  const catsStr = Object.entries(stats.category_breakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, n]) => `${cat}: ${n}`)
    .join(', ')
  const mixStr = mixTasteForDataBlock(stats, lang)
  const labelDecadesStr = Object.entries(stats.label_decades)
    .sort(([, a], [, b]) => b - a)
    .map(([era, n]) => `${era}: ${n}`)
    .join(', ')
  const eventCountriesStr = stats.event_profile.countries.join(', ')
  const sampleArtistsStr = stats.sample_artists?.join(', ') || ''
  const sampleLabelsStr = stats.sample_labels?.join(', ') || ''
  const sampleEventsStr = stats.sample_events?.join(', ') || ''
  const sampleMixesStr = stats.sample_mixes?.join(', ') || ''
  const tracksStr = stats.sample_tracks?.join(', ') || ''
  const artistReleasesStr = stats.sample_artist_releases?.join(', ') || ''
  const labelReleasesStr = stats.sample_label_releases?.join(', ') || ''
  const labelArtistsStr = stats.sample_label_artists?.join(', ') || ''
  const recommendedMixesStr = stats.sample_recommended_mixes?.join(', ') || ''
  const eventLineupStr = stats.sample_event_lineup?.join(', ') || ''
  const eventContextsStr = stats.sample_event_contexts?.join(', ') || ''
  const mixContextsStr = stats.sample_mix_contexts?.join(', ') || ''
  const savedChartTracksStr = stats.sample_saved_chart_tracks?.join(' | ') || ''
  const savedTrackLabelsStr = (stats.saved_track_labels || [])
    .map((l) => `${l.name} ×${l.count}`)
    .join(', ')
  const savedTrackArtistsStr = (stats.saved_track_artists || [])
    .map((a) => `${a.name} ×${a.count}`)
    .join(', ')
  const savedTracksCount = stats.saved_chart_tracks_count || 0
  const dominantErasStr = (stats.dominant_eras || [])
    .map((d) => `${d.name} (${pctLabel(d.pct)})`)
    .join(', ')
  const dominantYearsStr = (stats.dominant_years || [])
    .map((d) => `${d.year} (${pctLabel(d.pct)})`)
    .join(', ')
  const sceneHintsStr = stats.scene_hints?.join(' | ') || ''
  const isEs = lang === 'es'
  const behavior = stats.behavior
  const favReading = (isEs ? behavior?.favorites_reading_es : behavior?.favorites_reading_en) || (isEs ? 'sin datos' : 'no data')
  const crateReading = (isEs ? behavior?.crate_reading_es : behavior?.crate_reading_en) || (isEs ? 'sin datos' : 'no data')
  const liveReading = (isEs ? behavior?.live_reading_es : behavior?.live_reading_en) || (isEs ? 'sin datos' : 'no data')
  const listenReading = (isEs ? behavior?.listening_reading_es : behavior?.listening_reading_en) || (isEs ? 'sin datos' : 'no data')

  const systemPrompt = isEs
    ? `Eres crítico musical y analista de cultura breakbeat para Optimal Breaks. Escribes para un lector que ya sabe de la música y detecta al instante el copy comercial y la plantilla autogenerada. Tu voz: cercana, culta, analítica, seca cuando hace falta; nunca promocional ni grandilocuente. Hablas al usuario de tú. Cada lectura que haces debe estar sostenida por evidencia real del bloque de datos: subgéneros, décadas, años, artistas, tracks, releases, sellos, eventos, lineups o mixes. Si un área está vacía, lo dices con naturalidad y pasas a otra; no rellenas con abstracciones.

Cosas que NUNCA haces:
- Muletillas vacías tipo "no es un dato administrativo", "no es decorativo", "no es casualidad", "cuando aterrizas en nombres", "se puede hablar de canon", "se deja leer en…".
- Frases tipo "hay raíces", "hay evolución", "hay mutaciones" sin aterrizarlas acto seguido en un año, un nombre o una escena.
- Inventarte artistas, tracks, sellos o escenas que no estén en los datos.
- Soltar un inventario de contadores ("con 59 datos", "tienes 12 artistas, 4 sellos y 200 tracks" en lista). La escala sí entra en la prosa cuando define el perfil: cajón corto o profundo, oyente habitual o en silencio, va a festivales o los sigue desde casa.
- Sacar claves técnicas internas: youtube_session, essential_mix, classic_set, radio_show, snake_case, marcadores tipo [top semanal], [new release], [vinilo retro], [weekly top], [retro vinyl]. Si aparecen en los datos los traduces a lenguaje natural (sesión larga en vídeo, programa de radio, set de pista, podcast; o, para tracks, referente a si es top semanal, novedad o rescate en vinilo retro, pero siempre en prosa, nunca con corchetes ni etiquetas).`
    : `You are a music critic and breakbeat culture analyst for Optimal Breaks. You write for a reader who already knows the music and instantly spots promotional copy or autogenerated templates. Your voice: close, cultured, analytical, dry when it needs to be; never promotional or overblown. You speak to the user directly as "you". Every interpretive claim you make must be grounded in real evidence from the data block: subgenres, decades, years, artists, tracks, releases, labels, events, lineups or mixes. If an area is thin, say so naturally and move on; do not fill with abstractions.

Things you NEVER do:
- Empty formulas such as "it is not a decorative figure", "it is no accident", "once you land on names", "you can talk about a canon".
- Phrases like "there are roots", "there is evolution", "there are mutations" without immediately anchoring them in a year, a name or a scene.
- Invent artists, tracks, labels or scenes not present in the data.
- Dump a counter inventory ("with 59 data points", "you have 12 artists, 4 labels and 200 tracks" as a list). Scale does belong in the prose when it defines the profile: a short or deep crate, a habitual listener or silence, goes to festivals or follows them from home.
- Surface internal taxonomy keys: youtube_session, essential_mix, classic_set, radio_show, snake_case, markers like [top semanal], [new release], [vinilo retro], [weekly top], [retro vinyl]. If they appear in the data, translate them to natural prose (long video session, radio show, club set, podcast; for tracks, rephrase the source context in prose, never in brackets or tags).`

  const userPrompt = isEs
    ? `Escribe el ADN breakbeatero de este usuario. Responde en JSON con dos campos:

1. "archetype": 2-4 palabras, preciso, sin explicación (ej. "Digger Nu Skool Andaluz", "Big Beat Purista", "Selector Club UK").

2. "text": un análisis dirigido al usuario, en prosa fluida y apoyado en los datos de abajo.

FORMA:
- Entre 6 y 9 párrafos separados por una línea en blanco. Cada párrafo, varias frases desarrolladas (no bullets, no listas).
- Longitud total: apunta a 3000-5500 caracteres; si los datos son muy ricos, puedes llegar a 7000, pero sólo si hay evidencia real para rellenarlos sin muletillas.
- Arranca con una primera frase concreta (no con "Lo primero que se ve en tu ADN…" ni fórmulas de plantilla).

QUÉ DEBES CUBRIR (repártelo por los párrafos como quieras, no hace falta seguir el orden):
- Subgéneros y geografía dominantes y qué suena realmente ahí.
- Décadas y años que más pesan y qué sugiere eso del tipo de escucha (rave 90s, nu skool 2000s, mutaciones bass posteriores…).
- Artistas concretos, mezclando los que el usuario tiene guardados con los que aparecen en las tracks guardadas.
- Tracks de "Mis Tracks": si hay, cita al menos 6-10 por título y artista (y año si aparece). Jamás con marcadores entre corchetes: reformúlalos en prosa indicando de forma natural si salen del top semanal, de novedades, de rescates en vinilo retro o del Top 10 Beatport de una ficha.
- Releases/álbumes/compilaciones cuando los datos los aportan.
- Sellos: combina los sellos guardados con los sellos que más se repiten en las tracks guardadas (eso es evidencia fuerte de apuesta editorial).
- Mixes: habla de formatos de escucha (sesión larga en vídeo, programa de radio, set de pista, podcast…) y menciona algún título concreto si existe.
- Eventos, lineups y el contexto de sala/festival si hay. Un evento en favoritos no es haber asistido: la asistencia la manda el bloque CONDUCTA.
- Conducta en la web, en un párrafo propio y también en la síntesis final. Cuatro capas, las cuatro: favoritos declarados, tamaño y ritmo del cajón de Mis Tracks, si va a festivales (o solo los quiere, o no marca ninguno) y cada cuánto suena música con su cuenta. Si no dicen lo mismo, dilo. El bloque CONDUCTA ya está redactado: intégralo, no lo contradigas y no lo copies como ficha.
- Al final, síntesis breve del perfil: más digger o más selector, más de casa o de festival, más purista o ecléctico — cruzando las cuatro capas, no solo los favoritos.

REGLAS DURAS:
- Voz siempre en segunda persona ("tú"), nunca "este usuario" ni "el perfil".
- Nada de copy promocional, chistes fáciles ni clickbait.
- No inventes. Si falta evidencia en un área, omítela o dilo con naturalidad.
- Prohibido usar las muletillas listadas en el system prompt. Prohibido escribir corchetes con marcadores técnicos.
- No hagas inventario de contadores. Una cifra concreta (temas guardados, festivales a los que ha ido, ritmo de escucha) sí, dentro de una frase.
- No uses listas ni bullets.

DATOS DEL PERFIL:
- Subgéneros favoritos: ${stylesStr}
- Países dominantes: ${countriesStr}
- Eras/décadas: ${erasStr}
- Décadas dominantes resumidas: ${dominantErasStr || 'sin datos'}
- Años (histograma: artistas→año referencia por década, sellos/mixes→año exacto): ${yearsStr || 'sin datos'}
- Años dominantes resumidos: ${dominantYearsStr || 'sin datos'}
- Categorías de artistas: ${catsStr}
- Perfil de mixes: ${mixStr}
- Décadas de sellos: ${labelDecadesStr || 'sin datos'}
- Eventos: ${stats.event_profile.festivals} festivales, ${stats.event_profile.club_nights} club nights
- Países de eventos: ${eventCountriesStr || 'sin datos'}
- Artistas guardados o favoritos (muestra): ${sampleArtistsStr || 'sin datos'}
- Tracks esenciales detectados: ${tracksStr || 'sin datos'}
- Releases clave de artistas: ${artistReleasesStr || 'sin datos'}
- Sellos guardados o favoritos (muestra): ${sampleLabelsStr || 'sin datos'}
- Key artists de sellos: ${labelArtistsStr || 'sin datos'}
- Key releases de sellos: ${labelReleasesStr || 'sin datos'}
- Eventos en favoritos (muestra; no implica asistencia): ${sampleEventsStr || 'sin datos'}
- Contexto de eventos: ${eventContextsStr || 'sin datos'}
- Lineups vistos en eventos: ${eventLineupStr || 'sin datos'}
- Mixes guardados (muestra): ${sampleMixesStr || 'sin datos'}
- Mixes recomendados desde artistas: ${recommendedMixesStr || 'sin datos'}
- Contexto de mixes: ${mixContextsStr || 'sin datos'}
- Tracks guardadas por el usuario en "Mis Tracks" (total ${savedTracksCount}; fuentes entre corchetes = top semanal / new release / vinilo retro / top beatport de ficha): ${savedChartTracksStr || 'sin datos'}
- Artistas que más se repiten en esas tracks guardadas: ${savedTrackArtistsStr || 'sin datos'}
- Sellos que más se repiten en esas tracks guardadas: ${savedTrackLabelsStr || 'sin datos'}
- Pistas de escena inferibles desde los favoritos: ${sceneHintsStr || 'sin datos suficientes'}
- CONDUCTA — favoritos: ${favReading}
- CONDUCTA — cajón (Mis Tracks): ${crateReading}
- CONDUCTA — en vivo (esto manda para saber si va a festivales; un favorito no es haber ido): ${liveReading}
- CONDUCTA — escucha en la web: ${listenReading}

Responde EXACTAMENTE en este formato JSON:
{"archetype": "...", "text": "..."}`
    : `Write this user's breakbeat DNA. Reply with JSON: two fields.

1. "archetype": 2-4 words, precise, no explanation (e.g. "Nu Skool UK Digger", "Big Beat Purist", "Club Selector").

2. "text": an analysis addressed to the user, in flowing prose grounded in the data below.

FORM:
- Between 6 and 9 paragraphs separated by a blank line. Each paragraph several developed sentences (no bullets, no lists).
- Total length: aim for 3000-5500 characters; if the data is very rich you can reach 7000, but only if there is real evidence to fill it without filler.
- Open with a concrete first sentence (not "The first thing your DNA shows…" nor template formulas).

WHAT YOU MUST COVER (distribute freely across paragraphs):
- Dominant subgenres and geography and what that actually sounds like.
- Decades and years that weigh most and what that suggests about the type of listening (90s rave, 2000s nu skool, later bass mutations…).
- Concrete artists, blending saved favourites with artists that show up in the saved tracks.
- Tracks from "My Tracks": if present, cite at least 6-10 by title and artist (and year when available). Never with bracketed markers: rephrase in prose whether they come from the weekly top, new releases, retro vinyl rescues or a profile Beatport Top 10.
- Releases/albums/compilations when the data supports it.
- Labels: combine saved labels with labels that recur in the saved tracks (strong editorial evidence).
- Mixes: listening formats (long video session, radio show, club set, podcast…) and mention a concrete title if present.
- Events, lineups and club/festival context if present. A favourited event is not attendance: attendance is governed by the CONDUCT block.
- Behaviour on the site, in its own paragraph and again in the closing synthesis. All four layers: declared favourites, size and pace of the My Tracks crate, whether they go to festivals (or only want to, or mark none) and how often music plays on their account. If the layers disagree, say so. The CONDUCT block is already written: weave it in, do not contradict it and do not paste it as a fact sheet.
- End with a short synthesis: more digger or selector, more home or festival, more purist or eclectic — crossing all four layers, not favourites alone.

HARD RULES:
- Speak to the user in the second person ("you"), never "this user" or "the profile".
- No promotional copy, no cheap jokes, no clickbait.
- Do not invent. If evidence is thin, omit or say so naturally.
- Forbidden to use the filler phrases listed in the system prompt. Forbidden to write bracketed technical markers.
- Do not dump a counter inventory. One concrete figure (saved tracks, festivals attended, listening rhythm) is fine inside a sentence.
- No bullet lists.

PROFILE DATA:
- Favorite subgenres: ${stylesStr}
- Dominant countries: ${countriesStr}
- Eras/decades: ${erasStr}
- Dominant eras summary: ${dominantErasStr || 'no data'}
- Years (histogram: artists→reference year per decade, labels/mixes→exact year): ${yearsStr || 'no data'}
- Dominant years summary: ${dominantYearsStr || 'no data'}
- Artist categories: ${catsStr}
- Mix profile: ${mixStr}
- Label decades: ${labelDecadesStr || 'no data'}
- Events: ${stats.event_profile.festivals} festivals, ${stats.event_profile.club_nights} club nights
- Event countries: ${eventCountriesStr || 'no data'}
- Saved/favorite artists (sample): ${sampleArtistsStr || 'no data'}
- Essential tracks detected: ${tracksStr || 'no data'}
- Artist key releases: ${artistReleasesStr || 'no data'}
- Saved/favorite labels (sample): ${sampleLabelsStr || 'no data'}
- Label key artists: ${labelArtistsStr || 'no data'}
- Label key releases: ${labelReleasesStr || 'no data'}
- Saved/favourite events (sample; not attendance): ${sampleEventsStr || 'no data'}
- Event contexts: ${eventContextsStr || 'no data'}
- Event lineups: ${eventLineupStr || 'no data'}
- Saved mixes (sample): ${sampleMixesStr || 'no data'}
- Recommended mixes from artists: ${recommendedMixesStr || 'no data'}
- Mix contexts: ${mixContextsStr || 'no data'}
- User-saved tracks in "My Tracks" (total ${savedTracksCount}; bracketed label = weekly top / new release / retro vinyl / profile Beatport top): ${savedChartTracksStr || 'no data'}
- Artists that recur most across those saved tracks: ${savedTrackArtistsStr || 'no data'}
- Labels that recur most across those saved tracks: ${savedTrackLabelsStr || 'no data'}
- Scene hints inferred from favourites: ${sceneHintsStr || 'not enough data'}
- CONDUCT — favourites: ${favReading}
- CONDUCT — crate (My Tracks): ${crateReading}
- CONDUCT — live (this governs whether they go to festivals; a favourite is not attendance): ${liveReading}
- CONDUCT — listening on the site: ${listenReading}

Reply EXACTLY in this JSON format:
{"archetype": "...", "text": "..."}`

  /**
   * Llama a OpenAI con un modelo concreto y devuelve:
   *   - { ok: true, text, archetype } si la respuesta del LLM parsea y pasa la
   *     validación de robustez.
   *   - { ok: false, reason, retryWithFallback } si falla: `retryWithFallback`
   *     indica si merece la pena reintentar con el modelo fallback (p. ej.
   *     modelo no existe / sin acceso).
   */
  const callOpenAI = async (model: string): Promise<
    | { ok: true; text: string; archetype: string }
    | { ok: false; reason: string; retryWithFallback: boolean }
  > => {
    try {
      // Detecta modelos de la familia nueva (GPT-5, o1, o3, ...) que ya NO
      // aceptan `max_tokens` ni una `temperature != 1`. Para esos usamos
      // `max_completion_tokens` y omitimos `temperature` (queda en default).
      const isReasoningFamily = /^(gpt-5|o1|o3|o4)/i.test(model)
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }
      if (isReasoningFamily) {
        body.max_completion_tokens = 5600
      } else {
        body.max_tokens = 5600
        body.temperature = 0.55
      }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.warn(`[breakbeat-profile] OpenAI error (${model}, ${lang}):`, res.status, errText.slice(0, 400))
        // Políticamente: retry siempre que el primario falle HTTP y haya
        // fallback disponible. El coste es una llamada extra en el peor caso
        // (uno falla, otro funciona), pero evita caer a la plantilla por un
        // problema puntual de modelo, cuota o rate-limit transitorio.
        return { ok: false, reason: `openai_http_${res.status}`, retryWithFallback: true }
      }

      const data = await res.json()
      const raw = data.choices?.[0]?.message?.content?.trim() || ''
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn(`[breakbeat-profile] OpenAI response missing JSON (${model}, ${lang}). Raw starts:`, raw.slice(0, 200))
        return { ok: false, reason: 'no_json', retryWithFallback: false }
      }
      let parsed: { text?: string; archetype?: string }
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        console.warn(`[breakbeat-profile] OpenAI JSON parse failed (${model}, ${lang})`)
        return { ok: false, reason: 'json_parse', retryWithFallback: false }
      }
      const text = parsed.text || ''
      if (!isStrongEnoughAnalysis(text)) {
        console.warn(`[breakbeat-profile] OpenAI text too short (${model}, ${lang}):`, text.length, 'chars')
        return { ok: false, reason: 'too_short', retryWithFallback: false }
      }
      return { ok: true, text, archetype: parsed.archetype || '' }
    } catch (err) {
      console.warn(`[breakbeat-profile] OpenAI call threw (${model}, ${lang}):`, err)
      return { ok: false, reason: 'exception', retryWithFallback: true }
    }
  }

  const primary = await callOpenAI(OPENAI_MODEL_PRIMARY)
  if (primary.ok) {
    return { text: primary.text, archetype: primary.archetype, method: 'openai' }
  }

  if (primary.retryWithFallback && OPENAI_MODEL_FALLBACK && OPENAI_MODEL_FALLBACK !== OPENAI_MODEL_PRIMARY) {
    console.warn(`[breakbeat-profile] Retrying with fallback model ${OPENAI_MODEL_FALLBACK} (${lang}) after reason=${primary.reason}`)
    const fallback = await callOpenAI(OPENAI_MODEL_FALLBACK)
    if (fallback.ok) {
      return { text: fallback.text, archetype: fallback.archetype, method: 'openai' }
    }
    console.warn(`[breakbeat-profile] Fallback model also failed (${lang}) reason=${fallback.reason}. Using rules.`)
  } else {
    console.warn(`[breakbeat-profile] Falling back to rules (${lang}) reason=${primary.reason}`)
  }

  return generateRulesText(stats, lang)
}

function generateRulesText(stats: BreakbeatProfileStats, lang: 'es' | 'en'): {
  text: string; archetype: string; method: 'rules'
} {
  const isEs = lang === 'es'
  const topStyle = stats.top_styles[0]?.name || 'breakbeat'
  const topCountry = stats.top_countries[0]?.name || ''
  const topEra = Object.entries(stats.era_distribution).sort(([, a], [, b]) => b - a)[0]?.[0] || ''
  const eventBias =
    stats.event_profile.club_nights > stats.event_profile.festivals
      ? (isEs ? 'club' : 'club')
      : stats.event_profile.festivals > stats.event_profile.club_nights
        ? (isEs ? 'festival' : 'festival')
        : (isEs ? 'equilibrado' : 'balanced')

  const archetypes: Record<string, { en: string; es: string }> = {
    nu_skool: { en: 'Nu Skool Purist', es: 'Purista del Nu Skool' },
    bassline: { en: 'Bassline Addict', es: 'Adicto al Bassline' },
    acid_breaks: { en: 'Acid Breaks Head', es: 'Cabeza Acid Breaks' },
    florida_breaks: { en: 'Florida Breaks Archaeologist', es: 'Arqueólogo del Florida Breaks' },
    big_beat: { en: 'Big Beat Maniac', es: 'Maníaco del Big Beat' },
    electro: { en: 'Electro Breaks Explorer', es: 'Explorador del Electro Breaks' },
    progressive_breaks: { en: 'Progressive Voyager', es: 'Viajero del Progressive Breaks' },
  }

  const fallback = { en: 'Breakbeat Eclectic', es: 'Ecléctico del Breakbeat' }
  const arch = archetypes[topStyle] || fallback
  const archetype = isEs ? arch.es : arch.en

  const countryNames: Record<string, { en: string; es: string }> = {
    UK: { en: 'the UK', es: 'Reino Unido' },
    US: { en: 'the US', es: 'Estados Unidos' },
    ES: { en: 'Spain', es: 'España' },
    AU: { en: 'Australia', es: 'Australia' },
  }
  const cName = countryNames[topCountry] || { en: topCountry, es: topCountry }
  const topStyles = stats.top_styles
    .slice(0, 3)
    .map((s) => s.name.replace(/_/g, ' '))
    .join(', ')
  const topEras = Object.entries(stats.era_distribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([era, pct]) => `${era} (${pctLabel(pct)})`)
    .join(', ')
  const topYears = (stats.dominant_years || [])
    .slice(0, 4)
    .map((d) => `${d.year} (${pctLabel(d.pct)})`)
    .join(', ')
  const sampleArtists = stats.sample_artists?.slice(0, 5).join(', ') || ''
  const sampleLabels = stats.sample_labels?.slice(0, 3).join(', ') || ''
  const sampleEvents = stats.sample_events?.slice(0, 3).join(', ') || ''
  const sampleMixes = stats.sample_mixes?.slice(0, 4).join(', ') || ''
  const sampleTracks = stats.sample_tracks?.slice(0, 6).join(', ') || ''
  // Releases/key releases usan ' · ' internamente (formatArtistRelease), así
  // que el join visible los separa con '; ' para no confundir al lector.
  const artistReleases = stats.sample_artist_releases?.slice(0, 5).join('; ') || ''
  const labelReleases = stats.sample_label_releases?.slice(0, 5).join('; ') || ''
  const labelArtists = stats.sample_label_artists?.slice(0, 6).join(', ') || ''
  const recommendedMixes = stats.sample_recommended_mixes?.slice(0, 4).join('; ') || ''
  const eventLineup = stats.sample_event_lineup?.slice(0, 8).join(', ') || ''
  const eventContexts = stats.sample_event_contexts?.slice(0, 4).join('; ') || ''
  const mixContexts = stats.sample_mix_contexts?.slice(0, 4).join('; ') || ''
  // IMPORTANTE: al usuario nunca le enseñamos los marcadores internos
  // `[top semanal]`, `[new release]`, `[vinilo retro]`, etc. Los quitamos
  // antes de inyectar en el texto final y separamos con '; ' para legibilidad.
  const savedChartTracks = (stats.sample_saved_chart_tracks || [])
    .slice(0, 6)
    .map(stripTrackSourceTag)
    .filter(Boolean)
    .join('; ')
  const formatCount = (name: string, count: number): string =>
    count > 1 ? `${name} (×${count})` : name
  const savedTrackLabels = (stats.saved_track_labels || [])
    .slice(0, 4)
    .map((l) => formatCount(l.name, l.count))
    .join(', ')
  const savedTrackArtists = (stats.saved_track_artists || [])
    .slice(0, 4)
    .map((a) => formatCount(a.name, a.count))
    .join(', ')
  const sceneHints = stats.scene_hints?.slice(0, 2).join('; ') || ''
  const behavior = stats.behavior
  const mixTasteSummary = Object.entries(stats.mix_taste)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([t, n]) => formatCount(formatMixTypeForPrompt(t, isEs ? 'es' : 'en'), n))
    .join('; ')
  const labelDecadesStr = Object.entries(stats.label_decades || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([era, n]) => formatCount(era, n))
    .join(', ')

  // =============================================
  // TEMPLATE DEL FALLBACK (rules)
  // =============================================
  // Se escribe por bloques que sólo se unen si hay evidencia real para ese
  // bloque. Prohibidas las muletillas tipo "no es decorativo", "no es un dato
  // administrativo", "cuando aterrizas en nombres": queremos que cuando el
  // usuario vea el fallback no se note como plantilla. Paragraphs separados
  // por línea en blanco, joins con ' ' entre frases del mismo párrafo.
  const joinSentences = (...parts: Array<string | undefined | null>): string =>
    parts.map((p) => (p || '').trim()).filter(Boolean).join(' ')

  const country = isEs ? cName.es : cName.en
  const styleLine = topStyles || topStyle.replace(/_/g, ' ')

  const p1Es = joinSentences(
    `Tu ADN breakbeatero se sostiene sobre ${styleLine}${country ? `, con un ancla geográfica clara en ${country}` : ''}.`,
    sceneHints ? `Encaja con escenas como ${sceneHints}.` : '',
  )
  const p1En = joinSentences(
    `Your breakbeat DNA sits on top of ${styleLine}${country ? `, anchored geographically in ${country}` : ''}.`,
    sceneHints ? `It lines up with scenes such as ${sceneHints}.` : '',
  )

  const p2Es = joinSentences(
    topEras
      ? `En décadas pesan ${topEras}.`
      : topEra
        ? `Destaca la década de los ${topEra}.`
        : '',
    topYears
      ? `Afinando por año, los picos del histograma son ${topYears}: funciona como anclaje concreto para tu gusto, no como nostalgia genérica.`
      : '',
  )
  const p2En = joinSentences(
    topEras
      ? `On decades, the weight goes to ${topEras}.`
      : topEra
        ? `The ${topEra} stand out.`
        : '',
    topYears
      ? `Year by year, the histogram peaks at ${topYears}: a concrete anchor for your taste rather than generic nostalgia.`
      : '',
  )

  const p3Es = joinSentences(
    sampleArtists ? `Entre artistas guardados asoman ${sampleArtists}.` : '',
    sampleTracks ? `De su catálogo emergen cortes como ${sampleTracks}.` : '',
    savedChartTracks
      ? `En Mis Tracks has fijado selecciones concretas: ${savedChartTracks}.`
      : '',
  )
  const p3En = joinSentences(
    sampleArtists ? `Saved artists include ${sampleArtists}.` : '',
    sampleTracks ? `From their catalogue, cuts such as ${sampleTracks} emerge.` : '',
    savedChartTracks
      ? `In My Tracks you have pinned concrete picks: ${savedChartTracks}.`
      : '',
  )

  const p4Es = joinSentences(
    artistReleases ? `Los releases que asoman en tus artistas (${artistReleases}) anclan ese gusto a álbumes y compilaciones concretas.` : '',
    sampleLabels ? `Guardas sellos como ${sampleLabels}, lo que inclina la escucha hacia archivo y continuidad.` : '',
    savedTrackLabels ? `Y entre las tracks guardadas, los sellos que más se repiten son ${savedTrackLabels}: ahí sí hay apuesta editorial clara.` : '',
    labelDecadesStr ? `Décadas de fundación de esos sellos: ${labelDecadesStr}.` : '',
    savedTrackArtists ? `Artistas recurrentes en Mis Tracks: ${savedTrackArtists}.` : '',
  )
  const p4En = joinSentences(
    artistReleases ? `Releases that show up in your artists (${artistReleases}) pin that taste to specific albums and compilations.` : '',
    sampleLabels ? `You save labels such as ${sampleLabels}, tilting the listening toward archival and continuity.` : '',
    savedTrackLabels ? `Among your saved tracks, the recurring labels are ${savedTrackLabels}: a clear editorial bet.` : '',
    labelDecadesStr ? `Founding decades of those labels: ${labelDecadesStr}.` : '',
    savedTrackArtists ? `Recurring artists in My Tracks: ${savedTrackArtists}.` : '',
  )

  const p5Es = joinSentences(
    labelArtists ? `En torno a esos sellos orbitan nombres como ${labelArtists}.` : '',
    labelReleases ? `Y referencias como ${labelReleases} cierran el círculo entre sello, artista y momento.` : '',
  )
  const p5En = joinSentences(
    labelArtists ? `Those labels connect to names like ${labelArtists}.` : '',
    labelReleases ? `And releases such as ${labelReleases} close the loop between label, artist and moment.` : '',
  )

  const p6Es = joinSentences(
    mixTasteSummary ? `En mixes dominan ${mixTasteSummary}.` : '',
    sampleMixes ? `Títulos concretos: ${sampleMixes}.` : '',
    mixContexts ? `Contexto: ${mixContexts}.` : '',
    recommendedMixes ? `Desde tus artistas se te recomiendan ${recommendedMixes}.` : '',
  )
  const p6En = joinSentences(
    mixTasteSummary ? `In mixes, the weighting goes to ${mixTasteSummary}.` : '',
    sampleMixes ? `Concrete titles: ${sampleMixes}.` : '',
    mixContexts ? `Context: ${mixContexts}.` : '',
    recommendedMixes ? `From your artists, recommendations include ${recommendedMixes}.` : '',
  )

  const p7Es = behavior
    ? joinSentences(behavior.live_reading_es, behavior.listening_reading_es)
    : joinSentences(
      sampleEvents ? `En eventos aparecen ${sampleEvents}.` : '',
      eventContexts ? `Contextos: ${eventContexts}.` : '',
      eventLineup ? `Lineups con nombres como ${eventLineup}.` : '',
    )
  const p7En = behavior
    ? joinSentences(behavior.live_reading_en, behavior.listening_reading_en)
    : joinSentences(
      sampleEvents ? `Events include ${sampleEvents}.` : '',
      eventContexts ? `Contexts: ${eventContexts}.` : '',
      eventLineup ? `Lineups with names such as ${eventLineup}.` : '',
    )

  const homeEs = behavior && behavior.festivals_attended === 0 && behavior.club_attended === 0
    ? 'de casa'
    : eventBias
  const homeEn = behavior && behavior.festivals_attended === 0 && behavior.club_attended === 0
    ? 'home'
    : eventBias
  const p8Es = behavior
    ? joinSentences(
      behavior.favorites_reading_es,
      behavior.crate_reading_es,
      `En conjunto te lees como un perfil ${homeEs}: el canon declarado, el cajón, la asistencia y la escucha en la web pesan los cuatro.`,
    )
    : `En conjunto, te acercas a un perfil ${eventBias}, probablemente entre selector y digger, con un gusto que se lee en fechas, nombres y sellos concretos más que en una etiqueta genérica.`
  const p8En = behavior
    ? joinSentences(
      behavior.favorites_reading_en,
      behavior.crate_reading_en,
      `Overall you read as a ${homeEn} profile: declared canon, crate, attendance and listening on the site all four carry weight.`,
    )
    : `Overall you lean toward a ${eventBias} profile, probably between selector and digger, with a taste that reads through concrete dates, names and labels rather than a broad tag.`

  const paragraphsEs = [p1Es, p2Es, p3Es, p4Es, p5Es, p6Es, p7Es, p8Es].filter(Boolean)
  const paragraphsEn = [p1En, p2En, p3En, p4En, p5En, p6En, p7En, p8En].filter(Boolean)

  const text = (isEs ? paragraphsEs : paragraphsEn).join('\n\n')

  return { text, archetype, method: 'rules' }
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const lang: 'es' | 'en' = body.lang === 'en' ? 'en' : 'es'

    // Favoritos y asistencia (páginas cortas). Mis Tracks se pagina: el default
    // de PostgREST (1000) se queda corto en cuentas editoriales.
    const [favArtistsRes, favLabelsRes, attendanceRes, favEventsRes, savedMixesRes, savedTracksPage, sightingsPage] = await Promise.all([
      supabase.from('favorite_artists').select('artist_id').eq('user_id', user.id),
      supabase.from('favorite_labels').select('label_id').eq('user_id', user.id),
      supabase.from('event_attendance').select('event_id, status').eq('user_id', user.id),
      supabase.from('favorite_events').select('event_id').eq('user_id', user.id),
      supabase.from('saved_mixes').select('mix_id').eq('user_id', user.id),
      fetchAllRows<SavedTrackRow>((from, to) =>
        supabase
          .from('saved_chart_tracks')
          .select('track_source, track_id, canonical_url, snapshot, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      ),
      fetchAllRows<{ artist_id: string; event_name: string | null; city: string | null }>((from, to) =>
        supabase
          .from('artist_sightings')
          .select('artist_id, event_name, city')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      ),
    ])

    if (savedTracksPage.error) {
      console.error('[breakbeat-profile] saved_chart_tracks:', savedTracksPage.error)
    }
    if (sightingsPage.error) {
      console.error('[breakbeat-profile] artist_sightings:', sightingsPage.error)
    }

    const artistIds = favArtistsRes.data?.map((d: { artist_id: string }) => d.artist_id) || []
    const labelIds = favLabelsRes.data?.map((d: { label_id: string }) => d.label_id) || []
    const eventIds = Array.from(new Set([
      ...(attendanceRes.data?.map((d: { event_id: string }) => d.event_id) || []),
      ...(favEventsRes.data?.map((d: { event_id: string }) => d.event_id) || []),
    ]))
    const mixIds = savedMixesRes.data?.map((d: { mix_id: string }) => d.mix_id) || []

    const savedTrackRows: SavedTrackRow[] = (savedTracksPage.data || []).filter((r) =>
      r.track_source === 'chart'
      || r.track_source === 'featured'
      || r.track_source === 'vinyl'
      || r.track_source === 'beatport_top',
    )
    const chartTrackIds = savedTrackRows.filter((r) => r.track_source === 'chart').map((r) => r.track_id)
    const featuredTrackIds = savedTrackRows.filter((r) => r.track_source === 'featured').map((r) => r.track_id)
    const vinylTrackIds = savedTrackRows.filter((r) => r.track_source === 'vinyl').map((r) => r.track_id)
    const savedTrackIds = savedTrackRows.map((r) => `track:${r.track_source}:${r.track_id}`)
    const sightingRows = sightingsPage.data || []
    const sightingArtistIds = Array.from(new Set(sightingRows.map((s) => s.artist_id).filter(Boolean)))

    const allIds = [...artistIds, ...labelIds, ...eventIds, ...mixIds, ...savedTrackIds]
    if (allIds.length < 3) {
      return NextResponse.json({
        error: lang === 'es'
          ? 'Necesitas al menos 3 elementos guardados (artistas, sellos, eventos, mixes o tracks) para generar tu perfil breakbeatero'
          : 'You need at least 3 saved items (artists, labels, events, mixes or tracks) to generate your breakbeat profile',
      }, { status: 400 })
    }

    // Fetch entity details in parallel. `.in('id', 700 UUIDs)` tumba PostgREST;
    // el Top 100 ya trocea — aquí igual, o las New Releases no entran al ADN.
    type ChartLive = { id: string; title: string | null; mix_name: string | null; artists: unknown; label: string | null; bpm: number | null; release_year: number | null; release_date?: string | null }
    type FeatLive = { id: string; title: string | null; mix_name?: string | null; artists: unknown; label: string | null; release_year: number | null; release_date?: string | null }
    type VinylLive = { id: string; title: string | null; mix_name: string | null; artists: unknown; label: string | null; year: number | null }
    type SightingArtist = { id: string; name: string }

    const [artistsRes, labelsRes, eventsRes, mixesRes, chartTracksRes, featuredTracksRes, vinylTracksRes, sightingArtistsRes, catalogRes, playStamps] = await Promise.all([
      artistIds.length > 0
        ? selectByIds<ArtistProfileInput>(artistIds, (chunk) =>
          supabase.from('artists').select('name, styles, country, era, category, essential_tracks, recommended_mixes, key_releases').in('id', chunk),
        )
        : { data: [] as ArtistProfileInput[] },
      labelIds.length > 0
        ? selectByIds<LabelProfileInput>(labelIds, (chunk) =>
          supabase.from('labels').select('name, country, founded_year, is_active, key_artists, key_releases').in('id', chunk),
        )
        : { data: [] as LabelProfileInput[] },
      eventIds.length > 0
        ? selectByIds<EventProfileInput>(eventIds, (chunk) =>
          supabase.from('events').select('id, name, event_type, country, city, venue, lineup, date_start, tags').in('id', chunk),
        )
        : { data: [] as EventProfileInput[] },
      mixIds.length > 0
        ? selectByIds<MixProfileInput>(mixIds, (chunk) =>
          supabase.from('mixes').select('title, artist_name, mix_type, year, platform, duration_minutes').in('id', chunk),
        )
        : { data: [] as MixProfileInput[] },
      chartTrackIds.length > 0
        ? selectByIds<ChartLive>(chartTrackIds, (chunk) =>
          supabase.from('chart_tracks').select('id, title, mix_name, artists, label, bpm, release_year, release_date').in('id', chunk),
        )
        : { data: [] as ChartLive[] },
      featuredTrackIds.length > 0
        ? selectByIds<FeatLive>(featuredTrackIds, (chunk) =>
          supabase.from('chart_featured_tracks').select('id, title, mix_name, artists, label, release_year, release_date').in('id', chunk),
        )
        : { data: [] as FeatLive[] },
      vinylTrackIds.length > 0
        ? selectByIds<VinylLive>(vinylTrackIds, (chunk) =>
          supabase.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year').in('id', chunk),
        )
        : { data: [] as VinylLive[] },
      sightingArtistIds.length > 0
        ? selectByIds<SightingArtist>(sightingArtistIds, (chunk) =>
          supabase.from('artists').select('id, name').in('id', chunk),
        )
        : { data: [] as SightingArtist[] },
      savedTrackRows.length > 0
        ? fetchAllRows<CatalogTasteRow>((from, to) =>
          supabase
            .from('artists')
            .select('name, name_display, styles, country')
            .order('id', { ascending: true })
            .range(from, to),
        )
        : Promise.resolve({ data: [] as CatalogTasteRow[], error: null }),
      loadOwnPlayStamps(user.id),
    ])

    const chartById = new Map((chartTracksRes.data || []).map((t) => [t.id, t]))
    const featuredById = new Map((featuredTracksRes.data || []).map((t) => [t.id, t]))
    const vinylById = new Map((vinylTracksRes.data || []).map((t) => [t.id, t]))

    const chartTracksInput: ChartTrackProfileInput[] = []
    for (const row of savedTrackRows) {
      const createdAt = row.created_at || null
      if (row.track_source === 'beatport_top') {
        const fromSnap = trackFromSnapshot('beatport_top', row.snapshot, createdAt)
        if (fromSnap) chartTracksInput.push(fromSnap)
        continue
      }
      if (row.track_source === 'chart') {
        const live = chartById.get(row.track_id)
        if (live) {
          chartTracksInput.push({
            source: 'chart',
            title: live.title || '',
            mix_name: live.mix_name || '',
            artist_names: artistsToNames(live.artists),
            label: live.label || '',
            year: yearFromRelease(live.release_year, live.release_date ?? null),
            bpm: live.bpm ?? null,
            created_at: createdAt,
          })
          continue
        }
      } else if (row.track_source === 'featured') {
        const live = featuredById.get(row.track_id)
        if (live) {
          chartTracksInput.push({
            source: 'featured',
            title: live.title || '',
            mix_name: live.mix_name || '',
            artist_names: artistsToNames(live.artists),
            label: live.label || '',
            year: yearFromRelease(live.release_year, live.release_date ?? null),
            bpm: null,
            created_at: createdAt,
          })
          continue
        }
      } else if (row.track_source === 'vinyl') {
        const live = vinylById.get(row.track_id)
        if (live) {
          chartTracksInput.push({
            source: 'vinyl',
            title: live.title || '',
            mix_name: live.mix_name || '',
            artist_names: artistsToNames(live.artists),
            label: live.label || '',
            year: live.year ?? null,
            bpm: null,
            created_at: createdAt,
          })
          continue
        }
      }
      const fromSnap = trackFromSnapshot(row.track_source, row.snapshot, createdAt)
      if (fromSnap) chartTracksInput.push(fromSnap)
    }

    const eventsInput = (eventsRes.data || []) as EventProfileInput[]
    const favoriteEventIds = new Set((favEventsRes.data || []).map((d: { event_id: string }) => d.event_id))
    const stats = computeStats(
      (artistsRes.data as ArtistProfileInput[]) || [],
      (labelsRes.data as LabelProfileInput[]) || [],
      eventsInput,
      (mixesRes.data as MixProfileInput[]) || [],
      chartTracksInput,
    )
    stats.sample_events = takeUniqueNonEmpty(
      eventsInput.filter((e) => favoriteEventIds.has(e.id)).map((e) => e.name),
      4,
    )

    const sightingNameById = new Map((sightingArtistsRes.data || []).map((a) => [a.id, a.name]))
    const attendanceRows: { event_id: string; status: AttendanceStatus }[] = []
    for (const row of attendanceRes.data || []) {
      const status = row.status
      if (status === 'wishlist' || status === 'attending' || status === 'attended') {
        attendanceRows.push({ event_id: row.event_id, status })
      }
    }
    if (catalogRes.error) {
      console.error('[breakbeat-profile] artist catalog for crate styles:', catalogRes.error)
    }

    stats.behavior = buildBehavior({
      favoriteArtists: artistIds.length,
      favoriteLabels: labelIds.length,
      favoriteEvents: favoriteEventIds.size,
      savedMixes: mixIds.length,
      tracks: chartTracksInput,
      events: eventsInput,
      attendance: attendanceRows,
      sightings: sightingRows.map((s) => ({
        name: sightingNameById.get(s.artist_id) || '',
        event_name: s.event_name || '',
        city: s.city || '',
      })).filter((s) => s.name),
      catalog: catalogRes.data || [],
      trackPlayStamps: playStamps.tracks,
      mixPlayStamps: playStamps.mixes,
      playsReadable: playStamps.ok,
      favoriteStyles: stats.top_styles,
    })

    const currentHash = hashInputs([
      ...allIds,
      `saves:${stats.behavior.saved_tracks}:${stats.behavior.saves_last_30d}`,
      `live:${stats.behavior.festivals_attended}:${stats.behavior.festivals_going}:${stats.behavior.festivals_wishlist}:${stats.behavior.club_attended}:${stats.behavior.sightings}`,
      `plays:${stats.behavior.listening_cadence}:${stats.behavior.track_plays}:${stats.behavior.mix_plays}:${stats.behavior.last_play_at || ''}`,
    ])

    // Generate text in both languages
    const [resultEs, resultEn] = await Promise.all([
      generateAIText(stats, 'es'),
      generateAIText(stats, 'en'),
    ])

    const payload = {
      user_id: user.id,
      stats: stats as any,
      analysis_text_es: resultEs.text,
      analysis_text_en: resultEn.text,
      archetype_es: resultEs.archetype,
      archetype_en: resultEn.archetype,
      input_hash: currentHash,
      generated_by: resultEs.method,
    }

    const { data: saved, error: saveErr } = await (supabase as any)
      .from('breakbeat_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()

    if (saveErr) {
      console.error('[breakbeat-profile] Save error:', saveErr)
      return NextResponse.json({ ...payload, _saved: false })
    }

    return NextResponse.json(saved)
  } catch (err: any) {
    console.error('[breakbeat-profile] Unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
