/**
 * OPTIMAL BREAKS — Enriquecer con el agente las fichas «starter» creadas desde el chart
 *
 * Lee la misma fuente que sync-chart-artists (última semana publicada por defecto), construye
 * por cada slug los sellos y títulos de los temas donde aparece, y lanza:
 *   run agent -- <slug> "<name>" --revise --save-json --notes <tmp>
 *
 * Las notas priorizan contexto breakbeat / Beatport y, si el slug/nombre es ambiguo,
 * insisten en desambiguar con sellos + títulos del chart (no homónimos de otros géneros).
 *
 * Uso:
 *   node scripts/enrich-chart-artists-agent.mjs
 *   node scripts/enrich-chart-artists-agent.mjs --week=2026-03-30
 *   node scripts/enrich-chart-artists-agent.mjs --file=data/chart-draft.json
 *   node scripts/enrich-chart-artists-agent.mjs --force          # todos los del chart, aunque ya no sean starter
 *   node scripts/enrich-chart-artists-agent.mjs --dry-run --limit=5
 *   node scripts/enrich-chart-artists-agent.mjs --delay-ms=6000
 *   node scripts/enrich-chart-artists-agent.mjs --poor-bios-all --all-published [--limit=N]  # reescribe bios con autopromo OB / chart metadata
 *   node scripts/enrich-chart-artists-agent.mjs --photo-only --dry-run
 *   node scripts/enrich-chart-artists-agent.mjs --all-published --bootstrap-min-freq=3 [--bootstrap-only]
 *     # créditos del chart sin JSON local: agente nuevo + búsqueda; ≥N apariciones en 40 Breaks + New Releases.
 *     # Umbral editorial del catálogo: N=3 (artistas). Sellos: ver README / charts-catalog-discovery (≥10, sin DistroKid).
 *
 * Requiere: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE (salvo --file + --dry-run sin BD)
 * Opcional: SERPAPI_API_KEY
 *
 * Guía: node scripts/guia-base-datos.mjs run chart-artists-agent [-- …]
 * npm:   npm run db:chart:artists:agent -- [flags]
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync, spawn } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ARTISTS_DIR = join(ROOT, 'data', 'artists')
const NOTES_DIR = join(ROOT, 'tmp-chart-agent-notes')

/** Debe coincidir con CHART_NAME_TO_SLUG en sync-chart-artists.mjs */
const CHART_NAME_TO_SLUG = {
  'Dominic B UK': 'dominic-b',
  Mutantbreakz: 'mutant-breakz',
  'Huda Hudia': 'huda-hudia',
}

/** Slugs muy ambiguos → nota de desambiguación reforzada */
const AMBIGUOUS_SLUGS = new Set([
  'sans',
  'blanco',
  'bodhi',
  'notion',
  'miau',
  'ance',
  'ayk',
  'arthi',
  'borez',
  'ghezz',
  'orebeat',
  'xwile',
  'mvpz',
  'neumonic',
  'cocuns',
  'deep-impact',
  'king-of-the-beats',
  'x-prod',
  'dj-genesis',
  'loopcrashing',
  'inner-realms',
  'the-gaff',
  'stush',
  'sam-interface',
  'luke-dean',
  'manxito',
  'montylla',
  'amp-live',
  'analog-hustlers',
  'andrewfx',
  'bsd',
  'kuplay',
  'home-alone',
  'liars',
])

function parseArgs(argv) {
  let dryRun = false
  let force = false
  let photoOnly = false
  let allPublished = false
  let bootstrapOnly = false
  let poorBiosAll = false
  let weekDate = ''
  let filePath = ''
  let limit = Infinity
  let delayMs = 5000
  /** @type {number | null} */
  let bootstrapMinFreq = null
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true
    else if (a === '--force') force = true
    else if (a === '--photo-only') photoOnly = true
    else if (a === '--all-published') allPublished = true
    else if (a === '--bootstrap-only') bootstrapOnly = true
    else if (a === '--poor-bios-all') poorBiosAll = true
    else if (a.startsWith('--week=')) weekDate = a.slice('--week='.length).trim()
    else if (a.startsWith('--file=')) filePath = a.slice('--file='.length).trim()
    else if (a.startsWith('--bootstrap-min-freq=')) {
      const n = parseInt(a.slice('--bootstrap-min-freq='.length), 10)
      if (Number.isFinite(n) && n >= 1) bootstrapMinFreq = n
    } else if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10)
      if (Number.isFinite(n) && n > 0) limit = n
    } else if (a.startsWith('--delay-ms=')) {
      const n = parseInt(a.slice('--delay-ms='.length), 10)
      if (Number.isFinite(n) && n >= 0) delayMs = n
    }
  }
  return {
    dryRun,
    force,
    photoOnly,
    allPublished,
    bootstrapOnly,
    poorBiosAll,
    weekDate,
    filePath,
    limit,
    delayMs,
    bootstrapMinFreq,
  }
}

