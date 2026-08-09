/**
 * OPTIMAL BREAKS — 40 Breaks Vitales: scraping + curación IA + UPSERT Supabase
 *
 * Editorial: cada --week YYYY-MM-DD etiqueta la *edición* del chart (lunes de esa semana).
 * Beatport: se pide el Top 100 *en vivo* en el momento de la ejecución; no hay API de “top histórico”.
 * Para que los 40 temas reflejen “esta semana”, ejecuta --confirm cuando publiques esa edición.
 *
 *   node scripts/chart-40-breaks.mjs --dry-run
 *   node scripts/chart-40-breaks.mjs --confirm
 *   node scripts/chart-40-breaks.mjs --confirm --week 2026-03-30
 *   node scripts/chart-40-breaks.mjs --sources beatport,juno
 *
 * Credenciales (.env.local):
 *   OPENAI_API_KEY             (curación IA)
 *   NEXT_PUBLIC_SUPABASE_URL   (siempre)
 *   SUPABASE_SERVICE_ROLE_KEY  (siempre)
 */

import { execFileSync } from 'child_process'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Env
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
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
// Supabase
// ---------------------------------------------------------------------------

function requireSupabase() {
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

// ---------------------------------------------------------------------------
// OpenAI (JSON mode)
// ---------------------------------------------------------------------------

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function openAiJson({ system, user }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model = process.env.OPENAI_MODEL_CHART?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
  const body = JSON.stringify({
    model,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  let lastErr
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body,
    })
    if (res.ok) {
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('Respuesta OpenAI vacía')
      let raw = content.trim()
      if (raw.startsWith('```')) {
        raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
      }
      return JSON.parse(raw)
    }
    const err = await res.text()
    lastErr = new Error(`OpenAI ${res.status}: ${err}`)
    if (attempt < 4 && (res.status >= 500 || res.status === 429)) {
      console.log(`  ↳ OpenAI ${res.status}, reintento ${attempt + 1}/4…`)
      await sleepMs(3000 * attempt)
      continue
    }
    throw lastErr
  }
  throw lastErr
}

// ---------------------------------------------------------------------------
// Scraping: Beatport Top 100 Breaks/Breakbeat/UK Bass (genre 9)
// ---------------------------------------------------------------------------

const BEATPORT_TOP100_URL =
  'https://www.beatport.com/genre/breaks-breakbeat-uk-bass/9/top-100'

const BEATPORT_FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Redes con proxy TLS o huella undici → Beatport devuelve 403; curl -k suele funcionar. */
function fetchBeatportHtmlViaCurl(url) {
  try {
    return execFileSync(
      'curl',
      ['-k', '-sL', '--compressed', '-A', BEATPORT_FETCH_UA, url],
      { encoding: 'utf8', maxBuffer: 25 * 1024 * 1024 },
    )
  } catch (e) {
    throw new Error(`Beatport (curl): ${e.message}`)
  }
}

