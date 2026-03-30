/**
 * OPTIMAL BREAKS — Agente sellos (OpenAI + búsqueda opcional) → Supabase (tabla labels)
 *
 * Índice: scripts/guia-base-datos.mjs → run label-agent -- …
 *
 * Uso:
 *   npm run db:label:agent -- lot49 "Lot49"
 *   node scripts/generar-sello-agente.mjs slug "Nombre sello" [--notes ruta …] [--no-search]
 *   node scripts/generar-sello-agente.mjs slug "Nombre" --revise [--notes …] [--json-only]
 *   node scripts/generar-sello-agente.mjs --from-db [--limit N] [--skip=a,b] [--no-search]
 *
 * Requiere OPENAI_API_KEY. Para escribir en BD: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SECRET).
 * Opcional: SERPAPI_API_KEY para contexto web.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { supabaseApiCredentials } from './lib/artist-upsert.mjs'
import { upsertLabel } from './lib/label-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnvLocal() {
  const p = join(ROOT, '.env.local')
  if (!existsSync(p)) return
  let text = readFileSync(p, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const line of text.split('\n')) {
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
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'sello-agente-system.txt')
const REVISION_APPEND_PATH = join(__dirname, 'prompts', 'sello-agente-revision-system.txt')

function loadSystemPromptBase() {
  if (existsSync(SYSTEM_PROMPT_PATH)) {
    return readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim()
  }
  console.error('Falta el prompt:', SYSTEM_PROMPT_PATH)
  process.exit(1)
}

/** @param {boolean} withRevisionAppend */
function loadSystemPrompt(withRevisionAppend) {
  const base = loadSystemPromptBase()
  if (!withRevisionAppend) return base
  if (!existsSync(REVISION_APPEND_PATH)) return base
  const add = readFileSync(REVISION_APPEND_PATH, 'utf8').trim()
  return add ? `${base}\n\n---\n\n${add}` : base
}

async function fetchSerpContext(query, apiKey) {
  if (!apiKey) return ''
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', '10')
  url.searchParams.set('api_key', apiKey)
  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      console.warn('[sello-agente] SerpAPI HTTP', res.status, '(sigue sin contexto web)')
      return ''
    }
    const data = await res.json()
    const bits = []
    if (data.organic_results && Array.isArray(data.organic_results)) {
      for (const r of data.organic_results.slice(0, 8)) {
        if (r.title) bits.push(`Título: ${r.title}`)
        if (r.snippet) bits.push(`Resumen: ${r.snippet}`)
        if (r.link) bits.push(`URL: ${r.link}`)
        bits.push('---')
      }
    }
    if (data.answer_box?.answer) bits.push(`Answer: ${data.answer_box.answer}`)
    const text = bits.join('\n').slice(0, 12000)
    return text || ''
  } catch (e) {
    console.warn('[sello-agente] SerpAPI error:', e.message)
    return ''
  }
}

const LABEL_SELECT_REVISE =
  'slug,name,country,founded_year,description_en,description_es,image_url,website,key_artists,key_releases,is_active,is_featured'

/** Texto JSON de la ficha actual: repo primero, si no Supabase. */
async function loadCurrentLabelJsonForRevise(slug) {
  const p = join(ROOT, 'data', 'labels', `${slug}.json`)
  if (existsSync(p)) return readFileSync(p, 'utf8')
  const creds = supabaseApiCredentials()
  if (!creds) return null
  const sb = createClient(creds.url, creds.key, { auth: { persistSession: false } })
  const { data, error } = await sb.from('labels').select(LABEL_SELECT_REVISE).eq('slug', slug).maybeSingle()
  if (error || !data) return null
  return `${JSON.stringify(data, null, 2)}\n`
}