function stripParens(s) {
  return s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildCatalogIndexes() {
  const files = readdirSync(ARTISTS_DIR).filter((f) => f.endsWith('.json'))
  const byLower = new Map()
  const byStripped = new Map()
  for (const f of files) {
    const j = JSON.parse(readFileSync(join(ARTISTS_DIR, f), 'utf8'))
    const n = String(j.name || '').trim()
    if (!n) continue
    byLower.set(n.toLowerCase(), j.slug)
    byStripped.set(stripParens(n).toLowerCase(), j.slug)
  }
  return { byLower, byStripped }
}

function resolveSlug(chartName, byLower, byStripped) {
  if (CHART_NAME_TO_SLUG[chartName]) return CHART_NAME_TO_SLUG[chartName]
  let slug = byLower.get(chartName.toLowerCase())
  if (slug) return slug
  slug = byStripped.get(stripParens(chartName).toLowerCase())
  if (slug) return slug
  const s = slugify(chartName)
  if (existsSync(join(ARTISTS_DIR, `${s}.json`))) return s
  return null
}

function collectNamesFromArtistsArray(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map((a) => String(a?.name ?? '').trim()).filter(Boolean)
}

function isStarterProfileBio(j) {
  const es = String(j.bio_es || '')
  const en = String(j.bio_en || '')
  return (
    es.includes('Ficha inicial; el texto puede ampliarse') ||
    en.includes('Starter profile; editorial depth can grow over time')
  )
}

const POOR_BIO_RE =
  /Optimal Breaks|40 Breaks Vitales|listado extendido|extended artist roster|chart metadata|figura en el chart|appears in Optimal Breaks|tracked by Optimal Breaks|roster extendido de Optimal Breaks|extended Optimal Breaks roster/i

/** Fichas cuya bio es plantilla del chart o autopromo del sitio en lugar de biografía editorial. */
function isPoorProfileBio(j) {
  if (isStarterProfileBio(j)) return true
  const blob = `${j.bio_en || ''}\n${j.bio_es || ''}`
  if (POOR_BIO_RE.test(blob)) return true
  const kr = Array.isArray(j.key_releases) ? j.key_releases : []
  return kr.some((r) => /chart metadata|Optimal Breaks/i.test(String(r?.note || '')))
}

/** slug → { labels: Set, lines: string[] } (líneas "«title» — label") */
function makeContextMap() {
  return new Map()
}

function addContext(map, artistName, title, label, byLower, byStripped) {
  const slug = resolveSlug(artistName, byLower, byStripped)
  if (!slug) return
  let o = map.get(slug)
  if (!o) {
    o = { labels: new Set(), lines: [] }
    map.set(slug, o)
  }
  const lab = String(label || '').trim() || '(sin sello en chart)'
  const tit = String(title || '').trim() || '(sin título)'
  if (lab) o.labels.add(lab)
  const line = `«${tit}» — ${lab}`
  if (!o.lines.includes(line)) o.lines.push(line)
  if (o.lines.length > 12) o.lines = o.lines.slice(0, 12)
}

async function fetchChartContextFromSupabase({ allPublished, weekDate }) {
  const creds = supabaseApiCredentials()
  if (!creds) throw new Error('Faltan credenciales Supabase')
  const sb = createClient(creds.url, creds.key, { auth: { persistSession: false } })

  let q = sb.from('chart_editions').select('id, week_date').eq('is_published', true)
  if (!allPublished && weekDate) q = q.eq('week_date', weekDate)
  q = q.order('week_date', { ascending: false })
  if (!allPublished && !weekDate) q = q.limit(1)

  const { data: editions, error: e1 } = await q
  if (e1) throw e1
  if (!editions?.length) throw new Error('No hay edición publicada (chart_editions).')

  const ids = editions.map((e) => e.id)
  const label =
    allPublished || ids.length > 1
      ? `union ${ids.length} ediciones (${editions.map((e) => e.week_date).join(', ')})`
      : `semana ${editions[0].week_date}`

  const { byLower, byStripped } = buildCatalogIndexes()
  const map = makeContextMap()

  const { data: trks, error: e2 } = await sb
    .from('chart_tracks')
    .select('title, label, artists')
    .in('chart_edition_id', ids)
  if (e2) throw e2
  for (const row of trks || []) {
    const names = collectNamesFromArtistsArray(row.artists)
    for (const n of names) addContext(map, n, row.title, row.label, byLower, byStripped)
  }

  const { data: feat, error: e3 } = await sb
    .from('chart_featured_tracks')
    .select('title, label, artists')
    .in('chart_edition_id', ids)
  if (e3) throw e3
  for (const row of feat || []) {
    const names = collectNamesFromArtistsArray(row.artists)
    for (const n of names) addContext(map, n, row.title, row.label, byLower, byStripped)
  }

  return { contextBySlug: map, sourceLabel: label, chartSlugs: new Set(map.keys()) }
}

function buildContextFromFile(absPath) {
  const raw = JSON.parse(readFileSync(absPath, 'utf8'))
  const { byLower, byStripped } = buildCatalogIndexes()
  const map = makeContextMap()
  for (const t of raw.tracks || []) {
    const names = collectNamesFromArtistsArray(t.artists)
    for (const n of names) addContext(map, n, t.title, t.label, byLower, byStripped)
  }
  for (const t of raw.picks || []) {
    const names = collectNamesFromArtistsArray(t.artists)
    for (const n of names) addContext(map, n, t.title, t.label, byLower, byStripped)
  }
  return { contextBySlug: map, sourceLabel: absPath, chartSlugs: new Set(map.keys()) }
}

function buildNotesFile({ slug, name, ctx, weekHint, profileMode = 'revise' }) {
  const labels = ctx ? [...ctx.labels].sort() : []
  const lines = ctx?.lines?.length ? ctx.lines.slice(0, 10) : []
  const ambiguous = AMBIGUOUS_SLUGS.has(slug) || slug.length <= 4

  const enEdit =
    profileMode === 'new'
      ? `- There is **no** local profile yet for slug \`${slug}\`: produce a **full** encyclopedia-style Optimal Breaks JSON (not a placeholder).
- Anchor the profile in **breakbeat / electronic club**; this name appears multiple times in the Optimal Breaks weekly 40 / New Releases exports — mention the chart **once** in bios only if it fits naturally, never as the whole article.
- Use labels and track titles below as **disambiguation** cues; do not invent exact chart positions, sales, or dates.`
      : `- Revise and expand the existing JSON bios; keep the same artist identity and slug \`${slug}\`.
- Anchor the profile in **breakbeat / electronic club** context.
- **Never** mention Optimal Breaks, «40 Breaks Vitales», extended roster, chart metadata, or that the artist is listed on this website — write for readers who are already here.
- Use labels and track titles above only as **disambiguation** and scene hints; do not fabricate chart positions, sales, or exact dates.`

  const esEdit =
    profileMode === 'new'
      ? `- Aún **no** hay ficha local para el slug \`${slug}\`: genera una entrada **completa** al estilo Optimal Breaks (no un placeholder).
- Ancla el perfil en **breakbeat / electrónica de club**; este nombre aparece varias veces en los export del 40 / New Releases — menciona el chart **como mucho una vez** si encaja; nunca como texto único de la bio.
- Usa sellos y temas solo como **pistas de desambiguación**; no inventes posiciones exactas en listas, ventas ni fechas.`
      : `Instrucciones: revisa y amplía las bios del JSON; mantén slug \`${slug}\` y identidad; ancla en **breakbeat / electrónica de club**; **nunca** menciones Optimal Breaks, «40 Breaks Vitales», listado extendido ni metadatos del chart — el lector ya está en el sitio; usa sellos y títulos solo como pistas de desambiguación; no inventes datos.`

  let body = `# Chart context — Optimal Breaks «40 Breaks Vitales» (${weekHint})

This artist credit appears in the chart export with the following **release labels** (Beatport / editorial chart metadata):
${labels.length ? labels.map((l) => `- ${l}`).join('\n') : '- (no label column in source rows for this slug — rely on breakbeat scene + web search carefully)'}

**Tracks / credits in that chart snapshot (titles as stored; do not invent others):**
${lines.length ? lines.map((l) => `- ${l}`).join('\n') : '- (no per-track lines captured)'}

**Editor instructions (EN):**
${enEdit}
`

  if (ambiguous) {
    body += `
**DISAMBIGUATION (required):** The stage name is short or easily confused with unrelated acts. You MUST use the **labels and track lines above** plus conservative web context to describe the **correct** producer/DJ in the breaks/bass ecosystem — not a namesake from pop, rock, hip-hop, or film, unless the chart evidence clearly matches.
`
  }

  body += `
---
# Mismo contenido (ES) para el redactor

Contexto del chart **«40 Breaks Vitales»** (${weekHint}). Sellos bajo los que aparece en los metadatos exportados:
${labels.length ? labels.map((l) => `- ${l}`).join('\n') : '- (sin sellos en las filas para este slug)'}

**Temas / créditos en esa instantánea:**
${lines.length ? lines.map((l) => `- ${l}`).join('\n') : '- (sin líneas por tema)'}

${esEdit}
`
  if (ambiguous) {
    body += `\n**Desambiguación obligatoria:** nombre ambiguo; prioriza el acto correcto del ecosistema breaks/bass usando sellos y temas del chart.\n`
  }

  return body
}

function addLineToContextObj(o, title, label) {
  const lab = String(label || '').trim() || '(sin sello en chart)'
  const tit = String(title || '').trim() || '(sin título)'
  if (lab) o.labels.add(lab)
  const line = `«${tit}» — ${lab}`
  if (!o.lines.includes(line)) o.lines.push(line)
  if (o.lines.length > 12) o.lines = o.lines.slice(0, 12)
}

function contextForRawChartName(artistName, trks, feat) {
  const o = { labels: new Set(), lines: [] }
  for (const row of trks || []) {
    const names = collectNamesFromArtistsArray(row.artists)
    if (!names.includes(artistName)) continue
    addLineToContextObj(o, row.title, row.label)
  }
  for (const row of feat || []) {
    const names = collectNamesFromArtistsArray(row.artists)
    if (!names.includes(artistName)) continue
    addLineToContextObj(o, row.title, row.label)
  }
  return o
}

function collectMissingNameFrequency(trks, feat, byLower, byStripped) {
  const freq = new Map()
  function bump(artists) {
    for (const n of collectNamesFromArtistsArray(artists)) {
      if (!resolveSlug(n, byLower, byStripped)) {
        freq.set(n, (freq.get(n) || 0) + 1)
      }
    }
  }
  for (const row of trks || []) bump(row.artists)
  for (const row of feat || []) bump(row.artists)
  return freq
}

async function fetchRawChartTracksFromSupabase({ allPublished, weekDate }) {
  const creds = supabaseApiCredentials()
  if (!creds) throw new Error('Faltan credenciales Supabase')
  const sb = createClient(creds.url, creds.key, { auth: { persistSession: false } })

  let q = sb.from('chart_editions').select('id, week_date').eq('is_published', true)
  if (!allPublished && weekDate) q = q.eq('week_date', weekDate)
  q = q.order('week_date', { ascending: false })
  if (!allPublished && !weekDate) q = q.limit(1)

  const { data: editions, error: e1 } = await q
  if (e1) throw e1
  if (!editions?.length) throw new Error('No hay edición publicada (chart_editions).')

  const ids = editions.map((e) => e.id)
  const label =
    allPublished || ids.length > 1
      ? `union ${ids.length} ediciones (${editions.map((e) => e.week_date).join(', ')})`
      : `semana ${editions[0].week_date}`

  const { data: trks, error: e2 } = await sb
    .from('chart_tracks')
    .select('title, label, artists')
    .in('chart_edition_id', ids)
  if (e2) throw e2
  const { data: feat, error: e3 } = await sb
    .from('chart_featured_tracks')
    .select('title, label, artists')
    .in('chart_edition_id', ids)
  if (e3) throw e3
  return { trks: trks || [], feat: feat || [], sourceLabel: label }
}

async function runBootstrapMissingFrequent({
  bootstrapMinFreq,
  weekDate,
  dryRun,
  limit,
  delayMs,
}) {
  const { trks, feat, sourceLabel } = await fetchRawChartTracksFromSupabase({
    allPublished: !weekDate,
    weekDate,
  })
  const { byLower, byStripped } = buildCatalogIndexes()
  const freq = collectMissingNameFrequency(trks, feat, byLower, byStripped)
  const entries = [...freq.entries()]
    .filter(([, c]) => c >= bootstrapMinFreq)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }))
  const todo = []
  for (const [name, count] of entries) {
    const slug = slugify(name)
    const p = join(ARTISTS_DIR, `${slug}.json`)
    if (existsSync(p)) continue
    todo.push({ name, slug, count })
  }
  const sliced = todo.slice(0, limit)

  console.log(
    `[bootstrap] Fuente: ${sourceLabel} | sin JSON local con ≥${bootstrapMinFreq} apariciones: ${todo.length} | a procesar: ${sliced.length}`,
  )
  if (dryRun) {
    for (const t of sliced) console.log(`- ${t.count}x ${t.slug} (${t.name})`)
    return
  }

  mkdirSync(NOTES_DIR, { recursive: true })
  let ok = 0
  let fail = 0
  for (let i = 0; i < sliced.length; i++) {
    const { name, slug } = sliced[i]
    const ctx = contextForRawChartName(name, trks, feat)
    const notePath = join(NOTES_DIR, `bootstrap-${slug}-notes.md`)
    const text = buildNotesFile({
      slug,
      name,
      ctx,
      weekHint: sourceLabel,
      profileMode: 'new',
    })
    writeFileSync(notePath, text, 'utf8')

    console.log(`\n[bootstrap ${i + 1}/${sliced.length}] agent (nuevo) ${slug} (${name})\n`)
    const r = spawnSync(
      'node',
      ['scripts/guia-base-datos.mjs', 'run', 'agent', '--', slug, name, '--save-json', '--notes', notePath],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, OPENAI_MODEL: process.env.OPENAI_MODEL?.trim() || 'gpt-5.4' },
        shell: false,
      },
    )
    try {
      unlinkSync(notePath)
    } catch {}
    if (r.status === 0) ok++
    else {
      fail++
      console.error(`[bootstrap] Fallo ${slug} (exit ${r.status})`)
    }
    if (i < sliced.length - 1 && delayMs > 0) await sleep(delayMs)
  }
  console.log(`\n[bootstrap] Fin: ok=${ok} fallos=${fail}`)
  if (fail > 0) console.warn('[bootstrap] Revisa slugs fallidos y relanza el comando.')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function runPhotoForSlug(slug) {
  return new Promise((resolveFn) => {
    const child = spawn(
      'node',
      ['scripts/guia-base-datos.mjs', 'run', 'photo', '--', slug],
      { cwd: ROOT, stdio: 'inherit', env: process.env, shell: false },
    )
    child.on('error', (e) => {
      console.error(`[photo] ${slug}:`, e.message || e)
      resolveFn(1)
    })
    child.on('close', (code) => {
      if (code !== 0) console.warn(`[photo] ${slug} exit ${code}, continuo`)
      resolveFn(code ?? 1)
    })
  })
}