async function scrapeBeatport() {
  console.log(`  ↳ Fetching Beatport Top 100...`)
  let html
  try {
    const res = await fetch(BEATPORT_TOP100_URL, {
      headers: {
        'User-Agent': BEATPORT_FETCH_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) {
      console.log(`  ↳ Beatport HTTP ${res.status}, reintentando con curl -k…`)
      html = fetchBeatportHtmlViaCurl(BEATPORT_TOP100_URL)
    } else {
      html = await res.text()
    }
  } catch (err) {
    console.log(`  ↳ Beatport fetch: ${err.message} — curl -k…`)
    html = fetchBeatportHtmlViaCurl(BEATPORT_TOP100_URL)
  }
  if (!html || html.length < 500) {
    throw new Error('Beatport: HTML vacío o demasiado corto tras fetch/curl')
  }
  return parseBeatportNextData(html)
}

function parseBeatportNextData(html) {
  const marker = '__NEXT_DATA__'
  const idx = html.indexOf(marker)
  if (idx === -1) {
    console.log(`  ↳ __NEXT_DATA__ not found, falling back to regex parsing`)
    return parseBeatportHtmlFallback(html)
  }

  const start = html.indexOf('>', idx) + 1
  const end = html.indexOf('</script>', start)
  const nextData = JSON.parse(html.slice(start, end).trim())

  const queries = nextData.props?.pageProps?.dehydratedState?.queries || []
  const topQuery = queries.find((q) => q.queryKey?.[0]?.includes('top-100'))
  if (!topQuery) {
    console.log(`  ↳ top-100 query not found in __NEXT_DATA__`)
    return parseBeatportHtmlFallback(html)
  }

  const results = topQuery.state?.data?.results || []
  const tracks = results.map((t, i) => {
    const artists = (t.artists || []).map((a) => ({
      name: a.name,
      beatport_url: `https://www.beatport.com/artist/${a.slug}/${a.id}`,
    }))

    const artworkUrl = artworkUrlFromBeatportEntity(t)

    return {
      position: i + 1,
      title: (t.name || '').trim(),
      mix_name: (t.mix_name || '').trim(),
      artists,
      label: t.release?.label?.name || '',
      bpm: t.bpm || null,
      key: t.key?.name || '',
      beatport_url: `https://www.beatport.com/track/${t.slug}/${t.id}`,
      artwork_url: artworkUrl,
      sample_url: t.sample_url || null,
      waveform_url: waveformUrlFromBeatportEntity(t),
      release_year: beatportReleaseYear(t),
      release_date: beatportReleaseDate(t),
    }
  })

  console.log(`  ↳ Parsed ${tracks.length} tracks from Beatport __NEXT_DATA__`)
  return tracks
}

/** Imagen panorámica de onda del track (1500x250 PNG). NO es la carátula del release. */
function waveformUrlFromBeatportEntity(t) {
  const img = t.image
  if (!img) return null
  if (img.dynamic_uri) {
    return String(img.dynamic_uri).replace(/\{w\}/g, '1500').replace(/\{h\}/g, '250')
  }
  if (img.uri) return String(img.uri)
  return null
}

/** Año desde publish_date / new_release_date (YYYY-MM-DD) en payload Beatport. */
function beatportReleaseYear(t) {
  const raw = t.publish_date || t.new_release_date
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  if (!Number.isFinite(y) || y < 1970 || y > 2100) return null
  return y
}

/** Fecha YYYY-MM-DD desde publish_date / new_release_date en payload Beatport. */
function beatportReleaseDate(t) {
  const raw = t.publish_date || t.new_release_date
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** URL cuadrada de carátula (release preferido sobre imagen de track). */
function artworkUrlFromBeatportEntity(t) {
  const rel = t.release?.image
  const trk = t.image
  const pick = (img) => {
    if (!img) return null
    if (img.dynamic_uri) {
      return String(img.dynamic_uri).replace(/\{w\}/g, '250').replace(/\{h\}/g, '250')
    }
    if (img.uri) return String(img.uri)
    return null
  }
  return pick(rel) || pick(trk)
}

/** ID numérico del track en URL Beatport. */
function beatportTrackIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.trim().match(/\/track\/[^/]+\/(\d+)(?:[?#]|$)/)
  return m ? m[1] : null
}

/** Carátula, preview y año de publicación solo desde scrape Beatport (la IA no interviene). */
function mergeBeatportMetadata(curated, beatportTracks) {
  const byId = new Map()
  for (const src of beatportTracks) {
    const id = beatportTrackIdFromUrl(src.beatport_url)
    if (id) byId.set(id, src)
  }
  let filled = 0
  const out = curated.map((t) => {
    const {
      artwork_url: _a,
      sample_url: _s,
      release_year: _y,
      release_date: _d,
      waveform_url: _w,
      ...rest
    } = t
    const id = beatportTrackIdFromUrl(rest.beatport_url)
    const src = id ? byId.get(id) : null
    if (!src) {
      return {
        ...rest,
        artwork_url: null,
        sample_url: null,
        waveform_url: null,
        release_year: null,
        release_date: null,
      }
    }
    const artwork_url = src.artwork_url ?? null
    const sample_url = src.sample_url ?? null
    const waveform_url = src.waveform_url ?? null
    const release_year = src.release_year ?? null
    const release_date = src.release_date ?? null
    if (artwork_url) filled++
    return { ...rest, artwork_url, sample_url, waveform_url, release_year, release_date }
  })
  console.log(`  ↳ Carátula + sample + año (Beatport por id): ${filled}/${out.length} con imagen`)
  return out
}

/** La IA a veces repite el mismo `beatport_url`. Unifica por id y rellena hasta `n` desde el Top 100. */
function dedupeCuratedTracks(curated, beatportTracks, n = 40) {
  const seen = new Set()
  const out = []
  const push = (row) => {
    const id = beatportTrackIdFromUrl(row.beatport_url)
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push(row)
  }
  const aiIds = curated.slice(0, n).map((r) => beatportTrackIdFromUrl(r.beatport_url)).filter(Boolean)
  if (aiIds.length > new Set(aiIds).size) {
    console.log(`  ↳ Dedupe: la IA duplicó track(s) por id Beatport; reordenando + relleno desde Top 100.`)
  }
  for (const row of curated) {
    push(row)
    if (out.length >= n) break
  }
  if (out.length < n) {
    for (const t of beatportTracks) {
      push(t)
      if (out.length >= n) break
    }
  }
  if (out.length < n) {
    console.log(`  ⚠ Tras dedupe + relleno hay solo ${out.length}/${n} tracks.`)
  }
  return out.slice(0, n)
}

function parseBeatportHtmlFallback(html) {
  console.log(`  ↳ HTML fallback parser (limited data)`)
  const tracks = []
  const trackRegex = /href="\/track\/([^"]+?)\/(\d+)"/g
  let match
  let position = 0
  while ((match = trackRegex.exec(html)) !== null) {
    position++
    tracks.push({
      position,
      title: match[1].replace(/-/g, ' '),
      mix_name: '',
      artists: [],
      label: '',
      bpm: null,
      key: '',
      beatport_url: `https://www.beatport.com/track/${match[1]}/${match[2]}`,
      artwork_url: null,
      sample_url: null,
      waveform_url: null,
      release_year: null,
      release_date: null,
    })
  }
  console.log(`  ↳ Fallback parsed ${tracks.length} tracks`)
  return tracks
}

// ---------------------------------------------------------------------------
// Scraping: Juno Download (optional)
// ---------------------------------------------------------------------------

async function scrapeJuno() {
  const url = 'https://www.junodownload.com/breakbeat/charts/bestsellers/this-week/tracks/'
  console.log(`  ↳ Fetching Juno Download breakbeat chart...`)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    })
    if (!res.ok) {
      console.log(`  ↳ Juno returned ${res.status}, skipping`)
      return []
    }
    const html = await res.text()
    const tracks = []
    const trackPattern = /class="product-title[^"]*"[^>]*>([^<]+)</g
    let match
    let pos = 0
    while ((match = trackPattern.exec(html)) !== null) {
      pos++
      tracks.push({
        position: pos,
        title: match[1].trim(),
        source: 'juno',
      })
    }
    console.log(`  ↳ Found ${tracks.length} tracks on Juno`)
    return tracks
  } catch (err) {
    console.log(`  ↳ Juno scrape failed: ${err.message}`)
    return []
  }
}

