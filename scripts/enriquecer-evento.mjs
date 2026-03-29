/**
 * OPTIMAL BREAKS — Enriquecer evento: SerpAPI (web) + OpenAI → completa ficha en BD
 *
 * El usuario crea el evento (admin o Cursor) con datos minimos. Este script
 * busca en internet y rellena los campos que falten.
 *
 *   node scripts/enriquecer-evento.mjs <slug>
 *   node scripts/enriquecer-evento.mjs <slug> --with-poster
 *   node scripts/enriquecer-evento.mjs <slug> --dry-run
 *   node scripts/enriquecer-evento.mjs <slug> --force
 *
 * Utilidades de mantenimiento (no requieren OpenAI):
 *   node scripts/enriquecer-evento.mjs --prune-non-spain [--dry-run]
 *   node scripts/enriquecer-evento.mjs --delete-event-slug <slug>
 *   node scripts/enriquecer-evento.mjs --patch-raveart-winter-2026
 *   node scripts/enriquecer-evento.mjs --patch-raveart-summer-2026
 *
 * Credenciales (.env.local):
 *   OPENAI_API_KEY, SERPAPI_API_KEY (enriquecimiento)
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (siempre)
 *
 * Indice: node scripts/guia-base-datos.mjs run events-enrich <slug> [--flags]
 */

import { readFileSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'evento-enriquecer-system.txt')

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
// SerpAPI (busqueda web, no imagenes)
// ---------------------------------------------------------------------------

async function fetchSerpWebContext(query, apiKey, gl = 'es') {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', '10')
  if (gl) url.searchParams.set('gl', gl)
  url.searchParams.set('api_key', apiKey)
  const res = await fetch(url.toString())
  if (!res.ok) return ''
  const data = await res.json()
  const bits = []
  if (data.organic_results && Array.isArray(data.organic_results)) {
    for (const r of data.organic_results.slice(0, 10)) {
      if (r.title) bits.push(`Title: ${r.title}`)
      if (r.snippet) bits.push(`Snippet: ${r.snippet}`)
      if (r.link) bits.push(`URL: ${r.link}`)
      bits.push('---')
    }
  }
  return bits.join('\n').slice(0, 9000)
}

// ---------------------------------------------------------------------------
// OpenAI (JSON mode)
// ---------------------------------------------------------------------------

async function openAiJson({ system, user }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
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
  if (!content) throw new Error('Respuesta OpenAI vacia')
  let raw = content.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  return JSON.parse(raw)
}

// ---------------------------------------------------------------------------
// Enriquecimiento principal
// ---------------------------------------------------------------------------

function buildSearchQuery(event) {
  const name = String(event.name || '').trim()
  const city =
    event.city && String(event.city).trim() !== 'TBA'
      ? String(event.city).trim()
      : ''
  const country = event.country ? String(event.country).trim() : ''
  const venue = event.venue ? String(event.venue).trim() : ''
  let year = ''
  if (event.date_start) year = String(event.date_start).slice(0, 4)
  let q = `"${name}"`
  if (year) q += ` ${year}`
  if (city) q += ` ${city}`
  else if (country) q += ` ${country}`
  if (venue) q += ` ${venue}`
  q += ' festival event lineup'
  return q.replace(/\s+/g, ' ').trim()
}

/** true if val is empty/null/default in a way that means "not filled in" */
function isEmpty(val) {
  if (val == null) return true
  if (typeof val === 'string' && (val.trim() === '' || val.trim() === 'TBA')) return true
  if (Array.isArray(val) && val.length === 0) return true
  if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return true
  return false
}

const ENRICHABLE_FIELDS = [
  'name', 'description_en', 'description_es', 'event_type',
  'date_start', 'date_end', 'location', 'city', 'country', 'venue',
  'address', 'coords', 'lineup', 'stages', 'schedule', 'tags',
  'website', 'tickets_url', 'socials', 'capacity', 'age_restriction',
  'doors_open', 'doors_close', 'is_featured',
]

function mergeEnrichment(current, enriched, force) {
  const patch = {}
  for (const field of ENRICHABLE_FIELDS) {
    const newVal = enriched[field]
    if (isEmpty(newVal)) continue
    if (force || isEmpty(current[field])) {
      patch[field] = newVal
    }
  }
  return patch
}