async function main() {
  loadEnvLocal()
  const argv = process.argv.slice(2)
  const {
    dryRun,
    force,
    photoOnly,
    allPublished,
    bootstrapOnly,
    poorBiosAll,
    weekDate,
    filePath,
    limit,
    delayMs,
    bootstrapMinFreq,
  } = parseArgs(argv)

  if (bootstrapMinFreq != null) {
    if (filePath) {
      console.error('Usa --bootstrap-min-freq solo sin --file (datos de Supabase).')
      process.exit(1)
    }
    if (!dryRun && !process.env.OPENAI_API_KEY?.trim()) {
      console.error('Falta OPENAI_API_KEY en .env.local')
      process.exit(1)
    }
    await runBootstrapMissingFrequent({
      bootstrapMinFreq,
      weekDate,
      dryRun,
      limit,
      delayMs,
    })
    if (bootstrapOnly) return
  }

  if (!photoOnly && !process.env.OPENAI_API_KEY?.trim() && !dryRun) {
    console.error('Falta OPENAI_API_KEY en .env.local')
    process.exit(1)
  }

  let contextBySlug
  let sourceLabel
  let chartSlugs

  if (filePath) {
    const abs = resolve(ROOT, filePath)
    if (!existsSync(abs)) {
      console.error('No existe:', abs)
      process.exit(1)
    }
    ;({ contextBySlug, sourceLabel, chartSlugs } = buildContextFromFile(abs))
  } else {
    const r = await fetchChartContextFromSupabase({
      allPublished: allPublished || poorBiosAll,
      weekDate,
    })
    contextBySlug = r.contextBySlug
    sourceLabel = r.sourceLabel
    chartSlugs = r.chartSlugs
  }

  if (chartSlugs.size === 0 && !poorBiosAll) {
    console.log('No hay contexto de chart (0 slugs).')
    return
  }

  if (photoOnly) {
    let slugs = [...chartSlugs].filter((s) => existsSync(join(ARTISTS_DIR, `${s}.json`))).sort()
    slugs = slugs.slice(0, limit)
    console.log(`Fuente: ${sourceLabel} | --photo-only: ${slugs.length} slug(s) con JSON local`)
    if (dryRun) {
      for (const s of slugs) console.log(`- ${s}`)
      return
    }
    let ok = 0
    let fail = 0
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i]
      console.log(`\n[${i + 1}/${slugs.length}] photo ${slug}\n`)
      const code = await runPhotoForSlug(slug)
      if (code === 0) ok++
      else fail++
      if (i < slugs.length - 1 && delayMs > 0) await sleep(delayMs)
    }
    console.log(`\nFotos chart: ok=${ok} fallos=${fail}`)
    return
  }

  const candidates = []
  const bioFilter = force ? () => true : isPoorProfileBio

  if (poorBiosAll) {
    const files = readdirSync(ARTISTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
    for (const f of files) {
      const p = join(ARTISTS_DIR, f)
      const j = JSON.parse(readFileSync(p, 'utf8'))
      if (!bioFilter(j)) continue
      const slug = String(j.slug || f.replace(/\.json$/, '')).trim()
      candidates.push({
        slug,
        name: String(j.name || slug).trim() || slug,
        ctx: contextBySlug?.get(slug),
      })
    }
  } else {
    for (const slug of chartSlugs) {
      const p = join(ARTISTS_DIR, `${slug}.json`)
      if (!existsSync(p)) {
        console.warn('Sin JSON local, omite:', slug)
        continue
      }
      const j = JSON.parse(readFileSync(p, 'utf8'))
      if (!bioFilter(j)) continue
      candidates.push({ slug, name: String(j.name || slug).trim() || slug, ctx: contextBySlug.get(slug) })
    }
  }

  const todo = candidates.slice(0, limit)
  console.log(`Fuente: ${sourceLabel}`)
  const modeLabel = poorBiosAll
    ? 'bio pobre (sin autopromo OB)'
    : force
      ? 'force'
      : 'bio pobre (sin autopromo OB)'
  console.log(
    poorBiosAll
      ? `Fichas con bio pobre en catálogo: ${candidates.length} | A procesar: ${todo.length}`
      : `Candidatos en chart: ${chartSlugs.size} | Con JSON + ${modeLabel}: ${candidates.length} | A procesar: ${todo.length}`,
  )

  if (dryRun) {
    for (const t of todo) {
      const amb = AMBIGUOUS_SLUGS.has(t.slug) || t.slug.length <= 4
      console.log(`- ${t.slug} (${t.name})${amb ? ' [ambiguo]' : ''}`)
    }
    return
  }

  mkdirSync(NOTES_DIR, { recursive: true })

  let ok = 0
  let fail = 0
  for (let i = 0; i < todo.length; i++) {
    const { slug, name, ctx } = todo[i]
    const notePath = join(NOTES_DIR, `${slug}-chart-notes.md`)
    const text = buildNotesFile({ slug, name, ctx, weekHint: sourceLabel, profileMode: 'revise' })
    writeFileSync(notePath, text, 'utf8')

    console.log(`\n[${i + 1}/${todo.length}] agent --revise ${slug} (${name})\n`)
    const r = spawnSync(
      'node',
      [
        'scripts/guia-base-datos.mjs',
        'run',
        'agent',
        '--',
        slug,
        name,
        '--revise',
        '--save-json',
        '--notes',
        notePath,
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, OPENAI_MODEL: process.env.OPENAI_MODEL?.trim() || 'gpt-5.4' },
        shell: false,
      },
    )
    try {
      unlinkSync(notePath)
    } catch {}

    if (r.status === 0) ok++
    else {
      fail++
      console.error(`Fallo agent en ${slug} (exit ${r.status})`)
    }
    if (i < todo.length - 1 && delayMs > 0) await sleep(delayMs)
  }

  console.log(`\nFin: ok=${ok} fallos=${fail}`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
