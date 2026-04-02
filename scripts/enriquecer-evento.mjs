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
 *   node scripts/enriquecer-evento.mjs --patch-raveart-rvt-we-love-retro-2026
 *   node scripts/enriquecer-evento.mjs --patch-raveart-rvt-booking-clubbing-2026
 *   node scripts/enriquecer-evento.mjs --patch-raveart-retro-halloween-2025-poster
 *   node scripts/enriquecer-evento.mjs --patch-kultura-breakz-ii-aniversario-2026
 *   node scripts/enriquecer-evento.mjs --patch-pure-bassline-7-aniversario-2026
 *   node scripts/enriquecer-evento.mjs --patch-malaga-is-break-3-aniversario-frequency-break-2026
 *   node scripts/enriquecer-evento.mjs --patch-cyber-bass-2026
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

Devuelve SOLO el JSON final con todos los campos del esquema (ver sistema).

Prioridades para este enriquecimiento:
- Respeta los valores existentes si ya son plausibles y el contexto no los contradice.
- Prioriza los campos que mas valor aportan a la BD y a la pagina de detalle: fecha, venue, ciudad, pais, location, address, lineup, stages, schedule, tags, website, tickets_url, socials, doors_open, doors_close, age_restriction y capacity.
- Si no hay dia exacto confirmado, deja date_start/date_end en null.
- Si no hay evidencia suficientemente clara para un campo, devuelvelo vacio en lugar de inferirlo.
- Las descripciones EN/ES deben contar la misma historia y no introducir hechos nuevos.