function normalizeDate(val) {
  if (val == null || val === '') return null
  const s = String(val).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function normalizePatch(patch) {
  if ('date_start' in patch) patch.date_start = normalizeDate(patch.date_start)
  if ('date_end' in patch) patch.date_end = normalizeDate(patch.date_end)
  if ('website' in patch) {
    if (typeof patch.website !== 'string' || !patch.website.startsWith('https://')) {
      delete patch.website
    }
  }
  if ('tickets_url' in patch) {
    if (typeof patch.tickets_url !== 'string' || !patch.tickets_url.startsWith('https://')) {
      delete patch.tickets_url
    }
  }
  if ('lineup' in patch && Array.isArray(patch.lineup)) {
    patch.lineup = [...new Set(patch.lineup.map((s) => String(s).trim()).filter(Boolean))]
  }
  if ('tags' in patch && Array.isArray(patch.tags)) {
    patch.tags = [...new Set(patch.tags.map((s) => String(s).trim().toLowerCase()).filter(Boolean))]
  }
  if ('coords' in patch) {
    const c = patch.coords
    if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') delete patch.coords
  }
  return patch
}

async function runEnrich(slug, opts) {
  const sb = requireSupabase()
  const serpKey = process.env.SERPAPI_API_KEY?.trim()

  const { data: event, error: e0 } = await sb
    .from('events')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (e0) throw e0
  if (!event) {
    console.error('[enrich] No existe evento con slug:', slug)
    process.exit(1)
  }

  console.log('[enrich] Evento actual:', event.name, '|', event.slug)
  console.log('[enrich] date_start:', event.date_start, '| city:', event.city, '| lineup:', event.lineup?.length || 0)

  if (!existsSync(SYSTEM_PROMPT_PATH)) {
    throw new Error('Falta prompt: ' + SYSTEM_PROMPT_PATH)
  }
  const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim()

  let webContext = '(Sin busqueda web — falta SERPAPI_API_KEY)'
  if (serpKey) {
    const q = buildSearchQuery(event)
    console.log('[enrich] SerpAPI query:', q)
    webContext = await fetchSerpWebContext(q, serpKey)
    if (!webContext) webContext = '(Sin resultados de busqueda.)'
  } else {
    console.warn('[enrich] SERPAPI_API_KEY no disponible; solo OpenAI con conocimiento general.')
  }

  const today = new Date().toISOString().slice(0, 10)
  const userPrompt = `FICHA ACTUAL DEL EVENTO (JSON):
${JSON.stringify(event, null, 2)}

FECHA DE HOY: ${today}

CONTEXTO WEB (resultados de busqueda):
---
${webContext}
---

Completa o mejora los campos vacios/incompletos de este evento. Devuelve SOLO el JSON con todos los campos del esquema (ver sistema). Los campos que ya tienen valor correcto, repitelos tal cual.`

  console.log('[enrich] Consultando OpenAI...')
  const enriched = await openAiJson({ system: systemPrompt, user: userPrompt })

  const patch = normalizePatch(mergeEnrichment(event, enriched, opts.force))

  if (Object.keys(patch).length === 0) {
    console.log('[enrich] No hay campos nuevos que actualizar.')
    return
  }

  console.log('[enrich] Campos a actualizar:', Object.keys(patch).join(', '))

  if (opts.dryRun) {
    console.log('[enrich] --dry-run: no se escribe en BD.')
    console.log(JSON.stringify(patch, null, 2))
    return
  }

  const { error: e1 } = await sb.from('events').update(patch).eq('slug', slug)
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end, city, venue, lineup, tags, website, tickets_url, description_en, description_es')
    .eq('slug', slug)
    .maybeSingle()
  if (e2) throw e2
  console.log('[enrich] Actualizado:', JSON.stringify(after, null, 2))

  if (opts.withPoster) {
    console.log('[enrich] Lanzando elegir-poster-evento.mjs para', slug, '...')
    const posterScript = join(__dirname, 'elegir-poster-evento.mjs')
    const r = spawnSync(process.execPath, [posterScript, slug], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    if (r.status !== 0) {
      console.warn('[enrich] Poster script salio con codigo', r.status)
    }
  }
}

// ---------------------------------------------------------------------------
// Utilidades de mantenimiento (migradas de descubrir-eventos-breakbeat.mjs)
// ---------------------------------------------------------------------------

function isSpainCountry(raw) {
  if (raw == null) return false
  const s = String(raw).trim().toLowerCase()
  if (!s) return false
  if (s === 'spain') return true
  if (s === 'es') return true
  const n = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (n === 'espana') return true
  return false
}

async function fetchAllEventsMinimal(sb) {
  const pageSize = 1000
  let from = 0
  const all = []
  while (true) {
    const { data, error } = await sb
      .from('events')
      .select('id,slug,name,country')
      .order('slug')
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function runPruneNonSpain(sb, dryRun) {
  const rows = await fetchAllEventsMinimal(sb)
  const toDelete = rows.filter((r) => !isSpainCountry(r.country))
  const toKeep = rows.length - toDelete.length

  const byCountry = {}
  for (const r of rows) {
    const k = (r.country || '').trim() || '(vacio)'
    byCountry[k] = (byCountry[k] || 0) + 1
  }
  console.log('[prune-non-spain] Total eventos:', rows.length)
  console.log('[prune-non-spain] Por valor country:', JSON.stringify(byCountry, null, 2))
  console.log('[prune-non-spain] Se conservan (Espana):', toKeep)
  console.log('[prune-non-spain] Se eliminarian:', toDelete.length)

  if (toDelete.length === 0) {
    console.log('[prune-non-spain] Nada que borrar.')
    return
  }

  if (dryRun) {
    for (const r of toDelete.slice(0, 80)) {
      console.log('[prune-non-spain] dry-run:', r.slug, '|', JSON.stringify(r.country), '|', r.name?.slice(0, 60))
    }
    if (toDelete.length > 80) {
      console.log('[prune-non-spain] ...y', toDelete.length - 80, 'mas')
    }
    console.log('[prune-non-spain] Repite sin --dry-run para ejecutar DELETE.')
    return
  }

  const ids = toDelete.map((r) => r.id)
  const batch = 80
  let deleted = 0
  for (let i = 0; i < ids.length; i += batch) {
    const chunk = ids.slice(i, i + batch)
    const { error } = await sb.from('events').delete().in('id', chunk)
    if (error) throw error
    deleted += chunk.length
    console.log('[prune-non-spain] Borrados', deleted, '/', ids.length)
  }
  console.log('[prune-non-spain] Hecho. Eliminados:', deleted)
}

const SLUG_DELETE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i

async function runDeleteEventBySlug(sb, slug) {
  if (!slug || !SLUG_DELETE_PATTERN.test(slug)) {
    throw new Error('Slug vacio o no valido (solo letras, numeros y guiones).')
  }
  const { data, error } = await sb.from('events').delete().eq('slug', slug).select('slug,name')
  if (error) throw error
  if (!data?.length) {
    console.log('[delete-event] No habia fila con slug:', slug)
    return
  }
  console.log('[delete-event] Eliminado:', data)
}

// Parches Raveart puntuales

const RAVEART_WINTER_2026_SLUG = 'raveart-winter-festival-2026'

async function runPatchRaveartWinter2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end')
    .eq('slug', RAVEART_WINTER_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  if (!before) {
    console.error('[patch-raveart-winter] No existe fila:', RAVEART_WINTER_2026_SLUG)
    process.exit(1)
  }
  console.log('[patch-raveart-winter] antes:', before)
  const { error: e1 } = await sb
    .from('events')
    .update({ date_start: '2026-03-14', date_end: null })
    .eq('slug', RAVEART_WINTER_2026_SLUG)
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end')
    .eq('slug', RAVEART_WINTER_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-raveart-winter] despues:', after)
}

const RAVEART_SUMMER_2026_SLUG = 'raveart-summer-2026'

const EVENT_ROW_DEFAULTS = {
  stages: [],
  schedule: [],
  socials: {},
  tags: [],
  promoter_organization_id: null,
  image_url: null,
  capacity: null,
  age_restriction: null,
  doors_open: null,
  doors_close: null,
  address: null,
  coords: null,
  tickets_url: null,
}

const RAVEART_SUMMER_2026_ROW = {
  name: 'Raveart Summer Festival 2026',
  description_en:
    'XXIV Anniversary Summer Festival: Saturday 4 July 2026 at Hacienda El Chaparrejo in Alcala de Guadaira (Seville / Sevilla area). Official poster and updates on raveart.es.',
  description_es:
    'Summer Festival del XXIV Aniversario: sabado 4 de julio de 2026 en Hacienda El Chaparrejo, Alcala de Guadaira (Sevilla). Cartel e informacion en raveart.es.',
  event_type: 'upcoming',
  date_start: '2026-07-04',
  date_end: null,
  location: 'Hacienda El Chaparrejo, Alcala de Guadaira, Seville',
  city: 'Alcala de Guadaira',
  country: 'Spain',
  venue: 'Hacienda El Chaparrejo',
  website: 'https://www.raveart.es/',
}

async function runPatchRaveartSummer2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, location')
    .eq('slug', RAVEART_SUMMER_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-raveart-summer] antes:', before || '(sin fila)')

  const { data: org, error: eo } = await sb
    .from('organizations')
    .select('id')
    .eq('slug', 'raveart')
    .maybeSingle()
  if (eo) throw eo
  if (!org?.id) {
    console.error('[patch-raveart-summer] Falta organizations.slug = raveart')
    process.exit(1)
  }

  const row = {
    slug: RAVEART_SUMMER_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...RAVEART_SUMMER_2026_ROW,
    lineup: [],
    is_featured: true,
    promoter_organization_id: org.id,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end, city, venue, location, website')
    .eq('slug', RAVEART_SUMMER_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-raveart-summer] despues:', after)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseDeleteEventSlug(argv) {
  const i = argv.indexOf('--delete-event-slug')
  if (i === -1 || !argv[i + 1]) return ''
  return String(argv[i + 1]).trim()
}

async function main() {
  loadEnv()
  const argv = process.argv.slice(2)

  const dryRun = argv.includes('--dry-run')
  const force = argv.includes('--force')
  const withPoster = argv.includes('--with-poster')

  const sb = requireSupabase()

  if (argv.includes('--prune-non-spain')) {
    await runPruneNonSpain(sb, dryRun)
    return
  }

  if (argv.includes('--patch-raveart-winter-2026')) {
    await runPatchRaveartWinter2026(sb)
    return
  }

  if (argv.includes('--patch-raveart-summer-2026')) {
    await runPatchRaveartSummer2026(sb)
    return
  }

  const deleteSlug = parseDeleteEventSlug(argv)
  if (deleteSlug) {
    await runDeleteEventBySlug(sb, deleteSlug)
    return
  }

  if (argv.includes('--all')) {
    const { data: rows, error: eAll } = await sb
      .from('events')
      .select('slug')
      .order('date_start', { ascending: false })
    if (eAll) throw eAll
    console.log(`[enrich-all] ${rows.length} eventos a enriquecer (force=${force})...\n`)
    let updated = 0
    let skipped = 0
    let errors = 0
    for (let i = 0; i < rows.length; i++) {
      const s = rows[i].slug
      console.log(`\n── [${i + 1}/${rows.length}] ${s} ──`)
      try {
        await runEnrich(s, { dryRun, force, withPoster })
        updated++
      } catch (err) {
        console.error(`[enrich-all] ERROR en ${s}:`, err.message || err)
        errors++
      }
    }
    console.log(`\n[enrich-all] Terminado. Procesados: ${updated}, errores: ${errors}`)
    return
  }

  const slug = argv.find((a) => !a.startsWith('--'))
  if (!slug) {
    console.error(`Uso:
  node scripts/enriquecer-evento.mjs <slug> [--with-poster] [--dry-run] [--force]
  node scripts/enriquecer-evento.mjs --all [--force] [--dry-run] [--with-poster]
  node scripts/enriquecer-evento.mjs --prune-non-spain [--dry-run]
  node scripts/enriquecer-evento.mjs --delete-event-slug <slug>
  node scripts/enriquecer-evento.mjs --patch-raveart-winter-2026
  node scripts/enriquecer-evento.mjs --patch-raveart-summer-2026`)
    process.exit(1)
  }

  await runEnrich(slug, { dryRun, force, withPoster })
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