// ---------------------------------------------------------------------------
// AI curation
// ---------------------------------------------------------------------------

const CURATION_SYSTEM_PROMPT = `You are a breakbeat music curator for the "40 Breaks Vitales" weekly chart published by Optimal Breaks (optimalbreaks.com).

You receive raw chart data from Beatport (and optionally Juno Download) for the Breaks / Breakbeat / UK Bass genre. Your job is to select and rank the 40 best tracks for a breakbeat-focused audience.

Selection criteria:
- Prioritize QUALITY and DANCEFLOOR impact — tracks that DJs would actually play
- Ensure VARIETY of artists — avoid more than 2 tracks by the same artist
- Represent the full SPECTRUM: nu skool breaks, UK bass, classic breaks style, Florida breaks, funky breaks, acid breaks
- Favor tracks that feel genuinely breakbeat over tracks that lean too heavily into house, techno or DnB
- Weight Beatport chart position as a strong signal but not the only one
- If Juno data is available, tracks appearing on both charts should be boosted

Output EXACTLY 40 tracks as a JSON object with key "tracks", an array of objects (no artwork or audio preview — those are added later from Beatport only):
{
  "tracks": [
    {
      "position": 1,
      "title": "Track Title",
      "mix_name": "Extended Mix",
      "artists": [{"name": "Artist Name", "beatport_url": "https://www.beatport.com/artist/..."}],
      "label": "Label Name",
      "bpm": 135,
      "key": "Gb Major",
      "beatport_url": "https://www.beatport.com/track/slug/12345678"
    }
  ]
}

Use the exact beatport_url from the Beatport list for each chosen track (same track id). Do not invent artwork_url, sample_url, or image URLs.

If you cannot fill 40 quality tracks, fill all you can and pad to 40 with the best remaining from the source data. Keep BPM, key, mix_name, and URLs consistent with the source lines.`