function buildUserPrompt({
  slug,
  labelName,
  extraNotes,
  research,
  revise = false,
  currentLabelJson = '',
}) {
  let s = revise
    ? `Tarea: REVISION de ficha de sello existente (mejorar y corregir, no reemplazar desde cero). Sigue el prompt de sistema + bloque MODO REVISION.

slug (kebab-case): ${slug}
Nombre del sello (canonico): ${labelName}
`
    : `Genera el JSON del sello discografico siguiendo el prompt de sistema (redactor Optimal Breaks).

slug (kebab-case): ${slug}
Nombre del sello (canonico): ${labelName}
`
  if (revise && currentLabelJson) {
    s += `
FICHA ACTUAL (JSON completo del repo o BD). Parte de aqui; description_en y description_es deben seguir siendo esencialmente ESTA historia, mejorada y ampliada segun notas/web, sin vaciar ni reescribir en frio:
---
${currentLabelJson}
---
`
  }
  if (research) {
    s += `
CONTEXTO DE BUSQUEDA WEB (puede contener errores; contrasta y no inventes cifras exactas sin soporte):
---
${research}
---
`
  } else {
    s += '\nNo hay contexto web; usa conocimiento fiable hasta tu fecha de corte y se conservador con datos especificos.\n'
  }
  if (extraNotes) {
    s += `
NOTAS DEL EDITOR / DOCUMENTACION DEL SELLO (maxima prioridad si hay conflicto con ficha actual, web o modelo):
---
${extraNotes}
---
`
  }
  s += `
CHECKLIST (obligatorio antes de cerrar la respuesta):
- Solo un objeto JSON parseable; sin markdown, sin texto fuera del JSON, sin campos extra.
- Prioridad de fuentes: ${revise ? 'notas / documentacion > ficha actual > ' : ''}notas del editor > contexto web > conocimiento general.
${revise ? '- Modo revision: no sustituyas las descripciones por un borrador nuevo; conserva y mejora el texto de la FICHA ACTUAL salvo correcciones documentadas.\n' : ''}
- No inventes anos exactos de fundacion, catalogos completos, charts, premios ni URLs sin base razonable.
- slug EXACTO (kebab-case, solo a-z, 0-9, guiones): "${slug}"
- description_es y description_en: apunta a 8-14 parrafos cada una cuando haya base; separa parrafos con \\n\\n dentro del string JSON.
- Arrays sin duplicados ni strings vacios; sin placeholders (TBD, N/A, unknown).
- website e image_url: solo URLs https presentes en contexto o notas; si no hay evidencia, null.
`
  return s
}

function uniqueNonEmptyStrings(arr) {
  if (!Array.isArray(arr)) return []
  const seen = new Set()
  const out = []
  for (const x of arr) {
    const t = String(x ?? '').trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

async function openAiJson({ system, user }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error('Falta OPENAI_API_KEY en .env.local')
  }
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.28,
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
  if (!content) {
    throw new Error('Respuesta OpenAI vacía')
  }
  let raw = content.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error(`JSON del modelo no parseable: ${e.message}`)
  }
}

function normalizeLabel(obj, expectedSlug) {
  const out = { ...obj }
  out.slug =
    (out.slug || expectedSlug).toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '') ||
    expectedSlug
  out.name = String(out.name || '').trim() || out.slug
  out.country = typeof out.country === 'string' ? out.country.trim() : ''
  const fy = out.founded_year
  if (fy === undefined || fy === null || fy === '') {
    out.founded_year = null
  } else {
    const n = typeof fy === 'number' ? fy : parseInt(String(fy), 10)
    out.founded_year = Number.isFinite(n) && n >= 1800 && n <= 2100 ? n : null
  }
  out.description_en = String(out.description_en || '').trim()
  out.description_es = String(out.description_es || '').trim()
  out.key_artists = uniqueNonEmptyStrings(out.key_artists)
  out.key_releases = uniqueNonEmptyStrings(out.key_releases)
  const web = out.website
  out.website =
    typeof web === 'string' && web.trim().startsWith('https://') ? web.trim() : null
  const img = out.image_url
  out.image_url =
    typeof img === 'string' && img.trim().startsWith('https://') ? img.trim() : null
  if (typeof out.is_active !== 'boolean') out.is_active = true
  if (typeof out.is_featured !== 'boolean') out.is_featured = false
  return out
}

function validateMinimal(obj) {
  const err = []
  if (!obj.slug) err.push('slug')
  if (!obj.name || !String(obj.name).trim()) err.push('name')
  if (!obj.description_en || !String(obj.description_en).trim()) err.push('description_en')
  if (!obj.description_es || !String(obj.description_es).trim()) err.push('description_es')
  return err
}

