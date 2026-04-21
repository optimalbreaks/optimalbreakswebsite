/**
 * OPTIMAL BREAKS — Tester local del ADN breakbeatero
 *
 * Reproduce en local la lógica del endpoint /api/breakbeat-profile para un
 * usuario dado por email (por defecto contacto@eskaladigital.com) y ejecuta
 * la llamada a OpenAI mostrando todos los logs crudos:
 *
 *  - Qué modelo está usando (primario + fallback).
 *  - Si la API key está presente y es válida.
 *  - HTTP status y body de error si la llamada falla.
 *  - Longitud del texto generado, nº de párrafos, si pasa la validación
 *    isStrongEnoughAnalysis (2400 chars / 6 párrafos).
 *  - Arquetipo devuelto y texto completo final (ES por defecto).
 *
 * Pensado para iterar en local: cambias el prompt o el modelo, relanzas, ves
 * si el LLM está respondiendo bien antes de volver a desplegar en Vercel.
 *
 * Uso:
 *   node scripts/test-breakbeat-profile.mjs
 *   node scripts/test-breakbeat-profile.mjs --email=otro@dominio.com
 *   node scripts/test-breakbeat-profile.mjs --lang=en
 *   node scripts/test-breakbeat-profile.mjs --model=gpt-4o
 *   node scripts/test-breakbeat-profile.mjs --show-prompt
 *   node scripts/test-breakbeat-profile.mjs --show-data
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 * Opcional:
 *   OPENAI_MODEL_PROFILE  (primario, por defecto lee OPENAI_MODEL o 'gpt-5.4')
 *   OPENAI_MODEL_PROFILE_FALLBACK  (por defecto 'gpt-4o')
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Env loader
// ---------------------------------------------------------------------------

function parseEnvText(text) {
  const out = {}
  let t0 = text
  if (t0.charCodeAt(0) === 0xfeff) t0 = t0.slice(1)
  for (const line of t0.split('\n')) {
    let t = line.trim()
    if (t.startsWith('export ')) t = t.slice(7).trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

function loadEnv() {
  const base = existsSync(join(ROOT, '.env'))
    ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8'))
    : {}
  const local = existsSync(join(ROOT, '.env.local'))
    ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8'))
    : {}
  const merged = { ...base, ...local }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnv()

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs() {
  const out = {
    email: 'contacto@eskaladigital.com',
    lang: 'es',
    model: null,
    showPrompt: false,
    showData: false,
  }
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--email=')) out.email = arg.slice(8).trim()
    else if (arg.startsWith('--lang=')) out.lang = arg.slice(7).trim() === 'en' ? 'en' : 'es'
    else if (arg.startsWith('--model=')) out.model = arg.slice(8).trim()
    else if (arg === '--show-prompt') out.showPrompt = true
    else if (arg === '--show-data') out.showData = true
  }
  return out
}

const ARGS = parseArgs()

// ---------------------------------------------------------------------------
// Supabase admin
// ---------------------------------------------------------------------------

function requireSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim()
  if (!url || !key) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function findUserIdByEmail(supabase, email) {
  // auth.admin.listUsers está paginado; buscamos recorriendo páginas hasta
  // encontrar (o agotar) — suficiente para entornos pequeños.
  const target = email.toLowerCase().trim()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    if (!data?.users?.length) break
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === target)
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

// ---------------------------------------------------------------------------
// Helpers (replicados del endpoint, ES-only → dedupe y lógica no varía)
// ---------------------------------------------------------------------------

function takeUniqueNonEmpty(values, limit = 5) {
  const seen = new Set()
  const out = []
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

function normalizeArtistEraToDecade(eraRaw) {
  const s = String(eraRaw || '').trim().toLowerCase()
  if (!s) return null
  if (/^(19|20)\d{2}s$/.test(s)) return s
  const decades = []
  const re = /\b((?:19|20)\d{2})s\b/g
  let m
  while ((m = re.exec(s)) !== null) decades.push(`${m[1]}s`)
  if (decades.length > 0) return decades[0]
  const ym = s.match(/\b((?:19|20)\d{2})\b/)
  if (ym) {
    const y = parseInt(ym[1], 10)
    return `${Math.floor(y / 10) * 10}s`
  }
  return null
}

function artistEraToReferenceYear(eraRaw) {
  const dec = normalizeArtistEraToDecade(eraRaw)
  if (!dec) return null
  const m = dec.match(/^((?:19|20)\d{2})s$/i)
  if (!m) return null
  return parseInt(m[1], 10) + 5
}

function formatMixType(mixType, lang) {
  const t = (mixType || 'unknown').trim().toLowerCase()
  const map = {
    essential_mix: { es: 'mix esencial (p. ej. Essential Mix u obra similar)', en: 'essential-style mix' },
    classic_set: { es: 'set clásico de club o pista', en: 'classic club-floor set' },
    radio_show: { es: 'programa o episodio de radio', en: 'radio show or episode' },
    youtube_session: { es: 'sesión larga en vídeo (grabada, no el nombre de una plataforma)', en: 'long recorded video session' },
    podcast: { es: 'podcast o mix en formato podcast', en: 'podcast or podcast-format mix' },
    unknown: { es: 'mix sin tipo definido', en: 'unspecified mix type' },
  }
  const row = map[t] || { es: 'otro formato de sesión', en: 'another session format' }
  return lang === 'es' ? row.es : row.en
}

function formatChartTrackSource(source, lang) {
  const map = {
    chart: { es: 'top semanal', en: 'weekly top' },
    featured: { es: 'new release', en: 'new release' },
    vinyl: { es: 'vinilo retro', en: 'retro vinyl' },
  }
  const row = map[source] || { es: 'track guardado', en: 'saved track' }
  return lang === 'es' ? row.es : row.en
}

function chartTrackContextLine(t, lang) {
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

function mixContextLine(m) {
  const artist = (m.artist_name || '').trim()
  let title = (m.title || '').trim()
  const y = m.year != null ? String(m.year) : ''
  if (artist && title) {
    const al = artist.toLowerCase()
    const tl = title.toLowerCase()
    if (!(tl === al || tl.startsWith(`${al} —`) || tl.startsWith(`${al} -`) || tl.startsWith(`${al}–`))) {
      title = `${artist} — ${title}`
    }
  } else if (!title) {
    title = artist
  }
  return [title, y].filter(Boolean).join(' — ')
}

function formatArtistRelease(release) {
  if (!release?.title) return ''
  const year = release.year ? ` (${release.year})` : ''
  const note = release.note ? ` · ${release.note}` : ''
  return `${release.title}${year}${note}`
}

function topPctEntries(obj, limit) {
  return Object.entries(obj)
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, pct]) => ({ name, pct }))
}

function topYearEntries(obj, limit) {
  return Object.entries(obj || {})
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([year, pct]) => ({ year, pct }))
}

function pctLabel(pct) {
  return `${Math.round(pct * 100)}%`
}

function inferSceneHints({ topStyles, topCountries, eraDistribution, categoryBreakdown }) {
  const styles = new Set(topStyles.map((s) => s.name))
  const countries = new Set(topCountries.map((c) => c.name))
  const eras = new Set(Object.keys(eraDistribution))
  const hints = []
  const push = (h) => { if (!hints.includes(h)) hints.push(h) }

  if (countries.has('UK')) {
    if (styles.has('nu_skool') || styles.has('big_beat') || styles.has('bassline') ||
        styles.has('progressive_breaks') || styles.has('acid_breaks')) {
      push('continuo británico de rave y breakbeat de club entre los 90 y los 2000')
    }
    if (styles.has('uk_garage') || styles.has('bass')) {
      push('eje UK garage, bass music y cultura soundsystem británica')
    }
  }
  if (countries.has('ES') || (categoryBreakdown.andalusian || 0) > 0) {
    push('escena andaluza de breaks y su circuito Cádiz-Sevilla/club-radio-coche')
  }
  if (countries.has('US')) {
    if (styles.has('florida_breaks')) push('tradición Florida breaks y su lectura más de pista')
    if (styles.has('electro') || eras.has('1980s')) push('raíces electro, hip-hop temprano y primeras culturas del break en Nueva York')
  }
  if (countries.has('AU')) push('rama australiana del breakbeat de club y sus cruces con bass music')
  if (styles.has('big_beat')) push('big beat y cruce entre cultura de club, rock sampleado y breaks de finales de los 90')
  if (styles.has('nu_skool')) push('nu skool breaks como reformulación moderna del breakbeat clásico')
  return hints.slice(0, 3)
}

function computeStats(artists, labels, events, mixes, chartTracks) {
  const styleCounts = {}
  const countryCounts = {}
  const eraCounts = {}
  const yearCounts = {}
  const catCounts = {}
  const maxYear = new Date().getFullYear() + 1
  const bumpYear = (y) => {
    if (!Number.isFinite(y) || y < 1970 || y > maxYear) return
    yearCounts[y] = (yearCounts[y] || 0) + 1
  }

  for (const a of artists) {
    for (const s of a.styles || []) styleCounts[s] = (styleCounts[s] || 0) + 1
    if (a.country) countryCounts[a.country] = (countryCounts[a.country] || 0) + 1
    if (a.era) {
      const eraBucket = normalizeArtistEraToDecade(a.era) || String(a.era).trim()
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
  const labelDecades = {}
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
  const eventCountries = new Set()
  for (const ev of events) {
    if (ev.event_type === 'festival') festivals++
    if (ev.event_type === 'club_night') clubNights++
    if (ev.country) eventCountries.add(ev.country)
  }

  const mixTaste = {}
  for (const m of mixes) {
    const t = m.mix_type || 'unknown'
    mixTaste[t] = (mixTaste[t] || 0) + 1
    if (m.year) {
      const decade = `${Math.floor(m.year / 10) * 10}s`
      eraCounts[decade] = (eraCounts[decade] || 0) + 1
      bumpYear(m.year)
    }
  }

  const trackLabelCounts = {}
  const trackLabelDisplay = {}
  const trackArtistCounts = {}
  const trackArtistDisplay = {}
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
      const trimmed = String(name || '').trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      trackArtistCounts[key] = (trackArtistCounts[key] || 0) + 1
      if (!(key in trackArtistDisplay)) trackArtistDisplay[key] = trimmed
    }
  }
  const toTopCounts = (counts, display, limit) =>
    Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([k, n]) => ({ name: display[k] || k, count: n }))
  const savedTrackLabels = toTopCounts(trackLabelCounts, trackLabelDisplay, 8)
  const savedTrackArtists = toTopCounts(trackArtistCounts, trackArtistDisplay, 8)

  const totalEras = Object.values(eraCounts).reduce((a, b) => a + b, 0) || 1
  const eraDistribution = {}
  for (const [era, count] of Object.entries(eraCounts)) {
    eraDistribution[era] = Math.round((count / totalEras) * 100) / 100
  }
  const totalYear = Object.values(yearCounts).reduce((a, b) => a + b, 0) || 1
  const yearDistribution = {}
  for (const [y, count] of Object.entries(yearCounts)) {
    yearDistribution[y] = Math.round((count / totalYear) * 100) / 100
  }
  const sceneHints = inferSceneHints({ topStyles, topCountries, eraDistribution, categoryBreakdown: catCounts })

  const sampleArtistReleases = takeUniqueNonEmpty(
    artists.flatMap((a) => (a.key_releases || []).map((r) => formatArtistRelease(r))), 8)
  const sampleTracks = takeUniqueNonEmpty(artists.flatMap((a) => a.essential_tracks || []), 8)
  const sampleRecommendedMixes = takeUniqueNonEmpty(artists.flatMap((a) => a.recommended_mixes || []), 6)
  const sampleLabelReleases = takeUniqueNonEmpty(labels.flatMap((l) => l.key_releases || []), 8)
  const sampleLabelArtists = takeUniqueNonEmpty(labels.flatMap((l) => l.key_artists || []), 8)
  const sampleEventLineup = takeUniqueNonEmpty(events.flatMap((e) => e.lineup || []), 8)
  const sampleEventContexts = takeUniqueNonEmpty(
    events.map((e) => [e.name, e.city, e.venue || '', (e.date_start || '').slice(0, 4)].filter(Boolean).join(' — ')), 6)
  const sampleMixContexts = takeUniqueNonEmpty(mixes.map((m) => mixContextLine(m)), 6)
  const sampleSavedChartTracks = takeUniqueNonEmpty(
    chartTracks.map((t) => chartTrackContextLine(t, 'es')), 10)
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
    total_data_points: artists.length + labels.length + events.length + mixes.length + chartTracks.length,
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

// ---------------------------------------------------------------------------
// Prompt (idéntico en texto al actual del endpoint)
// ---------------------------------------------------------------------------

function buildPrompts(stats, lang) {
  const stylesStr = stats.top_styles.map((s) => `${s.name} (${Math.round(s.pct * 100)}%)`).join(', ')
  const countriesStr = stats.top_countries.map((c) => `${c.name} (${Math.round(c.pct * 100)}%)`).join(', ')
  const erasStr = Object.entries(stats.era_distribution)
    .sort(([, a], [, b]) => b - a)
    .map(([era, pct]) => `${era}: ${Math.round(pct * 100)}%`).join(', ')
  const yearsStr = Object.entries(stats.year_distribution || {})
    .filter(([, pct]) => pct > 0)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .map(([y, pct]) => `${y}: ${Math.round(pct * 100)}%`).join(', ')
  const catsStr = Object.entries(stats.category_breakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, n]) => `${cat}: ${n}`).join(', ')
  const mixStr = Object.entries(stats.mix_taste)
    .sort(([, a], [, b]) => b - a)
    .map(([type, n]) => `${formatMixType(type, lang)}: ${n}`).join(', ')
  const labelDecadesStr = Object.entries(stats.label_decades)
    .sort(([, a], [, b]) => b - a)
    .map(([era, n]) => `${era}: ${n}`).join(', ')
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
    .map((l) => `${l.name} ×${l.count}`).join(', ')
  const savedTrackArtistsStr = (stats.saved_track_artists || [])
    .map((a) => `${a.name} ×${a.count}`).join(', ')
  const savedTracksCount = stats.saved_chart_tracks_count || 0
  const dominantErasStr = (stats.dominant_eras || [])
    .map((d) => `${d.name} (${pctLabel(d.pct)})`).join(', ')
  const dominantYearsStr = (stats.dominant_years || [])
    .map((d) => `${d.year} (${pctLabel(d.pct)})`).join(', ')
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
    : `You are a music critic and breakbeat culture analyst for Optimal Breaks. Speak to the user directly as "you". Tone: close, cultured, analytical. Every interpretive claim must be grounded in the data below. NEVER use filler like "it is not decorative", "it is no accident", "once you land on names". NEVER output internal markers like [top semanal], [new release], [vinilo retro], snake_case keys. Translate everything to natural prose.`

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
- Tracks de "Mis Tracks": si hay, cita al menos 4-6 por título y artista (y año si aparece). Jamás con marcadores entre corchetes: reformúlalos en prosa indicando de forma natural si salen del top semanal, de novedades o de rescates en vinilo retro.
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
- Años: ${yearsStr || 'sin datos'}
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
- Tracks guardadas por el usuario en "Mis Tracks" (total ${savedTracksCount}; fuentes entre corchetes = top semanal / new release / vinilo retro): ${savedChartTracksStr || 'sin datos'}
- Artistas que más se repiten en esas tracks guardadas: ${savedTrackArtistsStr || 'sin datos'}
- Sellos que más se repiten en esas tracks guardadas: ${savedTrackLabelsStr || 'sin datos'}
- Pistas de escena inferibles desde los datos: ${sceneHintsStr || 'sin datos suficientes'}

Responde EXACTAMENTE en este formato JSON:
{"archetype": "...", "text": "..."}`
    : `Write this user's breakbeat DNA. Reply JSON with {archetype, text}. Data: ${stylesStr} · ${countriesStr} · ${erasStr}.`

  return { systemPrompt, userPrompt }
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

function isStrongEnoughAnalysis(text) {
  const normalized = (text || '').trim()
  if (normalized.length < 2400) return false
  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean)
  return paragraphs.length >= 6
}

async function callOpenAI({ model, apiKey, systemPrompt, userPrompt }) {
  const t0 = Date.now()
  // Modelos "reasoning family" (gpt-5, o1, o3, o4) no aceptan `max_tokens`
  // ni `temperature != 1`. Usan `max_completion_tokens` y temperature default.
  const isReasoningFamily = /^(gpt-5|o1|o3|o4)/i.test(model)
  const body = {
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
  let res
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return { ok: false, reason: 'network_error', error: err?.message || String(err), elapsed: Date.now() - t0 }
  }

  const elapsed = Date.now() - t0
  const status = res.status
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return { ok: false, reason: `http_${status}`, status, rawError: errText, elapsed }
  }
  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content?.trim() || ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { ok: false, reason: 'no_json', status, rawContent: raw, elapsed }
  }
  let parsed
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    return { ok: false, reason: 'json_parse', status, rawContent: raw, error: err?.message, elapsed }
  }
  const text = parsed.text || ''
  const archetype = parsed.archetype || ''
  return {
    ok: true,
    status,
    archetype,
    text,
    textLength: text.length,
    paragraphs: text.split(/\n\s*\n/).filter(Boolean).length,
    passesStrongEnough: isStrongEnoughAnalysis(text),
    rawContent: raw,
    elapsed,
    usage: data.usage || null,
  }
}

// ---------------------------------------------------------------------------
// Data fetch (reproduce el endpoint)
// ---------------------------------------------------------------------------

function artistsToNames(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((a) => {
      if (!a) return ''
      if (typeof a === 'string') return a
      if (typeof a === 'object' && 'name' in a) return String(a.name || '')
      return ''
    })
    .map((s) => s.trim())
    .filter(Boolean)
}

async function fetchUserData(supabase, userId) {
  const [favArtistsRes, favLabelsRes, attendanceRes, favEventsRes, savedMixesRes, savedTracksRes] = await Promise.all([
    supabase.from('favorite_artists').select('artist_id').eq('user_id', userId),
    supabase.from('favorite_labels').select('label_id').eq('user_id', userId),
    supabase.from('event_attendance').select('event_id, status').eq('user_id', userId),
    supabase.from('favorite_events').select('event_id').eq('user_id', userId),
    supabase.from('saved_mixes').select('mix_id').eq('user_id', userId),
    supabase.from('saved_chart_tracks').select('track_source, track_id').eq('user_id', userId),
  ])

  const artistIds = favArtistsRes.data?.map((d) => d.artist_id) || []
  const labelIds = favLabelsRes.data?.map((d) => d.label_id) || []
  const eventIds = Array.from(new Set([
    ...(attendanceRes.data?.map((d) => d.event_id) || []),
    ...(favEventsRes.data?.map((d) => d.event_id) || []),
  ]))
  const mixIds = savedMixesRes.data?.map((d) => d.mix_id) || []
  const savedTrackRows = (savedTracksRes.data || [])
    .map((r) => ({ track_source: r.track_source, track_id: r.track_id }))
  const chartTrackIds = savedTrackRows.filter((r) => r.track_source === 'chart').map((r) => r.track_id)
  const featuredTrackIds = savedTrackRows.filter((r) => r.track_source === 'featured').map((r) => r.track_id)
  const vinylTrackIds = savedTrackRows.filter((r) => r.track_source === 'vinyl').map((r) => r.track_id)

  const [artistsRes, labelsRes, eventsRes, mixesRes, chartTracksRes, featuredTracksRes, vinylTracksRes] = await Promise.all([
    artistIds.length
      ? supabase.from('artists').select('name, styles, country, era, category, essential_tracks, recommended_mixes, key_releases').in('id', artistIds)
      : { data: [] },
    labelIds.length
      ? supabase.from('labels').select('name, country, founded_year, is_active, key_artists, key_releases').in('id', labelIds)
      : { data: [] },
    eventIds.length
      ? supabase.from('events').select('name, event_type, country, city, venue, lineup, date_start, tags').in('id', eventIds)
      : { data: [] },
    mixIds.length
      ? supabase.from('mixes').select('title, artist_name, mix_type, year, platform, duration_minutes').in('id', mixIds)
      : { data: [] },
    chartTrackIds.length
      ? supabase.from('chart_tracks').select('id, title, mix_name, artists, label, bpm, release_year').in('id', chartTrackIds)
      : { data: [] },
    featuredTrackIds.length
      ? supabase.from('chart_featured_tracks').select('id, title, artists, label, release_year').in('id', featuredTrackIds)
      : { data: [] },
    vinylTrackIds.length
      ? supabase.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year').in('id', vinylTrackIds)
      : { data: [] },
  ])

  const chartTracksInput = [
    ...((chartTracksRes.data || []).map((t) => ({
      source: 'chart',
      title: t.title || '',
      mix_name: t.mix_name || '',
      artist_names: artistsToNames(t.artists),
      label: t.label || '',
      year: t.release_year ?? null,
      bpm: t.bpm ?? null,
    }))),
    ...((featuredTracksRes.data || []).map((t) => ({
      source: 'featured',
      title: t.title || '',
      mix_name: '',
      artist_names: artistsToNames(t.artists),
      label: t.label || '',
      year: t.release_year ?? null,
      bpm: null,
    }))),
    ...((vinylTracksRes.data || []).map((t) => ({
      source: 'vinyl',
      title: t.title || '',
      mix_name: t.mix_name || '',
      artist_names: artistsToNames(t.artists),
      label: t.label || '',
      year: t.year ?? null,
      bpm: null,
    }))),
  ]

  return {
    artists: artistsRes.data || [],
    labels: labelsRes.data || [],
    events: eventsRes.data || [],
    mixes: mixesRes.data || [],
    chartTracks: chartTracksInput,
    counts: {
      favorite_artists: artistIds.length,
      favorite_labels: labelIds.length,
      events: eventIds.length,
      saved_mixes: mixIds.length,
      saved_tracks: savedTrackRows.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function banner(title) {
  const line = '═'.repeat(title.length + 4)
  console.log(`\n${line}`)
  console.log(`  ${title}  `)
  console.log(`${line}`)
}

function truncate(text, n = 600) {
  if (!text) return ''
  if (text.length <= n) return text
  return text.slice(0, n) + `…(${text.length - n} chars omitidos)`
}

async function main() {
  banner('ADN breakbeatero — Tester local')

  // 1) Env
  const openaiKey = process.env.OPENAI_API_KEY?.trim() || ''
  const modelPrimary = (ARGS.model || process.env.OPENAI_MODEL_PROFILE || process.env.OPENAI_MODEL || 'gpt-5.4').trim()
  const modelFallback = (process.env.OPENAI_MODEL_PROFILE_FALLBACK || 'gpt-4o').trim()

  console.log(`Email:                ${ARGS.email}`)
  console.log(`Idioma:               ${ARGS.lang}`)
  console.log(`OPENAI_API_KEY:       ${openaiKey ? `sí (${openaiKey.slice(0, 8)}…${openaiKey.slice(-4)})` : 'NO (falta en .env.local)'}`)
  console.log(`Modelo primario:      ${modelPrimary}`)
  console.log(`Modelo fallback:      ${modelFallback}`)

  if (!openaiKey) {
    console.error('\n✖ Sin OPENAI_API_KEY no puedo testear. Añade la key a .env.local y repite.')
    process.exit(1)
  }

  // 2) Supabase + usuario
  const supabase = requireSupabaseAdmin()
  banner('1. Buscar usuario por email')
  const userId = await findUserIdByEmail(supabase, ARGS.email)
  if (!userId) {
    console.error(`✖ No se encontró usuario con email=${ARGS.email} en auth.users`)
    process.exit(1)
  }
  console.log(`✓ user_id: ${userId}`)

  // 3) Cargar datos
  banner('2. Cargar datos del usuario')
  const data = await fetchUserData(supabase, userId)
  console.log(`Favoritos / pistas cargadas:`)
  console.log(`  artists:        ${data.counts.favorite_artists}  (detalles recuperados: ${data.artists.length})`)
  console.log(`  labels:         ${data.counts.favorite_labels}  (${data.labels.length})`)
  console.log(`  events:         ${data.counts.events}  (${data.events.length})`)
  console.log(`  saved_mixes:    ${data.counts.saved_mixes}  (${data.mixes.length})`)
  console.log(`  saved_tracks:   ${data.counts.saved_tracks}  (cargadas: ${data.chartTracks.length})`)

  // 4) Stats
  banner('3. Calcular stats')
  const stats = computeStats(data.artists, data.labels, data.events, data.mixes, data.chartTracks)
  console.log(`  top_styles:     ${stats.top_styles.slice(0, 5).map((s) => `${s.name}(${Math.round(s.pct * 100)}%)`).join(', ')}`)
  console.log(`  top_countries:  ${stats.top_countries.slice(0, 4).map((c) => `${c.name}(${Math.round(c.pct * 100)}%)`).join(', ')}`)
  console.log(`  eras:           ${Object.entries(stats.era_distribution).sort(([,a],[,b])=>b-a).slice(0,4).map(([k,v])=>`${k}:${Math.round(v*100)}%`).join(', ')}`)
  console.log(`  total_data_points: ${stats.total_data_points}`)

  if (ARGS.showData) {
    banner('3b. Stats completos (JSON)')
    console.log(JSON.stringify(stats, null, 2))
  }

  // 5) Prompts
  banner('4. Construir prompts')
  const { systemPrompt, userPrompt } = buildPrompts(stats, ARGS.lang)
  console.log(`  system len:     ${systemPrompt.length} chars`)
  console.log(`  user   len:     ${userPrompt.length} chars`)
  if (ARGS.showPrompt) {
    console.log('\n--- SYSTEM ---\n' + systemPrompt)
    console.log('\n--- USER ---\n' + userPrompt)
  }

  // 6) Llamadas OpenAI
  banner(`5. Llamar a OpenAI (modelo primario: ${modelPrimary})`)
  let result = await callOpenAI({ model: modelPrimary, apiKey: openaiKey, systemPrompt, userPrompt })
  console.log(`  elapsed:        ${result.elapsed} ms`)
  console.log(`  ok:             ${result.ok}`)
  if (!result.ok) {
    console.log(`  reason:         ${result.reason}`)
    if (result.status) console.log(`  http_status:    ${result.status}`)
    if (result.rawError) console.log(`  error body:\n${truncate(result.rawError, 1200)}`)
    if (result.rawContent) console.log(`  raw content:\n${truncate(result.rawContent, 800)}`)
    if (result.error) console.log(`  error msg:      ${result.error}`)

    if (modelFallback && modelFallback !== modelPrimary) {
      banner(`5b. Retry con modelo fallback: ${modelFallback}`)
      result = await callOpenAI({ model: modelFallback, apiKey: openaiKey, systemPrompt, userPrompt })
      console.log(`  elapsed:        ${result.elapsed} ms`)
      console.log(`  ok:             ${result.ok}`)
      if (!result.ok) {
        console.log(`  reason:         ${result.reason}`)
        if (result.status) console.log(`  http_status:    ${result.status}`)
        if (result.rawError) console.log(`  error body:\n${truncate(result.rawError, 1200)}`)
        if (result.rawContent) console.log(`  raw content:\n${truncate(result.rawContent, 800)}`)
      }
    }
  }

  if (result.ok) {
    banner('6. Resultado LLM')
    console.log(`  archetype:      ${result.archetype}`)
    console.log(`  text length:    ${result.textLength} chars`)
    console.log(`  paragraphs:     ${result.paragraphs}`)
    console.log(`  pasa strong?:   ${result.passesStrongEnough}   (min 2400 chars / 6 párrafos)`)
    if (result.usage) {
      console.log(`  tokens:         prompt=${result.usage.prompt_tokens}  completion=${result.usage.completion_tokens}  total=${result.usage.total_tokens}`)
    }
    banner('7. Texto generado')
    console.log(result.text)
  } else {
    banner('✖ No se pudo obtener texto del LLM (ni primario ni fallback)')
    process.exit(2)
  }
}

main().catch((err) => {
  console.error('\n[tester] Error inesperado:', err)
  process.exit(1)
})