async function curateWithAI(beatportTracks, junoTracks = []) {
  console.log(`\n  🤖 Sending ${beatportTracks.length} tracks to OpenAI for curation...`)

  let userContent = `BEATPORT TOP 100 — Breaks / Breakbeat / UK Bass (${new Date().toISOString().slice(0, 10)}):\n\n`
  for (const t of beatportTracks) {
    const artists = t.artists.map((a) => a.name).join(', ')
    userContent += `#${t.position} | ${t.title} ${t.mix_name ? `(${t.mix_name})` : ''} | ${artists} | ${t.label} | ${t.bpm || '?'} BPM | ${t.key || '?'} | ${t.beatport_url}\n`
  }

  if (junoTracks.length > 0) {
    userContent += `\n\nJUNO DOWNLOAD BREAKBEAT BESTSELLERS:\n\n`
    for (const t of junoTracks.slice(0, 50)) {
      userContent += `#${t.position} | ${t.title}\n`
    }
  }

  userContent += `\n\nPlease curate the 40 Breaks Vitales from this data.`

  const result = await openAiJson({
    system: CURATION_SYSTEM_PROMPT,
    user: userContent,
  })

  if (!result.tracks || !Array.isArray(result.tracks)) {
    throw new Error('OpenAI did not return a "tracks" array')
  }

  console.log(`  ↳ AI returned ${result.tracks.length} curated tracks`)
  return result.tracks
}

function beatportTrackToCuratedRow(t) {
  return {
    title: t.title,
    mix_name: t.mix_name || '',
    artists: t.artists || [],
    label: t.label || '',
    bpm: t.bpm,
    key: t.key || '',
    beatport_url: t.beatport_url,
  }
}