/**
 * @param {object} opts
 */
export async function runLabelAgent({
  slug,
  labelName,
  extraNotes = '',
  noSearch = false,
  stdout = false,
  jsonOnly = false,
  saveJson = false,
  quiet = false,
  revise = false,
}) {
  let currentLabelJson = ''
  if (revise) {
    currentLabelJson = (await loadCurrentLabelJsonForRevise(slug)) || ''
    if (!currentLabelJson) {
      throw new Error(
        'Modo --revise: no hay data/labels/<slug>.json ni fila en Supabase. Crea el JSON o sincroniza la BD.',
      )
    }
    if (!quiet) {
      console.log('[sello-agente] Modo --revise: ficha actual cargada,', currentLabelJson.length, 'caracteres')
    }
  }

  let research = ''
  if (!noSearch) {
    const serpKey = process.env.SERPAPI_API_KEY?.trim()
    if (serpKey) {
      const q = `${labelName} record label breakbeat discography`
      if (!quiet) console.log('[sello-agente] Buscando contexto (SerpAPI)...')
      research = await fetchSerpContext(q, serpKey)
      if (!quiet) {
        if (research) console.log('[sello-agente] Contexto web:', research.length, 'caracteres')
        else console.log('[sello-agente] Sin resultados utiles de SerpAPI')
      }
    } else if (!quiet) {
      console.log('[sello-agente] SERPAPI_API_KEY no definida; modo solo modelo.')
    }
  }

  const userPrompt = buildUserPrompt({
    slug,
    labelName,
    extraNotes,
    research,
    revise,
    currentLabelJson,
  })
  if (!quiet) console.log('[sello-agente] Llamando OpenAI…')
  const parsed = await openAiJson({
    system: loadSystemPrompt(revise),
    user: userPrompt,
  })

  const normalized = normalizeLabel(parsed, slug)
  const bad = validateMinimal(normalized)
  if (bad.length) {
    throw new Error(`Faltan campos: ${bad.join(', ')}`)
  }

  const jsonOut = JSON.stringify(normalized, null, 2) + '\n'

  if (stdout) {
    process.stdout.write(jsonOut)
    return { path: null, slug: normalized.slug, savedDb: false }
  }

  const dir = join(ROOT, 'data', 'labels')
  const outPath = join(dir, `${normalized.slug}.json`)

  if (jsonOnly) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(outPath, jsonOut, 'utf8')
    if (!quiet) {
      console.log('Solo JSON (--json-only):', outPath)
    }
    return { path: outPath, slug: normalized.slug, savedDb: false }
  }

  let row
  try {
    row = await upsertLabel(normalized)
  } catch (e) {
    throw new Error(
      `${e.message}\n\nSi quieres generar solo el archivo sin BD: anade --json-only al comando.`,
    )
  }

  if (saveJson) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(outPath, jsonOut, 'utf8')
    if (!quiet) console.log('Copia JSON:', outPath)
  }

  if (!quiet) {
    console.log('Guardado en Supabase (label):', row.slug, '| id:', row.id)
  }

  return {
    path: saveJson ? outPath : null,
    slug: normalized.slug,
    savedDb: true,
    row,
  }
}

async function fetchAllLabelsFromSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim()
  if (!url || !key) {
    throw new Error(
      'Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY) en .env.local',
    )
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const all = []
  const page = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('labels')
      .select('slug,name')
      .order('slug', { ascending: true })
      .range(from, from + page - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...data)
    if (data.length < page) break
    from += page
  }
  return all
}

function parseLimit(argv) {
  const i = argv.indexOf('--limit')
  if (i === -1 || !argv[i + 1]) return Infinity
  const n = parseInt(argv[i + 1], 10)
  return Number.isFinite(n) && n > 0 ? n : Infinity
}

function parseDelayMs(argv) {
  const i = argv.indexOf('--delay-ms')
  if (i === -1 || !argv[i + 1]) return 3000
  const n = parseInt(argv[i + 1], 10)
  return Number.isFinite(n) && n >= 0 ? n : 3000
}

