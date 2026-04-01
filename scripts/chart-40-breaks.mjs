/**
 * OPTIMAL BREAKS — 40 Breaks Vitales: scraping + curación IA + UPSERT Supabase
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

async function openAiJson({ system, user }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model = process.env.OPENAI_MODEL_CHART?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI ${res.status}: ${err}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Respuesta OpenAI vacía')
  let raw = content.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  return JSON.parse(raw)
}

// ---------------------------------------------------------------------------
// Scraping: Beatport Top 100 Breaks/Breakbeat/UK Bass (genre 9)
// ---------------------------------------------------------------------------

async function scrapeBeatport() {
  const url = 'https://www.beatport.com/genre/breaks-breakbeat-uk-bass/9/top-100'
  console.log(`  ↳ Fetching Beatport Top 100...`)
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`Beatport HTTP ${res.status}`)
  const html = await res.text()
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

    const artworkUrl = t.release?.image?.dynamic_uri
      ? t.release.image.dynamic_uri.replace('{w}', '250').replace('{h}', '250')
      : t.image?.dynamic_uri
        ? t.image.dynamic_uri.replace('{w}', '250').replace('{h}', '250')
        : null

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
    }
  })

  console.log(`  ↳ Parsed ${tracks.length} tracks from Beatport __NEXT_DATA__`)
  return tracks
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

Output EXACTLY 40 tracks as a JSON object with key "tracks", an array of objects:
{
  "tracks": [
    {
      "position": 1,
      "title": "Track Title",
      "mix_name": "Extended Mix",
      "artists": [{"name": "Artist Name", "beatport_url": "https://..."}],
      "label": "Label Name",
      "bpm": 135,
      "key": "Gb Major",
      "beatport_url": "https://www.beatport.com/track/...",
      "artwork_url": null,
      "sample_url": null
    }
  ]
}

If you cannot fill 40 quality tracks, fill all you can and pad to 40 with the best remaining from the source data. Keep all available metadata (BPM, key, URLs) intact from the source.`

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

// ---------------------------------------------------------------------------
// Previous edition comparison
// ---------------------------------------------------------------------------

async function getPreviousEdition(supabase) {
  const { data } = await supabase
    .from('chart_editions')
    .select('id, week_date')
    .eq('is_published', true)
    .order('week_date', { ascending: false })
    .limit(1)
  if (!data?.[0]) return { edition: null, tracks: [] }

  const { data: tracks } = await supabase
    .from('chart_tracks')
    .select('title, artists, position')
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
      .from('chart_tracks')
      .delete()
      .eq('chart_edition_id', editionId)

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
    key: t.key || '',
    beatport_url: t.beatport_url || null,
    artwork_url: t.artwork_url || null,
    sample_url: t.sample_url || null,
    previous_position: t.previous_position ?? null,
    weeks_in_chart: t.weeks_in_chart || 1,
  }))

  const { error: insertErr } = await supabase.from('chart_tracks').insert(rows)
  if (insertErr) throw new Error(`Insert chart_tracks: ${insertErr.message}`)

  console.log(`  ↳ Inserted ${rows.length} tracks`)
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

  // 2. AI curation
  let curated = await curateWithAI(beatportTracks, junoTracks)
  curated = curated.slice(0, 40).map((t, i) => ({ ...t, position: i + 1 }))

  // 3. Historical comparison
  if (confirm) {
    const supabase = requireSupabase()
    const { tracks: prevTracks } = await getPreviousEdition(supabase)
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
