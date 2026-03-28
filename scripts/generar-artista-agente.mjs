/**
 * OPTIMAL BREAKS — Agente (OpenAI + búsqueda opcional) → JSON de artista
 *
 * Uso:
 *   node scripts/generar-artista-agente.mjs <slug> "Nombre del artista" [--notes archivo.txt] [--stdout] [--no-search]
 *   npm run db:artist:agent -- krafty-kuts "Krafty Kuts"
 *   npm run db:artist:agent:all --              # todos en BD excepto deekline
 *   npm run db:artist:agent:all -- --limit 3  # prueba con 3
 *
 * Requiere OPENAI_API_KEY en .env.local.
 * Opcional: SERPAPI_API_KEY (Google via serpapi.com) para contexto de búsqueda.
 *
 * Escribe por defecto: data/artists/<slug>.json
 * Luego: npm run db:artist -- data/artists/<slug>.json
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

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

const VALID_CATEGORIES = ['pioneer', 'uk_legend', 'us_artist', 'andalusian', 'current', 'crew']

const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'artista-agente-system.txt')

function loadSystemPrompt() {
  if (existsSync(SYSTEM_PROMPT_PATH)) {
    return readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim()
  }
  console.error('Falta el prompt:', SYSTEM_PROMPT_PATH)
  process.exit(1)
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
      console.warn('[agente] SerpAPI HTTP', res.status, '(sigue sin contexto web)')
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
    console.warn('[agente] SerpAPI error:', e.message)
    return ''
  }
}

function buildUserPrompt({ slug, artistName, extraNotes, research }) {
  let s = `Genera el JSON del artista siguiendo el prompt de sistema V2 (redactor Optimal Breaks).

slug (kebab-case): ${slug}
Nombre artístico principal: ${artistName}
`
  if (research) {
    s += `
CONTEXTO DE BÚSQUEDA WEB (puede contener errores; contrasta y no inventes cifras exactas sin soporte):
---
${research}
---
`
  } else {
    s += '\nNo hay contexto web; usa conocimiento fiable hasta tu fecha de corte y sé conservador con datos específicos.\n'
  }
  if (extraNotes) {
    s += `
NOTAS DEL EDITOR (máxima prioridad si hay conflicto con web o modelo):
---
${extraNotes}
---
`
  }
  s += `
CHECKLIST V2 (obligatorio antes de cerrar la respuesta):
- Solo un objeto JSON parseable; sin markdown, sin texto fuera del JSON, sin campos extra.
- Prioridad de fuentes: notas del editor > contexto web > conocimiento general.
- No inventes charts, fechas exactas, premios, sellos, colaboraciones ni URLs sin base razonable.
- slug EXACTO (kebab-case, solo a-z, 0-9, guiones): "${slug}"
- bio_es y bio_en: 12–18 párrafos cada una; separa párrafos con \\n\\n dentro del string JSON.
- Arrays sin duplicados ni strings vacíos; sin placeholders (TBD, N/A, unknown).
- socials y website: solo URLs https presentes en contexto o notas; si no hay evidencia, {} y null.
- image_url: null salvo URL https pública clara y estable en el contexto.
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

function normalizeSocials(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim().toLowerCase()
    const url = String(v ?? '').trim()
    if (!key || !url.startsWith('https://')) continue
    if (!out[key]) out[key] = url
  }
  return out
}

async function openAiJson({ system, user }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error('Falta OPENAI_API_KEY en .env.local')
  }
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
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

function normalizeArtist(obj, expectedSlug) {
  const out = { ...obj }
  out.slug = (out.slug || expectedSlug).toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '') || expectedSlug
  if (!VALID_CATEGORIES.includes(out.category)) out.category = 'current'
  out.name_display = String(out.name_display || out.name || '').toUpperCase()
  out.styles = uniqueNonEmptyStrings(out.styles)
  out.essential_tracks = uniqueNonEmptyStrings(out.essential_tracks)
  out.recommended_mixes = uniqueNonEmptyStrings(out.recommended_mixes)
  out.related_artists = uniqueNonEmptyStrings(out.related_artists)
  out.labels_founded = uniqueNonEmptyStrings(out.labels_founded)
  out.key_releases = Array.isArray(out.key_releases) ? out.key_releases : []
  out.socials = normalizeSocials(out.socials)
  const web = out.website === undefined ? null : out.website
  out.website =
    typeof web === 'string' && web.trim().startsWith('https://') ? web.trim() : null
  const rn = out.real_name
  if (rn === undefined || rn === null) out.real_name = null
  else {
    const t = String(rn).trim()
    out.real_name = t || null
  }
  const img = out.image_url
  out.image_url =
    typeof img === 'string' && img.trim().startsWith('https://') ? img.trim() : null
  if (typeof out.is_featured !== 'boolean') out.is_featured = false
  let so = typeof out.sort_order === 'number' ? out.sort_order : 50
  if (!Number.isFinite(so)) so = 50
  out.sort_order = Math.min(200, Math.max(1, Math.round(so)))
  for (const kr of out.key_releases) {
    if (typeof kr.year !== 'number') kr.year = 2000
    if (kr.note === undefined) kr.note = ''
  }
  return out
}

function validateMinimal(obj) {
  const err = []
  if (!obj.slug) err.push('slug')
  if (!obj.name || !String(obj.name).trim()) err.push('name')
  if (!obj.name_display || !String(obj.name_display).trim()) err.push('name_display')
  if (!obj.bio_en || !String(obj.bio_en).trim()) err.push('bio_en')
  if (!obj.bio_es || !String(obj.bio_es).trim()) err.push('bio_es')
  return err
}

/**
 * Genera y opcionalmente escribe data/artists/<slug>.json. Lanza Error si falla.
 */
