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
 *   node scripts/enriquecer-evento.mjs --patch-raveart-rvt-we-love-retro-elysium-sevilla-2026
 *   node scripts/enriquecer-evento.mjs --patch-raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026
 *   node scripts/enriquecer-evento.mjs --patch-raveart-retro-halloween-2025-poster
 *   node scripts/enriquecer-evento.mjs --patch-raveart-retro-halloween-2026-lineup
 *   node scripts/enriquecer-evento.mjs --patch-kultura-breakz-ii-aniversario-2026
 *   node scripts/enriquecer-evento.mjs --patch-pure-bassline-7-aniversario-2026
 *   node scripts/enriquecer-evento.mjs --patch-pure-bassline-15-agosto-2026-sevilla
 *   node scripts/enriquecer-evento.mjs --patch-natural-universal-retro-2026-malaga
 *   node scripts/enriquecer-evento.mjs --patch-malaga-is-break-3-aniversario-frequency-break-2026
 *   node scripts/enriquecer-evento.mjs --patch-cyber-bass-2026
 *   node scripts/enriquecer-evento.mjs --patch-safari-break-night-2026
 *   node scripts/enriquecer-evento.mjs --patch-solaris-fest-matalascanas-2026
 *   node scripts/enriquecer-evento.mjs --patch-floridance-festival-2026
 *   node scripts/enriquecer-evento.mjs --patch-break-the-flow-w-terrie-kynd-2026
 *   node scripts/enriquecer-evento.mjs --patch-el-pinar-breaks-fest-2026
 *   node scripts/enriquecer-evento.mjs --patch-breaks-bloom-festival-2026
 *   node scripts/enriquecer-evento.mjs --patch-bellota-break-festival-2026
 *   node scripts/enriquecer-evento.mjs --patch-oshun-festival-2026
 *   node scripts/enriquecer-evento.mjs --patch-mas-ruido-black-hole-360-2026
 *   node scripts/enriquecer-evento.mjs --patch-la-caseta-del-breakbeat-2026
 *   node scripts/enriquecer-evento.mjs --patch-fruity-loops-03-06-2026
 *   node scripts/enriquecer-evento.mjs --patch-finger-lickin-boat-party-2026
 *   node scripts/enriquecer-evento.mjs --patch-finger-lickin-between-the-bridges-2026
 *   node scripts/enriquecer-evento.mjs --patch-dreambeach-costa-del-sol-2026
 *   node scripts/enriquecer-evento.mjs --patch-iberican-breaks-festival-2026
 *   node scripts/enriquecer-evento.mjs --patch-electrolunch-xxl-picnic-76-sevilla-2026
 *   node scripts/enriquecer-evento.mjs --patch-breakdown-orlando-2026
 *   node scripts/enriquecer-evento.mjs --patch-ritmika-1-aniversario-white-beach-lepe-2026
 *
 * Credenciales (.env.local):
 *   OPENAI_API_KEY (web_search + redacción; gpt-5.6-terra)
 *   SERPAPI_API_KEY opcional (respaldo web; Google Imágenes para carteles)
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (siempre)
 *
 * Indice: node scripts/guia-base-datos.mjs run events-enrich <slug> [--flags]
 */

import { readFileSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  fetchWebResearchContext,
  openAiChatCompletionsBody,
  resolveOpenAiModel,
} from './lib/openai-editorial.mjs'

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
// OpenAI (JSON mode)
// ---------------------------------------------------------------------------