/** Si OpenAI cae: Top Beatport con máx. 2 temas por artista principal. */
function curateBeatportFallback(beatportTracks, n = 40) {
  console.log(`  ⚠ Fallback editorial: Top Beatport (máx. 2 por artista principal)`)
  const out = []
  const seen = new Set()
  const artistCount = new Map()
  const push = (t, enforceArtistCap) => {
    const id = beatportTrackIdFromUrl(t.beatport_url)
    if (!id || seen.has(id)) return false
    const artist = (t.artists?.[0]?.name || '').trim().toLowerCase()
    if (enforceArtistCap && artist) {
      const c = artistCount.get(artist) || 0
      if (c >= 2) return false
      artistCount.set(artist, c + 1)
    }
    seen.add(id)
    out.push(beatportTrackToCuratedRow(t))
    return true
  }
  for (const t of beatportTracks) {
    push(t, true)
    if (out.length >= n) break
  }
  if (out.length < n) {
    for (const t of beatportTracks) {
      push(t, false)
      if (out.length >= n) break
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Previous edition comparison
// ---------------------------------------------------------------------------

async function getPreviousEdition(supabase, currentWeekDate) {
  // IMPORTANTE: la edición "anterior" debe ser estrictamente ANTES de la
  // semana que estamos publicando. Si `currentWeekDate` ya existe en la BD
  // (p. ej. porque el upsert de vinilos creó la fila vacía, o porque es un
  // re-run), NO debemos compararnos contra nosotros mismos: eso produciría
  // "NEW" en todos los tracks y rompería los movimientos (▲/▼/═) y el
  // contador `weeks_in_chart`.
  let q = supabase
    .from('chart_editions')
    .select('id, week_date')
    .eq('is_published', true)
  if (currentWeekDate) q = q.lt('week_date', currentWeekDate)
  const { data } = await q.order('week_date', { ascending: false }).limit(1)
  if (!data?.[0]) return { edition: null, tracks: [] }

  const { data: tracks } = await supabase
    .from('chart_tracks')
    .select('title, artists, position, weeks_in_chart')
    .eq('chart_edition_id', data[0].id)
    .order('position')

  return { edition: data[0], tracks: tracks || [] }
}

function enrichWithHistory(curated, previousTracks) {
  if (!previousTracks.length) {
    return curated.map((t) => ({ ...t, previous_position: null, weeks_in_chart: 1 }))
  }

  return curated.map((t) => {
    const titleLower = t.title.toLowerCase().trim()
    const artistNames = (t.artists || []).map((a) => a.name.toLowerCase().trim())

    const prev = previousTracks.find((p) => {
      const pTitle = (p.title || '').toLowerCase().trim()
      const pArtists = (p.artists || []).map((a) => (a.name || '').toLowerCase().trim())
      return pTitle === titleLower && artistNames.some((a) => pArtists.includes(a))
    })

    if (prev) {
      const prevWeeks = prev.weeks_in_chart || 1
      return { ...t, previous_position: prev.position, weeks_in_chart: prevWeeks + 1 }
    }
    return { ...t, previous_position: null, weeks_in_chart: 1 }
  })
}

// ---------------------------------------------------------------------------
// Week date calculation
// ---------------------------------------------------------------------------

function currentWeekMonday(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date()
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Terminal display
// ---------------------------------------------------------------------------

function printChart(tracks, weekDate) {
  console.log(`\n${'═'.repeat(80)}`)
  console.log(`  40 BREAKS VITALES — Semana del ${weekDate}`)
  console.log(`${'═'.repeat(80)}\n`)

  for (const t of tracks) {
    const pos = String(t.position).padStart(2)
    const artists = (t.artists || []).map((a) => a.name).join(', ')
    const movement =
      t.previous_position === null
        ? ' NEW'
        : t.previous_position > t.position
          ? ` ▲${t.previous_position - t.position}`
          : t.previous_position < t.position
            ? ` ▼${t.position - t.previous_position}`
            : ' ═'
    const weeks = t.weeks_in_chart > 1 ? ` [${t.weeks_in_chart}w]` : ''
    const bpmKey = [t.bpm ? `${t.bpm}BPM` : '', t.key].filter(Boolean).join(' ')

    console.log(
      `  ${pos}.${movement}${weeks}  ${t.title} ${t.mix_name ? `(${t.mix_name})` : ''}`
    )
    console.log(`      ${artists} — ${t.label}  ${bpmKey}`)
  }

  console.log(`\n${'═'.repeat(80)}`)
}

// ---------------------------------------------------------------------------
// Supabase UPSERT
// ---------------------------------------------------------------------------

/** Reordena posiciones (1..40) usando huecos libres; evita UNIQUE sin migración 058. */
function computeChartTrackPositionMoves(positions, target, empty) {
  const pos = new Map(positions)
  const holes = new Set(empty)
  const moves = []
  const maxIter = 10000
  let iter = 0
  const mismatch = () => [...target.entries()].find(([id, tp]) => pos.get(id) !== tp)
  while (mismatch()) {
    if (++iter > maxIter) throw new Error('computeChartTrackPositionMoves: demasiadas iteraciones')
    const [id, want] = mismatch()
    const cur = pos.get(id)
    if (holes.has(want)) {
      moves.push({ id, position: want })
      holes.delete(want)
      holes.add(cur)
      pos.set(id, want)
      continue
    }
    const blockerId = [...pos.entries()].find(([i, p]) => i !== id && p === want)?.[0]
    if (blockerId === undefined) {
      throw new Error(`chart_tracks: sin ocupante en posición ${want}`)
    }
    const temp = [...holes][0]
    if (temp === undefined) throw new Error('chart_tracks: sin hueco libre para reordenar')
    moves.push({ id: blockerId, position: temp })
    holes.delete(temp)
    holes.add(pos.get(blockerId))
    pos.set(blockerId, temp)
  }
  return moves
}

/** Con huecos (p. ej. tras borrar filas antes de insertar nuevas): solo UPDATE position + datos. */
async function syncChartTrackUpdatesWithFreeSlots(supabase, editionId, updates) {
  const ids = updates.map((u) => u.id)
  const { data: dbRows, error } = await supabase
    .from('chart_tracks')
    .select('id, position')
    .eq('chart_edition_id', editionId)
    .in('id', ids)
  if (error) throw new Error(`chart_tracks positions: ${error.message}`)
  const positions = new Map(dbRows.map((r) => [r.id, r.position]))
  const target = new Map(updates.map((u) => [u.id, u.data.position]))
  const used = new Set(positions.values())
  const holes = new Set()
  for (let p = 1; p <= 40; p++) {
    if (!used.has(p)) holes.add(p)
  }
  if (holes.size === 0) return false
  const moves = computeChartTrackPositionMoves(positions, target, holes)
  for (const m of moves) {
    const { error: upErr } = await supabase
      .from('chart_tracks')
      .update({ position: m.position })
      .eq('id', m.id)
    if (upErr) throw new Error(`reorder chart_tracks ${m.id}: ${upErr.message}`)
  }
  for (const u of updates) {
    const { error: upErr } = await supabase.from('chart_tracks').update(u.data).eq('id', u.id)
    if (upErr) throw new Error(`update chart_tracks ${u.id}: ${upErr.message}`)
  }
  return true
}

/** Sin huecos (permutación pura): una transacción en BD con UNIQUE DEFERRABLE (migración 058). */
async function applyChartTrackRowUpdatesRpc(supabase, updates) {
  const payload = updates.map((u) => ({ id: u.id, ...u.data }))
  const { error: rpcErr } = await supabase.rpc('apply_chart_tracks_row_updates', {
    p_updates: payload,
  })
  if (rpcErr) {
    throw new Error(
      `apply_chart_tracks_row_updates: ${rpcErr.message}. ` +
        'Aplica supabase/migrations/058_chart_tracks_position_unique_deferrable.sql en el proyecto.',
    )
  }
}

async function uploadToSupabase(supabase, tracks, weekDate, sources) {
  const title = `40 Breaks Vitales — ${weekDate}`

  const { data: existing } = await supabase
    .from('chart_editions')
    .select('id')
    .eq('week_date', weekDate)
    .maybeSingle()

  let editionId
  if (existing) {
    editionId = existing.id
    await supabase
      .from('chart_editions')
      .update({
        title,
        sources,
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .eq('id', editionId)
    console.log(`  ↳ Updated existing edition ${editionId}`)
  } else {
    const { data: inserted, error } = await supabase
      .from('chart_editions')
      .insert({
        week_date: weekDate,
        title,
        description_en: `The 40 breakbeat tracks defining the week of ${weekDate}.`,
        description_es: `Los 40 temas de breakbeat que definen la semana del ${weekDate}.`,
        sources,
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) throw new Error(`Insert chart_edition: ${error.message}`)
    editionId = inserted.id
    console.log(`  ↳ Created new edition ${editionId}`)
  }

  const rows = tracks.map((t) => ({
    chart_edition_id: editionId,
    position: t.position,
    title: t.title,
    mix_name: t.mix_name || '',
    artists: t.artists || [],
    label: t.label || '',
    bpm: t.bpm || null,
    music_key: t.key || '',
    beatport_url: t.beatport_url || null,
    artwork_url: t.artwork_url || null,
    sample_url: t.sample_url || null,
    waveform_url: t.waveform_url || null,
    release_year: t.release_year ?? null,
    release_date: t.release_date ?? null,
    previous_position: t.previous_position ?? null,
    weeks_in_chart: t.weeks_in_chart || 1,
  }))

  // Sync estable por `beatport_url`: no borramos+reinsertamos para no destruir
  // los UUIDs de `chart_tracks.id` y orfanar los `saved_chart_tracks` de los
  // usuarios (track_source='chart').
  const normalizeBeatport = (u) => {
    const s = (u || '').trim().toLowerCase()
    if (!s) return ''
    const m = s.match(/\/track\/[^/]+\/(\d+)$/)
    return m ? `beatport:${m[1]}` : s.replace(/\/$/, '')
  }
  const { data: existingRows, error: exErr } = await supabase
    .from('chart_tracks')
    .select('id, beatport_url')
    .eq('chart_edition_id', editionId)
  if (exErr) throw new Error(`load chart_tracks: ${exErr.message}`)

  const existingByKey = new Map()
  for (const r of existingRows || []) {
    const k = normalizeBeatport(r.beatport_url)
    if (k && !existingByKey.has(k)) existingByKey.set(k, r.id)
  }

  const newKeys = new Set()
  const updates = []
  const inserts = []
  for (const row of rows) {
    const k = normalizeBeatport(row.beatport_url)
    if (k) newKeys.add(k)
    const liveId = k ? existingByKey.get(k) : null
    if (liveId) updates.push({ id: liveId, data: row })
    else inserts.push(row)
  }
  const toDelete = []
  for (const [k, id] of existingByKey.entries()) {
    if (!newKeys.has(k)) toDelete.push(id)
  }

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('chart_tracks')
      .delete()
      .in('id', toDelete)
    if (delErr) throw new Error(`delete chart_tracks (no presentes): ${delErr.message}`)
  }
  if (updates.length > 0) {
    const usedFreeSlots = await syncChartTrackUpdatesWithFreeSlots(supabase, editionId, updates)
    if (!usedFreeSlots) await applyChartTrackRowUpdatesRpc(supabase, updates)
  }
  if (inserts.length > 0) {
    const { error: insertErr } = await supabase.from('chart_tracks').insert(inserts)
    if (insertErr) throw new Error(`Insert chart_tracks: ${insertErr.message}`)
  }

  console.log(
    `  ↳ Sync ${rows.length} tracks ` +
    `(${updates.length} actualizados, ${inserts.length} nuevos, ${toDelete.length} eliminados)`,
  )
  return editionId
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const confirm = args.includes('--confirm')
  const weekIdx = args.indexOf('--week')
  const weekDate = weekIdx !== -1 && args[weekIdx + 1]
    ? args[weekIdx + 1]
    : currentWeekMonday()

  const srcIdx = args.indexOf('--sources')
  const sourcesArg = srcIdx !== -1 && args[srcIdx + 1]
    ? args[srcIdx + 1].split(',').map((s) => s.trim().toLowerCase())
    : ['beatport']

  if (!dryRun && !confirm) {
    console.log(`
40 BREAKS VITALES — Script de chart semanal
════════════════════════════════════════════

Uso:
  node scripts/chart-40-breaks.mjs --dry-run              Proponer chart (solo terminal)
  node scripts/chart-40-breaks.mjs --confirm               Proponer y subir a Supabase
  node scripts/chart-40-breaks.mjs --confirm --week 2026-03-30  Fecha específica
  node scripts/chart-40-breaks.mjs --sources beatport,juno --dry-run

Fuentes disponibles: beatport, juno
`)
    process.exit(0)
  }

  console.log(`\n▸ 40 Breaks Vitales — ${dryRun ? 'DRY RUN' : 'CONFIRM'} — Semana ${weekDate}`)
  console.log(`  Fuentes: ${sourcesArg.join(', ')}`)

  // 1. Scrape
  let beatportTracks = []
  let junoTracks = []

  if (sourcesArg.includes('beatport')) {
    beatportTracks = await scrapeBeatport()
  }
  if (sourcesArg.includes('juno')) {
    junoTracks = await scrapeJuno()
  }

  if (beatportTracks.length === 0) {
    console.error('  ✗ No se obtuvieron tracks de Beatport. Abortando.')
    process.exit(1)
  }

  // 2. AI curation (fallback Top Beatport si la API falla)
  let curated
  try {
    curated = await curateWithAI(beatportTracks, junoTracks)
  } catch (err) {
    console.log(`  ⚠ Curación IA: ${err.message}`)
    curated = curateBeatportFallback(beatportTracks, 40)
  }
  curated = dedupeCuratedTracks(curated, beatportTracks, 40)
  curated = curated.map((t, i) => ({ ...t, position: i + 1 }))
  curated = mergeBeatportMetadata(curated, beatportTracks)

  // 3. Historical comparison (siempre contra la edición ESTRICTAMENTE anterior
  //    a `weekDate`, aunque la propia `weekDate` ya exista en la BD).
  if (confirm) {
    const supabase = requireSupabase()
    const { edition: prevEd, tracks: prevTracks } = await getPreviousEdition(supabase, weekDate)
    if (prevEd) {
      console.log(`  ↳ Comparando movimientos contra edición previa: ${prevEd.week_date} (${prevTracks.length} tracks)`)
    } else {
      console.log(`  ↳ No hay edición previa a ${weekDate}; todos los tracks serán NEW.`)
    }
    curated = enrichWithHistory(curated, prevTracks)
  } else {
    curated = curated.map((t) => ({ ...t, previous_position: null, weeks_in_chart: 1 }))
  }

  // 4. Display
  printChart(curated, weekDate)

  // 5. Save JSON draft
  const draftPath = join(ROOT, 'data', 'chart-draft.json')
  writeFileSync(draftPath, JSON.stringify({ week_date: weekDate, sources: sourcesArg, tracks: curated }, null, 2))
  console.log(`\n  ✓ Draft guardado en ${draftPath}`)

  // 6. Upload if --confirm
  if (confirm) {
    const supabase = requireSupabase()
    const editionId = await uploadToSupabase(supabase, curated, weekDate, sourcesArg)
    console.log(`\n  ✓ Chart publicado en Supabase (edition ${editionId})`)
  } else {
    console.log(`\n  ℹ Modo dry-run. Para subir a Supabase, ejecuta con --confirm`)
  }
}

main().catch((err) => {
  console.error(`\n  ✗ Error: ${err.message}`)
  process.exit(1)
})