async function runFromDbMode(argv) {
  const skipSlugs = new Set()
  const extraSkip = argv.find((a) => a.startsWith('--skip='))
  if (extraSkip) {
    for (const s of extraSkip.slice('--skip='.length).split(',')) {
      const t = s.trim().toLowerCase()
      if (t) skipSlugs.add(t)
    }
  }
  const limit = parseLimit(argv)
  const delayMs = parseDelayMs(argv)
  const noSearch = argv.includes('--no-search')
  const jsonOnly = argv.includes('--json-only')
  const saveJson = argv.includes('--save-json')

  const rows = await fetchAllLabelsFromSupabase()
  let todo = rows.filter((r) => r.slug && !skipSlugs.has(r.slug))
  if (Number.isFinite(limit)) todo = todo.slice(0, limit)

  console.log(
    `[batch labels] ${todo.length} sellos (omitidos: ${[...skipSlugs].join(', ')}); pausa ${delayMs} ms entre llamadas`,
  )

  let ok = 0
  let fail = 0
  const failed = []
  for (let i = 0; i < todo.length; i++) {
    const { slug, name } = todo[i]
    const labelName = String(name || slug).trim() || slug
    console.log(`[batch labels] ${i + 1}/${todo.length} ${slug} (${labelName})`)
    let lastErr = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await runLabelAgent({
          slug,
          labelName,
          extraNotes: '',
          noSearch,
          stdout: false,
          jsonOnly,
          saveJson,
          quiet: true,
          revise: false,
        })
        ok++
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        console.warn(`[batch labels] intento ${attempt}/3 ${slug}:`, e.message)
        if (attempt < 3) await new Promise((r) => setTimeout(r, 5000 * attempt))
      }
    }
    if (lastErr) {
      fail++
      failed.push(slug)
    }
    if (i < todo.length - 1 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
  }

  console.log(`[batch labels] Fin: ok=${ok} fallos=${fail}`)
  if (failed.length) console.log('[batch labels] Slugs con error:', failed.join(', '))
}

async function main() {
  loadEnvLocal()
  const argv = process.argv.slice(2)
  if (argv.includes('--from-db')) {
    try {
      await runFromDbMode(argv)
    } catch (e) {
      console.error('[batch labels]', e.message)
      process.exit(1)
    }
    return
  }

  let noSearch = false
  let stdout = false
  let jsonOnly = false
  let saveJson = false
  let revise = false
  const notePaths = []
  const filtered = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-search') noSearch = true
    else if (argv[i] === '--stdout') stdout = true
    else if (argv[i] === '--json-only') jsonOnly = true
    else if (argv[i] === '--save-json') saveJson = true
    else if (argv[i] === '--revise') revise = true
    else if (argv[i] === '--notes' && argv[i + 1]) {
      notePaths.push(argv[++i])
    } else filtered.push(argv[i])
  }
  const pos = filtered.filter((x) => typeof x === 'string')
  if (pos.length < 2) {
    console.error(
      `Uso: node scripts/generar-sello-agente.mjs <slug> "Nombre sello" [--revise] [--notes ruta ...] [--no-search] [--stdout] [--json-only] [--save-json]`,
    )
    console.error(
      `   o: node scripts/generar-sello-agente.mjs --from-db [--limit N] [--delay-ms ms] [--no-search] [--skip=a,b] [--save-json]`,
    )
    process.exit(1)
  }
  const slug = pos[0]
  const labelName = pos[1]
  let extraNotes = ''
  if (notePaths.length) {
    const parts = []
    for (let n = 0; n < notePaths.length; n++) {
      const np = resolve(ROOT, notePaths[n])
      if (!existsSync(np)) {
        console.error('No existe archivo de notas:', np)
        process.exit(1)
      }
      parts.push(`--- Documento ${n + 1} (${notePaths[n]}) ---\n${readFileSync(np, 'utf8')}`)
    }
    extraNotes = parts.join('\n\n')
  }

  try {
    await runLabelAgent({
      slug,
      labelName,
      extraNotes,
      noSearch,
      stdout,
      jsonOnly,
      saveJson,
      quiet: false,
      revise,
    })
  } catch (e) {
    console.error('[sello-agente]', e.message)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