async function openAiJson({ system, user }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model = resolveOpenAiModel()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(
      openAiChatCompletionsBody({
        model,
        temperature: 0.2,
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    ),
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

  let webContext = '(Sin resultados de búsqueda web — OpenAI web_search y SerpAPI no devolvieron contexto.)'
  const q = buildSearchQuery(event)
  console.log('[enrich] Web search query:', q)
  const eventPrompt = `Investiga en la web el evento de música electrónica / breakbeat: ${q}

Prioriza fuentes oficiales (web del evento, promotor, ticketeras: MonsterTicket, Dice, RA, Resident Advisor, Facebook Events).

Devuelve SOLO un resumen factual en texto plano (sin markdown) con:
- Nombre oficial del evento
- Fecha(s) exacta(s) (YYYY-MM-DD si posible) y horarios (doors / cierre)
- Recinto/venue, dirección, ciudad y país
- Line-up completo / artistas confirmados (y stages si hay)
- URL oficial (website) y URL de venta de entradas (tickets)
- Redes sociales del evento si aparecen
- Precio, edad mínima, capacidad, promotor
Incluye la URL de la fuente junto a cada dato clave. Si algo no aparece, no lo inventes.`
  const research = await fetchWebResearchContext(q, {
    prompt: eventPrompt,
    logPrefix: '[enrich]',
    gl: 'es',
  })
  if (research.context) {
    webContext = research.context
    console.log('[enrich] Contexto web:', research.source, webContext.length, 'chars')
  } else {
    console.warn('[enrich] Sin contexto web; solo OpenAI con conocimiento general.')
  }

  const today = new Date().toISOString().slice(0, 10)
  const userPrompt = `FICHA ACTUAL DEL EVENTO (JSON):
${JSON.stringify(event, null, 2)}

FECHA DE HOY: ${today}

CONTEXTO WEB (OpenAI web_search o SerpAPI; puede tener errores; no inventes URLs que no aparezcan):
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

const RAVEART_RETRO_HALLOWEEN_2026_SLUG = 'raveart-retro-halloween-2026-malaga-forum'

/** Cartel oficial ÁREA ONLY VINYLS / 1ª tanda (A-Z en flyer y comunicado Raveart, ago 2026). */
const RAVEART_RH_2026_ONLY_VINYLS = [
  'Adam VYT',
  'Aldo Ferrari',
  'Amaya Dejota',
  'Anuschka',
  'Baymont Bross',
  'Heavy',
  'Maribel',
  'Norbak',
  'Kos DJ',
  'Prody',
  'Rasco',
  'Rupe',
  'Carlos Mejías VJ',
]

/** Cartel oficial ÁREA UNIVERSAL / 2ª tanda (A-Z en flyer y comunicado Raveart, ago 2026). */
const RAVEART_RH_2026_UNIVERSAL = [
  'Bartdon',
  'Chris Carter',
  'Deep Impact',
  'Madam Breaks',
  'Ricardo del Toro',
  'Rueda',
  'Saturn DJ',
  'Slag Brothers',
  'V. Aparicio',
  'Xema',
]

const RAVEART_RH_2026_LINEUP = [
  ...new Set([...RAVEART_RH_2026_ONLY_VINYLS, ...RAVEART_RH_2026_UNIVERSAL]),
].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))

const RAVEART_RH_2026_STAGES = [
  {
    name: 'ÁREA ONLY VINYLS',
    description_en:
      'Vinyl-only cabin: turntables and physical format, with visuals by Carlos Mejías VJ. First published wave — a Spanish-scene bill.',
    description_es:
      'Cabina de vinilo: platos y formato físico, con visuales de Carlos Mejías VJ. Primera oleada publicada: cartel de la escena nacional.',
    lineup: RAVEART_RH_2026_ONLY_VINYLS,
  },
  {
    name: 'ÁREA ANNIVERSARY',
    description_en:
      'From 2002 to 2026: retro meeting the current catalogue. Line-up not yet published.',
    description_es:
      'De 2002 a 2026: lo retro con el catálogo actual. Line-up por confirmar.',
    lineup: [],
  },
  {
    name: 'ÁREA UNIVERSAL',
    description_en:
      'Electronic classics through 2010. Second published wave, with UK guests Chris Carter, Deep Impact, Madam Breaks and Slag Brothers.',
    description_es:
      'Clásicos electrónicos hasta 2010. Segunda oleada publicada, con invitados del Reino Unido: Chris Carter, Deep Impact, Madam Breaks y Slag Brothers.',
    lineup: RAVEART_RH_2026_UNIVERSAL,
  },
  {
    name: 'ÁREA OLD SCHOOL',
    description_en:
      'The earliest layer: classics through 2000. Line-up not yet published.',
    description_es:
      'La capa más temprana: clásicos hasta el año 2000. Line-up por confirmar.',
    lineup: [],
  },
]

async function runPatchRaveartRetroHalloween2026Lineup(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, lineup, stages, tags, socials, description_es, address')
    .eq('slug', RAVEART_RETRO_HALLOWEEN_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  if (!before) {
    console.error('[patch-retro-halloween-2026] No existe fila:', RAVEART_RETRO_HALLOWEEN_2026_SLUG)
    process.exit(1)
  }
  console.log(
    '[patch-retro-halloween-2026] antes: lineup',
    before.lineup?.length || 0,
    '| stages',
    Array.isArray(before.stages) ? before.stages.length : 0,
  )

  const tags = [
    ...new Set([
      ...(before.tags || []),
      'only vinyls',
      'área universal',
      'anniversary',
      'old school',
      'vinilo',
      'málaga forum',
    ]),
  ]
  const prevSocials =
    before.socials && typeof before.socials === 'object' ? before.socials : {}
  const socials = {
    ...prevSocials,
    instagram: 'https://www.instagram.com/raveartprod/',
    email: 'mailto:info@raveart.es',
    phone: 'tel:+34657733208',
    MonsterTicket: 'https://www.monsterticket.com/evento/retro-halloween-2026',
  }

  const { error: e1 } = await sb
    .from('events')
    .update({
      lineup: RAVEART_RH_2026_LINEUP,
      stages: RAVEART_RH_2026_STAGES,
      tags,
      socials,
      address: 'Ctra. de la Azucarera Intelhorce, 7, Churriana, Málaga',
      location: 'Málaga Forum, Churriana, Málaga',
      description_es:
        'Raveart celebra Retro Halloween el sábado 31 de octubre de 2026 en el Málaga Forum de Churriana: la primera vez que la cita aterriza en la Costa del Sol, después de la edición de 2025 en Complejo Embrujo (Las Gabias, Granada). Doce horas de breaks y electrónica clásica, de tarde a madrugada, con estética Halloween y cuatro áreas pensadas por época y formato. Only Vinyls —primera oleada publicada— reivindica los platos y el disco físico, con cartel de la escena nacional y visuales de Carlos Mejías. Universal —segunda oleada— cubre clásicos hasta 2010 e introduce los primeros internacionales del cartel, todos del Reino Unido: Chris Carter, Deep Impact, Madam Breaks y Slag Brothers. Anniversary (2002–2026) y Old School (hasta 2000) se anunciarán más adelante.\n\nHorario de apertura: el recinto abre a las 14:00 h y la programación se extiende hasta las 02:00 h. Prohibida la entrada a menores de 18 años.\n\nEntrada general: incluye consumición mínima, válida hasta las 17:00 h, según las condiciones publicadas por Raveart.\n\nEntrada VIP: zona VIP, copa, vaso, bono ReAcceso en los horarios que fije la organización y acceso sin colas.\n\nVenta de entradas en raveart.es. Consultas al promotor: info@raveart.es y 657 733 208.\n\nCómo llegar: Málaga Forum está en la Ctra. de la Azucarera Intelhorce, 7, Churriana (Málaga).',
      description_en:
        'Raveart stages Retro Halloween on Saturday 31 October 2026 at Málaga Forum in Churriana — the first time the date lands on the Costa del Sol, after the 2025 edition at Complejo Embrujo (Las Gabias, Granada). Twelve hours of breaks and classic electronics, afternoon into the small hours, with Halloween production and four areas split by era and format. Only Vinyls — the first published wave — is a turntable cabin for physical format, with a Spanish-scene bill and visuals by Carlos Mejías. Universal — the second wave — runs classics through 2010 and brings in the bill’s first international names, all from the UK: Chris Carter, Deep Impact, Madam Breaks and Slag Brothers. Anniversary (2002–2026) and Old School (through 2000) are still to come.\n\nDoors 14:00; the programme runs through 02:00. 18+ only.\n\nGeneral admission includes a minimum spend valid until 17:00, per Raveart’s published terms.\n\nVIP adds VIP zone, drink, glass, re-entry pass at the hours set by the promoter, and queue-free access.\n\nTickets and sales on raveart.es. Promoter info-line: info@raveart.es and 657 733 208.\n\nHow to get there: Málaga Forum, Ctra. de la Azucarera Intelhorce, 7, Churriana (Málaga).',
    })
    .eq('slug', RAVEART_RETRO_HALLOWEEN_2026_SLUG)
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, lineup, stages')
    .eq('slug', RAVEART_RETRO_HALLOWEEN_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log(
    '[patch-retro-halloween-2026] despues: lineup',
    after?.lineup?.length || 0,
    '| stages',
    Array.isArray(after?.stages) ? after.stages.map((s) => `${s.name}:${s.lineup?.length || 0}`).join(', ') : 0,
  )
}

const RAVEART_SUMMER_2026_SLUG = 'raveart-summer-2026'

/** Lineup completo del cartel oficial Raveart Summer 2026 (A-Z artists + VJs/MC). */
const RAVEART_SUMMER_2026_LINEUP = [
  '4AM KRU (live)',
  'Aggresivnes',
  'Anuschka',
  'Backdraft',
  'Baymont Bross',
  'Bebe Breaks',
  'Benny Page',
  'Bowser',
  'Breakfastaz',
  'Bubu',
  'Colombo',
  'Damián',
  'Datafunk',
  'Destroyers ft Big Oli',
  'DJ Wavs',
  'Dub Elements B2B Aphex',
  'FM-3',
  'Four Motion',
  'Frannabik',
  'Freestylers',
  'Freq Nasty',
  'Hankook',
  'Jan B',
  'Juno',
  'Karpin',
  'Ken Mac',
  'Kid Panel',
  'Linero',
  'Maribel',
  'Midnight Cvlt',
  'Müme',
  'Norbak',
  'Nosk',
  'Orebeat',
  'Paket',
  'Perfect Kombo',
  'Plump DJs',
  'Pray for Bass',
  'Prody',
  'Sekret Chadow',
  'Seveng',
  'Staxia',
  'The Mind Hackers',
  'Tomy',
  'Tortu',
  'Urbano',
  'Vandermou',
  'Virus Trinity (Audio B2B Ed Rush B2B Optical)',
  'Welder B',
  'Willy G',
  'Yo Speed',
  'Benjamin VJ',
  'Carlos Mejias VJ',
  'Cellux MC',
  'Nimeim',
]

const RAVEART_SUMMER_2026_STAGES = [
  {
    name: 'Summer Festival',
    description_en: 'Main Raveart Summer Festival area — breaks and bass from 19:00 to 07:00.',
    description_es: 'Área principal Summer Festival — breaks y bass de 19:00 a 07:00 h.',
    lineup: [
      'Bowser',
      'Bubu vs Urbano',
      'Pray for Bass',
      'Freestylers',
      'Destroyers ft Big Oli',
      'Breakfastaz ft Ken Mac',
      'Sekret Chadow',
      'Backdraft',
      'Hankook',
      'Dub Elements B2B Aphex',
      'Paket',
      'Damián',
    ],
  },
  {
    name: '24th Anniversary',
    description_en: 'XXIV anniversary stage — opens 16:00 with Bebe Breaks through to 07:00.',
    description_es: 'Escenario XXIV aniversario — apertura 16:00 con Bebe Breaks hasta las 07:00 h.',
    lineup: [
      'Bebe Breaks',
      'Four Motion',
      'FM-3',
      'Jan B',
      'Prody',
      'Aggresivnes',
      'Nosk',
      'Kid Panel',
      'Müme',
      'Plump DJs',
      'Anuschka',
      'Freq Nasty',
      'Colombo',
      'Datafunk',
      'DJ Wavs',
    ],
  },
  {
    name: 'RVT Pro Main',
    description_en: 'RVT Pro Main area — national breaks bill 20:00–07:00.',
    description_es: 'Área RVT Pro Main — cartel nacional de breaks de 20:00 a 07:00 h.',
    lineup: [
      'Welder B',
      'Staxia vs Linero',
      'Tomy',
      'Willy G',
      'Seveng',
      'Tortu',
      'Baymont Bross',
      'Norbak',
      'Perfect Kombo',
      'Karpin',
      'Orebeat vs Maribel',
    ],
  },
  {
    name: 'Mass Bass',
    description_en: 'Mass Bass area — DnB and bass-heavy sets including 4AM KRU live and Virus Trinity.',
    description_es: 'Área Mass Bass — sesiones DnB y bass con 4AM KRU en directo y Virus Trinity.',
    lineup: [
      'Benny Page',
      'The Mind Hackers',
      'Vandermou',
      '4AM KRU (live)',
      'Nimeim',
      'Virus Trinity (Audio B2B Ed Rush B2B Optical)',
      'Midnight Cvlt',
      'Frannabik',
      'Juno',
    ],
  },
]

const RAVEART_SUMMER_2026_SCHEDULE = [
  { time: '16:00', artist: 'Bebe Breaks', stage: '24th Anniversary' },
  { time: '17:00', artist: 'Four Motion', stage: '24th Anniversary' },
  { time: '18:00', artist: 'FM-3', stage: '24th Anniversary' },
  { time: '19:00', artist: 'Bowser', stage: 'Summer Festival' },
  { time: '19:00', artist: 'Jan B', stage: '24th Anniversary' },
  { time: '19:00', artist: 'Benny Page', stage: 'Mass Bass' },
  { time: '20:00', artist: 'Bubu vs Urbano', stage: 'Summer Festival', is_b2b: true },
  { time: '20:00', artist: 'Prody', stage: '24th Anniversary' },
  { time: '20:00', artist: 'Welder B', stage: 'RVT Pro Main' },
  { time: '20:00', artist: 'The Mind Hackers', stage: 'Mass Bass' },
  { time: '21:00', artist: 'Pray for Bass', stage: 'Summer Festival' },
  { time: '21:00', artist: 'Aggresivnes', stage: '24th Anniversary' },
  { time: '21:00', artist: 'Staxia vs Linero', stage: 'RVT Pro Main', is_b2b: true },
  { time: '22:00', artist: 'Freestylers', stage: 'Summer Festival' },
  { time: '22:00', artist: 'Nosk', stage: '24th Anniversary' },
  { time: '22:00', artist: 'Tomy', stage: 'RVT Pro Main' },
  { time: '22:00', artist: 'Vandermou', stage: 'Mass Bass' },
  { time: '23:00', artist: 'Destroyers ft Big Oli', stage: 'Summer Festival' },
  { time: '23:00', artist: 'Kid Panel', stage: '24th Anniversary' },
  { time: '23:00', artist: 'Willy G', stage: 'RVT Pro Main' },
  { time: '23:00', artist: '4AM KRU (live)', stage: 'Mass Bass' },
  { time: '00:00', artist: 'Breakfastaz ft Ken Mac', stage: 'Summer Festival' },
  { time: '00:00', artist: 'Müme', stage: '24th Anniversary' },
  { time: '00:00', artist: 'Seveng', stage: 'RVT Pro Main' },
  { time: '00:30', artist: 'Nimeim', stage: 'Mass Bass' },
  { time: '01:00', artist: 'Sekret Chadow', stage: 'Summer Festival' },
  { time: '01:00', artist: 'Plump DJs', stage: '24th Anniversary' },
  { time: '01:00', artist: 'Tortu', stage: 'RVT Pro Main' },
  { time: '02:00', artist: 'Backdraft', stage: 'Summer Festival' },
  { time: '02:00', artist: 'Anuschka', stage: '24th Anniversary' },
  { time: '02:00', artist: 'Baymont Bross', stage: 'RVT Pro Main' },
  { time: '02:00', artist: 'Virus Trinity (Audio B2B Ed Rush B2B Optical)', stage: 'Mass Bass', is_b2b: true },
  { time: '03:00', artist: 'Hankook', stage: 'Summer Festival' },
  { time: '03:00', artist: 'Freq Nasty', stage: '24th Anniversary' },
  { time: '03:00', artist: 'Norbak', stage: 'RVT Pro Main' },
  { time: '03:30', artist: 'Midnight Cvlt', stage: 'Mass Bass' },
  { time: '04:00', artist: 'Dub Elements B2B Aphex', stage: 'Summer Festival', is_b2b: true },
  { time: '04:00', artist: 'Colombo', stage: '24th Anniversary' },
  { time: '04:00', artist: 'Perfect Kombo', stage: 'RVT Pro Main' },
  { time: '04:30', artist: 'Frannabik', stage: 'Mass Bass' },
  { time: '05:00', artist: 'Paket', stage: 'Summer Festival' },
  { time: '05:00', artist: 'Datafunk', stage: '24th Anniversary' },
  { time: '05:00', artist: 'Karpin', stage: 'RVT Pro Main' },
  { time: '05:30', artist: 'Juno', stage: 'Mass Bass' },
  { time: '06:00', artist: 'Damián', stage: 'Summer Festival' },
  { time: '06:00', artist: 'DJ Wavs', stage: '24th Anniversary' },
  { time: '06:00', artist: 'Orebeat vs Maribel', stage: 'RVT Pro Main', is_b2b: true },
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
    'XXIV anniversary edition on Saturday 4 July 2026 at Hacienda El Chaparrejo, Alcalá de Guadaíra (Seville area). Four areas with published timetables: Summer Festival (Bowser 19:00 through Damián 06:00 — Freestylers, Breakfastaz ft Ken Mac, Destroyers ft Big Oli, Dub Elements B2B Aphex and more), 24th Anniversary (Bebe Breaks 16:00 — Plump DJs, Kid Panel, Freq Nasty, Anuschka), RVT Pro Main (Welder B 20:00 — Perfect Kombo, Norbak, Karpin, Orebeat vs Maribel) and Mass Bass (Benny Page 19:00 — 4AM KRU live, Virus Trinity, Midnight Cvlt, Nimeim). MC Cellux; visuals Benjamin VJ and Carlos Mejias VJ.\n\nDoors 16:00 through 07:00 Sunday 5 July. Named tickets only; physical ID required (18+).\n\nGeneral admission: entry plus minimum spend valid until 20:00. VIP adds VIP zone, drink, glass, re-entry pass at set hours and queue-free access.\n\nTickets and sales on MonsterTicket and raveart.es; named tickets are typically issued a few days before the show (check promoter terms).\n\nHow to get there: Hacienda El Chaparrejo is at Carretera Alcalá de Guadaíra–Morón de la Frontera, km 3.5, Alcalá de Guadaíra (41500, Seville), roughly 15–20 minutes by car from central Seville and Seville Airport (SVQ). By car: usual route via A-92 / A-376 towards Alcalá de Guadaíra, then follow signs for the Alcalá–Morón road; on-site parking is available (follow on-site signage on the day). Official Raveart buses: book at raveart.es/buses-summer-festival and MonsterTicket; stops and times may change and departure is only confirmed at 70% occupancy (refund if the line is cancelled). Taxi or ride-hail with the full address is an alternative. Plan your return before 07:00 and check Raveart’s site a few days ahead for last-minute bus or access changes.',
  description_es:
    'Edición del XXIV aniversario el sábado 4 de julio de 2026 en Hacienda El Chaparrejo, Alcalá de Guadaíra (Sevilla). Cuatro áreas con horarios oficiales: Summer Festival (Bowser 19:00 hasta Damián 06:00 — Freestylers, Breakfastaz ft Ken Mac, Destroyers ft Big Oli, Dub Elements B2B Aphex y más), 24th Anniversary (Bebe Breaks 16:00 — Plump DJs, Kid Panel, Freq Nasty, Anuschka), RVT Pro Main (Welder B 20:00 — Perfect Kombo, Norbak, Karpin, Orebeat vs Maribel) y Mass Bass (Benny Page 19:00 — 4AM KRU en directo, Virus Trinity, Midnight Cvlt, Nimeim). MC Cellux; visuales Benjamin VJ y Carlos Mejias VJ.\n\nHorario de apertura: puertas 16:00 h; cierre del festival 07:00 h del domingo 5 de julio. Entradas nominativas; documento de identidad físico obligatorio (+18).\n\nEntrada general: entrada + consumición mínima válida hasta las 20:00 h. Entrada VIP: zona VIP, copa, vaso, bono ReAcceso en los horarios establecidos y acceso sin colas.\n\nVenta de entradas en MonsterTicket y raveart.es; las nominativas suelen enviarse pocos días antes del evento (consultar condiciones del promotor).\n\nCómo llegar al Summer Festival 2026: la Hacienda El Chaparrejo está en Carretera Alcalá de Guadaíra–Morón de la Frontera, km 3,5, Alcalá de Guadaíra (41500, Sevilla), a unos 15–20 minutos en coche desde el centro de Sevilla y del aeropuerto de San Pablo (SVQ). En coche: salida habitual por la A-92 / A-376 hacia Alcalá de Guadaíra; sigue la señalización hacia la carretera Alcalá–Morón; hay aparcamiento en el recinto (consultar indicaciones el día del evento). Autobuses oficiales Raveart: venta en raveart.es/buses-summer-festival y MonsterTicket; paradas y horarios pueden ajustarse y la salida solo se confirma al cubrir el 70% de plazas (devolución si se cancela la línea). Alternativa: taxi o VTC con la dirección completa. Planifica la vuelta antes de las 07:00 h y revisa la web de Raveart unos días antes por posibles cambios de última hora.',
  event_type: 'festival',
  date_start: '2026-07-04',
  date_end: null,
  location: 'Hacienda El Chaparrejo, Alcalá de Guadaíra, Sevilla',
  city: 'Alcala de Guadaira',
  country: 'Spain',
  venue: 'Hacienda El Chaparrejo',
  address: 'Carretera Alcalá de Guadaíra–Morón de la Frontera, km 3,5, Alcalá de Guadaíra',
  coords: { lat: 37.3033, lng: -5.7982 },
  website: 'https://www.raveart.es/',
  tickets_url: 'https://www.monsterticket.com/evento/summer-festival-2026',
  socials: {
    'Autobuses oficiales': 'https://www.raveart.es/buses-summer-festival/',
    'Entradas MonsterTicket': 'https://www.monsterticket.com/evento/summer-festival-2026',
    Raveart: 'https://www.raveart.es/',
  },
  doors_open: '16:00',
  doors_close: '07:00',
  lineup: RAVEART_SUMMER_2026_LINEUP,
  stages: RAVEART_SUMMER_2026_STAGES,
  schedule: RAVEART_SUMMER_2026_SCHEDULE,
  tags: [
    'Raveart',
    'Summer Festival',
    'XXIV aniversario',
    'breakbeat',
    'drum and bass',
    'Sevilla',
    'Alcalá de Guadaíra',
    'horarios',
    '2026',
    'monsterticket',
    'rvt pro main',
    'mass bass',
    'cómo llegar',
    'autobús',
    'transporte',
  ],
  age_restriction: '+18',
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
    .select('slug, name, date_start, date_end, city, venue, doors_open, doors_close')
    .eq('slug', RAVEART_SUMMER_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-raveart-summer] despues:', after)
  console.log(
    '[patch-raveart-summer] stages:',
    RAVEART_SUMMER_2026_STAGES.length,
    '| schedule slots:',
    RAVEART_SUMMER_2026_SCHEDULE.length,
  )
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
  const lower = absPath.toLowerCase()
  let ext = 'png'
  let contentType = 'image/png'
  if (lower.endsWith('.webp')) {
    ext = 'webp'
    contentType = 'image/webp'
  } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    ext = 'jpg'
    contentType = 'image/jpeg'
  }
  const normalized = `events/${slug}/poster.${ext}`
  const buf = readFileSync(absPath)
  const { error } = await sb.storage.from('media').upload(normalized, buf, {
    contentType,
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

const RAVEART_RVT_WE_LOVE_RETRO_ELYSIUM_SEVILLA_2026_SLUG =
  'raveart-rvt-we-love-retro-elysium-sevilla-2026'
const RAVEART_RVT_WE_LOVE_RETRO_ELYSIUM_SEVILLA_2026_POSTER = join(
  ROOT,
  'public',
  'images',
  'events',
  'rvt-by-raveart-we-love-retro--elysium-sevilla.webp',
)

const RAVEART_RVT_WE_LOVE_RETRO_ELYSIUM_SEVILLA_2026_ROW = {
  name: 'RVT by Raveart: We Love Retro',
  description_en:
    'RVT Booking & Clubbing presents We Love Retro at Elysium Sevilla (Seville): breakbeat night with a national lineup. Saturday 9 May 2026, doors 21:00–07:00. Official contact on the flyer: info@rvtpro.com. Ticket types and pricing on MonsterTicket (free early pass until 23:00, general and VIP per listing). Tickets: monsterticket.com · rvtpro.com.',
  description_es:
    'RVT Booking & Clubbing presenta We Love Retro en Elysium Sevilla: noche de breakbeat con cartel nacional. Sábado 9 de mayo de 2026, 21:00h–7:00h. Contacto en el cartel: info@rvtpro.com. Tipos de entrada en MonsterTicket (early pass gratuito hasta las 23:00, general y VIP según venta). Entradas: MonsterTicket · rvtpro.com.',
  event_type: 'club_night',
  date_start: '2026-05-09',
  date_end: null,
  location: 'Elysium Sevilla, Sevilla, Spain',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Elysium Sevilla',
  address: 'C/ La Red Seis, 39, Sevilla',
  website: 'https://www.rvtpro.com/',
  tickets_url:
    'https://www.monsterticket.com/evento/rvt-by-raveart-we-love-retro--elysium-sevilla',
  age_restriction: '18+',
  doors_open: '21:00',
  doors_close: '07:00',
  tags: ['breakbeat', 'raveart', 'sevilla', 'rvt', 'elysium', 'we love retro'],
  lineup: [
    'Anuschka',
    'Barrientos',
    'DJ Heavy',
    'DJ Killer',
    'Man',
    'Maribel',
    'DJ Mike',
    'Peter Paul',
    'Ricardo del Toro',
    'Rupe',
    'Wally',
    'Xema',
  ],
  socials: {
    email: 'mailto:info@rvtpro.com',
    phone: 'tel:+34657733208',
  },
}

async function runPatchRaveartRvtWeLoveRetroElysiumSevilla2026(sb) {
  const { data: org, error: eo } = await sb
    .from('organizations')
    .select('id')
    .eq('slug', 'raveart')
    .maybeSingle()
  if (eo) throw eo
  if (!org?.id) {
    console.error('[patch-rvt-we-love-retro-elysium] Falta organizations.slug = raveart')
    process.exit(1)
  }

  let imageUrl = null
  try {
    imageUrl = await uploadLocalPosterToMedia(
      sb,
      RAVEART_RVT_WE_LOVE_RETRO_ELYSIUM_SEVILLA_2026_SLUG,
      RAVEART_RVT_WE_LOVE_RETRO_ELYSIUM_SEVILLA_2026_POSTER,
    )
  } catch (e) {
    console.error('[patch-rvt-we-love-retro-elysium] Error subiendo cartel:', e.message || e)
    throw e
  }

  const row = {
    slug: RAVEART_RVT_WE_LOVE_RETRO_ELYSIUM_SEVILLA_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...RAVEART_RVT_WE_LOVE_RETRO_ELYSIUM_SEVILLA_2026_ROW,
    image_url: imageUrl,
    is_featured: true,
    promoter_organization_id: org.id,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', RAVEART_RVT_WE_LOVE_RETRO_ELYSIUM_SEVILLA_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-rvt-we-love-retro-elysium] OK:', after)
}

const RAVEART_RVT_SUMMER_FEST_PRESENT_EL_TREN_2026_SLUG =
  'raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026'
const RAVEART_RVT_SUMMER_FEST_PRESENT_EL_TREN_2026_POSTER = join(
  ROOT,
  'public',
  'images',
  'events',
  'rvt-by-raveart-summer-festival-2026-presentacion-oficial--el-tren-granada.webp',
)

const RAVEART_RVT_SUMMER_FEST_PRESENT_EL_TREN_2026_ROW = {
  name: 'RVT by Raveart: Summer Festival 2026 (Presentación oficial)',
  description_en:
    'Official RVT Summer Festival launch at Sala El Tren (Granada): RVT Booking & Clubbing with Deekline plus a national lineup. Saturday 9 May 2026. Flyer/ticketing mention entry with beer and the official Summer 2026 lanyard (per promoter and MonsterTicket copy). Genre breakbeat per ticket page. Contact: info@rvtpro.com. Tickets via MonsterTicket; general site: rvtpro.com.',
  description_es:
    'Presentación oficial del RVT Summer Festival en Sala El Tren (Granada): RVT Booking & Clubbing con Deekline y artistas nacionales. Sábado 9 de mayo de 2026. Entrada con cerveza y lanyard oficial Summer 2026 según cartel y texto de venta en MonsterTicket. Breakbeat según la ficha de entradas. Contacto: info@rvtpro.com. Venta en MonsterTicket; web: rvtpro.com.',
  event_type: 'club_night',
  date_start: '2026-05-09',
  date_end: null,
  location: 'Sala El Tren, Chana, Granada, Spain',
  city: 'Granada',
  country: 'Spain',
  venue: 'Sala El Tren',
  address: 'Ctra. de Málaga, 136, Chana, Granada',
  website: 'https://www.rvtpro.com/',
  tickets_url:
    'https://www.monsterticket.com/evento/rvt-by-raveart-summer-festival-2026-presentacion-oficial--el-tren-granada',
  age_restriction: '18+',
  tags: ['breakbeat', 'raveart', 'granada', 'rvt', 'sala el tren', 'deekline', 'summer festival'],
  lineup: [
    'Deekline',
    'Anuschka',
    'aTRIK',
    'Datafunk',
    'DJ Ways',
    'Jiro',
    'LDP Breaks',
    'Müme',
    'Paket',
    'Urbano',
  ],
  socials: {
    email: 'mailto:info@rvtpro.com',
    phone: 'tel:+34657733208',
  },
}

async function runPatchRaveartRvtSummerFestivalPresentacionOficialElTrenGranada2026(sb) {
  const { data: org, error: eo } = await sb
    .from('organizations')
    .select('id')
    .eq('slug', 'raveart')
    .maybeSingle()
  if (eo) throw eo
  if (!org?.id) {
    console.error('[patch-rvt-summer-fest-present-el-tren] Falta organizations.slug = raveart')
    process.exit(1)
  }

  let imageUrl = null
  try {
    imageUrl = await uploadLocalPosterToMedia(
      sb,
      RAVEART_RVT_SUMMER_FEST_PRESENT_EL_TREN_2026_SLUG,
      RAVEART_RVT_SUMMER_FEST_PRESENT_EL_TREN_2026_POSTER,
    )
  } catch (e) {
    console.error('[patch-rvt-summer-fest-present-el-tren] Error subiendo cartel:', e.message || e)
    throw e
  }

  const row = {
    slug: RAVEART_RVT_SUMMER_FEST_PRESENT_EL_TREN_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...RAVEART_RVT_SUMMER_FEST_PRESENT_EL_TREN_2026_ROW,
    image_url: imageUrl,
    is_featured: true,
    promoter_organization_id: org.id,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', RAVEART_RVT_SUMMER_FEST_PRESENT_EL_TREN_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-rvt-summer-fest-present-el-tren] OK:', after)
}

const RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_SLUG =
  'raveart-rvt-retro-halloween-presentacion-oficial-el-tren-granada-2026'
const RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_POSTER = join(
  ROOT,
  'public',
  'images',
  'events',
  'raveart-rvt-retro-halloween-presentacion-oficial-el-tren-granada-2026.webp',
)
const RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_TICKETS =
  'https://www.monsterticket.com/evento/rvt-by-raveart-retro-halloween-2026-presentacion-oficial--el-tren-granada'

const RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_LINEUP = [
  'Backdraft',
  'Aggresivnes vs Paket',
  'Prody vs Bubu',
  'Datafunk vs Destroyers',
  'Saturn DJ vs Mr Fli',
  'BLNK vs Tilla Pink',
]

const RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_ROW = {
  name: 'RVT by Raveart: Retro Halloween 2026 (Presentación oficial)',
  description_en:
    'Raveart presents the official Retro Halloween 2026 launch at Sala El Tren (Granada): RVT Booking & Clubbing breakbeat night separate from the main Retro Halloween festival at Málaga Forum on 31 October 2026. Saturday 12 September 2026, 01:00–07:00. Official poster: headliner Backdraft plus versus sets Aggresivnes vs Paket, Prody vs Bubu, Datafunk vs Destroyers, Saturn DJ vs Mr Fli and BLNK vs Tilla Pink. Flyer offer: entry with free lanyard, beer and re-entry (per promoter artwork). Address Ctra. de Málaga 136, Chana, Granada. Tickets via MonsterTicket; info@rvtpro.com / rvtpro.com.',
  description_es:
    'Raveart presenta la presentación oficial de Retro Halloween 2026 en Sala El Tren (Granada): noche breakbeat de RVT Booking & Clubbing, distinta del festival Retro Halloween en Málaga Forum el 31 de octubre de 2026. Sábado 12 de septiembre de 2026, 1:00h–7:00h. Cartel oficial: cabeza de cartel Backdraft y enfrentamientos Aggresivnes vs Paket, Prody vs Bubu, Datafunk vs Destroyers, Saturn DJ vs Mr Fli y BLNK vs Tilla Pink. Oferta del cartel: entrada con lanyard gratis, cerveza y reacceso (según artwork del promotor). Ctra. de Málaga 136, Chana, Granada. Entradas en MonsterTicket; info@rvtpro.com / rvtpro.com.',
  event_type: 'club_night',
  date_start: '2026-09-12',
  date_end: null,
  location: 'Sala El Tren, Chana, Granada, Spain',
  city: 'Granada',
  country: 'Spain',
  venue: 'Sala El Tren',
  address: 'Ctra. de Málaga, 136, Chana, Granada',
  website: 'https://www.rvtpro.com/',
  tickets_url: RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_TICKETS,
  lineup: RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_LINEUP,
  tags: [
    'retro halloween',
    'halloween',
    'breakbeat',
    'raveart',
    'rvt',
    'rvt booking',
    'granada',
    'sala el tren',
    'chana',
    'backdraft',
    'presentación oficial',
    '2026',
    'monsterticket',
  ],
  socials: {
    email: 'mailto:info@rvtpro.com',
    phone: 'tel:+34657733208',
    'RVT Pro': 'https://www.rvtpro.com/',
    MonsterTicket: RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_TICKETS,
  },
  age_restriction: '18+',
  doors_open: '01:00',
  doors_close: '07:00',
  coords: { lat: 37.192, lng: -3.6165 },
}

async function runPatchRaveartRvtRetroHalloweenPresentacionOficialElTrenGranada2026(sb) {
  const { data: org, error: eo } = await sb
    .from('organizations')
    .select('id')
    .eq('slug', 'raveart')
    .maybeSingle()
  if (eo) throw eo
  if (!org?.id) {
    console.error('[patch-rvt-retro-halloween-present-el-tren] Falta organizations.slug = raveart')
    process.exit(1)
  }

  let imageUrl = null
  try {
    imageUrl = await uploadLocalPosterToMedia(
      sb,
      RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_SLUG,
      RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_POSTER,
    )
  } catch (e) {
    console.error('[patch-rvt-retro-halloween-present-el-tren] Error subiendo cartel:', e.message || e)
    throw e
  }

  const row = {
    slug: RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_ROW,
    image_url: imageUrl,
    is_featured: true,
    promoter_organization_id: org.id,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup, doors_open')
    .eq('slug', RAVEART_RVT_RETRO_HALLOWEEN_PRESENT_EL_TREN_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-rvt-retro-halloween-present-el-tren] OK:', after)
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
  image_url: '/images/events/kultura-breakz-ii-aniversario-2026.avif',
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
    .select('slug, name, date_start, city, venue, tickets_url, website, image_url')
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

const PURE_BASSLINE_15_AGO_2026_SLUG = 'made-in-spain-festival-2026-white-beach-lepe'
const PURE_BASSLINE_15_AGO_2026_LEGACY_SLUG = 'pure-bassline-15-agosto-2026-sevilla'
const PURE_BASSLINE_15_AGO_2026_TICKETS =
  'https://site.fourvenues.com/es/rollercoaster/events/pure-bassline-15-08-2026-7FFR'
const PURE_BASSLINE_15_AGO_2026_WEBSITE = 'https://www.rollerwhitebeach.com/'
const PURE_BASSLINE_15_AGO_2026_IMAGE =
  '/images/events/made-in-spain-festival-2026-white-beach-lepe.webp'

const PURE_BASSLINE_15_AGO_2026_LINEUP = [
  'Bowser',
  'FM-3',
  'KMK',
  'Mbreaks',
  'Rhades',
  'Hankook',
  'Orebeat',
  'Nvthec',
  'Xwile',
  'Bubble Couple',
  'Kuplay',
  'Mutantbreakz',
  'Karpin',
  'Kultür',
  'Lords of Motion',
  'Maribel',
  'Norbak',
  'Rasco',
  'Sans',
  'The Brainkiller',
]

const PURE_BASSLINE_15_AGO_2026_ROW = {
  name: 'Made in Spain Festival (Pure Bassline) — White Beach La Antilla',
  description_en:
    'Pure Bassline presents Made in Spain Festival on Saturday 15 August 2026 at White Beach Antilla (La Antilla, Lepe, Huelva), the open-air beach club on the Costa de la Luz operated by Roller Group — billed as the collective’s largest breakbeat production to date with 12 hours non-stop. Fifth lineup announcement (5º avance): Banana Records showcase (Bowser, FM-3, KMK, Mbreaks, Rhades), Distorsion Records showcase (Hankook, Orebeat, Nvthec, Xwile), Guachinche Records showcase (Bubble Couple, Kuplay, Mutantbreakz) plus Karpin, Kultür, Lords of Motion, Maribel, Norbak, Rasco, Sans and The Brainkiller. Tickets via Fourvenues (Rollercoaster) and at rollerwhitebeach.com. 18+.',
  description_es:
    'Pure Bassline presenta Made in Spain Festival el sábado 15 de agosto de 2026 en White Beach Antilla (La Antilla, Lepe, Huelva), la terraza open air de la Costa de la Luz operada por Roller Group — el mayor evento del colectivo hasta la fecha, con 12 horas non-stop de breakbeat y ritmos rotos. Quinto avance de cartel: showcase Banana Records (Bowser, FM-3, KMK, Mbreaks, Rhades), showcase Distorsion Records (Hankook, Orebeat, Nvthec, Xwile), showcase Guachinche Records (Bubble Couple, Kuplay, Mutantbreakz) más Karpin, Kultür, Lords of Motion, Maribel, Norbak, Rasco, Sans y The Brainkiller. Entradas en Fourvenues (Rollercoaster) y en rollerwhitebeach.com. +18 años.',
  event_type: 'festival',
  date_start: '2026-08-15',
  date_end: null,
  location: 'White Beach Antilla, La Antilla, Lepe, Huelva, Spain',
  city: 'Lepe',
  country: 'Spain',
  venue: 'White Beach Antilla (White Beach Club)',
  address: 'Finca La Calzadilla, La Antilla, Lepe, Huelva',
  website: PURE_BASSLINE_15_AGO_2026_WEBSITE,
  tickets_url: PURE_BASSLINE_15_AGO_2026_TICKETS,
  image_url: PURE_BASSLINE_15_AGO_2026_IMAGE,
  lineup: PURE_BASSLINE_15_AGO_2026_LINEUP,
  stages: [],
  schedule: [],
  tags: [
    'made in spain festival',
    'pure bassline',
    'breakbeat',
    'breaks',
    'bassline',
    'festival',
    'open air',
    'white beach',
    'white beach antilla',
    'la antilla',
    'lepe',
    'huelva',
    'roller group',
    'banana records',
    'distorsion records',
    'guachinche records',
    '2026',
  ],
  socials: {
    'Tickets Fourvenues (Rollercoaster)': PURE_BASSLINE_15_AGO_2026_TICKETS,
    'Web Roller White Beach': PURE_BASSLINE_15_AGO_2026_WEBSITE,
    'Instagram @purebassline': 'https://www.instagram.com/purebassline/',
  },
  age_restriction: '+18',
  capacity: 3000,
  coords: { lat: 37.196, lng: -7.262 },
  doors_open: null,
  doors_close: null,
}

async function runPatchPureBassline15Agosto2026Sevilla(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', PURE_BASSLINE_15_AGO_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-made-in-spain-festival-2026] antes:', before || '(sin fila)')

  const row = {
    slug: PURE_BASSLINE_15_AGO_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...PURE_BASSLINE_15_AGO_2026_ROW,
    is_featured: true,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { error: eLegacy } = await sb
    .from('events')
    .delete()
    .eq('slug', PURE_BASSLINE_15_AGO_2026_LEGACY_SLUG)
  if (eLegacy) throw eLegacy

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, image_url, tickets_url')
    .eq('slug', PURE_BASSLINE_15_AGO_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-made-in-spain-festival-2026] OK:', after)
  if (PURE_BASSLINE_15_AGO_2026_LEGACY_SLUG !== PURE_BASSLINE_15_AGO_2026_SLUG) {
    console.log(
      '[patch-made-in-spain-festival-2026] borrada fila legacy:',
      PURE_BASSLINE_15_AGO_2026_LEGACY_SLUG,
    )
  }
}

const NATURAL_UNIVERSAL_RETRO_2026_SLUG = 'natural-universal-retro-2026-malaga'
const NATURAL_UNIVERSAL_RETRO_TICKETS =
  'https://www.monsterticket.com/evento/natural-universal-retro'
const NATURAL_UNIVERSAL_RETRO_IMAGE = '/images/events/natural-universal-retro-2026-malaga.webp'

const NATURAL_UNIVERSAL_RETRO_LINEUP = [
  'Felipe Volumen',
  'Jordi Slate',
  'Killer',
  'Wally',
  'Tortu',
  'Lady Packa',
  'Rasco',
  'Bartdon',
  'Carlos Mejías (VJ)',
]

const NATURAL_UNIVERSAL_RETRO_2026_ROW = {
  name: 'Nätural Universal Retro',
  description_en:
    'Nätural Universal Retro at Paris15 Málaga on Saturday 9 May 2026. Flyer-led lineup: Felipe Volumen, Jordi Slate, Killer, Wally, Tortu, Lady Packa, Rasco, Bartdon and Carlos Mejías on visuals (VJ). Space-retro artwork on the poster; 18+ only per venue and MonsterTicket. Address C/ Orotava 27. Advance tiers and non-nominative tickets on MonsterTicket; promo and first waves were listed as sold out at the time of capture—check the listing for current availability.',
  description_es:
    'Nätural Universal Retro en Paris15 Málaga el sábado 9 de mayo de 2026. Cartel con estética retro espacial; cabina y pista con Felipe Volumen, Jordi Slate, Killer, Wally, Tortu, Lady Packa, Rasco, Bartdon y visuales de Carlos Mejías (VJ). Prohibido menores de 18 años según sala y MonsterTicket. Dirección C/ Orotava 27. Entradas no nominativas y tramos de preventa en MonsterTicket; en la captura de venta constaban agotados el lanzamiento y el tramo 1—consultar la web para disponibilidad actual.',
  event_type: 'club_night',
  date_start: '2026-05-09',
  date_end: null,
  location: 'Paris15, Málaga',
  city: 'Málaga',
  country: 'Spain',
  venue: 'Paris15',
  address: 'C/ Orotava 27, Málaga',
  website: null,
  tickets_url: NATURAL_UNIVERSAL_RETRO_TICKETS,
  image_url: NATURAL_UNIVERSAL_RETRO_IMAGE,
  lineup: NATURAL_UNIVERSAL_RETRO_LINEUP,
  tags: [
    'natural universal retro',
    'nätural',
    'paris15',
    'malaga',
    'málaga',
    'retro',
    'breakbeat',
    '2026',
    'monsterticket',
  ],
  socials: {},
  doors_open: null,
  doors_close: null,
  age_restriction: '18+',
}

async function runPatchNaturalUniversalRetro2026Malaga(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', NATURAL_UNIVERSAL_RETRO_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-natural-universal-retro] antes:', before || '(sin fila)')

  const row = {
    slug: NATURAL_UNIVERSAL_RETRO_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...NATURAL_UNIVERSAL_RETRO_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', NATURAL_UNIVERSAL_RETRO_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-natural-universal-retro] OK:', after)
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

const SAFARI_BREAK_NIGHT_2026_SLUG = 'safari-break-night-2026'
const SAFARI_BREAK_NIGHT_TICKETS =
  'https://www.monsterticket.com/evento/safari-break-night'
const SAFARI_BREAK_NIGHT_IMAGE = '/images/events/safari-break-night.webp'

const SAFARI_BREAK_NIGHT_2026_LINEUP = [
  'Songbass',
  'Skullbreakerz',
  'Tony Line',
  'Miss Bass',
  'MCB Break',
]

const SAFARI_BREAK_NIGHT_2026_ROW = {
  name: 'Safari Break Night',
  description_en:
    'Basshock Events (breakbeat energy) presents Safari Break Night on Saturday 25 April 2026 at Safari Club, Polígono Las Zarzas, Palomares del Río (Seville area). The poster line-up: Songbass, Skullbreakerz, Tony Line, Miss Bass, MCB Break. The official sale page on MonsterTicket states 18+ and non-nominal tickets. Address: Calle Umbrete 11, Polígono Las Zarzas, Palomares del Río. Promoter branding and sale line: “Basshock Events” on the artwork; tickets via MonsterTicket as on the flyer.',
  description_es:
    'Basshock Events presenta Safari Break Night el sábado 25 de abril de 2026 en Safari Club (Polígono Las Zarzas), Palomares del Río (área de Sevilla). Cartel según flyer: Songbass, Skullbreakerz, Tony Line, Miss Bass, MCB Break. La venta oficial en MonsterTicket indica prohibido el acceso a menores de 18 años y entradas no nominativas. Dirección: Calle Umbrete 11, Polígono Las Zarzas, Palomares del Río. Marca del cartel y venta en MonsterTicket como en el flyer.',
  event_type: 'club_night',
  date_start: '2026-04-25',
  date_end: null,
  location: 'Safari Club, Polígono Las Zarzas, Palomares del Río, Sevilla, Spain',
  city: 'Palomares del Río',
  country: 'Spain',
  venue: 'Safari Club',
  address: 'Calle Umbrete 11, Polígono Las Zarzas, Palomares del Río, Sevilla',
  website: null,
  tickets_url: SAFARI_BREAK_NIGHT_TICKETS,
  image_url: SAFARI_BREAK_NIGHT_IMAGE,
  lineup: SAFARI_BREAK_NIGHT_2026_LINEUP,
  tags: [
    'safari break night',
    'basshock events',
    'breakbeat',
    'safari club',
    'palomares del rio',
    'sevilla',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
}

async function runPatchSafariBreakNight2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', SAFARI_BREAK_NIGHT_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-safari-break-night-2026] antes:', before || '(sin fila)')

  const row = {
    slug: SAFARI_BREAK_NIGHT_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...SAFARI_BREAK_NIGHT_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', SAFARI_BREAK_NIGHT_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-safari-break-night-2026] OK:', after)
}

const BREAK_NIGHT_FREE_PARTY_2026_SLUG = 'break-night'
const BREAK_NIGHT_FREE_PARTY_TICKETS =
  'https://www.monsterticket.com/evento/break-night--free-party'
const BREAK_NIGHT_FREE_PARTY_IMAGE = '/images/events/break-night-free-party-2026.webp'

const BREAK_NIGHT_FREE_PARTY_2026_LINEUP = [
  'Broken Ragdoll',
  'Lookdown',
  'Doublefacez',
  'Cool Beat',
  'Skull Breakerz',
  'The Mastreline',
]

const BREAK_NIGHT_FREE_PARTY_2026_SCHEDULE = [
  { time: '01:00', artist: 'Broken Ragdoll' },
  { time: '02:00', artist: 'Lookdown' },
  { time: '03:00', artist: 'Doublefacez' },
  { time: '04:00', artist: 'Cool Beat' },
  { time: '05:00', artist: 'Skull Breakerz' },
  { time: '06:00', artist: 'The Mastreline' },
]

const BREAK_NIGHT_FREE_PARTY_2026_ROW = {
  name: 'Break Night | Free Party',
  description_en:
    'Break Night Free Party on Friday 21 August 2026 at Sala Even, Seville. Doors 1:00–7:00. Poster line-up and set times: Broken Ragdoll (01:00), Lookdown (02:00), Doublefacez (03:00), Cool Beat (04:00), Skull Breakerz (05:00), The Mastreline (06:00). MonsterTicket lists 18+ only and non-nominal tickets; online sales for this event had ended on the platform at the time of cataloguing — check Sala Even / élitemusic for door policy. Address: C/ José Díaz 5, Sevilla.',
  description_es:
    'Break Night Free Party el viernes 21 de agosto de 2026 en Sala Even (Sevilla). Horario 1:00h–7:00h. Cartel y horarios: Broken Ragdoll (01:00), Lookdown (02:00), Doublefacez (03:00), Cool Beat (04:00), Skull Breakerz (05:00), The Mastreline (06:00). MonsterTicket indica prohibido el acceso a menores de 18 años y entradas no nominativas; la venta online había finalizado en la plataforma al catalogar — consulta Sala Even / élitemusic por acceso en puerta. Dirección: C/ José Díaz 5, Sevilla.',
  event_type: 'club_night',
  date_start: '2026-08-21',
  date_end: null,
  location: 'Sala Even, Sevilla, Spain',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Sala Even',
  address: 'C/ José Díaz 5, Sevilla',
  website: null,
  tickets_url: BREAK_NIGHT_FREE_PARTY_TICKETS,
  image_url: BREAK_NIGHT_FREE_PARTY_IMAGE,
  lineup: BREAK_NIGHT_FREE_PARTY_2026_LINEUP,
  schedule: BREAK_NIGHT_FREE_PARTY_2026_SCHEDULE,
  tags: [
    'break night',
    'free party',
    'breakbeat',
    'sala even',
    'sevilla',
    'élitemusic',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
  doors_open: '01:00',
  doors_close: '07:00',
}

async function runPatchBreakNightFreeParty2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, lineup')
    .eq('slug', BREAK_NIGHT_FREE_PARTY_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-break-night-free-party-2026] antes:', before || '(sin fila)')

  const row = {
    slug: BREAK_NIGHT_FREE_PARTY_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAK_NIGHT_FREE_PARTY_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', BREAK_NIGHT_FREE_PARTY_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-break-night-free-party-2026] OK:', after)
}

const SOLARIS_FEST_MATALASCANAS_2026_SLUG = 'solaris-fest-matalascanas-2026'
const SOLARIS_FEST_MATALASCANAS_TICKETS =
  'https://www.monsterticket.com/evento/solaris-fest-matalascanas'
const SOLARIS_FEST_MATALASCANAS_IMAGE =
  '/images/events/solaris-fest-matalascanas-2026.webp'

const SOLARIS_FEST_MATALASCANAS_2026_LINEUP = [
  'Olmedbreak',
  'Nileb',
  'Dany BS',
  'DJ Tokyo',
  'Perfect Kombo',
  'Basstyler',
  'Anuschka',
  'The BJ Crew',
  'Sekret Chadow',
  'Hankook',
]

const SOLARIS_FEST_MATALASCANAS_2026_SCHEDULE = [
  { time: '17:00', artist: 'Olmedbreak', stage: '', duration_min: 45 },
  { time: '17:45', artist: 'Nileb', stage: '', duration_min: 45 },
  { time: '18:30', artist: 'Dany BS', stage: '', duration_min: 45 },
  { time: '19:15', artist: 'DJ Tokyo', stage: '', duration_min: 45 },
  { time: '20:00', artist: 'Perfect Kombo', stage: '', duration_min: 60 },
  { time: '21:00', artist: 'Basstyler', stage: '', duration_min: 60 },
  { time: '22:00', artist: 'Anuschka', stage: '', duration_min: 60 },
  { time: '23:00', artist: 'The BJ Crew', stage: '', duration_min: 60 },
  { time: '00:00', artist: 'Sekret Chadow', stage: '', duration_min: 60 },
  { time: '01:00', artist: 'Hankook', stage: '', duration_min: 60 },
]

const SOLARIS_FEST_MATALASCANAS_2026_ROW = {
  name: 'Solaris Fest — Matalascañas',
  description_en:
    'Solaris Fest at Centro de Ocio Surfasaurus in Matalascañas (Huelva), about 100 m from Playa de Doñana: current and retro breakbeat with a summer vibe. Saturday 20 June 2026, doors 17:00, closing after Hankook (01:00–02:00). Official poster timetable: Olmedbreak 17:00, Nileb 17:45, Dany BS 18:30, DJ Tokyo 19:15, Perfect Kombo 20:00, Basstyler 21:00, Anuschka 22:00, The BJ Crew 23:00, Sekret Chadow 00:00, Hankook 01:00–02:00. Two parking areas; food and drink on site. Tickets on MonsterTicket (non-named, 18+). Address Sector Somormujo 31. Co-branded with RVT (Raveart Booking & Clubbing) on the official flyer.',
  description_es:
    'Solaris Fest en el Centro de Ocio Surfasaurus de Matalascañas (Huelva), a unos 100 metros de la playa de Doñana: breakbeat actual y retro con vibes de verano. Sábado 20 de junio de 2026, apertura 17:00 h, cierre tras Hankook (01:00–02:00 h). Horario del cartel oficial: Olmedbreak 17:00, Nileb 17:45, Dany BS 18:30, DJ Tokyo 19:15, Perfect Kombo 20:00, Basstyler 21:00, Anuschka 22:00, The BJ Crew 23:00, Sekret Chadow 00:00, Hankook 01:00–02:00 h. Dos zonas de parking y bares/comida en el recinto. Entradas en MonsterTicket (no nominativas, +18). Dirección Sector Somormujo 31. Cartel con marca RVT (Raveart Booking & Clubbing).',
  event_type: 'festival',
  date_start: '2026-06-20',
  date_end: null,
  location: 'Centro de Ocio Surfasaurus, Sector Somormujo 31, Matalascañas, Huelva, Spain',
  city: 'Matalascañas',
  country: 'Spain',
  venue: 'Centro de Ocio Surfasaurus',
  address: 'Sector Somormujo, 31, Matalascañas, Huelva',
  website: null,
  tickets_url: SOLARIS_FEST_MATALASCANAS_TICKETS,
  doors_open: '17:00',
  doors_close: '02:00',
  image_url: SOLARIS_FEST_MATALASCANAS_IMAGE,
  lineup: SOLARIS_FEST_MATALASCANAS_2026_LINEUP,
  schedule: SOLARIS_FEST_MATALASCANAS_2026_SCHEDULE,
  tags: [
    'solaris fest',
    'matalascañas',
    'huelva',
    'breakbeat',
    'breaks',
    'retro breakbeat',
    'surfasaurus',
    'doñana',
    'monsterticket',
    'rvt',
    'raveart',
    '2026',
  ],
  socials: {
    'Tickets MonsterTicket': SOLARIS_FEST_MATALASCANAS_TICKETS,
    'RVT Booking & Clubbing': 'https://www.rvtpro.com/',
  },
  age_restriction: '+18',
}

async function runPatchSolarisFestMatalascanas2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', SOLARIS_FEST_MATALASCANAS_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-solaris-fest-matalascanas-2026] antes:', before || '(sin fila)')

  const row = {
    slug: SOLARIS_FEST_MATALASCANAS_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...SOLARIS_FEST_MATALASCANAS_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, address')
    .eq('slug', SOLARIS_FEST_MATALASCANAS_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-solaris-fest-matalascanas-2026] OK:', after)
}

const FLORIDANCE_FESTIVAL_2026_SLUG = 'floridance-festival-2026'
const FLORIDANCE_FESTIVAL_TICKETS =
  'https://www.monsterticket.com/evento/floridance-festival-2026'
const FLORIDANCE_FESTIVAL_IMAGE = '/images/events/floridance-festival-2026.webp'
const FLORIDANCE_FESTIVAL_HORARIOS_IMAGE =
  'https://wfekymvossnjdncbvtua.supabase.co/storage/v1/object/public/media/events/floridance-festival-2026/horarios.webp'

/** Cartel oficial A–Z (5 sept 2026). MonsterTicket no lista nombres. */
const FLORIDANCE_FESTIVAL_2026_LINEUP = [
  'Pascal Kleiman',
  'Stanton Warriors',
  'Wizard',
  'Atomic Hooligan',
  'Ctrl-Z',
  'Leeroy Thornhill',
  'MC Ivory',
  'La Gore',
  'Aldo Ferrari',
  'Anuschka',
  'Bad Legs',
  'Deekbass',
  'DJ Man vs DJ Shemma',
  'Funkybitz',
  'Heavy',
  'Kill2Beat',
  'Killerblitz',
  'Lady Shade',
  'Maribel',
  'Norbak',
  'Orebeat',
  'Perfect Kombo',
  'Rueda',
  'Shade K',
  'Tilla Pink',
  'Tortu',
  'Vand4los',
  'Wally',
  'Xema',
  'Yo Speed',
  'Benjamín Serdio VJ',
  'Carlos Mejías VJ',
  'Cellux MC',
]

const FLORIDANCE_CUTTY_SARK = 'Escenario 30 Aniversario Cutty Sark'
const FLORIDANCE_NEGRITA = 'Escenario Floridance Negrita'

const FLORIDANCE_FESTIVAL_2026_STAGES = [
  {
    name: FLORIDANCE_CUTTY_SARK,
    description_es: 'Escenario 30 aniversario (Cutty Sark). Apertura 18:00; cierre 06:00. Horarios oficiales del cartel «Modificación horarios».',
    description_en: '30th-anniversary stage (Cutty Sark). Opens 18:00; closes 06:00. Official “schedule modification” flyer.',
    lineup: [
      'Deekbass',
      'Kill2Beat',
      'Tilla Pink',
      'La Gore',
      'Xema vs Heavy',
      'Stanton Warriors',
      'DJ Man vs Shemma',
      'Tortu',
      'Vand4los (Bad Legs, Seekflow, JTT, L-Essence)',
      'Wizard vs Ivory',
      'Yo Speed',
      'Anuschka',
      'Aldo Ferrari',
    ],
  },
  {
    name: FLORIDANCE_NEGRITA,
    description_es: 'Escenario Floridance (Negrita). Apertura 18:30; cierre 05:30. Horarios oficiales del cartel «Modificación horarios».',
    description_en: 'Floridance stage (Negrita). Opens 18:30; closes 05:30. Official “schedule modification” flyer.',
    lineup: [
      'Funkybitz',
      'Lady Shade',
      'Perfect Kombo',
      'Leeroy Thornhill',
      'Killerblitz',
      'Wally',
      'Orebeat',
      'Atomic Hooligan',
      'Rueda vs Maribel',
      'Ctrl-Z',
      'Pascal Kleiman',
      'Shade K vs Norbak',
    ],
  },
]

const FLORIDANCE_FESTIVAL_2026_SCHEDULE = [
  { time: '18:00', artist: 'Deekbass', stage: FLORIDANCE_CUTTY_SARK },
  { time: '18:30', artist: 'Funkybitz', stage: FLORIDANCE_NEGRITA },
  { time: '18:45', artist: 'Kill2Beat', stage: FLORIDANCE_CUTTY_SARK },
  { time: '19:15', artist: 'Lady Shade', stage: FLORIDANCE_NEGRITA },
  { time: '19:30', artist: 'Tilla Pink', stage: FLORIDANCE_CUTTY_SARK },
  { time: '20:00', artist: 'Perfect Kombo', stage: FLORIDANCE_NEGRITA },
  { time: '20:15', artist: 'La Gore', stage: FLORIDANCE_CUTTY_SARK },
  { time: '20:45', artist: 'Leeroy Thornhill', stage: FLORIDANCE_NEGRITA },
  { time: '21:00', artist: 'Xema vs Heavy', stage: FLORIDANCE_CUTTY_SARK, is_b2b: true },
  { time: '21:45', artist: 'Killerblitz', stage: FLORIDANCE_NEGRITA },
  { time: '22:00', artist: 'Stanton Warriors', stage: FLORIDANCE_CUTTY_SARK },
  { time: '22:30', artist: 'Wally', stage: FLORIDANCE_NEGRITA },
  { time: '23:00', artist: 'DJ Man vs Shemma', stage: FLORIDANCE_CUTTY_SARK, is_b2b: true },
  { time: '23:30', artist: 'Orebeat', stage: FLORIDANCE_NEGRITA },
  { time: '00:00', artist: 'Tortu', stage: FLORIDANCE_CUTTY_SARK },
  { time: '00:30', artist: 'Atomic Hooligan', stage: FLORIDANCE_NEGRITA },
  { time: '01:00', artist: 'Vand4los (Bad Legs, Seekflow, JTT, L-Essence)', stage: FLORIDANCE_CUTTY_SARK },
  { time: '01:30', artist: 'Rueda vs Maribel', stage: FLORIDANCE_NEGRITA, is_b2b: true },
  { time: '02:00', artist: 'Wizard vs Ivory', stage: FLORIDANCE_CUTTY_SARK, is_b2b: true },
  { time: '02:30', artist: 'Ctrl-Z', stage: FLORIDANCE_NEGRITA },
  { time: '03:00', artist: 'Yo Speed', stage: FLORIDANCE_CUTTY_SARK },
  { time: '03:30', artist: 'Pascal Kleiman', stage: FLORIDANCE_NEGRITA },
  { time: '04:00', artist: 'Anuschka', stage: FLORIDANCE_CUTTY_SARK },
  { time: '04:30', artist: 'Shade K vs Norbak', stage: FLORIDANCE_NEGRITA, is_b2b: true },
  { time: '05:00', artist: 'Aldo Ferrari', stage: FLORIDANCE_CUTTY_SARK },
  { time: '05:30', artist: 'Cierre', stage: FLORIDANCE_NEGRITA },
  { time: '06:00', artist: 'Cierre', stage: FLORIDANCE_CUTTY_SARK },
]

const FLORIDANCE_FESTIVAL_2026_DESC_ES =
  'Floridance Fest 2026, de Animalia El Bicho Producciones (desde 1999), es el sábado 5 de septiembre en el Estadio Municipal Antonio Pazos Puyana «Monago» de Rota (Cádiz): solo breakbeat, pista de césped a pie de playa, foodtrucks, merchandising y pintacaras de Fluornation. Vestimenta casual; solo mayores de 18 años con DNI; entradas nominativas.\n\nDos escenarios con horarios oficiales (modificación publicada por Animalia). Escenario 30 Aniversario Cutty Sark: Deekbass 18:00, Kill2Beat, Tilla Pink, La Gore, Xema vs Heavy, Stanton Warriors, DJ Man vs Shemma, Tortu, Vand4los (Bad Legs, Seekflow, JTT, L-Essence) a las 01:00, Wizard vs Ivory, Yo Speed, Anuschka y Aldo Ferrari (cierre 06:00). Escenario Floridance Negrita: Funkybitz 18:30, Lady Shade, Perfect Kombo, Leeroy Thornhill (ex-Prodigy), Killerblitz, Wally, Orebeat, Atomic Hooligan, Rueda vs Maribel, Ctrl-Z, Pascal Kleiman y Shade K vs Norbak (cierre 05:30). Visuales: Benjamín Serdio VJ y Carlos Mejías VJ. Presentación: Cellux MC.\n\nVenta en MonsterTicket y floridance.es. Patrocinan Cutty Sark, Negrita, Cruzcampo y Fuze Tea; colaboran Ayuntamiento de Rota (Delegación de Juventud), Cayetano, Rives, Legendario, Locura y Rota Dance.'

const FLORIDANCE_FESTIVAL_2026_DESC_EN =
  'Floridance Fest 2026, from Animalia El Bicho Producciones (since 1999), is on Saturday 5 September at Estadio Municipal Antonio Pazos Puyana “Monago” in Rota (Cádiz): breakbeat only, a grass dancefloor by the beach, food trucks, merch and Fluornation face painting. Casual dress; 18+ with ID; nominative tickets.\n\nTwo stages with official times (Animalia’s published schedule update). 30th Anniversary Cutty Sark stage: Deekbass 18:00, Kill2Beat, Tilla Pink, La Gore, Xema vs Heavy, Stanton Warriors, DJ Man vs Shemma, Tortu, Vand4los (Bad Legs, Seekflow, JTT, L-Essence) at 01:00, Wizard vs Ivory, Yo Speed, Anuschka and Aldo Ferrari (close 06:00). Floridance Negrita stage: Funkybitz 18:30, Lady Shade, Perfect Kombo, Leeroy Thornhill (ex-Prodigy), Killerblitz, Wally, Orebeat, Atomic Hooligan, Rueda vs Maribel, Ctrl-Z, Pascal Kleiman and Shade K vs Norbak (close 05:30). Visuals: Benjamín Serdio VJ and Carlos Mejías VJ. Host: Cellux MC.\n\nTickets via MonsterTicket and floridance.es. Sponsors on the flyer: Cutty Sark, Negrita, Cruzcampo and Fuze Tea; partners include Ayuntamiento de Rota (youth department), Cayetano, Rives, Legendario, Locura and Rota Dance.'

async function runPatchFloridanceFestival2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end, city, venue, image_url, lineup, stages')
    .eq('slug', FLORIDANCE_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  if (!before) {
    console.error('[patch-floridance-festival-2026] No existe fila:', FLORIDANCE_FESTIVAL_2026_SLUG)
    process.exit(1)
  }
  console.log(
    '[patch-floridance-festival-2026] antes: lineup',
    before.lineup?.length || 0,
    '| stages',
    before.stages?.length || 0,
    '| date_end',
    before.date_end,
  )

  const { error: e1 } = await sb
    .from('events')
    .update({
      name: 'Floridance Fest 2026',
      lineup: FLORIDANCE_FESTIVAL_2026_LINEUP,
      stages: FLORIDANCE_FESTIVAL_2026_STAGES,
      schedule: FLORIDANCE_FESTIVAL_2026_SCHEDULE,
      socials: {
        facebook: 'https://www.facebook.com/animalia.elbichoproduciones',
        instagram: 'https://www.instagram.com/animalia_el_bicho_producciones/',
        schedule_image: FLORIDANCE_FESTIVAL_HORARIOS_IMAGE,
      },
      date_start: '2026-09-05',
      date_end: '2026-09-05',
      country: 'Spain',
      capacity: null,
      doors_open: '18:00',
      doors_close: '07:00',
      age_restriction: '18+',
      tickets_url: FLORIDANCE_FESTIVAL_TICKETS,
      website: 'https://floridance.es/evento/floridance-festival-2026',
      image_url: FLORIDANCE_FESTIVAL_IMAGE,
      description_es: FLORIDANCE_FESTIVAL_2026_DESC_ES,
      description_en: FLORIDANCE_FESTIVAL_2026_DESC_EN,
      tags: [
        'floridance',
        'breakbeat',
        'festival',
        'rota',
        'cádiz',
        'animalia',
        'monsterticket',
        '2026',
      ],
    })
    .eq('slug', FLORIDANCE_FESTIVAL_2026_SLUG)
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end, lineup, stages, schedule, socials, tickets_url')
    .eq('slug', FLORIDANCE_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-floridance-festival-2026] OK:', after)
}

const BREAK_THE_FLOW_W_TERRIE_KYND_2026_SLUG = 'break-the-flow-w-terrie-kynd-2026'
const BREAK_THE_FLOW_TICKETS =
  'https://www.monsterticket.com/evento/break-the-flow-w-terrie-kynd'
const BREAK_THE_FLOW_IMAGE = '/images/events/break-the-flow-w-terrie-kynd.webp'

const BREAK_THE_FLOW_W_TERRIE_KYND_2026_LINEUP = [
  'Terrie Kynd',
  'Evil Crew vs Playbass',
  'Isma Breakz',
  'Franetik',
  'TTBeats',
  'Beatbreaker',
]

const BREAK_THE_FLOW_W_TERRIE_KYND_2026_ROW = {
  name: 'Break The Flow w/ Terrie Kynd',
  description_en:
    'Frequency Break presents Break The Flow at Sala Teranga (Torrox Costa, Málaga province): Terrie Kynd headlines with Evil Crew vs Playbass, Isma Breakz, Franetik, TTBeats and Beatbreaker per the flyer. Saturday 2 May 2026. Official listing on MonsterTicket gives the address as Paseo Marítimo de Ferrara 3, Torrox-Costa (Málaga); 18+ and non-nominal tickets. Sale at monsterticket.com; the artwork also references advance and door pricing with drink (details on the poster).',
  description_es:
    'Frequency Break presenta Break The Flow en Sala Teranga (Torrox Costa, provincia de Málaga): Terrie Kynd encabeza cartel con Evil Crew vs Playbass, Isma Breakz, Franetik, TTBeats y Beatbreaker según el flyer. Sábado 2 de mayo de 2026. La ficha oficial en MonsterTicket indica dirección Paseo Marítimo de Ferrara 3, Torrox-Costa (Málaga); prohibido el acceso a menores de 18 años y entradas no nominativas. Venta en MonsterTicket; el cartel menciona precios anticipada/taquilla con copa.',
  event_type: 'club_night',
  date_start: '2026-05-02',
  date_end: null,
  location: 'Sala Teranga, Torrox Costa, Málaga, Spain',
  city: 'Torrox',
  country: 'Spain',
  venue: 'Sala Teranga',
  address: 'Paseo Marítimo de Ferrara 3, Torrox Costa, Málaga',
  website: null,
  tickets_url: BREAK_THE_FLOW_TICKETS,
  image_url: BREAK_THE_FLOW_IMAGE,
  lineup: BREAK_THE_FLOW_W_TERRIE_KYND_2026_LINEUP,
  tags: [
    'break the flow',
    'frequency break',
    'terrie kynd',
    'breakbeat',
    'torrox costa',
    'málaga',
    'sala teranga',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
}

async function runPatchBreakTheFlowWTerrieKynd2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', BREAK_THE_FLOW_W_TERRIE_KYND_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-break-the-flow-w-terrie-kynd-2026] antes:', before || '(sin fila)')

  const row = {
    slug: BREAK_THE_FLOW_W_TERRIE_KYND_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAK_THE_FLOW_W_TERRIE_KYND_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', BREAK_THE_FLOW_W_TERRIE_KYND_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-break-the-flow-w-terrie-kynd-2026] OK:', after)
}

const EL_PINAR_BREAKS_FEST_2026_SLUG = 'el-pinar-breaks-fest-2026'
const EL_PINAR_BREAKS_FEST_TICKETS =
  'https://www.monsterticket.com/evento/el-pinar-breaks-fest'
const EL_PINAR_BREAKS_FEST_IMAGE = '/images/events/el-pinar-breaks-fest.webp'

const EL_PINAR_BREAKS_FEST_2026_LINEUP = [
  'DJ Karpin',
  'Badlegs',
  'Aggresivnes',
  'Mr-Fli',
  'Kos DJ',
  'Colombo',
  'Jan-B',
  'Tilla Pink',
  'Satuxx',
  'ONEDROIT',
  'Breakbeat ESP',
]

const EL_PINAR_BREAKS_FEST_2026_ROW = {
  name: 'El Pinar Breaks Fest',
  description_en:
    'El Pinar Breaks Fest at Sala El Pinar (Baños de la Encina, Jaén province): Saturday 9 May 2026, doors from 19:00 until closing per MonsterTicket. The posted lineup on the official flyer includes DJ Karpin, Badlegs, Aggresivnes, Mr-Fli, Kos DJ, Colombo, Jan-B, Tilla Pink, Satuxx, ONEDROIT and Breakbeat ESP. Official sale page lists non-nominal tickets, 18+, address Av. Migaldias s/n in Baños de la Encina; tiered pricing on MonsterTicket.',
  description_es:
    'El Pinar Breaks Fest en Sala El Pinar (Baños de la Encina, Jaén): sábado 9 de mayo de 2026, apertura desde las 19:00 hasta el cierre según MonsterTicket. Cartel según flyer oficial: DJ Karpin, Badlegs, Aggresivnes, Mr-Fli, Kos DJ, Colombo, Jan-B, Tilla Pink, Satuxx, ONEDROIT y Breakbeat ESP. Venta oficial: entradas no nominativas, prohibido menores de 18 años; dirección Av. Migaldias s/n en Baños de la Encina; precios por tramos en MonsterTicket.',
  event_type: 'club_night',
  date_start: '2026-05-09',
  date_end: null,
  location: 'Sala El Pinar, Baños de la Encina, Jaén, Spain',
  city: 'Baños de la Encina',
  country: 'Spain',
  venue: 'Sala El Pinar',
  address: 'Av. Migaldias s/n, 23711 Baños de la Encina, Jaén',
  website: null,
  tickets_url: EL_PINAR_BREAKS_FEST_TICKETS,
  image_url: EL_PINAR_BREAKS_FEST_IMAGE,
  lineup: EL_PINAR_BREAKS_FEST_2026_LINEUP,
  tags: [
    'el pinar breaks fest',
    'breakbeat',
    'breaks',
    'baños de la encina',
    'jaén',
    'sala el pinar',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
  doors_open: '19:00',
  doors_close: null,
}

async function runPatchElPinarBreaksFest2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', EL_PINAR_BREAKS_FEST_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-el-pinar-breaks-fest-2026] antes:', before || '(sin fila)')

  const row = {
    slug: EL_PINAR_BREAKS_FEST_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...EL_PINAR_BREAKS_FEST_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', EL_PINAR_BREAKS_FEST_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-el-pinar-breaks-fest-2026] OK:', after)
}

const BREAKS_BLOOM_FESTIVAL_2026_SLUG = 'breaks-bloom-festival-2026'
const BREAKS_BLOOM_FESTIVAL_TICKETS =
  'https://www.monsterticket.com/evento/breaks-bloom-festival'
const BREAKS_BLOOM_FESTIVAL_IMAGE = '/images/events/breaks-bloom-festival.webp'

const BREAKS_BLOOM_FESTIVAL_2026_ROW = {
  name: 'Breaks Bloom Festival',
  description_en:
    'Outdoor-oriented breaks event at Hacienda El Mantillo in Pilas (Seville province): Saturday 19 September 2026. The flyer and MonsterTicket listing describe terrace, gardens, chill zone and an indoor room; private parking advertised for more than 350 vehicles. Official artwork brands BackStage together with Hacienda El Mantillo (events venue). Artist lineup was not published on the poster (“coming soon”); ticket sale on MonsterTicket lists 18+ and non-nominal tickets. Address on the ticket page: Ctra. Hinojos, km 1, Pilas (Seville).',
  description_es:
    'Propuesta de breaks en exterior en la Hacienda El Mantillo, Pilas (Sevilla): sábado 19 de septiembre de 2026. Cartel y ficha en MonsterTicket citan terraza, jardines, chill zone y sala interior; aparcamiento privado para más de 350 vehículos según el diseño gráfico. Identidad visual: BackStage junto a Hacienda El Mantillo (espacio de eventos). Cartel sin nombres de artistas (“próximamente”); venta en MonsterTicket: mayores de 18 y entradas no nominativas. Dirección en venta: Ctra. Hinojos, km 1, Pilas (Sevilla).',
  event_type: 'festival',
  date_start: '2026-09-19',
  date_end: null,
  location: 'Hacienda El Mantillo, Pilas, Sevilla, Spain',
  city: 'Pilas',
  country: 'Spain',
  venue: 'Hacienda El Mantillo',
  address: 'Ctra. Hinojos, km 1, Pilas, Sevilla',
  website: null,
  tickets_url: BREAKS_BLOOM_FESTIVAL_TICKETS,
  image_url: BREAKS_BLOOM_FESTIVAL_IMAGE,
  lineup: [],
  tags: [
    'breaks bloom',
    'breakbeat',
    'pilas',
    'sevilla',
    'hacienda el mantillo',
    'festival',
    '2026',
    'monsterticket',
    'backstage',
  ],
  socials: {},
  age_restriction: '18+',
}

async function runPatchBreaksBloomFestival2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', BREAKS_BLOOM_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-breaks-bloom-festival-2026] antes:', before || '(sin fila)')

  const row = {
    slug: BREAKS_BLOOM_FESTIVAL_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAKS_BLOOM_FESTIVAL_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', BREAKS_BLOOM_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-breaks-bloom-festival-2026] OK:', after)
}

const BELLOTA_BREAK_FESTIVAL_2026_SLUG = 'bellota-break-festival-2026'
const BELLOTA_BREAK_FESTIVAL_TICKETS =
  'https://www.monsterticket.com/evento/bellota-break-festival-2026'
const BELLOTA_BREAK_FESTIVAL_IMAGE = '/images/events/bellota-break-festival-2026.webp'

const BELLOTA_BREAK_FESTIVAL_2026_LINEUP = [
  'The Brainkiller',
  'Tortu',
  'José Rodríguez',
  'Yo Speed',
  'Hankook',
  'Jotta Frank',
  'Madam Dee',
  'Maribel',
  'Four Motion',
  'V. Aparicio',
  'JN Cruz',
  'Maxuka',
  'Kill II Beat',
  'Frex Collective',
  'Moraobreak',
  'Boti-K',
  'Sukla\'s',
  'La Bestia 333',
  'Skinwalker',
  'Cellux MC',
]

const BELLOTA_BREAK_FESTIVAL_2026_ROW = {
  name: 'Bellota Break Festival 2026',
  description_en:
    'Bellota Break Festival at the Plaza de Toros in Calzadilla de los Barros (Badajoz province), Saturday 13 June 2026, 19:00–07:00. Official flyer line-up mixes retro and contemporary breakbeat acts: The Brainkiller, Tortu, José Rodríguez, Yo Speed, Hankook, Jotta Frank, Madam Dee, Maribel, Four Motion, V. Aparicio, JN Cruz, Maxuka, Kill II Beat, Frex Collective, Moraobreak, Boti-K, Sukla\'s, La Bestia 333, Skinwalker; host Cellux MC. Collaborators on the artwork include the town council (Ayto. Calzadilla de los Barros), Rural Breaks, Dreambreak Fest, Frex Collective, Extremadura Break, Sentimiento Break Beat and MonsterTicket. Advance tickets via promoters and MonsterTicket. MonsterTicket listing: hours as above; access from age 16 with minor-authorisation form linked on sale page; non-nominal ticket tiers change over time; address Calle Calvario 1.',
  description_es:
    'Bellota Break Festival en la Plaza de Toros de Calzadilla de los Barros (Badajoz), sábado 13 de junio de 2026, 19:00 h a 07:00 h. Cartel oficial (retro / actual): The Brainkiller, Tortu, José Rodríguez, Yo Speed, Hankook, Jotta Frank, Madam Dee, Maribel, Four Motion, V. Aparicio, JN Cruz, Maxuka, Kill II Beat, Frex Collective, Moraobreak, Boti-K, Sukla\'s, La Bestia 333 y Skinwalker; presentador Cellux MC. El cartel cita la colaboración del Ayuntamiento de Calzadilla de los Barros y marcas asociadas (Rural Breaks, Dreambreak Fest, Frex Collective, Extremadura Break, Sentimiento Break Beat, MonsterTicket). Venta anticipada por RRPP y Monsterticket. En MonsterTicket: horario indicado; acceso desde 16 años con autorización para menores según ficha; entradas no nominativas; dirección de venta: Calle Calvario 1.',
  event_type: 'festival',
  date_start: '2026-06-13',
  date_end: null,
  location: 'Plaza de Toros, Calzadilla de los Barros, Badajoz, Spain',
  city: 'Calzadilla de los Barros',
  country: 'Spain',
  venue: 'Plaza de Toros',
  address: 'Calle Calvario 1, Calzadilla de los Barros, Badajoz',
  website: null,
  tickets_url: BELLOTA_BREAK_FESTIVAL_TICKETS,
  image_url: BELLOTA_BREAK_FESTIVAL_IMAGE,
  lineup: BELLOTA_BREAK_FESTIVAL_2026_LINEUP,
  tags: [
    'bellota break festival',
    'breakbeat',
    'calzadilla de los barros',
    'badajoz',
    'plaza de toros',
    'festival',
    '2026',
    'monsterticket',
    'rural breaks',
    'dreambreak fest',
    'frex collective',
    'extremadura break',
  ],
  socials: {},
  age_restriction: '16+',
  doors_open: '19:00',
  doors_close: '07:00',
}

async function runPatchBellotaBreakFestival2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', BELLOTA_BREAK_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-bellota-break-festival-2026] antes:', before || '(sin fila)')

  const row = {
    slug: BELLOTA_BREAK_FESTIVAL_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BELLOTA_BREAK_FESTIVAL_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', BELLOTA_BREAK_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-bellota-break-festival-2026] OK:', after)
}

const OSHUN_FESTIVAL_2026_SLUG = 'oshun-festival-2026'
const OSHUN_FESTIVAL_TICKETS = 'https://www.monsterticket.com/evento/oshun-festival-2026'
const OSHUN_FESTIVAL_IMAGE = '/images/events/oshun-festival-2026.webp'

const OSHUN_FESTIVAL_2026_LINEUP = [
  'Colombo',
  'Norbak',
  'Mbreaks',
  'Killerblitz',
  'Franxi',
  'Pasku',
  'Baymont Bross',
  'Yo Speed',
  'Bad Legs',
  'Bowser',
  'Darkbass',
  'Xano',
  '… más artistas por confirmar',
]

const OSHUN_FESTIVAL_2026_ROW = {
  name: 'Oshun Festival 2026',
  description_en:
    'Oshun Festival 2026 at Carpas Yerbabuena, Recinto Ferial Barbate (Cádiz province), Saturday 15 August 2026. Second lineup wave (“Segundo avance”) on the flyer adds Colombo, Norbak, Mbreaks, Killerblitz, Franxi and Pasku on top of the previously confirmed Baymont Bross, Yo Speed, Bad Legs, Bowser, Darkbass and Xano, with more acts still TBA—100% breakbeat, foam cannon, beachside site, food trucks and merchandising as promoted. Doors 17:00–close 07:00; 18+ only. MonsterTicket: non-nominal tickets; launch tranches for first entries + T-shirt sold out at times—check the storefront. Organisers on the art: Sala Oshun and Made In Sur (@salaoshun, @made.in.sur.events). Sale URL without RRPP tracking: monsterticket.com/oshun-festival-2026.',
  description_es:
    'Oshun Festival 2026 en Carpas Yerbabuena, Recinto Ferial Barbate (Cádiz), sábado 15 de agosto de 2026. Segundo avance de cartel: a los ya anunciados Baymont Bross, Yo Speed, Bad Legs, Bowser, Darkbass y Xano se suman Colombo, Norbak, Mbreaks, Killerblitz, Franxi y Pasku, con más artistas por confirmar. Festival 100% breakbeat con cañón de espuma, junto a la playa, food trucks y merchandising según flyer. Horario 17:00h–07:00h; acceso prohibido a menores de 18 años. En MonsterTicket: entradas no nominativas; tramos promocionales (p. ej. primeras entradas + camiseta) pueden agotarse—consultar taquilla. Organizadores en el arte: Sala Oshun y Made In Sur. Enlace de venta sin parámetros RRPP: monsterticket.com/oshun-festival-2026.',
  event_type: 'festival',
  date_start: '2026-08-15',
  date_end: null,
  location: 'Carpas Yerbabuena, Recinto Ferial Barbate, Barbate, Cádiz, Spain',
  city: 'Barbate',
  country: 'Spain',
  venue: 'Carpas Yerbabuena',
  address: 'Recinto Ferial Barbate, Barbate, Cádiz',
  website: null,
  tickets_url: OSHUN_FESTIVAL_TICKETS,
  image_url: OSHUN_FESTIVAL_IMAGE,
  lineup: OSHUN_FESTIVAL_2026_LINEUP,
  tags: [
    'oshun festival',
    'breakbeat',
    'barbate',
    'cádiz',
    'yerbabuena',
    'carpas',
    'festival',
    '2026',
    'monsterticket',
  ],
  socials: {
    instagram: 'https://www.instagram.com/salaoshun/',
    instagram_made_in_sur: 'https://www.instagram.com/made.in.sur.events/',
  },
  age_restriction: '18+',
  doors_open: '17:00',
  doors_close: '07:00',
}

async function runPatchOshunFestival2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', OSHUN_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-oshun-festival-2026] antes:', before || '(sin fila)')

  const row = {
    slug: OSHUN_FESTIVAL_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...OSHUN_FESTIVAL_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', OSHUN_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-oshun-festival-2026] OK:', after)
}

const BREIKI_ELECTRONIC_FESTIVAL_SLUG = 'breiki-electronic-festival'
const BREIKI_ELECTRONIC_FESTIVAL_TICKETS =
  'https://www.monsterticket.com/evento/breiki-electronic-festival-3-edicion'
const BREIKI_ELECTRONIC_FESTIVAL_IMAGE = '/images/events/breiki-electronic-festival-2026.webp'

const BREIKI_ELECTRONIC_FESTIVAL_LINEUP = [
  'Jan-B vs Mr.Fli',
  'DJ Garry',
  'Anita Breakz vs Lady Ourevitch',
  'Nokaut',
  'Yuls',
  'Wascaman Jr',
  'Vialbass vs Kaberbass',
  'Cellux MC',
  'Alhai',
  'Formation Estepona',
  'Puma',
  'Fireheart',
  'Mcaracoles',
]

const BREIKI_ELECTRONIC_FESTIVAL_ROW = {
  name: 'BREIKI Electronic Festival',
  description_en:
    'Third edition of Breiki Electronic Festival, an inclusive and accessible family electronic music festival, on Saturday 19 September 2026 at Santa Rita Supperdisco, Málaga. Family Rave 16:00–21:00 (doors from 15:30). Poster line-up: Jan-B vs Mr.Fli, DJ Garry, Anita Breakz vs Lady Ourevitch, Nokaut, Yuls, Wascaman Jr, Vialbass vs Kaberbass, Cellux MC, plus Alhai, Formation Estepona, Puma, Fireheart and Mcaracoles. For families with kids and teens: confetti, kids’ parkineo, superheroes, quiet relax area, baby zone, face painting and terrace. Adults may not enter without a minor (max. four adults per child); under-18s need ID or family book, an adult and a printed authorisation. Under 2s free. No distilled alcohol (beer or wine for adults only). Tickets on MonsterTicket; first tranche sold out at cataloguing. Address: C/ de Alfredo Corrochano 85, 29006 Málaga. Tagline on the flyer: “En Andalucía comienza todo”.',
  description_es:
    'Tercera edición de Breiki Electronic Festival, festival familiar inclusivo y accesible de música electrónica, el sábado 19 de septiembre de 2026 en Santa Rita Supperdisco (Málaga). Family Rave 16:00–21:00 (apertura 15:30). Cartel: Jan-B vs Mr.Fli, DJ Garry, Anita Breakz vs Lady Ourevitch, Nokaut, Yuls, Wascaman Jr, Vialbass vs Kaberbass, Cellux MC, y también Alhai, Formation Estepona, Puma, Fireheart y Mcaracoles. Solo para familias con peques, adolescentes y ritmo: confeti, peque parkineo, superhéroes, zona relax sin música, baby zone, pintacaras y terraza. No entran adultos sin menor (máx. 4 adultos por menor); menores de 18 con DNI o libro de familia, adulto y autorización impresa. Bebés de menos de 2 años gratis. Sin alcohol destilado (cerveza o vino solo para adultos). Entradas en MonsterTicket; el 1.er tramo estaba agotado al catalogar. Dirección: C/ de Alfredo Corrochano 85, 29006 Málaga. Lema del flyer: «En Andalucía comienza todo».',
  event_type: 'festival',
  date_start: '2026-09-19',
  date_end: null,
  location: 'Santa Rita Supperdisco, Málaga, Spain',
  city: 'Málaga',
  country: 'Spain',
  venue: 'Santa Rita Supperdisco',
  address: 'C/ de Alfredo Corrochano, 85, 29006 Málaga',
  website: null,
  tickets_url: BREIKI_ELECTRONIC_FESTIVAL_TICKETS,
  image_url: BREIKI_ELECTRONIC_FESTIVAL_IMAGE,
  lineup: BREIKI_ELECTRONIC_FESTIVAL_LINEUP,
  tags: [
    'breiki',
    'family rave',
    'accesible',
    'inclusivo',
    'málaga',
    'santa rita',
    'breaks',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction:
    'Todos los públicos. Menores de 18: DNI o libro de familia, adulto y autorización impresa. Adultos solo con menor (máx. 4 por menor). Menores de 2 años gratis.',
  doors_open: '15:30',
  doors_close: '21:00',
}

async function runPatchBreikiElectronicFestival2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, lineup')
    .eq('slug', BREIKI_ELECTRONIC_FESTIVAL_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-breiki-electronic-festival-2026] antes:', before || '(sin fila)')

  const row = {
    slug: BREIKI_ELECTRONIC_FESTIVAL_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREIKI_ELECTRONIC_FESTIVAL_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', BREIKI_ELECTRONIC_FESTIVAL_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-breiki-electronic-festival-2026] OK:', after)
}

const MAS_RUIDO_BLACK_HOLE_360_2026_SLUG = 'mas-ruido-black-hole-360-2026'
const MAS_RUIDO_BLACK_HOLE_360_TICKETS =
  'https://www.monsterticket.com/evento/mas-ruido-black-hole-360'
const MAS_RUIDO_BLACK_HOLE_360_IMAGE = '/images/events/mas-ruido-black-hole-360.webp'

const MAS_RUIDO_BLACK_HOLE_360_2026_LINEUP = [
  'Aldo Ferrari',
  'Elle Skull',
  'FM-3',
  'Mutantbreakz',
  'Pray For Bass',
  'Shade K',
  'Tortu',
  'Yo Speed',
  'Cellux MC',
]

const MAS_RUIDO_BLACK_HOLE_360_2026_ROW = {
  name: "+Ruido! - Black Hole 360",
  description_en:
    '+Ruido! Black Hole 360 at Sala O’Farrell (San Fernando, Cádiz): the flyer bills “the black breakbeat night” (la fiesta de negro del breakbeat) with 360 stage, LED screens and production nods (Megatron, FX) per artwork. Saturday 18 April 2026, 23:00–07:00. Official lineup on the poster: Aldo Ferrari, Elle Skull, FM-3, Mutantbreakz, Pray For Bass, Shade K, Tortu, Yo Speed; host Cellux MC. Address on the art: C/ Ajustadores 10, by Bahía Sur. MonsterTicket lists 18+, non-nominal tickets, no all-sportswear entry, and at times showed online sales closed — verify current availability with the promoter. Tickets/RRPP as per flyer.',
  description_es:
    '+Ruido! Black Hole 360 en Sala O’Farrell (San Fernando, Cádiz): el cartel presenta “la fiesta de negro del breakbeat” con escenario 360, pantallas LED y elementos de puesta (Megatron, FX, etc.) según el diseño. Sábado 18 de abril de 2026, 23:00h a 7:00h. Line-up en el flyer: Aldo Ferrari, Elle Skull, FM-3, Mutantbreakz, Pray For Bass, Shade K, Tortu, Yo Speed; presentación con Cellux MC. Dirección en el cartel: C/ Ajustadores 10, junto a Bahía Sur. Ficha de MonsterTicket: 18+ y entradas no nominativas; prohibido acceder con ropa totalmente deportiva. La venta online puede constar como cerrada en un momento dado: confirmar con el promotor. Enlace de venta sin parámetros RRPP.',
  event_type: 'club_night',
  date_start: '2026-04-18',
  date_end: null,
  location: "Sala O'Farrell, San Fernando, Cádiz, Spain",
  city: 'San Fernando',
  country: 'Spain',
  venue: "Sala O'Farrell",
  address: 'C/ Ajustadores 10, San Fernando, Cádiz',
  website: null,
  tickets_url: MAS_RUIDO_BLACK_HOLE_360_TICKETS,
  image_url: MAS_RUIDO_BLACK_HOLE_360_IMAGE,
  lineup: MAS_RUIDO_BLACK_HOLE_360_2026_LINEUP,
  tags: [
    'mas ruido',
    'black hole 360',
    'breakbeat',
    "o'farrell",
    'san fernando',
    'cádiz',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
  doors_open: '23:00',
  doors_close: '07:00',
}

async function runPatchMasRuidoBlackHole3602026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', MAS_RUIDO_BLACK_HOLE_360_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-mas-ruido-black-hole-360-2026] antes:', before || '(sin fila)')

  const row = {
    slug: MAS_RUIDO_BLACK_HOLE_360_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...MAS_RUIDO_BLACK_HOLE_360_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', MAS_RUIDO_BLACK_HOLE_360_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-mas-ruido-black-hole-360-2026] OK:', after)
}

const LA_CASETA_DEL_BREAKBEAT_2026_SLUG = 'la-caseta-del-breakbeat-2026'
const LA_CASETA_DEL_BREAKBEAT_TICKETS =
  'https://site.fourvenues.com/es/dj-rokeh/events/la-caseta-del-breakbeat-25-04-2026-DGZP'
const LA_CASETA_DEL_BREAKBEAT_IMAGE = '/images/events/la_caseta_del_breakbeat.webp'

const LA_CASETA_DEL_BREAKBEAT_2026_LINEUP = [
  'A.Skillz vs Krafty Kuts',
  'Miau vs Terrie Kynd',
  'Mutantbreakz',
  'Guau',
  'Yo Speed',
  'Mbreaks',
  'Bowser',
  'Nosk',
  'Buson',
]

const LA_CASETA_DEL_BREAKBEAT_2026_ROW = {
  name: 'La Caseta del Breakbeat',
  description_en:
    'Breakbeat night at Sala Pandora, Seville, on Saturday 25 April 2026. Promoted via DJ Rokeh on Fourvenues: headline battles A.Skillz vs Krafty Kuts and Miau vs Terrie Kynd, plus Mutantbreakz, Guau, Yo Speed, Mbreaks, Bowser, Nosk and Buson, with further international artists and show still to be announced. Venue address: Calle Gramil 2. Advertised ticket tiers on Fourvenues: free before 23:00; group (4 people) €5.50; duo (2 people) €6; entry before 01:00 €6; general admission €10.',
  description_es:
    'Noche de breakbeat en la sala Pandora, Sevilla, el sábado 25 de abril de 2026. Convocatoria difundida por DJ Rokeh en Fourvenues: batallas A.Skillz vs Krafty Kuts y Miau vs Terrie Kynd; Mutantbreakz, Guau, Yo Speed, Mbreaks, Bowser, Nosk y Buson; más artistas y show internacional por confirmar. Dirección: calle Gramil 2. Precios publicitados en Fourvenues: gratis antes de las 23:00; grupo (4 pax) 5,50 €; dúo (2 pax) 6 €; acceso antes de la 01:00 6 €; general 10 €.',
  event_type: 'club_night',
  date_start: '2026-04-25',
  date_end: null,
  location: 'Sala Pandora, Sevilla',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Sala Pandora',
  address: 'Calle Gramil 2, Sevilla',
  website: null,
  tickets_url: LA_CASETA_DEL_BREAKBEAT_TICKETS,
  image_url: LA_CASETA_DEL_BREAKBEAT_IMAGE,
  lineup: LA_CASETA_DEL_BREAKBEAT_2026_LINEUP,
  tags: [
    'la caseta del breakbeat',
    'breakbeat',
    'breaks',
    'sevilla',
    'sala pandora',
    'gramil',
    '2026',
    'dj rokeh',
    'fourvenues',
    'a.skillz',
    'krafty kuts',
  ],
  socials: {},
  doors_open: '22:00',
  doors_close: null,
}

async function runPatchLaCasetaDelBreakbeat2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', LA_CASETA_DEL_BREAKBEAT_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-la-caseta-del-breakbeat-2026] antes:', before || '(sin fila)')

  const row = {
    slug: LA_CASETA_DEL_BREAKBEAT_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...LA_CASETA_DEL_BREAKBEAT_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', LA_CASETA_DEL_BREAKBEAT_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-la-caseta-del-breakbeat-2026] OK:', after)
}

const FRUITY_LOOPS_03062026_SLUG = 'fruity-loops-03-06-2026'
const FRUITY_LOOPS_TICKETS =
  'https://site.fourvenues.com/es/iaramargafatimagmailcom/events/fruity-loops-03-06-2026-MU2X'
const FRUITY_LOOPS_IMAGE = '/images/events/fruity-loops-03-06-2026.avif'

const FRUITY_LOOPS_03062026_LINEUP = []

const FRUITY_LOOPS_03062026_ROW = {
  name: 'Fruity Loops',
  description_en:
    'Fruity Loops on Wednesday 3 June 2026. Tickets, venue, timetable and lineup are published on the organizer Fourvenues storefront (site.fourvenues.com). Poster in the repo matches the listing artwork.',
  description_es:
    'Fruity Loops el miércoles 3 de junio de 2026. Entradas, sala, horario y artistas figuran en la venta oficial de Fourvenues (site.fourvenues.com). El cartel en el repositorio coincide con el arte de la ficha.',
  event_type: 'club_night',
  date_start: '2026-06-03',
  date_end: null,
  location: '',
  city: '',
  country: 'Spain',
  venue: null,
  address: null,
  website: null,
  tickets_url: FRUITY_LOOPS_TICKETS,
  image_url: FRUITY_LOOPS_IMAGE,
  lineup: FRUITY_LOOPS_03062026_LINEUP,
  tags: ['fruity loops', 'fourvenues', 'breakbeat', '2026', 'site.fourvenues.com'],
  socials: {},
}

async function runPatchFruityLoops03062026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', FRUITY_LOOPS_03062026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-fruity-loops-03-06-2026] antes:', before || '(sin fila)')

  const row = {
    slug: FRUITY_LOOPS_03062026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...FRUITY_LOOPS_03062026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', FRUITY_LOOPS_03062026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-fruity-loops-03-06-2026] OK:', after)
}

const FINGER_LICKIN_BOAT_PARTY_2026_SLUG = 'finger-lickin-boat-party-2026'
const FINGER_LICKIN_SKIDDLE =
  'https://www.skiddle.com/whats-on/London/Dutch-Master-Party-Boat/Finger-Lickin-Boat-Party/42152456/'
const FINGER_LICKIN_IMAGE = '/images/events/finger-lickin-boat-party.webp'

const FINGER_LICKIN_BOAT_PARTY_2026_LINEUP = [
  'Plump DJs',
  'Krafty Kuts',
  'A.Skillz',
  'Soul of Man',
  'Slyde',
  'Jessica Joy',
]

const FINGER_LICKIN_BOAT_PARTY_2026_ROW = {
  name: 'Finger Lickin Boat Party',
  description_en:
    'Annual Finger Lickin Records boat party on the Dutch Master (Thames, London): two floors, daytime sailing on Saturday 16 May 2026, with public listings giving embarkation around 12:30–16:30 at Tower Millennium Pier / Tower Pier. The label’s own announcement names Plump DJs (marking 25 years of Plump Nights Out), Krafty Kuts and A.Skillz, Soul of Man, Slyde and Jessica Joy, with further names to follow. Genres sit in the breaks / club spectrum the brand is known for. The promoter states tickets are sold only via Skiddle, are non-transferable, and warns against touts and unofficial resellers.',
  description_es:
    'Fiesta anual en barco de Finger Lickin Records a bordo del Dutch Master por el Támesis (Londres): dos plantas, sesión diurna el sábado 16 de mayo de 2026; los listados públicos sitúan el embarque hacia 12:30–16:30 en Tower Millennium Pier / Tower Pier. El comunicado del sello cita a Plump DJs (25 años de Plump Nights Out), Krafty Kuts y A.Skillz, Soul of Man, Slyde y Jessica Joy, con más nombres por confirmar. El estilo encaja con el breaks y la línea club del sello. El promotor indica que las entradas solo se venden en Skiddle, que no son transferibles y advierte contra revendedores no oficiales.',
  event_type: 'club_night',
  date_start: '2026-05-16',
  date_end: null,
  location: 'Dutch Master Party Boat, Tower Millennium Pier, London, United Kingdom',
  city: 'London',
  country: 'United Kingdom',
  venue: 'Dutch Master Party Boat',
  address: 'Tower Millennium Pier, Tower Pier, London',
  website: FINGER_LICKIN_SKIDDLE,
  tickets_url: FINGER_LICKIN_SKIDDLE,
  image_url: FINGER_LICKIN_IMAGE,
  lineup: FINGER_LICKIN_BOAT_PARTY_2026_LINEUP,
  tags: [
    'finger lickin records',
    'london',
    'boat party',
    'thames',
    'breaks',
    'plump djs',
    'krafty kuts',
    'a.skillz',
    'soul of man',
    'slyde',
    'jessica joy',
    'dutch master',
    '2026',
    'skiddle',
  ],
  socials: {
    'Instagram @thedutchmasterlondon': 'https://www.instagram.com/thedutchmasterlondon/',
  },
  age_restriction: null,
  doors_open: '12:30',
  doors_close: '16:30',
}

async function runPatchFingerLickinBoatParty2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', FINGER_LICKIN_BOAT_PARTY_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-finger-lickin-boat-party-2026] antes:', before || '(sin fila)')

  const row = {
    slug: FINGER_LICKIN_BOAT_PARTY_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...FINGER_LICKIN_BOAT_PARTY_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', FINGER_LICKIN_BOAT_PARTY_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-finger-lickin-boat-party-2026] OK:', after)
}

const FINGER_LICKIN_BETWEEN_THE_BRIDGES_2026_SLUG = 'finger-lickin-between-the-bridges-2026'
const FINGER_LICKIN_BTB_SKIDDLE =
  'https://www.skiddle.com/whats-on/London/Between-The-Bridges-London/Finger-Lickin-At-Between-the-Bridges/42363687/'
const FINGER_LICKIN_BTB_IMAGE = '/images/events/finger-lickin-between-the-bridges-2026.webp'
const FINGER_LICKIN_BTB_VENUE_WEB = 'https://www.betweenthebridges.co.uk/events-btb/finger-lickin-16-may'

const FINGER_LICKIN_BETWEEN_THE_BRIDGES_2026_LINEUP = [
  'Plump DJs',
  'Krafty Kuts',
  'A.Skillz',
  'The Freestylers',
  'Slyde',
  'Stereo 8',
  'Soul of Man',
]

const FINGER_LICKIN_BETWEEN_THE_BRIDGES_2026_ROW = {
  name: "Finger Lickin' at Between the Bridges",
  description_en:
    "Finger Lickin' Records takes over Between the Bridges on the South Bank for an early-evening session on Saturday 16 May 2026 (5pm–11pm). It lands on the same day as the label’s annual Thames boat party: the boat is sold out, and this riverside slot keeps the party going on dry land for everyone who missed the boat — and for boat guests who want to roll straight into the night.\n\n" +
    "Line-up: Plump DJs, Krafty Kuts, A.Skillz, very special guests The Freestylers, Slyde, Stereo 8 and Soul of Man (label heads), with more names to come. Expect the juiciest breaks, house and hip-hop in the Finger Lickin' mould.\n\n" +
    "Venue: Between the Bridges — open-air beer garden and food village on The Queen's Walk, Southbank, London SE1, right by the Thames and an easy walk from Waterloo. Bars and street food on site; the promoter notes three years of Finger Lickin' dates at this spot.\n\n" +
    "Official tickets are sold via Skiddle (see Links below). Finger Lickin Records also shares the ticket link from their Instagram.",
  description_es:
    "Finger Lickin' Records ocupa Between the Bridges en South Bank para una sesión de tarde-noche el sábado 16 de mayo de 2026 (17:00–23:00). Coincide con la fiesta anual en barco por el Támesis: el barco va agotado y esta cita en la ribera permite seguir la celebración en tierra para quien no pudo subir al barco, y para quienes bajan del barco y quieren seguir la noche.\n\n" +
    "Cartel: Plump DJs, Krafty Kuts, A.Skillz, invitados especiales The Freestylers, Slyde, Stereo 8 y Soul of Man (cabezas del sello), con más nombres por confirmar. Sonido en clave breaks, house y hip-hop, en la línea Finger Lickin'.\n\n" +
    "Sala: Between the Bridges — beer garden al aire libre y oferta de comida en The Queen's Walk, Southbank, Londres SE1, junto al Támesis y a pocos minutos de Waterloo. Bares y street food en el recinto; el comunicado destaca tres años de fechas Finger Lickin' en este espacio.\n\n" +
    "Entradas oficiales en Skiddle (enlace en Links). El sello también publica el enlace en Instagram.",
  event_type: 'club_night',
  date_start: '2026-05-16',
  date_end: null,
  location: "Between the Bridges, The Queen's Walk, Southbank, London SE1, United Kingdom",
  city: 'London',
  country: 'United Kingdom',
  venue: 'Between the Bridges',
  address: "The Queen's Walk, Southbank, London SE1",
  website: FINGER_LICKIN_BTB_VENUE_WEB,
  tickets_url: FINGER_LICKIN_BTB_SKIDDLE,
  image_url: FINGER_LICKIN_BTB_IMAGE,
  lineup: FINGER_LICKIN_BETWEEN_THE_BRIDGES_2026_LINEUP,
  coords: { lat: 51.5056, lng: -0.1192 },
  tags: [
    'finger lickin records',
    'between the bridges',
    'southbank',
    'london',
    'breakbeat',
    'breaks',
    'house',
    'hip-hop',
    'plump djs',
    'krafty kuts',
    'a.skillz',
    'the freestylers',
    'slyde',
    'stereo 8',
    'soul of man',
    'skiddle',
    '2026',
    'daytimerave',
    'goldenageofbreaks',
  ],
  socials: {
    "Venue (Between the Bridges)": FINGER_LICKIN_BTB_VENUE_WEB,
    'Instagram @finger_lickin_records': 'https://www.instagram.com/finger_lickin_records/',
    'Instagram @btwthebridges': 'https://www.instagram.com/btwthebridges/',
  },
  age_restriction: '18+',
  doors_open: '17:00',
  doors_close: '23:00',
}

async function runPatchFingerLickinBetweenTheBridges2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', FINGER_LICKIN_BETWEEN_THE_BRIDGES_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-finger-lickin-between-the-bridges-2026] antes:', before || '(sin fila)')

  const row = {
    slug: FINGER_LICKIN_BETWEEN_THE_BRIDGES_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...FINGER_LICKIN_BETWEEN_THE_BRIDGES_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', FINGER_LICKIN_BETWEEN_THE_BRIDGES_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-finger-lickin-between-the-bridges-2026] OK:', after)
}

const DREAMBEACH_COSTA_DEL_SOL_2026_SLUG = 'dreambeach-costa-del-sol-2026'
const DREAMBEACH_WEB = 'https://www.dreambeach.es/'

const DREAMBEACH_COSTA_DEL_SOL_2026_LINEUP = [
  'Karpin',
  'Lady Waks B2B Stanton Warriors',
  'Wizard',
]

const DREAMBEACH_COSTA_DEL_SOL_2026_ROW = {
  name: 'Dreambeach Costa del Sol 2026',
  description_en:
    'First Dreambeach Costa del Sol edition: a two-day open-air electronic music festival on 31 July and 1 August 2026 in Vélez-Málaga on the Costa del Sol (Málaga province), Spain. Official communications promote the new location and a broad international bill across house, techno, EDM, drum and bass and related club styles. This Optimal Breaks entry highlights the breakbeat-facing names on the published 2026 poster: Karpin, the Spain-exclusive back-to-back Lady Waks B2B Stanton Warriors, and Wizard. Tickets and updates: dreambeach.es.',
  description_es:
    'Primera edición de Dreambeach Costa del Sol: festival al aire libre de música electrónica los días 31 de julio y 1 de agosto de 2026 en Vélez-Málaga, en la Costa del Sol (provincia de Málaga). La comunicación oficial presenta la nueva ubicación y un cartel amplio con nombres internacionales de house, techno, EDM, drum and bass y estilos de club afines. Esta ficha destaca los nombres con peso breakbeat en el cartel publicado para 2026: Karpin, el B2B en exclusiva para España Lady Waks B2B Stanton Warriors, y Wizard. Entradas e información: dreambeach.es.',
  event_type: 'festival',
  date_start: '2026-07-31',
  date_end: '2026-08-01',
  location: 'Vélez-Málaga, Costa del Sol, Málaga, Spain',
  city: 'Vélez-Málaga',
  country: 'Spain',
  venue: 'Dreambeach Costa del Sol',
  address: null,
  website: DREAMBEACH_WEB,
  tickets_url: DREAMBEACH_WEB,
  image_url: '/images/events/DREAMBEACH_festival_2026.webp',
  lineup: DREAMBEACH_COSTA_DEL_SOL_2026_LINEUP,
  tags: [
    'dreambeach',
    'dreambeach costa del sol',
    'vélez-málaga',
    'málaga',
    'costa del sol',
    'festival',
    '2026',
    'breakbeat',
    'breaks',
    'karpin',
    'lady waks',
    'stanton warriors',
    'wizard',
  ],
  socials: {},
}

async function runPatchDreambeachCostaDelSol2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end, city, venue, image_url')
    .eq('slug', DREAMBEACH_COSTA_DEL_SOL_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-dreambeach-costa-del-sol-2026] antes:', before || '(sin fila)')

  const row = {
    slug: DREAMBEACH_COSTA_DEL_SOL_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...DREAMBEACH_COSTA_DEL_SOL_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end, city, venue, lineup, website, tickets_url, image_url')
    .eq('slug', DREAMBEACH_COSTA_DEL_SOL_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-dreambeach-costa-del-sol-2026] OK:', after)
}

const IBERICAN_BREAKS_FESTIVAL_2026_SLUG = 'iberican-breaks-festival-2026'
const IBERICAN_BREAKS_TICKETS = 'https://www.monsterticket.com/evento/iberican-breaks-festival-2026'
const IBERICAN_BREAKS_IMAGE = '/images/events/iberican-breaks-festival-2026.webp'

/** Cartel oficial 2026: public/images/events/iberican-breaks-festival-2026.webp (orden de lectura). */
const IBERICAN_BREAKS_FESTIVAL_2026_LINEUP = [
  'Anuschka',
  'Sekret Chadow',
  'Pray for Bass',
  'Yo Speed',
  'Mutant Breakz',
  'Perfect Kombo',
  'Destroyers',
  'Shade K',
  'Prody',
  'Urbano',
  'Cude',
  'DJ WAVS',
  'Four Motion',
  'Müme',
  'Pavane',
  'Drumback',
  'Staxia',
  'Terrie Kynd',
  'Welder B',
  'Killerblitz',
  'Buson',
  'Kaak',
  'Rapela',
  'Speaker Cellux',
]

const IBERICAN_BREAKS_FESTIVAL_2026_ROW = {
  name: 'IBÉRICAN Breaks Festival 2026',
  description_en:
    'IBÉRICAN Breaks Festival 2026 brings together a broad slice of national breakbeat talent for one open-air date on Saturday 16 May 2026 at Terraza Manhattan in Olvera (Cádiz province), Spain. Promoted by The Electronics Nightmare, the bill is built as a solid cross-section of the current Iberian breaks circuit — DJs and producers aligned with the sound, the crowd energy and the festival-ready side of the scene. The stored lineup order matches the names printed on the official 2026 poster. Tickets are sold via MonsterTicket; the official listing states non-nominal passes and no entry under 18. Exact door times were still marked as to be confirmed on the ticket page at cataloguing time — check MonsterTicket and promoter channels for updates.',
  description_es:
    'IBÉRICAN Breaks Festival 2026 reúne a gran parte del talento nacional del breakbeat en una cita al aire libre el sábado 16 de mayo de 2026 en la Terraza Manhattan de Olvera (Cádiz). La promotora The Electronics Nightmare presenta un cartel amplio y representativo de la escena: sonido, ambiente y cultura de pista en clave breaks. El lineup guardado reproduce el orden de los nombres del cartel oficial de 2026. Entradas a la venta en MonsterTicket; la ficha oficial indica entradas no nominativas y prohibición de acceso a menores de 18 años. El horario de apertura figuraba como «por confirmar» en la página de venta al cerrar esta ficha — conviene revisar MonsterTicket y las redes del promotor antes del evento.',
  event_type: 'festival',
  date_start: '2026-05-16',
  date_end: null,
  location: 'Terraza Manhattan, Olvera, Cádiz, Spain',
  city: 'Olvera',
  country: 'Spain',
  venue: 'Terraza Manhattan',
  address: null,
  website: IBERICAN_BREAKS_TICKETS,
  tickets_url: IBERICAN_BREAKS_TICKETS,
  image_url: IBERICAN_BREAKS_IMAGE,
  lineup: IBERICAN_BREAKS_FESTIVAL_2026_LINEUP,
  tags: [
    'iberican',
    'iberican breaks',
    'breakbeat',
    'breaks',
    'olvera',
    'cadiz',
    'cádiz',
    'spain',
    '2026',
    'terrace',
    'the electronics nightmare',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
  doors_open: null,
  doors_close: null,
  coords: { lat: 36.9333, lng: -5.2667 },
}

async function runPatchIbericanBreaksFestival2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', IBERICAN_BREAKS_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-iberican-breaks-festival-2026] antes:', before || '(sin fila)')

  const row = {
    slug: IBERICAN_BREAKS_FESTIVAL_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...IBERICAN_BREAKS_FESTIVAL_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, age_restriction')
    .eq('slug', IBERICAN_BREAKS_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-iberican-breaks-festival-2026] OK:', after)
}

const ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_SLUG =
  'electrolunch-xxl-picnic-76-sevilla-2026'
const ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_TICKETS = 'https://www.ultimaentrada.com/'
const ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_IMAGE =
  '/images/events/electrolunch-xxl-picnic-76-sevilla-2026.webp'

const ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_LINEUP = [
  'Stanton Warriors',
  'Ylia',
  'Jade Tansa',
  'Magma',
  'Luis Soldevilla',
]

const ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_ROW = {
  name: 'Electrolunch XXL · Picnic 76 (Stanton Warriors)',
  description_en:
    'Electrolunch XXL returns to Parque Magallanes (next to Torre Sevilla) on Saturday 9 May 2026, edition number 76 ("Picnic 76") of the long-running open-air series promoted by Rocknrolla Producciones. Doors at 12:00; free entry until 17:00 and then special passes via ultimaentrada.com. The Main Stage is headlined by UK breakbeat pioneers Stanton Warriors — two decades of festivals and clubs worldwide in the breaks/bass canon — with national support from Ylia, Jade Tansa, Magma and Luis Soldevilla. Electrolunch keeps its usual all-ages, family-friendly daytime format: electronic music, workshops, artisan market, food trucks and activities for children in the shaded picnic zone.',
  description_es:
    'Electrolunch XXL regresa al Parque Magallanes (junto a Torre Sevilla) el sábado 9 de mayo de 2026, edición número 76 («Picnic 76») de la serie al aire libre que promueve Rocknrolla Producciones. Apertura a las 12:00 h; entrada gratuita hasta las 17:00 h y luego pases especiales en ultimaentrada.com. Directos desde Reino Unido, Stanton Warriors — pioneros del breakbeat con décadas reventando pistas en todo el mundo — encabezan el Main Stage, con refuerzo nacional de Ylia, Jade Tansa, Magma y Luis Soldevilla. Se mantiene el formato habitual de Electrolunch: música electrónica, talleres, mercadillo de artesanos, food trucks y actividades infantiles en la zona picnic con sombra.',
  event_type: 'festival',
  date_start: '2026-05-09',
  date_end: null,
  location: 'Parque Magallanes, Isla de la Cartuja, Sevilla, Spain',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Parque Magallanes',
  address: 'Parque Magallanes, junto a Torre Sevilla, Isla de la Cartuja, Sevilla',
  website: 'https://www.instagram.com/electrolvnch/',
  tickets_url: ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_TICKETS,
  image_url: ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_IMAGE,
  lineup: ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_LINEUP,
  tags: [
    'electrolunch',
    'electrolunch xxl',
    'picnic 76',
    'breakbeat',
    'breaks',
    'bass',
    'stanton warriors',
    'sevilla',
    'parque magallanes',
    'torre sevilla',
    'rocknrolla producciones',
    'open air',
    '2026',
  ],
  socials: {
    'Instagram @electrolvnch': 'https://www.instagram.com/electrolvnch/',
    'Facebook ElectroLvnch': 'https://www.facebook.com/ElectroLvnch/',
    'Tickets ultimaentrada.com': 'https://www.ultimaentrada.com/',
  },
  age_restriction: 'Todos los públicos',
  doors_open: '12:00',
  doors_close: null,
  coords: { lat: 37.4003, lng: -6.0013 },
}

async function runPatchElectrolunchXxlPicnic76Sevilla2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-electrolunch-xxl-picnic-76] antes:', before || '(sin fila)')

  const row = {
    slug: ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_ROW,
    is_featured: true,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, age_restriction')
    .eq('slug', ELECTROLUNCH_XXL_PICNIC_76_SEVILLA_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-electrolunch-xxl-picnic-76] OK:', after)
}

const BREAKDOWN_ORLANDO_2026_SLUG = 'breakdown-orlando-2026'
const BREAKDOWN_ORLANDO_2026_TICKETS =
  'https://www.eventbrite.com/e/breakdown-tickets-1988005787827'
const BREAKDOWN_ORLANDO_2026_IMAGE = '/images/events/breakdown-orlando-2026.webp'

const BREAKDOWN_ORLANDO_2026_LINEUP = [
  'Huda Hudia',
  'Soltek',
  'Robotic',
  'Matrix',
  'Supagroover',
  'Beezie',
  'Axel V',
  'Andres Morales',
]

const BREAKDOWN_ORLANDO_2026_ROW = {
  name: 'BREAKDOWN (Huda Hudia · Orlando)',
  description_en:
    'Fully Loaded & Rave Royalty present BREAKDOWN on Saturday 27 June 2026 at Broken Strings Brewery, downtown Orlando (1012 W Church St). An all-ages indoor/outdoor breakbeat & bass night with craft beers, cocktails, food vendors and state-of-the-art production lighting and sound. Headlining: Huda Hudia (Kaleidoscope Music) — Florida breakbeat veteran and Kaleidoscope label boss. Local & guest support from Soltek, Robotic, Matrix, Supagroover, Beezie, Axel V and Andres Morales. Doors 20:00, closing 23:30. Free parking. Co-presented by 808 Life Music, Rave Royalty, Fully Loaded Productions (FLP), Broken Strings Brewery and Next Level Productions.',
  description_es:
    'Fully Loaded y Rave Royalty presentan BREAKDOWN el sábado 27 de junio de 2026 en Broken Strings Brewery, en el centro de Orlando (1012 W Church St). Noche de breakbeat y bass para todos los públicos en formato indoor/outdoor, con cervezas artesanas, cócteles, food trucks y producción de sonido e iluminación de primer nivel. Cabeza de cartel: Huda Hudia (Kaleidoscope Music), veterano del breakbeat de Florida y jefe del sello Kaleidoscope. Refuerzo local con Soltek, Robotic, Matrix, Supagroover, Beezie, Axel V y Andres Morales. Apertura 20:00, cierre 23:30. Parking gratuito. Coorganizado por 808 Life Music, Rave Royalty, Fully Loaded Productions (FLP), Broken Strings Brewery y Next Level Productions.',
  event_type: 'club_night',
  date_start: '2026-06-27',
  date_end: null,
  location: 'Broken Strings Brewery, 1012 W Church St, Orlando, FL 32805',
  city: 'Orlando',
  country: 'United States',
  venue: 'Broken Strings Brewery',
  address: '1012 W Church St, Orlando, FL 32805',
  website: 'https://www.eventbrite.com/e/breakdown-tickets-1988005787827',
  tickets_url: BREAKDOWN_ORLANDO_2026_TICKETS,
  image_url: BREAKDOWN_ORLANDO_2026_IMAGE,
  lineup: BREAKDOWN_ORLANDO_2026_LINEUP,
  tags: [
    'breakdown',
    'huda hudia',
    'kaleidoscope music',
    'breakbeat',
    'breaks',
    'bass',
    'orlando',
    'florida',
    'fully loaded',
    'rave royalty',
    '808 life music',
    'broken strings brewery',
    'next level productions',
    '2026',
  ],
  socials: {
    'Eventbrite tickets': BREAKDOWN_ORLANDO_2026_TICKETS,
    'Broken Strings Brewery': 'https://brokenstringsbrewery.com/',
    'Instagram @huda_hudia': 'https://www.instagram.com/huda_hudia/',
    'Instagram @kaleidoscope.music': 'https://www.instagram.com/kaleidoscope.music/',
  },
  age_restriction: 'All ages',
  doors_open: '20:00',
  doors_close: '23:30',
  coords: { lat: 28.5413, lng: -81.3911 },
}

async function runPatchBreakdownOrlando2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', BREAKDOWN_ORLANDO_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-breakdown-orlando-2026] antes:', before || '(sin fila)')

  const row = {
    slug: BREAKDOWN_ORLANDO_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAKDOWN_ORLANDO_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, age_restriction')
    .eq('slug', BREAKDOWN_ORLANDO_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-breakdown-orlando-2026] OK:', after)
}

const RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_SLUG =
  'ritmika-1-aniversario-white-beach-lepe-2026'
const RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_TICKETS =
  'https://www.monsterticket.com/evento/1-aniversario-ritmika--white-beach'
const RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_WEBSITE =
  'https://www.rollerwhitebeach.com/'
const RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_IMAGE =
  '/images/events/ritmika-1-aniversario-white-beach-lepe-2026.webp'

// Cartel oficial — orden A-Z, mantenemos los enfrentamientos / b2b / feats tal cual.
const RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_LINEUP = [
  // Headliners (A-Z)
  'Ed Solo feat. Navigator',
  'Keith Mackenzie feat. Sporty-O',
  // Line up (A-Z) — show vand4los
  'Bad Legs x Seekflow feat. JTT & L-Essence',
  'Colombo vs Sekret Chadow',
  'Guau vs Yo Speed',
  'Jose Rodriguez + Gordo Master',
  'Killerblitz vs Four Motion',
  'Mbreaks',
  'Perfect Kombo vs Seveng vs Basstyler',
  'Rhades vs Pavane',
  'Tortu',
  'Urbano vs Bassmaster',
  'Wiguez x Air Baxx',
  // Warm up
  'Mastherizers vs Drumback',
  // Hosted by
  'Speaker Reality (MC)',
]

const RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_ROW = {
  name: 'Ritmika 1er Aniversario — Festival Open Air (White Beach La Antilla)',
  description_en:
    'RITMIKA throws its first anniversary edition on Saturday 18 July 2026 at White Beach Antilla (La Antilla, Lepe, Huelva), the open-air beach club on the Costa de la Luz operated by Roller Group (Pandora Sevilla, REBELS festival) with capacity for up to 3,000 people. Festival open air format with 12 hours non-stop of breakbeat and bass on the beach. Headliners (A-Z): Ed Solo feat. Navigator and Keith Mackenzie feat. Sporty-O. Show vand4los line up (A-Z): Bad Legs x Seekflow feat. JTT & L-Essence, Colombo vs Sekret Chadow, Guau vs Yo Speed, Jose Rodríguez + Gordo Master, Killerblitz vs Four Motion, Mbreaks, Perfect Kombo vs Seveng vs Basstyler, Rhades vs Pavane, Tortu, Urbano vs Bassmaster and Wiguez x Air Baxx. Warm up by Mastherizers vs Drumback, hosted by Speaker Reality on the mic. Doors 19:00; free entry with nominative ticket valid until 21:30 while capacity lasts, then GENERAL admission €10 + €1 booking fee via MonsterTicket and at rollerwhitebeach.com. 18+, non-nominative GENERAL tickets, wristband required for re-entry.',
  description_es:
    'RITMIKA celebra su primer aniversario el sábado 18 de julio de 2026 en White Beach Antilla (La Antilla, Lepe, Huelva), la gran terraza open air de la Costa de la Luz operada por Roller Group (Pandora Sevilla, festival REBELS) con capacidad para hasta 3.000 personas. Formato festival open air con 12 horas non-stop de breakbeat y bass a pie de playa. Headliners (A-Z): Ed Solo feat. Navigator y Keith Mackenzie feat. Sporty-O. Line up show vand4los (A-Z): Bad Legs x Seekflow feat. JTT & L-Essence, Colombo vs Sekret Chadow, Guau vs Yo Speed, Jose Rodríguez + Gordo Master, Killerblitz vs Four Motion, Mbreaks, Perfect Kombo vs Seveng vs Basstyler, Rhades vs Pavane, Tortu, Urbano vs Bassmaster y Wiguez x Air Baxx. Warm up a cargo de Mastherizers vs Drumback, presentación en directo de Speaker Reality al micro. Apertura de puertas 19:00 h; entrada GRATIS con entrada nominativa válida hasta las 21:30 h hasta agotar cupo, entrada GENERAL 10 € + 1 € gastos en MonsterTicket y en rollerwhitebeach.com. +18 años, entradas GENERAL no nominativas, pulsera obligatoria para reentrada según horario.',
  event_type: 'festival',
  date_start: '2026-07-18',
  date_end: null,
  location: 'White Beach Antilla, La Antilla, Lepe, Huelva, Spain',
  city: 'Lepe',
  country: 'Spain',
  venue: 'White Beach Antilla (White Beach Club)',
  address: 'Finca La Calzadilla, La Antilla, Lepe, Huelva',
  website: RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_WEBSITE,
  tickets_url: RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_TICKETS,
  image_url: RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_IMAGE,
  lineup: RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_LINEUP,
  tags: [
    'ritmika',
    '1 aniversario',
    '1er aniversario',
    'festival open air',
    'breakbeat',
    'breaks',
    'bass',
    '12h non stop',
    'open air',
    'beach',
    'white beach',
    'white beach antilla',
    'roller white beach',
    'la antilla',
    'lepe',
    'huelva',
    'costa de la luz',
    'roller group',
    'speaker reality',
    'andalucia',
    '2026',
  ],
  socials: {
    'Web Roller White Beach': RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_WEBSITE,
    'Tickets MonsterTicket': RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_TICKETS,
    'Instagram @ritmika.club': 'https://www.instagram.com/ritmika.club/',
    'Instagram @whitebeachantilla': 'https://www.instagram.com/whitebeachantilla/',
  },
  age_restriction: '+18',
  doors_open: '19:00',
  doors_close: '07:00',
  capacity: 3000,
  coords: { lat: 37.196, lng: -7.262 },
}

async function runPatchRitmika1AniversarioWhiteBeachLepe2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log(
    '[patch-ritmika-1-aniversario-white-beach-lepe-2026] antes:',
    before || '(sin fila)',
  )

  const row = {
    slug: RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_ROW,
    is_featured: true,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, age_restriction')
    .eq('slug', RITMIKA_1_ANIVERSARIO_WHITE_BEACH_LEPE_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-ritmika-1-aniversario-white-beach-lepe-2026] OK:', after)
}

const COAST_BREAKBEAT_2026_SLUG = 'coast-breakbeat-2026'
const COAST_BREAKBEAT_TICKETS = 'https://www.monsterticket.com/evento/coast-breakbeat-2026'
const COAST_BREAKBEAT_IMAGE = '/images/events/coast-breakbeat-2026.webp'

const COAST_BREAKBEAT_2026_LINEUP = [
  'Evil Crew vs Playbass',
  'Isma Breakz',
  'Super Break',
  'Franetik',
  'Raü',
  'DJ Fdez',
  'Defkon7',
  'CSBreak',
]

const COAST_BREAKBEAT_2026_ROW = {
  name: 'Coast Breakbeat',
  description_en:
    'Frequency Break presents Coast Breakbeat on Saturday 18 July 2026 at Sala Teranga, Torrox Costa (Málaga province): coastal breakbeat night on the Costa del Sol with Evil Crew vs Playbass, Isma Breakz, Super Break, Franetik, Raü, DJ Fdez, Defkon7 and CSBreak per the official MonsterTicket poster. Single ticket €7 including one drink; 18+ and non-nominal tickets. Address Paseo Marítimo de Ferrara 3, Torrox Costa (poster also cites Avenida del Faro). Same venue and promoter circuit as Break The Flow and Malaga is Break.',
  description_es:
    'Frequency Break presenta Coast Breakbeat el sábado 18 de julio de 2026 en Sala Teranga, Torrox Costa (Málaga): noche de breakbeat en la costa con Evil Crew vs Playbass, Isma Breakz, Super Break, Franetik, Raü, DJ Fdez, Defkon7 y CSBreak según cartel oficial en MonsterTicket. Entrada única 7 € con consumición; mayores de 18 años y entradas no nominativas. Dirección Paseo Marítimo de Ferrara 3, Torrox Costa (el cartel cita también Avenida del Faro). Mismo local y circuito promotor que Break The Flow y Malaga is Break.',
  event_type: 'club_night',
  date_start: '2026-07-18',
  date_end: null,
  location: 'Sala Teranga, Torrox Costa, Málaga, Spain',
  city: 'Torrox',
  country: 'Spain',
  venue: 'Sala Teranga',
  address: 'Paseo Marítimo de Ferrara 3, Torrox Costa, Málaga',
  website: null,
  tickets_url: COAST_BREAKBEAT_TICKETS,
  image_url: COAST_BREAKBEAT_IMAGE,
  lineup: COAST_BREAKBEAT_2026_LINEUP,
  tags: [
    'coast breakbeat',
    'frequency break',
    'breakbeat',
    'torrox costa',
    'málaga',
    'costa del sol',
    'sala teranga',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
}

async function runPatchCoastBreakbeat2026(sb) {
  const row = {
    slug: COAST_BREAKBEAT_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...COAST_BREAKBEAT_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url')
    .eq('slug', COAST_BREAKBEAT_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-coast-breakbeat-2026] OK:', after)
}

const BREAKCLUB_AT_COSMOS_CLUB_2026_SLUG = 'breakclub-at-cosmos-club-2026'
const BREAKCLUB_AT_COSMOS_CLUB_TICKETS =
  'https://www.monsterticket.com/evento/breakclub-at-cosmos-club'
const BREAKCLUB_AT_COSMOS_CLUB_IMAGE = '/images/events/breakclub-at-cosmos-club-2026.webp'
const BREAKCLUB_AT_COSMOS_WEB = 'https://www.salacosmos.com/'

const BREAKCLUB_AT_COSMOS_CLUB_2026_LINEUP = [
  'Black Voltaje',
  'GoNe',
  'Sirius',
  'Dolt',
  'Davo vs Coma',
  'Alicia Krter',
  'Mr John',
]

const BREAKCLUB_AT_COSMOS_CLUB_2026_ROW = {
  name: 'BREAKCLUB at COSMOS CLUB',
  description_en:
    'Breakbeat night at Sala Cosmos (Seville) on Friday 17 July 2026, 00:00–07:00. Official MonsterTicket poster: Black Voltaje, GoNe, Sirius, Dolt, Davo vs Coma, Alicia Krter and Mr John. C/ Carlos de Cepeda 2; 18+ and non-nominal tickets. Part of the Cosmos Club breakbeat programme (Breakbeat Klub / Local Breakers series).',
  description_es:
    'Noche de breakbeat en Sala Cosmos (Sevilla) el viernes 17 de julio de 2026, de 00:00 a 07:00 h. Cartel oficial en MonsterTicket: Black Voltaje, GoNe, Sirius, Dolt, Davo vs Coma, Alicia Krter y Mr John. C/ Carlos de Cepeda 2; mayores de 18 años y entradas no nominativas. Encaja en la programación breakbeat del Cosmos Club (serie Breakbeat Klub / Local Breakers).',
  event_type: 'club_night',
  date_start: '2026-07-17',
  date_end: null,
  location: 'Sala Cosmos, Sevilla, Spain',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Sala Cosmos',
  address: 'C/ Carlos de Cepeda 2, Sevilla',
  website: BREAKCLUB_AT_COSMOS_WEB,
  tickets_url: BREAKCLUB_AT_COSMOS_CLUB_TICKETS,
  image_url: BREAKCLUB_AT_COSMOS_CLUB_IMAGE,
  lineup: BREAKCLUB_AT_COSMOS_CLUB_2026_LINEUP,
  tags: [
    'breakclub',
    'breakbeat klub',
    'cosmos club',
    'breakbeat',
    'sevilla',
    '2026',
    'monsterticket',
    'local breakers',
  ],
  socials: {
    'Sala Cosmos': BREAKCLUB_AT_COSMOS_WEB,
  },
  age_restriction: '18+',
  doors_open: '00:00',
  doors_close: '07:00',
}

async function runPatchBreakclubAtCosmosClub2026(sb) {
  const row = {
    slug: BREAKCLUB_AT_COSMOS_CLUB_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAKCLUB_AT_COSMOS_CLUB_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, doors_open')
    .eq('slug', BREAKCLUB_AT_COSMOS_CLUB_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-breakclub-at-cosmos-club-2026] OK:', after)
}

const BREAK_NATION_BY_420_SOUND_2026_SLUG = 'break-nation-by-420-sound-2026'
const BREAK_NATION_BY_420_SOUND_TICKETS =
  'https://www.monsterticket.com/evento/break-nation-by-420-sound'
const BREAK_NATION_BY_420_SOUND_IMAGE = '/images/events/break-nation-by-420-sound-2026.webp'

const BREAK_NATION_BY_420_SOUND_2026_ROW = {
  name: 'Break Nation by 420 Sound',
  description_en:
    '420 Energy Sound presents Break Nation at Sala Roka, Málaga on Saturday 19 September 2026: underground breakbeat and bass culture night (official poster tagline: breakbeat, bass, culture). MonsterTicket lists 18+ and non-nominal tickets; promo tiers from €12. No individual DJ names were printed on the published artwork at cataloguing time — check MonsterTicket and @420energysound for lineup updates. Calle Leda 1, Málaga.',
  description_es:
    '420 Energy Sound presenta Break Nation en Sala Roka, Málaga, el sábado 19 de septiembre de 2026: noche de breakbeat y cultura bass underground (cartel oficial: breakbeat, bass, culture). MonsterTicket: mayores de 18 años y entradas no nominativas; tramos promocionales desde 12 €. El cartel publicado no incluía nombres de DJ individuales al catalogar — consultar MonsterTicket y @420energysound por avances de line-up. Calle Leda 1, Málaga.',
  event_type: 'club_night',
  date_start: '2026-09-19',
  date_end: null,
  location: 'Sala Roka, Málaga, Spain',
  city: 'Málaga',
  country: 'Spain',
  venue: 'Sala Roka',
  address: 'Calle Leda 1, Málaga',
  website: null,
  tickets_url: BREAK_NATION_BY_420_SOUND_TICKETS,
  image_url: BREAK_NATION_BY_420_SOUND_IMAGE,
  lineup: [],
  tags: [
    'break nation',
    '420 sound',
    '420 energy sound',
    'breakbeat',
    'bass',
    'sala roka',
    'málaga',
    '2026',
    'monsterticket',
  ],
  socials: {
    'Instagram @420energysound': 'https://www.instagram.com/420energysound/',
  },
  age_restriction: '18+',
}

async function runPatchBreakNationBy420Sound2026(sb) {
  const row = {
    slug: BREAK_NATION_BY_420_SOUND_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAK_NATION_BY_420_SOUND_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, tickets_url, image_url')
    .eq('slug', BREAK_NATION_BY_420_SOUND_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-break-nation-by-420-sound-2026] OK:', after)
}

const FINGER_LICKIN_SUMMER_TAKEOVER_2026_SLUG = 'finger-lickin-summer-takeover-2026'
const FINGER_LICKIN_SUMMER_TAKEOVER_SKIDDLE =
  'https://www.skiddle.com/whats-on/Brighton/The-Concorde-2/Finger-Lickin-Summer-Takeover/42427615/'
const FINGER_LICKIN_SUMMER_TAKEOVER_IMAGE =
  '/images/events/finger-lickin-summer-takeover-2026.webp'
const CONCORDE2_WEB = 'https://www.concorde2.co.uk/'

const FINGER_LICKIN_SUMMER_TAKEOVER_2026_LINEUP = [
  'The Freestylers',
  'Plump DJs',
  'Krafty Kuts',
  'A.Skillz',
  'Soul of Man',
]

const FINGER_LICKIN_SUMMER_TAKEOVER_2026_ROW = {
  name: "Finger Lickin' Summer Takeover (Concorde 2, Brighton)",
  description_en:
    "Finger Lickin Records summer showcase at Concorde 2, Brighton seafront, on Saturday 15 August 2026, 17:00–22:00 (18+). Official Skiddle listing: The Freestylers, Plump DJs, Krafty Kuts, A.Skillz and Soul of Man — core breaks roster from the Brighton-based label. Venue 286A Madeira Drive, BN2 1EN. Tickets via Skiddle; same Finger Lickin circuit as the London boat party and Between the Bridges dates already on Optimal Breaks.",
  description_es:
    'Showcase de verano de Finger Lickin Records en Concorde 2, frente al mar en Brighton, el sábado 15 de agosto de 2026, de 17:00 a 22:00 h (18+). Ficha Skiddle: The Freestylers, Plump DJs, Krafty Kuts, A.Skillz y Soul of Man — núcleo breaks del sello con sede en Brighton. Sala 286A Madeira Drive, BN2 1EN. Entradas en Skiddle; mismo circuito Finger Lickin que la boat party londinense y Between the Bridges ya catalogados en Optimal Breaks.',
  event_type: 'club_night',
  date_start: '2026-08-15',
  date_end: null,
  location: 'Concorde 2, Brighton, United Kingdom',
  city: 'Brighton',
  country: 'United Kingdom',
  venue: 'Concorde 2',
  address: '286A Madeira Drive, Brighton BN2 1EN',
  website: CONCORDE2_WEB,
  tickets_url: FINGER_LICKIN_SUMMER_TAKEOVER_SKIDDLE,
  image_url: FINGER_LICKIN_SUMMER_TAKEOVER_IMAGE,
  lineup: FINGER_LICKIN_SUMMER_TAKEOVER_2026_LINEUP,
  tags: [
    'finger lickin records',
    'concorde 2',
    'brighton',
    'breaks',
    'breakbeat',
    'freestylers',
    'plump djs',
    'krafty kuts',
    'a.skillz',
    'soul of man',
    '2026',
    'skiddle',
    'united kingdom',
  ],
  socials: {
    'Concorde 2': CONCORDE2_WEB,
    Skiddle: FINGER_LICKIN_SUMMER_TAKEOVER_SKIDDLE,
  },
  age_restriction: '18+',
  doors_open: '17:00',
  doors_close: '22:00',
  coords: { lat: 50.8156, lng: -0.1294 },
}

async function runPatchFingerLickinSummerTakeover2026(sb) {
  const row = {
    slug: FINGER_LICKIN_SUMMER_TAKEOVER_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...FINGER_LICKIN_SUMMER_TAKEOVER_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url')
    .eq('slug', FINGER_LICKIN_SUMMER_TAKEOVER_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-finger-lickin-summer-takeover-2026] OK:', after)
}

const STANTON_WARRIORS_VOLKS_BRIGHTON_2026_SLUG = 'stanton-warriors-volks-brighton-2026'
const STANTON_WARRIORS_VOLKS_SKIDDLE =
  'https://www.skiddle.com/whats-on/Brighton/Volks/On-the-Beach-Official-Afterparty-Stanton-Warriors-Calyx/42511743/'
const STANTON_WARRIORS_VOLKS_IMAGE = '/images/events/stanton-warriors-volks-brighton-2026.webp'
const VOLKS_WEB = 'https://volksclubbrighton.co.uk/'

const STANTON_WARRIORS_VOLKS_BRIGHTON_2026_LINEUP = ['Stanton Warriors', 'Calyx']

const STANTON_WARRIORS_VOLKS_BRIGHTON_2026_ROW = {
  name: 'On the Beach Official Afterparty — Stanton Warriors & Calyx (Volks, Brighton)',
  description_en:
    'Official On the Beach festival afterparty at Volks Club, Brighton seafront, Saturday 18 July 2026: Stanton Warriors and Calyx (Skiddle listing). Doors 22:00 until 07:00; 18+. Address 1–3 Madeira Drive, BN2 1PS — same Madeira Drive strip as Concorde 2. Breakbeat and drum & bass crossover night tied to the Brighton beach weekender circuit.',
  description_es:
    'Afterparty oficial de On the Beach en Volks Club, frente al mar en Brighton, el sábado 18 de julio de 2026: Stanton Warriors y Calyx (Skiddle). Puertas 22:00 h hasta las 07:00 h; 18+. Dirección 1–3 Madeira Drive, BN2 1PS — misma franja de Madeira Drive que Concorde 2. Noche breakbeat / drum & bass ligada al circuito del festival playero de Brighton.',
  event_type: 'club_night',
  date_start: '2026-07-18',
  date_end: null,
  location: 'Volks Club, Brighton, United Kingdom',
  city: 'Brighton',
  country: 'United Kingdom',
  venue: 'Volks Club',
  address: '1–3 Madeira Drive, Brighton BN2 1PS',
  website: VOLKS_WEB,
  tickets_url: STANTON_WARRIORS_VOLKS_SKIDDLE,
  image_url: STANTON_WARRIORS_VOLKS_IMAGE,
  lineup: STANTON_WARRIORS_VOLKS_BRIGHTON_2026_LINEUP,
  tags: [
    'stanton warriors',
    'calyx',
    'on the beach',
    'volks',
    'brighton',
    'afterparty',
    'breakbeat',
    'drum and bass',
    '2026',
    'skiddle',
    'united kingdom',
  ],
  socials: {
    Volks: VOLKS_WEB,
    Skiddle: STANTON_WARRIORS_VOLKS_SKIDDLE,
  },
  age_restriction: '18+',
  doors_open: '22:00',
  doors_close: '07:00',
  coords: { lat: 50.8165, lng: -0.1285 },
}

async function runPatchStantonWarriorsVolksBrighton2026(sb) {
  const row = {
    slug: STANTON_WARRIORS_VOLKS_BRIGHTON_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...STANTON_WARRIORS_VOLKS_BRIGHTON_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, doors_open')
    .eq('slug', STANTON_WARRIORS_VOLKS_BRIGHTON_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-stanton-warriors-volks-brighton-2026] OK:', after)
}

const STANTON_SESSIONS_STEELYARD_LONDON_2026_SLUG = 'stanton-sessions-steelyard-london-2026'
const STANTON_SESSIONS_STEELYARD_SKIDDLE =
  'https://www.skiddle.com/whats-on/London/The-Steelyard/Stanton-Warriors-Presents-Stanton-Sessions/43302831/'
const STANTON_SESSIONS_STEELYARD_IMAGE =
  '/images/events/stanton-sessions-steelyard-london-2026.webp'
const STEELYARD_WEB = 'https://www.thesteelyard.co.uk/'

const STANTON_SESSIONS_STEELYARD_LONDON_2026_LINEUP = ['Stanton Warriors']

const STANTON_SESSIONS_STEELYARD_LONDON_2026_ROW = {
  name: 'Stanton Warriors Presents: Stanton Sessions (The Steelyard, London)',
  description_en:
    'Stanton Warriors headline their Stanton Sessions brand at The Steelyard, London Bridge, on Saturday 10 October 2026. Doors 19:00 (Skiddle). Address 13–15 Allhallows Lane, EC4R 3UL. At cataloguing time public listings named Stanton Warriors only — check Skiddle and stantonwarriors.com for support announcements. Promotional artwork on file is a generic Stanton Warriors photo until a dedicated event poster is published.',
  description_es:
    'Stanton Warriors encabezan su marca Stanton Sessions en The Steelyard, London Bridge, el sábado 10 de octubre de 2026. Apertura 19:00 h (Skiddle). Dirección 13–15 Allhallows Lane, EC4R 3UL. Al catalogar, los listados públicos solo citaban a Stanton Warriors — consultar Skiddle y stantonwarriors.com por refuerzos. La imagen promocional en archivo es una foto genérica de Stanton Warriors hasta que publiquen cartel específico del evento.',
  event_type: 'club_night',
  date_start: '2026-10-10',
  date_end: null,
  location: 'The Steelyard, London, United Kingdom',
  city: 'London',
  country: 'United Kingdom',
  venue: 'The Steelyard',
  address: '13–15 Allhallows Lane, London EC4R 3UL',
  website: STEELYARD_WEB,
  tickets_url: STANTON_SESSIONS_STEELYARD_SKIDDLE,
  image_url: STANTON_SESSIONS_STEELYARD_IMAGE,
  lineup: STANTON_SESSIONS_STEELYARD_LONDON_2026_LINEUP,
  tags: [
    'stanton warriors',
    'stanton sessions',
    'the steelyard',
    'london',
    'breakbeat',
    'breaks',
    '2026',
    'skiddle',
    'united kingdom',
  ],
  socials: {
    'The Steelyard': STEELYARD_WEB,
    'Stanton Warriors': 'https://stantonwarriors.com/',
    Skiddle: STANTON_SESSIONS_STEELYARD_SKIDDLE,
  },
  age_restriction: '18+',
  doors_open: '19:00',
  coords: { lat: 51.5107, lng: -0.0923 },
}

async function runPatchStantonSessionsSteelyardLondon2026(sb) {
  const row = {
    slug: STANTON_SESSIONS_STEELYARD_LONDON_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...STANTON_SESSIONS_STEELYARD_LONDON_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url')
    .eq('slug', STANTON_SESSIONS_STEELYARD_LONDON_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-stanton-sessions-steelyard-london-2026] OK:', after)
}

const DEEKLINE_IRON_COW_ORLANDO_2026_SLUG = 'deekline-iron-cow-orlando-2026'
const DEEKLINE_IRON_COW_TICKETS =
  'https://www.happeningnext.com/event/best-of-breaks-presents-deekline-at-iron-cow-breaks-and-drum-n-bass'
const DEEKLINE_IRON_COW_IMAGE = '/images/events/deekline-iron-cow-orlando-2026.webp'
const IRON_COW_WEB = 'https://ironcowbar.com/'

const DEEKLINE_IRON_COW_ORLANDO_2026_LINEUP = [
  'Deekline',
  'Tooltime',
  'Audio',
  'Amber Jane',
]

const DEEKLINE_IRON_COW_ORLANDO_2026_ROW = {
  name: 'Best of Breaks presents Deekline @ Iron Cow (Orlando)',
  description_en:
    'Best of Breaks brings UK breakbeat icon Deekline to Iron Cow, Orlando, on Saturday 18 July 2026, 21:00–02:30. Listed support: Tooltime, Audio and Amber Jane (Happeningnext listing). Deekline spans classic breaks and drum & bass — a natural fit alongside Florida breakbeat nights such as BREAKDOWN on Optimal Breaks. Venue 2438A E Robinson St, Orlando, FL. 21+ bar; check Happeningnext and Iron Cow for ticket updates.',
  description_es:
    'Best of Breaks trae al icono británico del breakbeat Deekline al Iron Cow de Orlando el sábado 18 de julio de 2026, de 21:00 a 02:30 h. Refuerzos listados: Tooltime, Audio y Amber Jane (Happeningnext). Deekline cruza breaks clásico y drum & bass — encaja con la escena breakbeat de Florida ya representada por BREAKDOWN en Optimal Breaks. Local 2438A E Robinson St, Orlando, FL. Bar 21+; consultar Happeningnext e Iron Cow por entradas.',
  event_type: 'club_night',
  date_start: '2026-07-18',
  date_end: null,
  location: 'Iron Cow, Orlando, FL, United States',
  city: 'Orlando',
  country: 'United States',
  venue: 'Iron Cow',
  address: '2438A E Robinson St, Orlando, FL 32803',
  website: IRON_COW_WEB,
  tickets_url: DEEKLINE_IRON_COW_TICKETS,
  image_url: DEEKLINE_IRON_COW_IMAGE,
  lineup: DEEKLINE_IRON_COW_ORLANDO_2026_LINEUP,
  tags: [
    'deekline',
    'best of breaks',
    'iron cow',
    'orlando',
    'florida',
    'breakbeat',
    'breaks',
    'drum and bass',
    '2026',
    'united states',
  ],
  socials: {
    'Iron Cow': IRON_COW_WEB,
    Happeningnext: DEEKLINE_IRON_COW_TICKETS,
  },
  age_restriction: '21+',
  doors_open: '21:00',
  doors_close: '02:30',
  coords: { lat: 28.5458, lng: -81.3516 },
}

async function runPatchDeeklineIronCowOrlando2026(sb) {
  const row = {
    slug: DEEKLINE_IRON_COW_ORLANDO_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...DEEKLINE_IRON_COW_ORLANDO_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, age_restriction')
    .eq('slug', DEEKLINE_IRON_COW_ORLANDO_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-deekline-iron-cow-orlando-2026] OK:', after)
}

const BREAKS_BASS_GUAU_YO_SPEED_PERTH_2026_SLUG = 'breaks-bass-guau-yo-speed-perth-2026'
const BREAKS_BASS_GUAU_YO_SPEED_PERTH_RA = 'https://ra.co/events/2503896'
const BREAKS_BASS_GUAU_YO_SPEED_PERTH_TICKETS =
  'https://megatix.com.au/events/breaks-n-bass-yo-speed-guau-tour'
const BREAKS_BASS_GUAU_YO_SPEED_PERTH_IMAGE =
  '/images/events/breaks-bass-guau-yo-speed-perth-2026.webp'
const ABERDEEN_HOTEL_WEB = 'https://www.theaberdeenhotel.com.au/'

const BREAKS_BASS_GUAU_YO_SPEED_PERTH_2026_LINEUP = [
  'Guau',
  'Yo Speed',
  'Guau B2B Yo Speed',
  'Robwun',
  'Micah B2B Philly Blunt',
  'Krypsis',
  'Rhythmiic',
]

const BREAKS_BASS_GUAU_YO_SPEED_PERTH_2026_ROW = {
  name: 'Breaks & Bass — Guau + Yo Speed Australian Tour (Perth)',
  description_en:
    'Rhythmiic Productions presents Breaks & Bass on the Guau + Yo Speed Australian Tour: Friday 2 October 2026 at The Aberdeen Hotel, Northbridge (Perth), 19:00–02:00 AWST. Official poster and Megatix listing: Spanish breaks & bass headliners Guau and Yo Speed each play a solo set plus a closing Guau B2B Yo Speed; local support Robwun, Micah B2B Philly Blunt, Krypsis and Rhythmiic. 18+. Address 90 Aberdeen Street, Northbridge WA 6003. Part of the Perth leg of their 2026 Australia tour — both artists are already in the Optimal Breaks artist catalogue.',
  description_es:
    'Rhythmiic Productions presenta Breaks & Bass en la gira australiana Guau + Yo Speed: viernes 2 de octubre de 2026 en The Aberdeen Hotel, Northbridge (Perth), de 19:00 a 02:00 h (AWST). Cartel oficial y Megatix: los referentes españoles del breaks & bass Guau y Yo Speed con set en solitario cada uno y cierre Guau B2B Yo Speed; refuerzo local Robwun, Micah B2B Philly Blunt, Krypsis y Rhythmiic. 18+. Dirección 90 Aberdeen Street, Northbridge WA 6003. Parada de Perth de la gira Australia 2026 — ambos artistas ya figuran en el catálogo de Optimal Breaks.',
  event_type: 'club_night',
  date_start: '2026-10-02',
  date_end: null,
  location: 'The Aberdeen Hotel, Northbridge, Perth, WA, Australia',
  city: 'Perth',
  country: 'Australia',
  venue: 'The Aberdeen Hotel',
  address: '90 Aberdeen Street, Northbridge, Perth WA 6003',
  website: ABERDEEN_HOTEL_WEB,
  tickets_url: BREAKS_BASS_GUAU_YO_SPEED_PERTH_TICKETS,
  image_url: BREAKS_BASS_GUAU_YO_SPEED_PERTH_IMAGE,
  lineup: BREAKS_BASS_GUAU_YO_SPEED_PERTH_2026_LINEUP,
  tags: [
    'breaks and bass',
    'breaks & bass',
    'guau',
    'yo speed',
    'guau b2b yo speed',
    'rhythmiic productions',
    'australian tour',
    'perth',
    'northbridge',
    'aberdeen hotel',
    'breakbeat',
    'bass',
    'australia',
    '2026',
    'megatix',
    'resident advisor',
  ],
  socials: {
    'Resident Advisor': BREAKS_BASS_GUAU_YO_SPEED_PERTH_RA,
    Megatix: BREAKS_BASS_GUAU_YO_SPEED_PERTH_TICKETS,
    'The Aberdeen Hotel': ABERDEEN_HOTEL_WEB,
  },
  age_restriction: '18+',
  doors_open: '19:00',
  doors_close: '02:00',
  coords: { lat: -31.9477, lng: 115.857 },
}

async function runPatchBreaksBassGuauYoSpeedPerth2026(sb) {
  const row = {
    slug: BREAKS_BASS_GUAU_YO_SPEED_PERTH_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAKS_BASS_GUAU_YO_SPEED_PERTH_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, doors_open')
    .eq('slug', BREAKS_BASS_GUAU_YO_SPEED_PERTH_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-breaks-bass-guau-yo-speed-perth-2026] OK:', after)
}

const BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_2026_SLUG = 'breaks-bass-guau-yo-speed-melbourne-2026'
const BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_TICKETS =
  'https://theindustrique.com.au/collections/whats-on/products/breaks-n-bass-guau-x-yo-speed-australian-tour'
const BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_IMAGE =
  '/images/events/breaks-bass-guau-yo-speed-melbourne-2026.webp'
const INDUSTRIQUE_WEB = 'https://theindustrique.com.au/'

const BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_2026_LINEUP = [
  'Guau',
  'Yo Speed',
  'Guau B2B Yo Speed',
]

const BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_2026_ROW = {
  name: 'Breaks & Bass — Guau + Yo Speed Australian Tour (Melbourne)',
  description_en:
    'Rhythmiic Productions presents the Melbourne leg of the Guau + Yo Speed Australian Tour 2026 at The Industrique, Coburg North (Melbourne), Saturday 3 October 2026. Spanish breaks & bass headliners Guau and Yo Speed each play a solo set and close with Guau B2B Yo Speed — same format as the four-city October tour (Perth, Sydney, Brisbane, Melbourne). Local support still marked “coming soon” on the official Industrique listing at cataloguing time. R18. Address 5–7 Louvain Street, Coburg North VIC 3058. One of four distinct tour stops — not the Perth, Sydney or Brisbane dates.',
  description_es:
    'Rhythmiic Productions presenta la parada de Melbourne de la gira australiana Guau + Yo Speed 2026 en The Industrique, Coburg North (Melbourne), el sábado 3 de octubre de 2026. Los referentes españoles del breaks & bass Guau y Yo Speed con set en solitario cada uno y cierre Guau B2B Yo Speed — mismo formato que las cuatro ciudades de octubre (Perth, Sydney, Brisbane, Melbourne). Refuerzo local aún “coming soon” en la ficha oficial de Industrique al catalogar. R18. Dirección 5–7 Louvain Street, Coburg North VIC 3058. Una de las cuatro paradas del tour — no confundir con Perth, Sydney o Brisbane.',
  event_type: 'club_night',
  date_start: '2026-10-03',
  date_end: null,
  location: 'The Industrique, Coburg North, Melbourne, VIC, Australia',
  city: 'Melbourne',
  country: 'Australia',
  venue: 'The Industrique',
  address: '5–7 Louvain Street, Coburg North, Melbourne VIC 3058',
  website: INDUSTRIQUE_WEB,
  tickets_url: BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_TICKETS,
  image_url: BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_IMAGE,
  lineup: BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_2026_LINEUP,
  tags: [
    'breaks and bass',
    'breaks & bass',
    'guau',
    'yo speed',
    'guau b2b yo speed',
    'rhythmiic productions',
    'australian tour',
    'melbourne',
    'coburg north',
    'the industrique',
    'breakbeat',
    'bass',
    'australia',
    '2026',
  ],
  socials: {
    'The Industrique': INDUSTRIQUE_WEB,
    Tickets: BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_TICKETS,
  },
  age_restriction: '18+',
  coords: { lat: -37.7271, lng: 144.9608 },
}

async function runPatchBreaksBassGuauYoSpeedMelbourne2026(sb) {
  const row = {
    slug: BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url')
    .eq('slug', BREAKS_BASS_GUAU_YO_SPEED_MELBOURNE_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-breaks-bass-guau-yo-speed-melbourne-2026] OK:', after)
}

const BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_2026_SLUG = 'breaks-bass-guau-yo-speed-brisbane-2026'
const BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_TICKETS =
  'https://tickets.oztix.com.au/outlet/event/114ff16c-5ab6-4fd4-8ffe-b65e3b57164a'
const BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_IMAGE =
  '/images/events/breaks-bass-guau-yo-speed-brisbane-2026.webp'
const BRIGHTSIDE_WEB = 'https://www.thebrightside.com.au/'

const BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_2026_LINEUP = [
  'Guau',
  'Yo Speed',
  'Guau B2B Yo Speed',
  'Kenny Beeper',
  'Bosketta',
  'Rhythmiic',
]

const BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_2026_ROW = {
  name: 'Breaks & Bass — Guau + Yo Speed Australian Tour (Brisbane)',
  description_en:
    'Rhythmiic Productions presents the Brisbane leg of the Guau + Yo Speed Australian Tour 2026: Monday 5 October 2026 (October long weekend) at The Brightside Outdoors, Fortitude Valley, 15:00–21:00 AEST. Guau and Yo Speed solo sets plus closing Guau B2B Yo Speed; local support Kenny Beeper, Bosketta and Rhythmiic per Oztix listing. Day-party format — distinct from the Perth (2 Oct), Sydney (4 Oct) and Melbourne (3 Oct) tour dates. 18+. The Brightside, Fortitude Valley QLD.',
  description_es:
    'Rhythmiic Productions presenta la parada de Brisbane de la gira australiana Guau + Yo Speed 2026: lunes 5 de octubre de 2026 (long weekend de octubre) en The Brightside Outdoors, Fortitude Valley, de 15:00 a 21:00 h (AEST). Sets en solitario de Guau y Yo Speed y cierre Guau B2B Yo Speed; refuerzo local Kenny Beeper, Bosketta y Rhythmiic según Oztix. Formato day party — distinto de Perth (2 oct), Sydney (4 oct) y Melbourne (3 oct). 18+. The Brightside, Fortitude Valley QLD.',
  event_type: 'club_night',
  date_start: '2026-10-05',
  date_end: null,
  location: 'The Brightside (Outdoors), Fortitude Valley, Brisbane, QLD, Australia',
  city: 'Brisbane',
  country: 'Australia',
  venue: 'The Brightside (Outdoors)',
  address: '566 Wickham Street, Fortitude Valley, Brisbane QLD 4006',
  website: BRIGHTSIDE_WEB,
  tickets_url: BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_TICKETS,
  image_url: BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_IMAGE,
  lineup: BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_2026_LINEUP,
  tags: [
    'breaks and bass',
    'breaks & bass',
    'guau',
    'yo speed',
    'guau b2b yo speed',
    'rhythmiic productions',
    'australian tour',
    'brisbane',
    'fortitude valley',
    'the brightside',
    'day party',
    'long weekend',
    'breakbeat',
    'bass',
    'australia',
    '2026',
    'oztix',
  ],
  socials: {
    'The Brightside': BRIGHTSIDE_WEB,
    Oztix: BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_TICKETS,
  },
  age_restriction: '18+',
  doors_open: '15:00',
  doors_close: '21:00',
  coords: { lat: -27.4572, lng: 153.0354 },
}

async function runPatchBreaksBassGuauYoSpeedBrisbane2026(sb) {
  const row = {
    slug: BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, doors_open')
    .eq('slug', BREAKS_BASS_GUAU_YO_SPEED_BRISBANE_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-breaks-bass-guau-yo-speed-brisbane-2026] OK:', after)
}

const BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_2026_SLUG = 'breaks-bass-guau-yo-speed-sydney-2026'
const BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_TICKETS =
  'https://events.humanitix.com/guau-x-yo-speed-or-bre-ks-and-b-ss-or-sydney-or'
const BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_IMAGE =
  '/images/events/breaks-bass-guau-yo-speed-sydney-2026.webp'
const ARQ_SYDNEY_WEB = 'https://arqsydney.com.au/'

const BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_2026_LINEUP = [
  'Guau',
  'Yo Speed',
  'Guau B2B Yo Speed',
  'Rhythmiic',
]

const BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_2026_ROW = {
  name: 'Breaks & Bass — Guau + Yo Speed Australian Tour (Sydney)',
  description_en:
    'Rhythmiic Productions presents the Sydney leg of the Guau + Yo Speed Australian Tour 2026 at ARQ Sydney Basement, Darlinghurst, Sunday 4 October 2026 (long weekend), 20:00–04:00 AEDT. Guau and Yo Speed solo sets plus a one-hour Guau B2B Yo Speed finale; Rhythmiic on support with further names TBA on Humanitix. All-night basement rave — separate event from Perth (2 Oct), Melbourne (3 Oct) and Brisbane day party (5 Oct). 18+. Address 16 Flinders Street, Darlinghurst NSW 2010.',
  description_es:
    'Rhythmiic Productions presenta la parada de Sydney de la gira australiana Guau + Yo Speed 2026 en ARQ Sydney Basement, Darlinghurst, domingo 4 de octubre de 2026 (long weekend), de 20:00 a 04:00 h (AEDT). Sets en solitario de Guau y Yo Speed y cierre Guau B2B Yo Speed de una hora; Rhythmiic en refuerzo con más nombres por confirmar en Humanitix. Rave nocturna en basement — evento distinto de Perth (2 oct), Melbourne (3 oct) y Brisbane day party (5 oct). 18+. Dirección 16 Flinders Street, Darlinghurst NSW 2010.',
  event_type: 'club_night',
  date_start: '2026-10-04',
  date_end: null,
  location: 'ARQ Sydney Basement, Darlinghurst, Sydney, NSW, Australia',
  city: 'Sydney',
  country: 'Australia',
  venue: 'ARQ Sydney Basement',
  address: '16 Flinders Street, Darlinghurst, Sydney NSW 2010',
  website: ARQ_SYDNEY_WEB,
  tickets_url: BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_TICKETS,
  image_url: BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_IMAGE,
  lineup: BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_2026_LINEUP,
  tags: [
    'breaks and bass',
    'breaks & bass',
    'guau',
    'yo speed',
    'guau b2b yo speed',
    'rhythmiic productions',
    'australian tour',
    'sydney',
    'darlinghurst',
    'arq sydney',
    'long weekend',
    'breakbeat',
    'bass',
    'australia',
    '2026',
    'humanitix',
  ],
  socials: {
    Humanitix: BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_TICKETS,
    'ARQ Sydney': ARQ_SYDNEY_WEB,
  },
  age_restriction: '18+',
  doors_open: '20:00',
  doors_close: '04:00',
  coords: { lat: -33.8747, lng: 151.2185 },
}

async function runPatchBreaksBassGuauYoSpeedSydney2026(sb) {
  const row = {
    slug: BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, doors_open')
    .eq('slug', BREAKS_BASS_GUAU_YO_SPEED_SYDNEY_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-breaks-bass-guau-yo-speed-sydney-2026] OK:', after)
}

const BIONIC_BEATSLAPPAZ_SI_PARADISO_PERTH_2026_SLUG = 'bionic-beatslappaz-si-paradiso-perth-2026'
const BIONIC_BEATSLAPPAZ_FACEBOOK =
  'https://www.facebook.com/events/s/bionic/4426760787598683/'
const BIONIC_BEATSLAPPAZ_TICKETS = 'https://events.humanitix.com/bionic-sr7h5cdd'
const BIONIC_BEATSLAPPAZ_IMAGE = '/images/events/bionic-beatslappaz-si-paradiso-perth-2026.webp'
const SI_PARADISO_WEB = 'https://www.si-paradiso.com/'

const BIONIC_BEATSLAPPAZ_SI_PARADISO_PERTH_2026_LINEUP = [
  'Beatslappaz',
  '1badbadams',
  'Cobey',
]

const BIONIC_BEATSLAPPAZ_SI_PARADISO_PERTH_2026_ROW = {
  name: 'Bionic — Beatslappaz (Journey of Breaks) @ Si Paradiso Basement',
  description_en:
    "Lee Majors presents Bionic's first birthday at Si Paradiso Basement, Highgate (Perth), Friday 28 August 2026, 20:00–01:00 AWST. Official poster and Humanitix listing: Perth breakbeat duo Beatslappaz headline with a journey through breaks from the 2000s to the present — their own productions mixed with classics — plus support from 1badbadams and Cobey. Basement club night on Beaufort Street. Address 1/446 Beaufort Street, Highgate WA 6003. Beatslappaz/Rump Shaker Records orbit is documented in the Optimal Breaks label catalogue.",
  description_es:
    'Lee Majors presenta el primer aniversario de Bionic en Si Paradiso Basement, Highgate (Perth), el viernes 28 de agosto de 2026, de 20:00 a 01:00 h (AWST). Cartel oficial y Humanitix: el dúo perthiano Beatslappaz encabeza con un recorrido por el breakbeat desde los 2000 hasta hoy — producciones propias mezcladas con clásicos — y refuerzo de 1badbadams y Cobey. Noche de club en el sótano de Beaufort Street. Dirección 1/446 Beaufort Street, Highgate WA 6003. El entorno Beatslappaz / Rump Shaker Records ya figura en el catálogo de sellos de Optimal Breaks.',
  event_type: 'club_night',
  date_start: '2026-08-28',
  date_end: null,
  location: 'Si Paradiso Basement, Highgate, Perth, WA, Australia',
  city: 'Perth',
  country: 'Australia',
  venue: 'Si Paradiso Basement',
  address: '1/446 Beaufort Street, Highgate, Perth WA 6003',
  website: SI_PARADISO_WEB,
  tickets_url: BIONIC_BEATSLAPPAZ_TICKETS,
  image_url: BIONIC_BEATSLAPPAZ_IMAGE,
  lineup: BIONIC_BEATSLAPPAZ_SI_PARADISO_PERTH_2026_LINEUP,
  tags: [
    'bionic',
    'lee majors',
    'beatslappaz',
    '1badbadams',
    'cobey',
    'journey of breaks',
    'si paradiso',
    'highgate',
    'perth',
    'breakbeat',
    'australia',
    '2026',
    'humanitix',
    'rump shaker records',
  ],
  socials: {
    Facebook: BIONIC_BEATSLAPPAZ_FACEBOOK,
    Humanitix: BIONIC_BEATSLAPPAZ_TICKETS,
    'Si Paradiso': SI_PARADISO_WEB,
  },
  age_restriction: '18+',
  doors_open: '20:00',
  doors_close: '01:00',
  coords: { lat: -31.9454, lng: 115.8728 },
}

async function runPatchBionicBeatslappazSiParadisoPerth2026(sb) {
  const row = {
    slug: BIONIC_BEATSLAPPAZ_SI_PARADISO_PERTH_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...BIONIC_BEATSLAPPAZ_SI_PARADISO_PERTH_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }
  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1
  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, tickets_url, image_url, doors_open')
    .eq('slug', BIONIC_BEATSLAPPAZ_SI_PARADISO_PERTH_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-bionic-beatslappaz-si-paradiso-perth-2026] OK:', after)
}

const DUB_ELEMENTS_FRIENDS_SLUG = 'dub-elements-friends'
const DUB_ELEMENTS_FRIENDS_WEB =
  'https://pandorasevilla.com/agenda/dub-elements-friends-x-aniversario-11-09-2026/'
const DUB_ELEMENTS_FRIENDS_TICKETS =
  'https://site.fourvenues.com/es/rollercoaster/events/dub-elements--friends-x-aniversario-11-09-2026-OMYN'
const DUB_ELEMENTS_FRIENDS_IMAGE = '/images/events/dub-elements-friends-2026.webp'

const DUB_ELEMENTS_FRIENDS_MAIN_ROOM = [
  'Dub Elements',
  'Murdock',
  'Primate',
  "Smokin' Pandas",
  'Teddy Killerz',
  'T-Lex',
  'Zardonic',
]

const DUB_ELEMENTS_FRIENDS_TERRAZA = ['Dub Engineer', 'Ecsta', 'Sobass']

const DUB_ELEMENTS_FRIENDS_STAGES = [
  {
    name: 'Main Room',
    description_en:
      'Indoor main room: drum & bass headliners on the official Dub Elements & Friends poster.',
    description_es:
      'Sala principal indoor: cabezas de cartel drum & bass según cartel oficial Dub Elements & Friends.',
    lineup: DUB_ELEMENTS_FRIENDS_MAIN_ROOM,
  },
  {
    name: 'Terraza Open Air',
    description_en: 'Outdoor terrace support per the September 2026 poster.',
    description_es: 'Terraza open air con refuerzos según cartel de septiembre 2026.',
    lineup: DUB_ELEMENTS_FRIENDS_TERRAZA,
  },
]

const DUB_ELEMENTS_FRIENDS_LINEUP = [
  ...DUB_ELEMENTS_FRIENDS_MAIN_ROOM,
  ...DUB_ELEMENTS_FRIENDS_TERRAZA,
]

const DUB_ELEMENTS_FRIENDS_ROW = {
  name: 'Dub Elements & Friends',
  description_en:
    "Dub Elements & Friends X Aniversario — drum & bass festival at Pandora Sevilla on Friday 11 September 2026, doors 23:00 until 07:00. Official poster (Rollercoaster Group SL): Main Room with Dub Elements, Murdock, Primate, Smokin' Pandas, Teddy Killerz, T-Lex and Zardonic; Terraza Open Air with Dub Engineer, Ecsta and Sobass. Capacity ~1,550; 18+. Calle Gramil 2, Sevilla. Tickets via Fourvenues and pandorasevilla.com.",
  description_es:
    'Dub Elements & Friends X Aniversario — festival de drum & bass en Pandora Sevilla el viernes 11 de septiembre de 2026, puertas 23:00 h hasta las 07:00 h. Cartel oficial (Rollercoaster Group SL): Main Room con Dub Elements, Murdock, Primate, Smokin\' Pandas, Teddy Killerz, T-Lex y Zardonic; Terraza Open Air con Dub Engineer, Ecsta y Sobass. Aforo ~1.550; +18. Calle Gramil 2, Sevilla. Entradas en Fourvenues y pandorasevilla.com.',
  event_type: 'festival',
  date_start: '2026-09-11',
  date_end: null,
  location: 'Pandora Sevilla, Calle Gramil 2, Sevilla, Spain',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Pandora Sevilla',
  address: 'C. Gramil / Calle Gramil, 2, 41008 Sevilla, España',
  website: DUB_ELEMENTS_FRIENDS_WEB,
  tickets_url: DUB_ELEMENTS_FRIENDS_TICKETS,
  image_url: DUB_ELEMENTS_FRIENDS_IMAGE,
  lineup: DUB_ELEMENTS_FRIENDS_LINEUP,
  stages: DUB_ELEMENTS_FRIENDS_STAGES,
  schedule: [],
  tags: [
    'dub elements',
    'dub elements and friends',
    'drum and bass',
    'drum & bass',
    'festival',
    'pandora sevilla',
    'sevilla',
    'rollercoaster group',
    'murdock',
    'primate',
    'smokin pandas',
    'teddy killerz',
    't-lex',
    'zardonic',
    '2026',
    'fourvenues',
  ],
  socials: {
    facebook: 'https://linktr.ee/pandora_sevilla',
    instagram: 'https://linktr.ee/pandora_sevilla',
    'Pandora Sevilla': 'https://www.pandorasevilla.com/',
  },
  capacity: 1550,
  age_restriction: '18+',
  doors_open: '23:00',
  doors_close: '07:00',
  coords: { lat: 37.4086, lng: -5.9734 },
}

async function runPatchDubElementsFriends(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, lineup, image_url, stages')
    .eq('slug', DUB_ELEMENTS_FRIENDS_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-dub-elements-friends] antes:', before || '(sin fila)')

  const row = {
    slug: DUB_ELEMENTS_FRIENDS_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...DUB_ELEMENTS_FRIENDS_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, lineup, stages, tickets_url, image_url')
    .eq('slug', DUB_ELEMENTS_FRIENDS_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-dub-elements-friends] OK:', after)
}

const HEAT_OPENING_360_2026_SLUG = 'opening-special-360-show'
const HEAT_OPENING_360_2026_TICKETS =
  'https://www.monsterticket.com/evento/heat-opening-special-360-show'
const HEAT_OPENING_360_2026_IMAGE =
  'https://wfekymvossnjdncbvtua.supabase.co/storage/v1/object/public/media/events/opening-special-360-show/poster.webp'

/** Cartel oficial (26 sept 2026). MonsterTicket no lista el line-up. */
const HEAT_OPENING_360_2026_LINEUP = [
  'Tortu',
  'Bad Legs',
  'Jose Rodriguez',
  'Yo Speed',
  'Jottafrank',
  'Bass & Crash',
  'Bowser',
  'V. Aparicio',
  'Burgos',
  'Reality',
  'Cellux MC',
  'Carlos Mejias VJ',
  'Joseto LJ',
]

async function runPatchHeatOpeningSpecial360Show2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, lineup, doors_open, doors_close, tags')
    .eq('slug', HEAT_OPENING_360_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  if (!before) {
    console.error('[patch-heat-opening-360-2026] No existe fila:', HEAT_OPENING_360_2026_SLUG)
    process.exit(1)
  }
  console.log(
    '[patch-heat-opening-360-2026] antes: lineup',
    before.lineup?.length || 0,
    '| horario',
    before.doors_open,
    '→',
    before.doors_close,
  )

  const tags = [...new Set([...(before.tags || []), 'paris 15', 'breakbeat'])]

  const { error: e1 } = await sb
    .from('events')
    .update({
      lineup: HEAT_OPENING_360_2026_LINEUP,
      doors_open: '01:00',
      doors_close: '07:00',
      tickets_url: HEAT_OPENING_360_2026_TICKETS,
      image_url: HEAT_OPENING_360_2026_IMAGE,
      tags,
      description_es:
        'Heat Pro inaugura temporada el sábado 26 de septiembre de 2026 en Sala París 15 (Málaga) con Opening Special 360° Show: noche de sonidos rotos de 01:00 a 07:00. Cartel oficial: Tortu, Bad Legs, Jose Rodriguez, Yo Speed, Jottafrank, Bass & Crash, Bowser, V. Aparicio, Burgos, Reality, Cellux MC, Carlos Mejias VJ y Joseto LJ. Solo mayores de 18 años; entradas nominativas en MonsterTicket (general 19 € + G.D.; VIP 27 € + G.D.).\n\nPromoción cumpleaños: si cumples años el 25, 26 o 27 de septiembre, escribe a Heat Pro y entras gratis (fecha límite para apuntarse: 10 de septiembre).',
      description_en:
        'Heat Pro opens the season on Saturday 26 September 2026 at Sala París 15 (Málaga) with Opening Special 360° Show: a broken-beats night from 01:00 to 07:00. Official flyer: Tortu, Bad Legs, Jose Rodriguez, Yo Speed, Jottafrank, Bass & Crash, Bowser, V. Aparicio, Burgos, Reality, Cellux MC, Carlos Mejias VJ and Joseto LJ. 18+ only; nominative tickets via MonsterTicket (general €19 + fees; VIP €27 + fees).\n\nBirthday promo: if your birthday falls on 25, 26 or 27 September, message Heat Pro and get in free (sign-up deadline: 10 September).',
    })
    .eq('slug', HEAT_OPENING_360_2026_SLUG)
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, lineup, doors_open, doors_close, tickets_url, image_url, tags')
    .eq('slug', HEAT_OPENING_360_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-heat-opening-360-2026] OK:', after)
}

const POWER_BREAKBEAT_CON_AUTOBOTS_2026_SLUG = 'power-breakbeat-con-autobots-2026'
const POWER_BREAKBEAT_CON_AUTOBOTS_TICKETS =
  'https://www.monsterticket.com/evento/power-breakbeat-con-autobots'
const POWER_BREAKBEAT_CON_AUTOBOTS_IMAGE =
  '/images/events/power-breakbeat-con-autobots.webp'

const POWER_BREAKBEAT_CON_AUTOBOTS_2026_LINEUP = ['Autobots']

const POWER_BREAKBEAT_CON_AUTOBOTS_2026_ROW = {
  name: 'Power Breakbeat con Autobots',
  description_en:
    'Frequency Break and METSALA present Power Breakbeat at Sala Roka, Málaga, on Saturday 25 July 2026. Retro break, nu skool and current sounds; first confirmed headliner Autobots (UK). Promo tickets listed on MonsterTicket at 5 euros plus fees; non-nominal entry and 18+ only per the official sale page. Venue: Calle Leda 1, Cruz de Humilladero, Málaga. Co-branded on the flyer with Sala Roka and MonsterTicket.',
  description_es:
    'Frequency Break y METSALA presentan Power Breakbeat en Sala Roka, Málaga, el sábado 25 de julio de 2026. Sonido retro break, nu skool y actual; primer artista confirmado Autobots (UK). Entrada promo en MonsterTicket a 5 euros más gastos de gestión; entradas no nominativas y acceso prohibido a menores de 18 años según la ficha oficial. Sala: Calle Leda 1, Cruz de Humilladero, Málaga. Cartel con Sala Roka y MonsterTicket.',
  event_type: 'club_night',
  date_start: '2026-07-25',
  date_end: null,
  location: 'Sala Roka, Calle Leda 1, Málaga, Spain',
  city: 'Málaga',
  country: 'Spain',
  venue: 'Sala Roka',
  address: 'Calle Leda 1, Cruz de Humilladero, 29006 Málaga',
  website: 'https://www.salaroka.es/',
  tickets_url: POWER_BREAKBEAT_CON_AUTOBOTS_TICKETS,
  image_url: POWER_BREAKBEAT_CON_AUTOBOTS_IMAGE,
  lineup: POWER_BREAKBEAT_CON_AUTOBOTS_2026_LINEUP,
  tags: [
    'power breakbeat',
    'autobots',
    'frequency break',
    'metsala',
    'breakbeat',
    'sala roka',
    'málaga',
    '2026',
    'monsterticket',
  ],
  socials: {
    'Sala Roka': 'https://www.salaroka.es/',
  },
  age_restriction: '18+',
}

async function runPatchPowerBreakbeatConAutobots2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', POWER_BREAKBEAT_CON_AUTOBOTS_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-power-breakbeat-con-autobots-2026] antes:', before || '(sin fila)')

  const row = {
    slug: POWER_BREAKBEAT_CON_AUTOBOTS_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...POWER_BREAKBEAT_CON_AUTOBOTS_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', POWER_BREAKBEAT_CON_AUTOBOTS_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-power-breakbeat-con-autobots-2026] OK:', after)
}

const AQUA_BREAKS_POOL_PARTY_2026_SLUG = 'aqua-breaks-pool-party-2026'
const AQUA_BREAKS_POOL_PARTY_TICKETS =
  'https://www.monsterticket.com/evento/aqua-breaks-pool-party'
const AQUA_BREAKS_POOL_PARTY_IMAGE = '/images/events/aqua-breaks-pool-party.webp'

const AQUA_BREAKS_POOL_PARTY_2026_ROW = {
  name: 'Aqua Breaks Pool Party',
  description_en:
    'BackStage and Campamento Rural La Torre host Aqua Breaks Pool Party on Saturday 25 July 2026 at La Torre Terraza, La Rábida (Huelva province). Sun, pool and breakbeat: large pool, jacuzzi, private parking and open-air natural setting; doors 16:00–07:00 per MonsterTicket. Official artwork does not yet list DJ names. Advance tickets on MonsterTicket; non-nominal entry and 18+ only. Address on sale page: C. el Pinar, 10, 21819 La Rábida, Huelva.',
  description_es:
    'BackStage y Campamento Rural La Torre organizan Aqua Breaks Pool Party el sábado 25 de julio de 2026 en La Torre Terraza, La Rábida (Huelva). Sol, piscina y breakbeat: gran piscina, jacuzzi, aparcamiento privado y entorno natural al aire libre; horario 16:00 h a 07:00 h según MonsterTicket. El cartel oficial aún no publica nombres de DJ. Entrada anticipada en MonsterTicket; entradas no nominativas y prohibido el acceso a menores de 18 años. Dirección en venta: C. el Pinar, 10, 21819 La Rábida, Huelva.',
  event_type: 'festival',
  date_start: '2026-07-25',
  date_end: null,
  location: 'Campamento Rural La Torre, La Rábida, Huelva, Spain',
  city: 'La Rábida',
  country: 'Spain',
  venue: 'Campamento Rural La Torre',
  address: 'C. el Pinar, 10, 21819 La Rábida, Huelva',
  website: null,
  tickets_url: AQUA_BREAKS_POOL_PARTY_TICKETS,
  image_url: AQUA_BREAKS_POOL_PARTY_IMAGE,
  lineup: [],
  tags: [
    'aqua breaks',
    'pool party',
    'breakbeat',
    'la rábida',
    'huelva',
    'campamento rural la torre',
    'backstage',
    'festival',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
  doors_open: '16:00',
  doors_close: '07:00',
}

async function runPatchAquaBreaksPoolParty2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', AQUA_BREAKS_POOL_PARTY_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-aqua-breaks-pool-party-2026] antes:', before || '(sin fila)')

  const row = {
    slug: AQUA_BREAKS_POOL_PARTY_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...AQUA_BREAKS_POOL_PARTY_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url')
    .eq('slug', AQUA_BREAKS_POOL_PARTY_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-aqua-breaks-pool-party-2026] OK:', after)
}

const SURBREAK_BREAKBITEROS_DEL_SUR_2026_SLUG = 'surbreak-breakbiteros-del-sur-2026'
const SURBREAK_BREAKBITEROS_DEL_SUR_TICKETS =
  'https://www.monsterticket.com/evento/surbreak--breakbiteros-del-sur'
const SURBREAK_BREAKBITEROS_DEL_SUR_IMAGE =
  '/images/events/surbreak-breakbiteros-del-sur.webp'

const SURBREAK_BREAKBITEROS_DEL_SUR_2026_LINEUP = [
  'DJ Heavy',
  'DJ Nachh',
  'Mutant Breakz',
  'Kill II Beat',
  'DJ Xema',
  'Diyeico',
]

const SURBREAK_BREAKBITEROS_DEL_SUR_2026_ROW = {
  name: 'Surbreak — Breakbiteros del Sur',
  description_en:
    'SurBreak — Breakbiteros del Sur launch their first Surbreak club night on Saturday 15 August 2026 at Sala Las Palmeras, La Línea de la Concepción (Cádiz province), in collaboration with Love 90s. Official flyer line-up: DJ Heavy, DJ Nachh, Mutant Breakz, Kill II Beat, DJ Xema and Diyeico. Doors 23:00–07:00. General and VIP tickets (with drink; VIP beside the DJ booth) on MonsterTicket; non-nominal entry and 18+ only. Address: Calle Balandro, Polígono El Zabal, La Línea de la Concepción.',
  description_es:
    'SurBreak — Breakbiteros del Sur presentan su primer evento Surbreak el sábado 15 de agosto de 2026 en Sala Las Palmeras, La Línea de la Concepción (Cádiz), en colaboración con Love 90s. Cartel oficial: DJ Heavy, DJ Nachh, Mutant Breakz, Kill II Beat, DJ Xema y Diyeico. Horario 23:00 h a 07:00 h. Entrada general y VIP (con consumición; VIP junto a la cabina) en MonsterTicket; entradas no nominativas y prohibido el acceso a menores de 18 años. Dirección: Calle Balandro, Polígono El Zabal, La Línea de la Concepción.',
  event_type: 'club_night',
  date_start: '2026-08-15',
  date_end: null,
  location: 'Sala Las Palmeras, La Línea de la Concepción, Cádiz, Spain',
  city: 'La Línea de la Concepción',
  country: 'Spain',
  venue: 'Sala Las Palmeras',
  address: 'Calle Balandro, Polígono El Zabal, La Línea de la Concepción, Cádiz',
  website: null,
  tickets_url: SURBREAK_BREAKBITEROS_DEL_SUR_TICKETS,
  image_url: SURBREAK_BREAKBITEROS_DEL_SUR_IMAGE,
  lineup: SURBREAK_BREAKBITEROS_DEL_SUR_2026_LINEUP,
  tags: [
    'surbreak',
    'breakbiteros del sur',
    'breakbeat',
    'sala las palmeras',
    'la línea de la concepción',
    'cádiz',
    'love 90s',
    '2026',
    'monsterticket',
  ],
  socials: {},
  age_restriction: '18+',
  doors_open: '23:00',
  doors_close: '07:00',
}

async function runPatchSurbreakBreakbiterosDelSur2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', SURBREAK_BREAKBITEROS_DEL_SUR_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-surbreak-breakbiteros-del-sur-2026] antes:', before || '(sin fila)')

  const row = {
    slug: SURBREAK_BREAKBITEROS_DEL_SUR_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...SURBREAK_BREAKBITEROS_DEL_SUR_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', SURBREAK_BREAKBITEROS_DEL_SUR_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-surbreak-breakbiteros-del-sur-2026] OK:', after)
}

const FAREWELL_SUMMER_FESTIVAL_2026_SLUG = 'farewell-summer-festival-2026'
const FAREWELL_SUMMER_FESTIVAL_INSTAGRAM = 'https://www.instagram.com/farewell_summerfestival/'

const FAREWELL_SUMMER_FESTIVAL_2026_ROW = {
  name: 'Farewell Summer Festival 2026',
  description_en:
    'Farewell Summer Festival returns to the Recinto Ferial in Pedro Abad (Córdoba province) on Friday–Saturday 21–22 August 2026, closing the local summer season with a multi-style outdoor programme. The organisers promote breakbeat alongside tech house and hip-hop on their social channels; artist names and daily schedules are published via Instagram @farewell_summerfestival as the edition is confirmed. Check the official profile for tickets and lineup updates.',
  description_es:
    'Farewell Summer Festival vuelve al Recinto Ferial de Pedro Abad (Córdoba) el viernes y sábado 21 y 22 de agosto de 2026, como cierre de la temporada estival local con un programa al aire libre multitemático. En redes la organización mezcla breakbeat con tech house y hip-hop; nombres de artistas y horarios se publican en Instagram @farewell_summerfestival según se confirma la edición. Consultar el perfil oficial para entradas y avances de cartel.',
  event_type: 'festival',
  date_start: '2026-08-21',
  date_end: '2026-08-22',
  location: 'Recinto Ferial, Pedro Abad, Córdoba, Spain',
  city: 'Pedro Abad',
  country: 'Spain',
  venue: 'Recinto Ferial',
  address: 'Recinto Ferial, Pedro Abad, Córdoba',
  website: FAREWELL_SUMMER_FESTIVAL_INSTAGRAM,
  tickets_url: FAREWELL_SUMMER_FESTIVAL_INSTAGRAM,
  image_url: null,
  lineup: [],
  tags: [
    'farewell summer festival',
    'breakbeat',
    'tech house',
    'hip hop',
    'pedro abad',
    'córdoba',
    'festival',
    '2026',
  ],
  socials: {
    Instagram: FAREWELL_SUMMER_FESTIVAL_INSTAGRAM,
  },
}

async function runPatchFarewellSummerFestival2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end, city, venue, image_url')
    .eq('slug', FAREWELL_SUMMER_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-farewell-summer-festival-2026] antes:', before || '(sin fila)')

  const row = {
    slug: FAREWELL_SUMMER_FESTIVAL_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...FAREWELL_SUMMER_FESTIVAL_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, date_end, city, venue, image_url, tickets_url')
    .eq('slug', FAREWELL_SUMMER_FESTIVAL_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-farewell-summer-festival-2026] OK:', after)
}

const RITMOS_ROTOS_EN_EL_PATIO_2026_SLUG = 'ritmos-rotos-en-el-patio-2026'
const RITMOS_ROTOS_EN_EL_PATIO_TICKETS =
  'https://site.fourvenues.com/es/adrianchupi/events/ritmos-rotos-en-el-patio-11-07-2026-I4K6'
const RITMOS_ROTOS_EN_EL_PATIO_IMAGE = '/images/events/ritmos-rotos-en-el-patio-2026.webp'
const RITMOS_ROTOS_EN_EL_PATIO_WEB =
  'https://pandorasevilla.com/evento/ritmos-rotos-en-el-patio/'

const RITMOS_ROTOS_EN_EL_PATIO_2026_LINEUP = [
  'Soul Of Man',
  'Adam Vyt',
  'Bartdon',
  'DJ Nachh',
  'Elle Skull',
  'Missy Karma',
  'Pimpkea',
]

const RITMOS_ROTOS_EN_EL_PATIO_2026_ROW = {
  name: 'Ritmos Rotos en el Patio',
  description_en:
    'Open-air breakbeat night in El Patio at Pandora Sevilla on Saturday 11 July 2026, doors 23:00 until close (listed until 05:00). Official Fourvenues listing (adrianchupi): Soul Of Man headlines breaks, retro and electro with Adam Vyt, Bartdon, DJ Nachh, Elle Skull, Missy Karma and Pimpkea; casual dress code; 18+ only. Ticket tiers on Fourvenues: free entry before 00:30; general admission €10 valid any time. VOID-powered patio; address C. Gramil 2, 41008 Sevilla. Pandora promotes it as a selective end-of-season session under the moonlight.',
  description_es:
    'Sesión al aire libre de breakbeat en El Patio de Pandora Sevilla el sábado 11 de julio de 2026, apertura 23:00 h hasta el cierre (ficha hasta 05:00 h). Venta oficial en Fourvenues (adrianchupi): Soul Of Man encabeza breaks, retro y electro con Adam Vyt, Bartdon, DJ Nachh, Elle Skull, Missy Karma y Pimpkea; dress code casual; solo mayores de 18 años. Tramos en Fourvenues: entrada gratis antes de las 00:30 h; entrada general 10 € válida en cualquier momento. Sonido VOID en el patio; dirección C. Gramil 2, 41008 Sevilla. Pandora lo presenta como fiesta selecta de cierre de temporada bajo la luz de la luna.',
  event_type: 'club_night',
  date_start: '2026-07-11',
  date_end: null,
  location: 'El Patio, Pandora Sevilla, Sevilla, Spain',
  city: 'Sevilla',
  country: 'Spain',
  venue: 'Pandora Sevilla (El Patio)',
  address: 'Calle Gramil 2, Polígono Store, 41008 Sevilla',
  website: RITMOS_ROTOS_EN_EL_PATIO_WEB,
  tickets_url: RITMOS_ROTOS_EN_EL_PATIO_TICKETS,
  image_url: RITMOS_ROTOS_EN_EL_PATIO_IMAGE,
  lineup: RITMOS_ROTOS_EN_EL_PATIO_2026_LINEUP,
  tags: [
    'ritmos rotos en el patio',
    'breakbeat',
    'breaks',
    'retro',
    'electro',
    'soul of man',
    'finger lickin',
    'pandora sevilla',
    'el patio',
    'sevilla',
    'ritmika',
    'fourvenues',
    'adrianchupi',
    '2026',
  ],
  socials: {
    'Pandora Sevilla': 'https://pandorasevilla.com/',
    Fourvenues: RITMOS_ROTOS_EN_EL_PATIO_TICKETS,
  },
  age_restriction: '18+',
  doors_open: '23:00',
  doors_close: '05:00',
}

async function runPatchRitmosRotosEnElPatio2026(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', RITMOS_ROTOS_EN_EL_PATIO_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-ritmos-rotos-en-el-patio-2026] antes:', before || '(sin fila)')

  const row = {
    slug: RITMOS_ROTOS_EN_EL_PATIO_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...RITMOS_ROTOS_EN_EL_PATIO_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', RITMOS_ROTOS_EN_EL_PATIO_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-ritmos-rotos-en-el-patio-2026] OK:', after)
}

const RETRO_GOATS_2026_SLUG = 'retro-goats-2026-malaga'
const RETRO_GOATS_TICKETS =
  'https://www.monsterticket.com/evento/retro-goats-goat-breakbeat'
const RETRO_GOATS_IMAGE = '/images/events/retro-goats-2026-malaga.webp'
const RETRO_GOATS_INSTAGRAM = 'https://www.instagram.com/goatbreakbeat/'

const RETRO_GOATS_2026_LINEUP = [
  'Anuschka',
  'José Rodríguez',
  'Wally',
  'Mr. Fli',
  'DJ Heavy',
  'Nokaut',
  '936',
  'Tony War',
  'V. Aparicio',
  'Kid:Katana',
]

const RETRO_GOATS_2026_ROW = {
  name: 'RETRO Goats',
  description_en:
    'GOAT Breakbeat presents RETRO Goats on Saturday 20 June 2026 at Paris15, Málaga. Flyer lineup: Anuschka, José Rodríguez, Wally, Mr. Fli, DJ Heavy, Nokaut, 936, Tony War, plus the Goat crew with V. Aparicio and Kid:Katana. Non-nominal tickets and VIP zones on MonsterTicket (general tier 2 listed at €17 + fees at capture); ID required at door. 18+ only. Address C/ Orotava 27, Málaga. Updates and info @GOATBREAKBEAT.',
  description_es:
    'GOAT Breakbeat presenta RETRO Goats el sábado 20 de junio de 2026 en Paris15, Málaga. Cartel: Anuschka, José Rodríguez, Wally, Mr. Fli, DJ Heavy, Nokaut, 936, Tony War, más el crew Goat con V. Aparicio y Kid:Katana. Entradas no nominativas y zonas VIP en MonsterTicket (en la captura, general tramo 2 a 17 € + gastos); imprescindible D.N.I. Solo mayores de 18 años. Dirección C/ Orotava 27, Málaga. Más info en @GOATBREAKBEAT.',
  event_type: 'club_night',
  date_start: '2026-06-20',
  date_end: null,
  location: 'Paris15, Málaga',
  city: 'Málaga',
  country: 'Spain',
  venue: 'Paris15',
  address: 'C/ Orotava 27, Málaga',
  website: RETRO_GOATS_INSTAGRAM,
  tickets_url: RETRO_GOATS_TICKETS,
  image_url: RETRO_GOATS_IMAGE,
  lineup: RETRO_GOATS_2026_LINEUP,
  tags: [
    'retro goats',
    'goat breakbeat',
    'paris15',
    'malaga',
    'málaga',
    'retro',
    'breakbeat',
    '2026',
    'monsterticket',
  ],
  socials: {
    Instagram: RETRO_GOATS_INSTAGRAM,
    MonsterTicket: RETRO_GOATS_TICKETS,
  },
  age_restriction: '18+',
}

async function runPatchRetroGoats2026Malaga(sb) {
  const { data: before, error: e0 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url')
    .eq('slug', RETRO_GOATS_2026_SLUG)
    .maybeSingle()
  if (e0) throw e0
  console.log('[patch-retro-goats-2026-malaga] antes:', before || '(sin fila)')

  const row = {
    slug: RETRO_GOATS_2026_SLUG,
    ...EVENT_ROW_DEFAULTS,
    ...RETRO_GOATS_2026_ROW,
    is_featured: false,
    promoter_organization_id: null,
  }

  const { error: e1 } = await sb.from('events').upsert(row, { onConflict: 'slug' })
  if (e1) throw e1

  const { data: after, error: e2 } = await sb
    .from('events')
    .select('slug, name, date_start, city, venue, image_url, tickets_url, lineup')
    .eq('slug', RETRO_GOATS_2026_SLUG)
    .maybeSingle()
  if (e2) throw e2
  console.log('[patch-retro-goats-2026-malaga] OK:', after)
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

  if (argv.includes('--patch-raveart-rvt-we-love-retro-elysium-sevilla-2026')) {
    await runPatchRaveartRvtWeLoveRetroElysiumSevilla2026(sb)
    return
  }

  if (argv.includes('--patch-raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026')) {
    await runPatchRaveartRvtSummerFestivalPresentacionOficialElTrenGranada2026(sb)
    return
  }

  if (argv.includes('--patch-raveart-rvt-retro-halloween-presentacion-oficial-el-tren-granada-2026')) {
    await runPatchRaveartRvtRetroHalloweenPresentacionOficialElTrenGranada2026(sb)
    return
  }

  if (argv.includes('--patch-raveart-retro-halloween-2025-poster')) {
    await runPatchRaveartRetroHalloween2025Poster(sb)
    return
  }

  if (argv.includes('--patch-raveart-retro-halloween-2026-lineup')) {
    await runPatchRaveartRetroHalloween2026Lineup(sb)
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

  if (argv.includes('--patch-pure-bassline-15-agosto-2026-sevilla')) {
    await runPatchPureBassline15Agosto2026Sevilla(sb)
    return
  }

  if (argv.includes('--patch-natural-universal-retro-2026-malaga')) {
    await runPatchNaturalUniversalRetro2026Malaga(sb)
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

  if (argv.includes('--patch-safari-break-night-2026')) {
    await runPatchSafariBreakNight2026(sb)
    return
  }

  if (argv.includes('--patch-break-night-free-party-2026')) {
    await runPatchBreakNightFreeParty2026(sb)
    return
  }

  if (argv.includes('--patch-solaris-fest-matalascanas-2026')) {
    await runPatchSolarisFestMatalascanas2026(sb)
    return
  }

  if (argv.includes('--patch-floridance-festival-2026')) {
    await runPatchFloridanceFestival2026(sb)
    return
  }

  if (argv.includes('--patch-break-the-flow-w-terrie-kynd-2026')) {
    await runPatchBreakTheFlowWTerrieKynd2026(sb)
    return
  }

  if (argv.includes('--patch-el-pinar-breaks-fest-2026')) {
    await runPatchElPinarBreaksFest2026(sb)
    return
  }

  if (argv.includes('--patch-breaks-bloom-festival-2026')) {
    await runPatchBreaksBloomFestival2026(sb)
    return
  }

  if (argv.includes('--patch-bellota-break-festival-2026')) {
    await runPatchBellotaBreakFestival2026(sb)
    return
  }

  if (argv.includes('--patch-oshun-festival-2026')) {
    await runPatchOshunFestival2026(sb)
    return
  }

  if (argv.includes('--patch-breiki-electronic-festival-2026')) {
    await runPatchBreikiElectronicFestival2026(sb)
    return
  }

  if (argv.includes('--patch-mas-ruido-black-hole-360-2026')) {
    await runPatchMasRuidoBlackHole3602026(sb)
    return
  }

  if (argv.includes('--patch-la-caseta-del-breakbeat-2026')) {
    await runPatchLaCasetaDelBreakbeat2026(sb)
    return
  }

  if (argv.includes('--patch-fruity-loops-03-06-2026')) {
    await runPatchFruityLoops03062026(sb)
    return
  }

  if (argv.includes('--patch-finger-lickin-boat-party-2026')) {
    await runPatchFingerLickinBoatParty2026(sb)
    return
  }

  if (argv.includes('--patch-finger-lickin-between-the-bridges-2026')) {
    await runPatchFingerLickinBetweenTheBridges2026(sb)
    return
  }

  if (argv.includes('--patch-dreambeach-costa-del-sol-2026')) {
    await runPatchDreambeachCostaDelSol2026(sb)
    return
  }

  if (argv.includes('--patch-iberican-breaks-festival-2026')) {
    await runPatchIbericanBreaksFestival2026(sb)
    return
  }

  if (argv.includes('--patch-electrolunch-xxl-picnic-76-sevilla-2026')) {
    await runPatchElectrolunchXxlPicnic76Sevilla2026(sb)
    return
  }

  if (argv.includes('--patch-breakdown-orlando-2026')) {
    await runPatchBreakdownOrlando2026(sb)
    return
  }

  if (argv.includes('--patch-power-breakbeat-con-autobots-2026')) {
    await runPatchPowerBreakbeatConAutobots2026(sb)
    return
  }

  if (argv.includes('--patch-aqua-breaks-pool-party-2026')) {
    await runPatchAquaBreaksPoolParty2026(sb)
    return
  }

  if (argv.includes('--patch-surbreak-breakbiteros-del-sur-2026')) {
    await runPatchSurbreakBreakbiterosDelSur2026(sb)
    return
  }

  if (argv.includes('--patch-farewell-summer-festival-2026')) {
    await runPatchFarewellSummerFestival2026(sb)
    return
  }

  if (argv.includes('--patch-ritmos-rotos-en-el-patio-2026')) {
    await runPatchRitmosRotosEnElPatio2026(sb)
    return
  }

  if (argv.includes('--patch-retro-goats-2026-malaga')) {
    await runPatchRetroGoats2026Malaga(sb)
    return
  }

  if (argv.includes('--patch-ritmika-1-aniversario-white-beach-lepe-2026')) {
    await runPatchRitmika1AniversarioWhiteBeachLepe2026(sb)
    return
  }

  if (argv.includes('--patch-coast-breakbeat-2026')) {
    await runPatchCoastBreakbeat2026(sb)
    return
  }

  if (argv.includes('--patch-breakclub-at-cosmos-club-2026')) {
    await runPatchBreakclubAtCosmosClub2026(sb)
    return
  }

  if (argv.includes('--patch-break-nation-by-420-sound-2026')) {
    await runPatchBreakNationBy420Sound2026(sb)
    return
  }

  if (argv.includes('--patch-finger-lickin-summer-takeover-2026')) {
    await runPatchFingerLickinSummerTakeover2026(sb)
    return
  }

  if (argv.includes('--patch-stanton-warriors-volks-brighton-2026')) {
    await runPatchStantonWarriorsVolksBrighton2026(sb)
    return
  }

  if (argv.includes('--patch-stanton-sessions-steelyard-london-2026')) {
    await runPatchStantonSessionsSteelyardLondon2026(sb)
    return
  }

  if (argv.includes('--patch-deekline-iron-cow-orlando-2026')) {
    await runPatchDeeklineIronCowOrlando2026(sb)
    return
  }

  if (argv.includes('--patch-breaks-bass-guau-yo-speed-perth-2026')) {
    await runPatchBreaksBassGuauYoSpeedPerth2026(sb)
    return
  }

  if (argv.includes('--patch-breaks-bass-guau-yo-speed-melbourne-2026')) {
    await runPatchBreaksBassGuauYoSpeedMelbourne2026(sb)
    return
  }

  if (argv.includes('--patch-breaks-bass-guau-yo-speed-brisbane-2026')) {
    await runPatchBreaksBassGuauYoSpeedBrisbane2026(sb)
    return
  }

  if (argv.includes('--patch-breaks-bass-guau-yo-speed-sydney-2026')) {
    await runPatchBreaksBassGuauYoSpeedSydney2026(sb)
    return
  }

  if (argv.includes('--patch-bionic-beatslappaz-si-paradiso-perth-2026')) {
    await runPatchBionicBeatslappazSiParadisoPerth2026(sb)
    return
  }

  if (argv.includes('--patch-dub-elements-friends')) {
    await runPatchDubElementsFriends(sb)
    return
  }

  if (argv.includes('--patch-heat-opening-special-360-show-2026')) {
    await runPatchHeatOpeningSpecial360Show2026(sb)
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
  node scripts/enriquecer-evento.mjs --patch-raveart-rvt-we-love-retro-elysium-sevilla-2026
  node scripts/enriquecer-evento.mjs --patch-raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026
  node scripts/enriquecer-evento.mjs --patch-raveart-retro-halloween-2025-poster
  node scripts/enriquecer-evento.mjs --patch-raveart-retro-halloween-2026-lineup
  node scripts/enriquecer-evento.mjs --patch-kultura-breakz-ii-aniversario-2026
  node scripts/enriquecer-evento.mjs --patch-pure-bassline-7-aniversario-2026
  node scripts/enriquecer-evento.mjs --patch-pure-bassline-15-agosto-2026-sevilla
  node scripts/enriquecer-evento.mjs --patch-natural-universal-retro-2026-malaga
  node scripts/enriquecer-evento.mjs --patch-malaga-is-break-3-aniversario-frequency-break-2026
  node scripts/enriquecer-evento.mjs --patch-cyber-bass-2026
  node scripts/enriquecer-evento.mjs --patch-safari-break-night-2026
  node scripts/enriquecer-evento.mjs --patch-solaris-fest-matalascanas-2026
  node scripts/enriquecer-evento.mjs --patch-floridance-festival-2026
  node scripts/enriquecer-evento.mjs --patch-break-the-flow-w-terrie-kynd-2026
  node scripts/enriquecer-evento.mjs --patch-el-pinar-breaks-fest-2026
  node scripts/enriquecer-evento.mjs --patch-breaks-bloom-festival-2026
  node scripts/enriquecer-evento.mjs --patch-bellota-break-festival-2026
  node scripts/enriquecer-evento.mjs --patch-oshun-festival-2026
  node scripts/enriquecer-evento.mjs --patch-mas-ruido-black-hole-360-2026
  node scripts/enriquecer-evento.mjs --patch-la-caseta-del-breakbeat-2026
  node scripts/enriquecer-evento.mjs --patch-fruity-loops-03-06-2026
  node scripts/enriquecer-evento.mjs --patch-finger-lickin-boat-party-2026
  node scripts/enriquecer-evento.mjs --patch-finger-lickin-between-the-bridges-2026
  node scripts/enriquecer-evento.mjs --patch-dreambeach-costa-del-sol-2026
  node scripts/enriquecer-evento.mjs --patch-iberican-breaks-festival-2026
  node scripts/enriquecer-evento.mjs --patch-electrolunch-xxl-picnic-76-sevilla-2026
  node scripts/enriquecer-evento.mjs --patch-breakdown-orlando-2026
  node scripts/enriquecer-evento.mjs --patch-ritmika-1-aniversario-white-beach-lepe-2026`)
    process.exit(1)
  }

  await runEnrich(slug, { dryRun, force, withPoster })
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