Los campos que ya tienen valor correcto, repitelos tal cual.`

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

const RAVEART_RETRO_HALLOWEEN_2025_SLUG = 'raveart-retro-halloween-2025'
const RAVEART_RETRO_HALLOWEEN_2025_IMAGE = '/images/events/retro-halloween-2025.webp'

async function runPatchRaveartRetroHalloween2025Poster(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, image_url')
    .eq('slug', RAVEART_RETRO_HALLOWEEN_2025_SLUG)
    .maybeSingle()
  if (e0) throw e0
  if (!before) {
    console.error('[patch-retro-halloween-2025] No existe fila:', RAVEART_RETRO_HALLOWEEN_2025_SLUG)
    process.exit(1)
  }
  console.log('[patch-retro-halloween-2025] antes:', before)
  const { error: e1 } = await sb
    .from('events')
    .update({ image_url: RAVEART_RETRO_HALLOWEEN_2025_IMAGE })
    .eq('slug', RAVEART_RETRO_HALLOWEEN_2025_SLUG)
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, image_url')
    .eq('slug', RAVEART_RETRO_HALLOWEEN_2025_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-retro-halloween-2025] despues:', after)
}

const RAVEART_SUMMER_2026_SLUG = 'raveart-summer-2026'

/** Confirmaciones oficiales (dos tandas); nombres tal cartel / comunicación Raveart. */
const RAVEART_SUMMER_2026_LINEUP = [
  'BREAKFASTAZ (world premiere)',
  '4AM KRU (live)',
  'Baymont Bross',
  'Hankook',
  'Nosk',
  'Paket',
  'Pray for Bass',
  'The Mind Hackers',
  'Backdraft',
  'Kid Panel',
  'Frannabik',
  'Karpin',
  'Norbak',
  'Prody',
  'Seveng',
  'Staxia',
]

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
  image_url: '/images/events/summer-festival-2026.webp',
  description_en:
    'XXIV anniversary edition on Saturday 4 July 2026 at Hacienda El Chaparrejo, Alcalá de Guadaíra (Seville area). Doors 16:00–07:00. First wave (international): BREAKFASTAZ (world premiere), 4AM KRU live. National: Baymont Bross, Hankook, Nosk, Paket, Pray for Bass, The Mind Hackers. Second wave: Backdraft, Kid Panel (Hungary); Frannabik, Karpin, Norbak, Prody, Seveng, Staxia. General admission includes entry plus minimum spend valid until 20:00; VIP adds VIP zone, drink, glass, re-entry pass within set hours and queue-free access. Tickets and updates on raveart.es.',
  description_es:
    'Edición del XXIV aniversario el sábado 4 de julio de 2026 en Hacienda El Chaparrejo, Alcalá de Guadaíra (Sevilla). Horario de apertura 16:00 h a 07:00 h. Primera tanda (internacionales): BREAKFASTAZ (primicia mundial), 4AM KRU en directo. Nacionales: Baymont Bross, Hankook, Nosk, Paket, Pray for Bass, The Mind Hackers. Segunda tanda: Backdraft, Kid Panel; Frannabik, Karpin, Norbak, Prody, Seveng, Staxia. Entrada general: entrada + consumición mínima válida hasta las 20:00 h. Entrada VIP: zona VIP, copa, vaso, bono ReAcceso en horarios establecidos y acceso sin colas. Venta de entradas e información en raveart.es.',
  event_type: 'upcoming',
  date_start: '2026-07-04',
  date_end: null,
  location: 'Hacienda El Chaparrejo, Alcalá de Guadaíra, Sevilla',
  city: 'Alcala de Guadaira',
  country: 'Spain',
  venue: 'Hacienda El Chaparrejo',
  website: 'https://www.raveart.es/',
  tickets_url: 'https://www.raveart.es/',
  doors_open: '16:00',
  doors_close: '07:00',
  lineup: RAVEART_SUMMER_2026_LINEUP,
  tags: [
    'Raveart',
    'Summer Festival',
    'breakbeat',
    'drum and bass',
    'Sevilla',
    'Alcalá de Guadaíra',
    '2026',
  ],
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

const RAVEART_RVT_WE_LOVE_RETRO_SLUG = 'raveart-rvt-we-love-retro-granada-2026'
const RAVEART_RVT_WE_LOVE_RETRO_POSTER = join(
  ROOT,
  'public',
  'images',
  'events',
  'raveart_we_lo_retro_2026.png',
)

const RAVEART_RVT_WE_LOVE_RETRO_ROW = {
  name: 'RVT by Raveart: We Love Retro w/ Freestylers',
  description_en:
    'RVT Booking & Clubbing presents We Love Retro at Sala El Tren (Granada): breakbeat night with Freestylers plus national support. Friday 10 April 2026, doors 1:00–7:00. Entry includes lanyard and beer (per promoter offer). Tickets via MonsterTicket. Official info: rvtpro.com.',
  description_es:
    'RVT Booking & Clubbing presenta We Love Retro en Sala El Tren (Granada): noche de breakbeat con Freestylers y artistas nacionales. Viernes 10 de abril de 2026, 1:00h–7:00h. La entrada incluye lanyard y cerveza (según oferta del promotor). Entradas en MonsterTicket. Info: rvtpro.com.',
  event_type: 'club_night',
  date_start: '2026-04-10',
  date_end: null,
  location: 'Sala El Tren, Chana, Granada, Spain',
  city: 'Granada',
  country: 'Spain',
  venue: 'Sala El Tren',
  address: 'Ctra. de Málaga, 136, Chana, Granada',
  website: 'https://www.rvtpro.com/',
  tickets_url:
    'https://www.monsterticket.com/evento/rvt-by-raveart-we-love-retro-w-freestylers--el-tren-granada',
  age_restriction: '18+',
  doors_open: '01:00',
  doors_close: '07:00',
  tags: ['breakbeat', 'raveart', 'granada', 'rvt'],
  lineup: [
    'Freestylers',
    'BLNK',
    'Jan B',
    'Killer',
    'Man',
    'Saturn',
    'Tilla Pink',
    'Wally',
  ],
}

async function uploadLocalPosterToMedia(sb, slug, absPath) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '')
  if (!baseUrl) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL')
  if (!existsSync(absPath)) {
    console.warn('[upload-poster] Sin cartel local, image_url no se actualiza:', absPath)
    return null
  }
  const normalized = `events/${slug}/poster.png`
  const buf = readFileSync(absPath)
  const { error } = await sb.storage.from('media').upload(normalized, buf, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw error
  return `${baseUrl}/storage/v1/object/public/media/${normalized}`
}

async function runPatchRaveartRvtWeLoveRetro2026(sb) {
  const { data: org, error: eo } = await sb
    .from('organizations')
    .select('id')
    .eq('slug', 'raveart')
    .maybeSingle()
  if (eo) throw eo
  if (!org?.id) {
    console.error('[patch-rvt-retro] Falta organizations.slug = raveart')
    process.exit(1)
  }

  let imageUrl = null
  try {
    imageUrl = await uploadLocalPosterToMedia(sb, RAVEART_RVT_WE_LOVE_RETRO_SLUG, RAVEART_RVT_WE_LOVE_RETRO_POSTER)
  } catch (e) {
    console.error('[patch-rvt-retro] Error subiendo cartel:', e.message || e)
    throw e
  }

  const row = {
    slug: RAVEART_RVT_WE_LOVE_RETRO_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...RAVEART_RVT_WE_LOVE_RETRO_ROW,
    image_url: imageUrl,
    is_featured: true,
    promoter_organization_id: org.id,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', RAVEART_RVT_WE_LOVE_RETRO_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-rvt-retro] OK:', after)
}

const RAVEART_RVT_BOOKING_CLUBBING_SLUG = 'raveart-rvt-booking-clubbing-elysium-2026'
const RAVEART_RVT_BOOKING_CLUBBING_POSTER = join(
  ROOT,
  'public',
  'images',
  'events',
  'raveart_booking_clubbing_2026.png',
)

const RAVEART_RVT_BOOKING_CLUBBING_ROW = {
  name: 'RVT: Raveart Booking & Clubbing w/ Freestylers',
  description_en:
    'Raveart Booking & Clubbing brings RVT to Elysium Sevilla: Freestylers headline a long-format night with a strong national lineup. Saturday 11 April 2026, 19:00–07:00 (12+ hours). Ticket types on rvtpro.com include early passes and VIP options per promoter. Tickets and info: rvtpro.com/entradas · clubbing@rvtpro.com.',
  description_es:
    'Raveart Booking & Clubbing presenta RVT en Elysium Sevilla: Freestylers encabezan una noche larga con cartel nacional. Sabado 11 de abril de 2026, 19:00h–7:00h (mas de 12 horas). Tipos de entrada en rvtpro.com (early pass, general con lanyard, VIP segun promotor). Entradas: rvtpro.com/entradas · clubbing@rvtpro.com.',
  event_type: 'club_night',
  date_start: '2026-04-11',
  date_end: null,
  location: 'Elysium Sevilla, Sevilla, Spain',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Elysium Sevilla',
  address: 'C/ La Red Seis, 39, Sevilla',
  website: 'https://www.rvtpro.com/',
  tickets_url: 'https://www.rvtpro.com/entradas',
  age_restriction: '18+',
  doors_open: '19:00',
  doors_close: '07:00',
  tags: ['breakbeat', 'raveart', 'sevilla', 'rvt', 'elysium'],
  lineup: [
    'Freestylers',
    'Aggresivnes',
    'Aldo Ferrari',
    'Destroyers',
    'Elle Skull',
    'G-One',
    'Hankook',
    'Korain',
    'Malanda',
    'Secret Shadow',
    'She Beat',
    'SL-Small',
  ],
  socials: {
    email: 'mailto:clubbing@rvtpro.com',
    phone: 'tel:+34657733208',
  },
}

async function runPatchRaveartRvtBookingClubbing2026(sb) {
  const { data: org, error: eo } = await sb
    .from('organizations')
    .select('id')
    .eq('slug', 'raveart')
    .maybeSingle()
  if (eo) throw eo
  if (!org?.id) {
    console.error('[patch-rvt-booking] Falta organizations.slug = raveart')
    process.exit(1)
  }

  let imageUrl = null
  try {
    imageUrl = await uploadLocalPosterToMedia(
      sb,
      RAVEART_RVT_BOOKING_CLUBBING_SLUG,
      RAVEART_RVT_BOOKING_CLUBBING_POSTER,
    )
  } catch (e) {
    console.error('[patch-rvt-booking] Error subiendo cartel:', e.message || e)
    throw e
  }

  const row = {
    slug: RAVEART_RVT_BOOKING_CLUBBING_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...RAVEART_RVT_BOOKING_CLUBBING_ROW,
    image_url: imageUrl,
    is_featured: true,
    promoter_organization_id: org.id,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', RAVEART_RVT_BOOKING_CLUBBING_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-rvt-booking] OK:', after)
}

const KULTURA_BREAKZ_II_SLUG = 'kultura-breakz-ii-aniversario-2026'
const KULTURA_BREAKZ_TICKETS =
  'https://site.fourvenues.com/es/dj-rokeh/events/ii-aniversario-kultura-breakz-02-05-2026-K0AA'

const KULTURA_BREAKZ_II_ROW = {
  name: 'II Aniversario Kultura Breakz',
  description_en:
    'Second anniversary of the Kultura Breakz radio show and community: Saturday 2 May 2026 at Sala Pandora, Seville. The lineup focuses on producers shaping the breakbeat scene — veterans such as Rasco, Guau and Geon (returning to a live event after more than ten years, exclusive appearance), plus Lords of Motion, Ro73 (pronounced Rote) and Jormek, all playing own productions, peers’ tracks and remixes. Organised in the spirit of “Familia Kultura Breakz”; tickets and invitations via Fourvenues. Weekly Kultura Breakz on Twitch, YouTube and associated channels; more info on kulturabreakz.com and djkultur.com.',
  description_es:
    'Segundo aniversario del programa y la comunidad Kultura Breakz: sábado 2 de mayo de 2026 en la sala Pandora, Sevilla. Apuesta por productores que construyen la escena breakbeat: veteranos como Rasco, Guau y Geon (más de diez años sin actuar en un evento, en exclusiva), junto a Lords Of Motion, Ro73 (pronúnciese Rote) y Jormek, con sesiones basadas en temas propios, de colegas y remixes. Convocatoria en clave “Familia Kultura Breakz”; invitaciones y entradas en Fourvenues. El programa sale todos los miércoles en Twitch, YouTube y canales asociados; más información en kulturabreakz.com y djkultur.com.',
  event_type: 'club_night',
  date_start: '2026-05-02',
  date_end: null,
  location: 'Sala Pandora, Sevilla',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Sala Pandora',
  website: 'https://www.kulturabreakz.com/',
  tickets_url: KULTURA_BREAKZ_TICKETS,
  lineup: [
    'Rasco',
    'Guau',
    'Geon',
    'Lords Of Motion',
    'Ro73',
    'Jormek',
    'DJ Rokeh',
  ],
  tags: [
    'kultura breakz',
    'breakbeat',
    'breakz',
    'nuskool breaks',
    'sevilla',
    'sala pandora',
    '2026',
    'dj kultur',
  ],
  image_url: '/images/events/2-aniversario-kultura-breakz--pandora.webp',
  socials: {
    'TikTok @kultur.exe': 'https://www.tiktok.com/@kultur.exe',
    'Instagram @kultur.exe': 'https://www.instagram.com/kultur.exe/',
    'Facebook Kültur': 'https://www.facebook.com/kulturdotexe/',
    'djkultur.com': 'https://www.djkultur.com/',
    'Twitch Kultura Breakz': 'https://www.twitch.tv/kulturabreakz',
    'YouTube Kultura Breakz': 'https://www.youtube.com/@kulturabreakz',
    'YouTube Kultur Archives': 'https://www.youtube.com/@kulturarchives',
    'Instagram @kultura_breakz': 'https://www.instagram.com/kultura_breakz/',
    'Facebook Kultura Breakz': 'https://www.facebook.com/kulturabreakz',
    'Grupo Facebook': 'https://www.facebook.com/groups/486865200520039',
  },
}

async function runPatchKulturaBreakzIiAniversario2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue')
    .eq('slug', KULTURA_BREAKZ_II_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-kultura-breakz-ii] antes:', before || '(sin fila)')

  const row = {
    slug: KULTURA_BREAKZ_II_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...KULTURA_BREAKZ_II_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, tickets_url, website')
    .eq('slug', KULTURA_BREAKZ_II_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-kultura-breakz-ii] OK:', after)
}

const PURE_BASSLINE_7_SLUG = 'pure-bassline-7-aniversario-2026'
const PURE_BASSLINE_TICKETS =
  'https://site.fourvenues.com/es/dj-rokeh/events/pure-bassline-7-aniversario-02-04-2026-0BJP'
const PURE_BASSLINE_IMAGE = '/images/events/Pure_bassline_2026.webp'

const PURE_BASSLINE_STAGES = [
  {
    name: 'Pure Bassline Room',
    description_en: 'Main room: breaks, bassline and related sounds on the official Pure Bassline timetable.',
    description_es:
      'Sala principal: breaks, bassline y sonidos afines según el horario oficial de Pure Bassline.',
    lineup: [
      'TWOOK × Tomy × KMK',
      'Pavane × Glow × JN Cruz',
      'Kuplay × Sans × Rhades',
      'Quadrat Beat × Under This',
      'Rasco × DJ Nitro × Sellrude',
      'Mbreaks × Wiguez',
      'Citybox',
      'V. Aparicio × Nokaut',
    ],
  },
  {
    name: 'The Moon Room (Dirty Kitchen Rave)',
    description_en: 'Second area curated by Dirty Kitchen Rave: hybrid bass and rave energy from 22:00.',
    description_es: 'Segundo espacio a cargo de Dirty Kitchen Rave: bass híbrido y energía rave desde las 22:00.',
    lineup: [
      'Percybass',
      'Blow',
      'Wez Whatevr',
      'Acenoise',
      'Godino',
      'Afghan Headspin',
      'Datafunk',
      'Manxito',
      'Squat Party B2B Syndkt',
    ],
  },
]

const PURE_BASSLINE_SCHEDULE = [
  { time: '22:00', artist: 'Percybass', stage: 'The Moon Room (Dirty Kitchen Rave)' },
  { time: '23:00', artist: 'Blow', stage: 'The Moon Room (Dirty Kitchen Rave)' },
  { time: '00:00', artist: 'TWOOK × Tomy × KMK', stage: 'Pure Bassline Room' },
  { time: '00:00', artist: 'Wez Whatevr', stage: 'The Moon Room (Dirty Kitchen Rave)' },
  { time: '00:50', artist: 'Acenoise', stage: 'The Moon Room (Dirty Kitchen Rave)' },
  { time: '01:00', artist: 'Pavane × Glow × JN Cruz', stage: 'Pure Bassline Room' },
  { time: '01:40', artist: 'Godino', stage: 'The Moon Room (Dirty Kitchen Rave)' },
  { time: '02:00', artist: 'Kuplay × Sans × Rhades', stage: 'Pure Bassline Room' },
  { time: '02:30', artist: 'Afghan Headspin', stage: 'The Moon Room (Dirty Kitchen Rave)' },
  { time: '03:00', artist: 'Quadrat Beat × Under This', stage: 'Pure Bassline Room' },
  { time: '03:20', artist: 'Datafunk', stage: 'The Moon Room (Dirty Kitchen Rave)' },
  { time: '04:00', artist: 'Rasco × DJ Nitro × Sellrude', stage: 'Pure Bassline Room' },
  { time: '04:10', artist: 'Manxito', stage: 'The Moon Room (Dirty Kitchen Rave)' },
  { time: '04:45', artist: 'Mbreaks × Wiguez', stage: 'Pure Bassline Room' },
  { time: '05:00', artist: 'Squat Party B2B Syndkt', stage: 'The Moon Room (Dirty Kitchen Rave)', is_b2b: true },
  { time: '05:30', artist: 'Citybox', stage: 'Pure Bassline Room' },
  { time: '06:15', artist: 'V. Aparicio × Nokaut', stage: 'Pure Bassline Room' },
]

const PURE_BASSLINE_7_ROW = {
  name: 'Pure Bassline 7º Aniversario',
  description_en:
    'Seventh anniversary of Pure Bassline on Thursday 2 April 2026 (Maundy Thursday) at Sala Pandora, Seville. Advertised as 12+ hours across three areas with 25+ artists: the main Pure Bassline room (breaks and bass-focused sets) and The Moon Room by Dirty Kitchen Rave. Hosted by Cellux MC. Official guest list and ticket sales via Fourvenues (DJ Rokeh).',
  description_es:
    'Séptimo aniversario de Pure Bassline el jueves 2 de abril de 2026 (Jueves Santo) en la sala Pandora, Sevilla. Convocatoria de más de doce horas, tres áreas y más de veinticinco artistas: sala principal Pure Bassline (breaks y sonidos de bajo) y The Moon Room a cargo de Dirty Kitchen Rave. Presentación con Cellux MC. Invitaciones y venta de entradas en Fourvenues (RRPP oficial: DJ Rokeh).',
  event_type: 'club_night',
  date_start: '2026-04-02',
  date_end: null,
  location: 'Sala Pandora, Sevilla',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Sala Pandora',
  website: null,
  tickets_url: PURE_BASSLINE_TICKETS,
  image_url: PURE_BASSLINE_IMAGE,
  lineup: [
    'TWOOK',
    'Tomy',
    'KMK',
    'Pavane',
    'Glow',
    'JN Cruz',
    'Kuplay',
    'Sans',
    'Rhades',
    'Quadrat Beat',
    'Under This',
    'Rasco',
    'DJ Nitro',
    'Sellrude',
    'Mbreaks',
    'Wiguez',
    'Citybox',
    'V. Aparicio',
    'Nokaut',
    'Percybass',
    'Blow',
    'Wez Whatevr',
    'Acenoise',
    'Godino',
    'Afghan Headspin',
    'Datafunk',
    'Manxito',
    'Squat Party',
    'Syndkt',
    'Cellux MC',
    'DJ Rokeh',
  ],
  stages: PURE_BASSLINE_STAGES,
  schedule: PURE_BASSLINE_SCHEDULE,
  tags: [
    'pure bassline',
    'bassline',
    'breaks',
    'breakbeat',
    'dirty kitchen rave',
    'sevilla',
    'sala pandora',
    '2026',
    'dj rokeh',
    'fourvenues',
  ],
  socials: {},
  doors_open: '22:00',
  doors_close: '10:00',
}

async function runPatchPureBassline7Aniversario2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', PURE_BASSLINE_7_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-pure-bassline-7] antes:', before || '(sin fila)')

  const row = {
    slug: PURE_BASSLINE_7_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...PURE_BASSLINE_7_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', PURE_BASSLINE_7_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-pure-bassline-7] OK:', after)
}

const MALAGA_IS_BREAK_2026_SLUG = 'malaga-is-break-3-aniversario-frequency-break-2026'
const MALAGA_IS_BREAK_TICKETS =
  'https://www.monsterticket.com/evento/malaga-is-break-3-aniversario-frequency-break'
const MALAGA_IS_BREAK_IMAGE = '/images/events/malaga_is_break.webp'

const MALAGA_IS_BREAK_LINEUP = [
  'SHADE K vs BAMER 29 (Brothers Battle)',
  'VAZTERIA X',
  'EVIL CREW vs PLAYBASS',
  'ISMA BREAKZ vs WINGBREAKS',
  'Datafunk',
  'JN Cruz',
  'Manxito',
  'Franetik',
  'TTBeats',
  'Bassko',
  'Wallmaster',
  '100duritos',
  'CBK',
]

const MALAGA_IS_BREAK_2026_ROW = {
  name: 'Malaga is Break (3 Aniversario Frequency Break)',
  description_en:
    'Third-anniversary Frequency Break night in MIB theme: Friday 3 April 2026 at Sala Roka, Málaga. Lineup from the official poster and @frequencybreak: brothers battle SHADE K vs BAMER 29, VAZTERIA X, crew battles EVIL CREW vs PLAYBASS and ISMA BREAKZ vs WINGBREAKS, plus Datafunk, JN Cruz, Manxito, Franetik, TTBeats, Bassko, Wallmaster, 100duritos and CBK. Advance €10 + drink (copa); door €15 + drink per flyer. Promoter note: Sala Roka does not charge for wristbands. Tickets on MonsterTicket; 18+ only. Calle Leda 1, Málaga.',
  description_es:
    'Tercer aniversario de Frequency Break con propuesta MIB: viernes 3 de abril de 2026 en la Sala Roka, Málaga. Cartel según flyer e Instagram @frequencybreak: batalla de hermanos SHADE K vs BAMER 29, VAZTERIA X, batallas EVIL CREW vs PLAYBASS e ISMA BREAKZ vs WINGBREAKS, más Datafunk, JN Cruz, Manxito, Franetik, TTBeats, Bassko, Wallmaster, 100duritos y CBK. Anticipada 10 € + copa; taquilla 15 € + copa (cartel). Aviso del promotor: Sala Roka no cobra pulsera. Entradas en MonsterTicket; +18. Calle Leda 1, Málaga.',
  event_type: 'club_night',
  date_start: '2026-04-03',
  date_end: null,
  location: 'Sala Roka, Málaga',
  city: 'Málaga',
  country: 'Spain',
  venue: 'Sala Roka',
  address: 'Calle Leda 1, Málaga',
  website: 'https://www.instagram.com/frequencybreak/',
  tickets_url: MALAGA_IS_BREAK_TICKETS,
  image_url: MALAGA_IS_BREAK_IMAGE,
  lineup: MALAGA_IS_BREAK_LINEUP,
  tags: [
    'malaga is break',
    'frequency break',
    'mib',
    'breakbeat',
    'breaks',
    'málaga',
    'sala roka',
    '2026',
    'monsterticket',
    'shade k',
    'bamer 29',
    'battles',
  ],
  socials: {
    Instagram: 'https://www.instagram.com/frequencybreak/',
  },
  age_restriction: '18+',
}

async function runPatchMalagaIsBreak3AniversarioFrequencyBreak2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', MALAGA_IS_BREAK_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-malaga-is-break-2026] antes:', before || '(sin fila)')

  const row = {
    slug: MALAGA_IS_BREAK_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...MALAGA_IS_BREAK_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', MALAGA_IS_BREAK_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-malaga-is-break-2026] OK:', after)
}

const CYBER_BASS_2026_SLUG = 'cyber-bass-2026'
const CYBER_BASS_TICKETS =
  'https://www.monsterticket.com/evento/cyber-bass-goat-breakbeat'
const CYBER_BASS_IMAGE = '/images/events/cyber-bass-2026.webp'

const CYBER_BASS_2026_LINEUP = [
  'Tortu',
  'Norbak',
  'Jan-B',
  'Prody',
  'Godino',
  'Nicola Slof',
  'Franetik',
  'Superbreak',
  'V. Aparicio',
  'Kid:Katana',
]

const CYBER_BASS_2026_ROW = {
  name: 'Cyber Bass 2026',
  description_en:
    'GOAT Breakbeat presents Cyber Bass 2026 on Saturday 18 April 2026 at Sala Maruja Limón, Alhaurín de la Torre (Málaga province). Doors 23:30. Headliners Tortu, Norbak and Jan-B; support from Prody, Godino, Nicola Slof, Franetik and Superbreak; plus the Goat crew with V. Aparicio and Kid:Katana. The flyer lists VIP zones, LED screens and cold CO2 effects. Non-nominal tickets on MonsterTicket; no entry under 18 per the official listing. Address: Av. Las Americas, Nave 1 y 2, Alhaurín de la Torre.',
  description_es:
    'GOAT Breakbeat presenta Cyber Bass 2026 el sábado 18 de abril de 2026 en la Sala Maruja Limón, Alhaurín de la Torre (provincia de Málaga). Apertura 23:30 h. Cabezas de cartel Tortu, Norbak y Jan-B; soporte Prody, Godino, Nicola Slof, Franetik y Superbreak; más el crew Goat con V. Aparicio y Kid:Katana. El cartel anuncia zonas VIP, pantallas LED y efectos de CO2 en frío. Entradas no nominativas en MonsterTicket; prohibido el acceso a menores de 18 años según la ficha oficial. Dirección: Av. Las Americas, Nave 1 y 2, Alhaurín de la Torre.',
  event_type: 'club_night',
  date_start: '2026-04-18',
  date_end: null,
  location: 'Sala Maruja Limón, Alhaurín de la Torre, Málaga',
  city: 'Alhaurín de la Torre',
  country: 'Spain',
  venue: 'Sala Maruja Limón',
  address: 'Av. Las Americas, Nave 1 y 2, Alhaurín de la Torre, Málaga',
  website: null,
  tickets_url: CYBER_BASS_TICKETS,
  image_url: CYBER_BASS_IMAGE,
  lineup: CYBER_BASS_2026_LINEUP,
  tags: [
    'cyber bass',
    'goat breakbeat',
    'breakbeat',
    'breaks',
    'alhaurín de la torre',
    'málaga',
    'sala maruja limón',
    'tortu',
    'norbak',
    'jan-b',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
  doors_open: '23:30',
  doors_close: null,
}

async function runPatchCyberBass2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', CYBER_BASS_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-cyber-bass-2026] antes:', before || '(sin fila)')

  const row = {
    slug: CYBER_BASS_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...CYBER_BASS_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', CYBER_BASS_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-cyber-bass-2026] OK:', after)
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

  if (argv.includes('--patch-raveart-rvt-we-love-retro-2026')) {
    await runPatchRaveartRvtWeLoveRetro2026(sb)
    return
  }

  if (argv.includes('--patch-raveart-rvt-booking-clubbing-2026')) {
    await runPatchRaveartRvtBookingClubbing2026(sb)
    return
  }

  if (argv.includes('--patch-raveart-retro-halloween-2025-poster')) {
    await runPatchRaveartRetroHalloween2025Poster(sb)
    return
  }

  if (argv.includes('--patch-kultura-breakz-ii-aniversario-2026')) {
    await runPatchKulturaBreakzIiAniversario2026(sb)
    return
  }

  if (argv.includes('--patch-pure-bassline-7-aniversario-2026')) {
    await runPatchPureBassline7Aniversario2026(sb)
    return
  }

  if (argv.includes('--patch-malaga-is-break-3-aniversario-frequency-break-2026')) {
    await runPatchMalagaIsBreak3AniversarioFrequencyBreak2026(sb)
    return
  }

  if (argv.includes('--patch-cyber-bass-2026')) {
    await runPatchCyberBass2026(sb)
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
  node scripts/enriquecer-evento.mjs --patch-raveart-summer-2026
  node scripts/enriquecer-evento.mjs --patch-raveart-rvt-we-love-retro-2026
  node scripts/enriquecer-evento.mjs --patch-raveart-rvt-booking-clubbing-2026
  node scripts/enriquecer-evento.mjs --patch-raveart-retro-halloween-2025-poster
  node scripts/enriquecer-evento.mjs --patch-kultura-breakz-ii-aniversario-2026
  node scripts/enriquecer-evento.mjs --patch-pure-bassline-7-aniversario-2026
  node scripts/enriquecer-evento.mjs --patch-malaga-is-break-3-aniversario-frequency-break-2026
  node scripts/enriquecer-evento.mjs --patch-cyber-bass-2026`)
    process.exit(1)
  }

  await runEnrich(slug, { dryRun, force, withPoster })
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