export async function runArtistAgent({
  slug,
  artistName,
  extraNotes = '',
  noSearch = false,
  stdout = false,
  quiet = false,
}) {
  let research = ''
  if (!noSearch) {
    const serpKey = process.env.SERPAPI_API_KEY?.trim()
    if (serpKey) {
      const q = `${artistName} DJ producer breakbeat biography discography`
      if (!quiet) console.log('[agente] Buscando contexto (SerpAPI)...')
      research = await fetchSerpContext(q, serpKey)
      if (!quiet) {
        if (research) console.log('[agente] Contexto web:', research.length, 'caracteres')
        else console.log('[agente] Sin resultados útiles de SerpAPI')
      }
    } else if (!quiet) {
      console.log('[agente] SERPAPI_API_KEY no definida; modo solo modelo.')
    }
  }

  const userPrompt = buildUserPrompt({ slug, artistName, extraNotes, research })
  if (!quiet) console.log('[agente] Llamando OpenAI…')
  const parsed = await openAiJson({
    system: loadSystemPrompt(),
    user: userPrompt,
  })

  const normalized = normalizeArtist(parsed, slug)
  const bad = validateMinimal(normalized)
  if (bad.length) {
    throw new Error(`Faltan campos: ${bad.join(', ')}`)
  }

  const jsonOut = JSON.stringify(normalized, null, 2) + '\n'
  if (stdout) {
    process.stdout.write(jsonOut)
    return { path: null, slug: normalized.slug }
  }
  const dir = join(ROOT, 'data', 'artists')
  mkdirSync(dir, { recursive: true })
  const outPath = join(dir, `${normalized.slug}.json`)
  writeFileSync(outPath, jsonOut, 'utf8')
  if (!quiet) {
    console.log('Escrito:', outPath)
    console.log('Siguiente paso: npm run db:artist -- data/artists/' + normalized.slug + '.json')
  }
  return { path: outPath, slug: normalized.slug }
}

async function fetchAllArtistsFromSupabase() {
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
      .from('artists')
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
  const skipSlugs = new Set(['deekline'])
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

  const rows = await fetchAllArtistsFromSupabase()
  let todo = rows.filter((r) => r.slug && !skipSlugs.has(r.slug))
  if (Number.isFinite(limit)) todo = todo.slice(0, limit)

  console.log(
    `[batch] ${todo.length} artistas (omitidos: ${[...skipSlugs].join(', ')}); pausa ${delayMs} ms entre llamadas`,
  )

  let ok = 0
  let fail = 0
  const failed = []
  for (let i = 0; i < todo.length; i++) {
    const { slug, name } = todo[i]
    const artistName = String(name || slug).trim() || slug
    console.log(`[batch] ${i + 1}/${todo.length} ${slug} (${artistName})`)
    let lastErr = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await runArtistAgent({ slug, artistName, extraNotes: '', noSearch, stdout: false, quiet: true })
        ok++
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        console.warn(`[batch] intento ${attempt}/3 ${slug}:`, e.message)
        if (attempt < 3) await new Promise((r) => setTimeout(r, 5000 * attempt))
      }
    }
    if (lastErr) {
      fail++
      failed.push(slug)
    }
    if (i < todo.length - 1 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
  }

  console.log(`[batch] Fin: ok=${ok} fallos=${fail}`)
  if (failed.length) console.log('[batch] Slugs con error:', failed.join(', '))
}

async function main() {
  loadEnvLocal()
  const argv = process.argv.slice(2)
  if (argv.includes('--from-db')) {
    try {
      await runFromDbMode(argv)
    } catch (e) {
      console.error('[batch]', e.message)
      process.exit(1)
    }
    return
  }

  let noSearch = false
  let stdout = false
  const filtered = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--no-search') noSearch = true
    else if (argv[i] === '--stdout') stdout = true
    else if (argv[i] === '--notes' && argv[i + 1]) {
      filtered.push({ type: 'notes', path: argv[++i] })
    } else filtered.push(argv[i])
  }
  const pos = filtered.filter((x) => typeof x === 'string')
  if (pos.length < 2) {
    console.error(
      `Uso: node scripts/generar-artista-agente.mjs <slug> "Nombre artista" [--notes ruta.txt] [--stdout] [--no-search]`,
    )
    console.error(`   o: node scripts/generar-artista-agente.mjs --from-db [--limit N] [--delay-ms ms] [--no-search] [--skip=a,b]`)
    process.exit(1)
  }
  const slug = pos[0]
  const artistName = pos[1]
  let extraNotes = ''
  const noteArg = filtered.find((x) => x && typeof x === 'object' && x.type === 'notes')
  if (noteArg) {
    const np = resolve(ROOT, noteArg.path)
    if (!existsSync(np)) {
      console.error('No existe archivo de notas:', np)
      process.exit(1)
    }
    extraNotes = readFileSync(np, 'utf8')
  }

  try {
    await runArtistAgent({ slug, artistName, extraNotes, noSearch, stdout, quiet: false })
  } catch (e) {
    console.error('[agente]', e.message)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
