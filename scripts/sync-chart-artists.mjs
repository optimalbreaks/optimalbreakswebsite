/**
 * OPTIMAL BREAKS — Sincronizar artistas del chart «40 Breaks Vitales» → catálogo (JSON + Supabase)
 *
 * Tras publicar la semana en BD (chart-confirm + chart-featured-file), ejecuta esto para:
 * - Añadir en `styles` la etiqueta «Breakbeat» si no estaba.
 * - Añadir al final de bio_en/bio_es una mención al chart (una sola vez por ficha).
 * - Crear fichas starter para nombres que aún no existan en data/artists.
 *
 * Uso:
 *   node scripts/sync-chart-artists.mjs
 *   node scripts/sync-chart-artists.mjs --week=2026-03-30
 *   node scripts/sync-chart-artists.mjs --all-published
 *   node scripts/sync-chart-artists.mjs --file=data/chart-draft.json
 *   node scripts/sync-chart-artists.mjs --file=data/charts/picks/week-2026-03-30.example.json
 *   node scripts/sync-chart-artists.mjs --dry-run
 *
 * Índice: node scripts/guia-base-datos.mjs run chart-artists [-- …]
 * npm:    npm run db:chart:artists -- [--week=… | --all-published | --file=… | --dry-run]
 *
 * Requiere: .env.local → NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (salvo solo --file + --dry-run)
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { upsertArtist, loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ARTISTS_DIR = join(ROOT, 'data', 'artists')

/** Nombres del chart que no coinciden literalmente con `name` en el JSON del catálogo (replica en enrich-chart-artists-agent.mjs). */
const CHART_NAME_TO_SLUG = {
  'Dominic B UK': 'dominic-b',
  Mutantbreakz: 'mutant-breakz',
  'Huda Hudia': 'huda-hudia',
}

const BREAKBEAT_HINT_EN =
  'The artist appears in Optimal Breaks’ weekly breakbeat chart «40 Breaks Vitales», a Beatport-sourced, editorially curated snapshot of the current scene.'
const BREAKBEAT_HINT_ES =
  'El artista figura en el chart semanal de breakbeat «40 Breaks Vitales» de Optimal Breaks, una instantánea de la escena actual con base en Beatport y curación editorial.'

const STARTER_TAIL_EN =
  'Listed in the Optimal Breaks extended artist roster (2000s–present). Starter profile; editorial depth can grow over time.'
const STARTER_TAIL_ES =
  'Incluido en el listado extendido de artistas de Optimal Breaks (2000s–present). Ficha inicial; el texto puede ampliarse con el tiempo.'

function parseArgs(argv) {
  let dryRun = false
  let allPublished = false
  let weekDate = ''
  let filePath = ''
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true
    else if (a === '--all-published') allPublished = true
    else if (a.startsWith('--week=')) weekDate = a.slice('--week='.length).trim()
    else if (a.startsWith('--file=')) filePath = a.slice('--file='.length).trim()
  }
  return { dryRun, allPublished, weekDate, filePath }
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

function hasBreakbeat(styles) {
  if (!Array.isArray(styles)) return false
  return styles.some((x) => /breakbeat|breaks/i.test(String(x)))
}

function mergeStyles(styles) {
  const base = Array.isArray(styles) ? [...styles] : []
  const add = ['Breakbeat']
  for (const a of add) {
    if (!base.some((x) => String(x).toLowerCase() === a.toLowerCase())) base.push(a)
  }
  return base
}

function appendChartMention(bio, hint) {
  const t = String(bio || '').trim()
  if (!t) return hint
  if (t.includes('40 Breaks Vitales') || t.includes('«40 Breaks Vitales»')) return t
  return `${t}\n\n${hint}`
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
  const out = []
  if (!Array.isArray(arr)) return out
  for (const a of arr) {
    const n = String(a?.name ?? '').trim()
    if (n) out.push(n)
  }
  return out
}

function uniqueSorted(names) {
  const seen = new Set()
  const list = []
  for (const n of names) {
    const k = n.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    list.push(n)
  }
  return list.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}

function collectNamesFromDraftFile(absPath) {
  const raw = JSON.parse(readFileSync(absPath, 'utf8'))
  const names = []
  if (Array.isArray(raw.tracks)) {
    for (const t of raw.tracks) names.push(...collectNamesFromArtistsArray(t.artists))
  }
  if (Array.isArray(raw.picks)) {
    for (const t of raw.picks) names.push(...collectNamesFromArtistsArray(t.artists))
  }
  return uniqueSorted(names)
}

async function fetchChartArtistNamesFromSupabase({ allPublished, weekDate }) {
  const creds = supabaseApiCredentials()
  if (!creds) throw new Error('Faltan credenciales Supabase (NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE)')
  const sb = createClient(creds.url, creds.key, { auth: { persistSession: false } })

  let q = sb.from('chart_editions').select('id, week_date').eq('is_published', true)
  if (!allPublished && weekDate) q = q.eq('week_date', weekDate)
  q = q.order('week_date', { ascending: false })
  if (!allPublished && !weekDate) q = q.limit(1)

  const { data: editions, error: e1 } = await q
  if (e1) throw e1
  if (!editions?.length) {
    throw new Error(
      allPublished
        ? 'No hay ediciones publicadas en chart_editions.'
        : weekDate
          ? `No hay edición publicada con week_date=${weekDate}.`
          : 'No hay edición publicada (chart_editions). Publica antes el chart o usa --file=.',
    )
  }

  const ids = editions.map((e) => e.id)
  const label =
    allPublished || ids.length > 1
      ? `union ${ids.length} ediciones (${editions.map((e) => e.week_date).join(', ')})`
      : `semana ${editions[0].week_date}`

  const names = []

  const { data: trks, error: e2 } = await sb
    .from('chart_tracks')
    .select('artists')
    .in('chart_edition_id', ids)
  if (e2) throw e2
  for (const row of trks || []) names.push(...collectNamesFromArtistsArray(row.artists))

  const { data: feat, error: e3 } = await sb
    .from('chart_featured_tracks')
    .select('artists')
    .in('chart_edition_id', ids)
  if (e3) throw e3
  for (const row of feat || []) names.push(...collectNamesFromArtistsArray(row.artists))

  return { names: uniqueSorted(names), label }
}

