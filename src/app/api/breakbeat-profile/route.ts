import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database, SavedChartTrackSnapshot, BreakbeatProfileStats } from '@/types/database'
import { artistEraToReferenceYear, normalizeArtistEraToDecade } from '@/lib/breakbeat-profile-era'
import { fetchAllRows, selectByIds } from '@/lib/supabase-admin'

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

  const savedTrackLabels = toTopCounts(trackLabelCounts, trackLabelDisplay, 8)
  const savedTrackArtists = toTopCounts(trackArtistCounts, trackArtistDisplay, 8)

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
  const systemPrompt = isEs
    ? `Eres crítico musical y analista de cultura breakbeat para Optimal Breaks. Escribes para un lector que ya sabe de la música y detecta al instante el copy comercial y la plantilla autogenerada. Tu voz: cercana, culta, analítica, seca cuando hace falta; nunca promocional ni grandilocuente. Hablas al usuario de tú. Cada lectura que haces debe estar sostenida por evidencia real del bloque de datos: subgéneros, décadas, años, artistas, tracks, releases, sellos, eventos, lineups o mixes. Si un área está vacía, lo dices con naturalidad y pasas a otra; no rellenas con abstracciones.

Cosas que NUNCA haces:
- Muletillas vacías tipo "no es un dato administrativo", "no es decorativo", "no es casualidad", "cuando aterrizas en nombres", "se puede hablar de canon", "se deja leer en…".
- Frases tipo "hay raíces", "hay evolución", "hay mutaciones" sin aterrizarlas acto seguido en un año, un nombre o una escena.
- Inventarte artistas, tracks, sellos o escenas que no estén en los datos.
- Contar cuántos favoritos tiene el usuario ("con 59 datos", "con X ítems").
- Sacar claves técnicas internas: youtube_session, essential_mix, classic_set, radio_show, snake_case, marcadores tipo [top semanal], [new release], [vinilo retro], [weekly top], [retro vinyl]. Si aparecen en los datos los traduces a lenguaje natural (sesión larga en vídeo, programa de radio, set de pista, podcast; o, para tracks, referente a si es top semanal, novedad o rescate en vinilo retro, pero siempre en prosa, nunca con corchetes ni etiquetas).`
    : `You are a music critic and breakbeat culture analyst for Optimal Breaks. You write for a reader who already knows the music and instantly spots promotional copy or autogenerated templates. Your voice: close, cultured, analytical, dry when it needs to be; never promotional or overblown. You speak to the user directly as "you". Every interpretive claim you make must be grounded in real evidence from the data block: subgenres, decades, years, artists, tracks, releases, labels, events, lineups or mixes. If an area is thin, say so naturally and move on; do not fill with abstractions.

Things you NEVER do:
- Empty formulas such as "it is not a decorative figure", "it is no accident", "once you land on names", "you can talk about a canon".
- Phrases like "there are roots", "there is evolution", "there are mutations" without immediately anchoring them in a year, a name or a scene.
- Invent artists, tracks, labels or scenes not present in the data.
- Count how many favourites the user has ("with 59 data points", "with X items").
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
- Eventos, lineups y el contexto de sala/festival si hay.
- Al final, síntesis breve del perfil: más digger o más selector, más de club o festival, más purista o ecléctico — pero apoyado en los datos.

REGLAS DURAS:
- Voz siempre en segunda persona ("tú"), nunca "este usuario" ni "el perfil".
- Nada de copy promocional, chistes fáciles ni clickbait.
- No inventes. Si falta evidencia en un área, omítela o dilo con naturalidad.
- Prohibido usar las muletillas listadas en el system prompt. Prohibido escribir corchetes con marcadores técnicos.
- No digas cuántos ítems tiene el usuario en total.
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
- Eventos guardados/asistencias (muestra): ${sampleEventsStr || 'sin datos'}
- Contexto de eventos: ${eventContextsStr || 'sin datos'}
- Lineups vistos en eventos: ${eventLineupStr || 'sin datos'}
- Mixes guardados (muestra): ${sampleMixesStr || 'sin datos'}
- Mixes recomendados desde artistas: ${recommendedMixesStr || 'sin datos'}
- Contexto de mixes: ${mixContextsStr || 'sin datos'}
- Tracks guardadas por el usuario en "Mis Tracks" (total ${savedTracksCount}; fuentes entre corchetes = top semanal / new release / vinilo retro / top beatport de ficha): ${savedChartTracksStr || 'sin datos'}
- Artistas que más se repiten en esas tracks guardadas: ${savedTrackArtistsStr || 'sin datos'}
- Sellos que más se repiten en esas tracks guardadas: ${savedTrackLabelsStr || 'sin datos'}
- Pistas de escena inferibles desde los datos: ${sceneHintsStr || 'sin datos suficientes'}

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
- Events, lineups and club/festival context if present.
- End with a short synthesis: more digger or selector, more club or festival, more purist or eclectic — always grounded in the data.

HARD RULES:
- Speak to the user in the second person ("you"), never "this user" or "the profile".
- No promotional copy, no cheap jokes, no clickbait.
- Do not invent. If evidence is thin, omit or say so naturally.
- Forbidden to use the filler phrases listed in the system prompt. Forbidden to write bracketed technical markers.
- Do not say how many items the user has in total.
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
- Saved/attended events (sample): ${sampleEventsStr || 'no data'}
- Event contexts: ${eventContextsStr || 'no data'}
- Event lineups: ${eventLineupStr || 'no data'}
- Saved mixes (sample): ${sampleMixesStr || 'no data'}
- Recommended mixes from artists: ${recommendedMixesStr || 'no data'}
- Mix contexts: ${mixContextsStr || 'no data'}
- User-saved tracks in "My Tracks" (total ${savedTracksCount}; bracketed label = weekly top / new release / retro vinyl / profile Beatport top): ${savedChartTracksStr || 'no data'}
- Artists that recur most across those saved tracks: ${savedTrackArtistsStr || 'no data'}
- Labels that recur most across those saved tracks: ${savedTrackLabelsStr || 'no data'}
- Scene hints inferred from the data: ${sceneHintsStr || 'not enough data'}

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

  const p7Es = joinSentences(
    sampleEvents ? `En eventos aparecen ${sampleEvents}.` : '',
    eventContexts ? `Contextos: ${eventContexts}.` : '',
    eventLineup ? `Lineups con nombres como ${eventLineup}.` : '',
  )
  const p7En = joinSentences(
    sampleEvents ? `Events include ${sampleEvents}.` : '',
    eventContexts ? `Contexts: ${eventContexts}.` : '',
    eventLineup ? `Lineups with names such as ${eventLineup}.` : '',
  )

  const p8Es = `En conjunto, te acercas a un perfil ${eventBias}, probablemente entre selector y digger, con un gusto que se lee en fechas, nombres y sellos concretos más que en una etiqueta genérica.`
  const p8En = `Overall you lean toward a ${eventBias} profile, probably between selector and digger, with a taste that reads through concrete dates, names and labels rather than a broad tag.`

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
    const [favArtistsRes, favLabelsRes, attendanceRes, favEventsRes, savedMixesRes, savedTracksPage] = await Promise.all([
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
          .range(from, to),
      ),
    ])

    if (savedTracksPage.error) {
      console.error('[breakbeat-profile] saved_chart_tracks:', savedTracksPage.error)
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

    const allIds = [...artistIds, ...labelIds, ...eventIds, ...mixIds, ...savedTrackIds]
    if (allIds.length < 3) {
      return NextResponse.json({
        error: lang === 'es'
          ? 'Necesitas al menos 3 elementos guardados (artistas, sellos, eventos, mixes o tracks) para generar tu perfil breakbeatero'
          : 'You need at least 3 saved items (artists, labels, events, mixes or tracks) to generate your breakbeat profile',
      }, { status: 400 })
    }

    const currentHash = hashInputs(allIds)

    // Fetch entity details in parallel. `.in('id', 700 UUIDs)` tumba PostgREST;
    // el Top 100 ya trocea — aquí igual, o las New Releases no entran al ADN.
    type ChartLive = { id: string; title: string | null; mix_name: string | null; artists: unknown; label: string | null; bpm: number | null; release_year: number | null; release_date?: string | null }
    type FeatLive = { id: string; title: string | null; mix_name?: string | null; artists: unknown; label: string | null; release_year: number | null; release_date?: string | null }
    type VinylLive = { id: string; title: string | null; mix_name: string | null; artists: unknown; label: string | null; year: number | null }

    const [artistsRes, labelsRes, eventsRes, mixesRes, chartTracksRes, featuredTracksRes, vinylTracksRes] = await Promise.all([
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
          supabase.from('events').select('name, event_type, country, city, venue, lineup, date_start, tags').in('id', chunk),
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

    const stats = computeStats(
      (artistsRes.data as any[]) || [],
      (labelsRes.data as any[]) || [],
      (eventsRes.data as any[]) || [],
      (mixesRes.data as any[]) || [],
      chartTracksInput,
    )

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