async function nextSortOrderBase() {
  const creds = supabaseApiCredentials()
  if (!creds) return 960
  const sb = createClient(creds.url, creds.key, { auth: { persistSession: false } })
  const { data, error } = await sb
    .from('artists')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const m = Number(data?.sort_order)
  if (error || !Number.isFinite(m)) return 960
  return Math.max(960, Math.round(m) + 1)
}

async function main() {
  loadEnvLocal()
  const argv = process.argv.slice(2)
  const { dryRun, allPublished, weekDate, filePath } = parseArgs(argv)

  let chartNames = []
  let sourceLabel = ''

  if (filePath) {
    const abs = resolve(ROOT, filePath)
    if (!existsSync(abs)) {
      console.error('No existe el archivo:', abs)
      process.exit(1)
    }
    chartNames = collectNamesFromDraftFile(abs)
    sourceLabel = filePath
  } else {
    const r = await fetchChartArtistNamesFromSupabase({ allPublished, weekDate })
    chartNames = r.names
    sourceLabel = r.label
  }

  if (chartNames.length === 0) {
    console.log('No hay nombres de artista en la fuente.')
    return
  }

  console.log(`Fuente: ${sourceLabel}`)
  console.log(`Artistas únicos en chart: ${chartNames.length}`)
  if (dryRun) console.log('(dry-run: no se escribe disco ni Supabase)\n')

  const { byLower, byStripped } = buildCatalogIndexes()
  const toCreate = []
  const toUpdate = []

  for (const chartName of chartNames) {
    const slug = resolveSlug(chartName, byLower, byStripped)
    if (!slug) {
      const s = slugify(chartName)
      toCreate.push({ chartName, slug: s })
    } else {
      toUpdate.push({ chartName, slug })
    }
  }

  console.log(`Ya en catálogo: ${toUpdate.length} | Nuevos: ${toCreate.length}`)
  if (dryRun) {
    if (toCreate.length) console.log('Se crearían:', toCreate.map((x) => `${x.slug} (${x.chartName})`).join(', '))
    return
  }

  let sortBase = await nextSortOrderBase()
  for (const { chartName, slug } of toCreate) {
    sortBase += 1
    const name = chartName
    const obj = {
      slug,
      name,
      name_display: stripParens(name).toUpperCase().replace(/\s+/g, ' '),
      real_name: null,
      country: 'UK',
      category: 'current',
      styles: ['Breakbeat', 'Electronic', 'Bass'],
      era: '2000s–present',
      bio_en: `${BREAKBEAT_HINT_EN}\n\n${STARTER_TAIL_EN}`,
      bio_es: `${BREAKBEAT_HINT_ES}\n\n${STARTER_TAIL_ES}`,
      essential_tracks: [],
      recommended_mixes: [],
      related_artists: [],
      labels_founded: [],
      key_releases: [],
      socials: {},
      website: null,
      is_featured: false,
      sort_order: sortBase,
      image_url: null,
    }
    writeFileSync(join(ARTISTS_DIR, `${slug}.json`), JSON.stringify(obj, null, 2) + '\n', 'utf8')
    byLower.set(name.toLowerCase(), slug)
    byStripped.set(stripParens(name).toLowerCase(), slug)
    const row = await upsertArtist(obj)
    console.log('Creado+UPSERT:', slug, row?.id)
  }

  for (const { chartName, slug } of toUpdate) {
    const p = join(ARTISTS_DIR, `${slug}.json`)
    if (!existsSync(p)) {
      console.warn('Falta JSON local, se omite (crea o sincroniza desde BD):', slug)
      continue
    }
    const before = readFileSync(p, 'utf8')
    const j = JSON.parse(before)
    const hadBb = hasBreakbeat(j.styles)
    j.styles = mergeStyles(j.styles)
    j.bio_en = appendChartMention(j.bio_en, BREAKBEAT_HINT_EN)
    j.bio_es = appendChartMention(j.bio_es, BREAKBEAT_HINT_ES)
    if (chartName !== j.name && chartName.toLowerCase() !== String(j.name).toLowerCase()) {
      console.log('Nota chart vs catálogo:', chartName, '→', j.name, `(${slug})`)
    }
    const after = JSON.stringify(j, null, 2) + '\n'
    if (after === before) {
      console.log('Sin cambios:', slug)
      continue
    }
    writeFileSync(p, after, 'utf8')
    await upsertArtist(j)
    console.log('Actualizado:', slug, hadBb ? '(breakbeat ya figuraba)' : '+Breakbeat en styles')
  }

  console.log('Listo.')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
