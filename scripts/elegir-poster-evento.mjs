/**
 * OPTIMAL BREAKS — Cartel de evento: SerpAPI (Google Imágenes) + OpenAI + Storage
 *
 * Busca carteles / flyers con Google Imágenes vía SerpAPI, el modelo elige el mejor
 * candidato por metadatos (o con --vision miniaturas), descarga y sube a
 * `media/events/<slug>/poster.*`, actualiza `public.events.image_url`.
 *
 * Requiere: OPENAI_API_KEY, SERPAPI_API_KEY, NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE
 * (salvo --dry-run o --json-only sin subida).
 *
 * Índice: node scripts/guia-base-datos.mjs run events-poster [--flags] [slug]
 *
 * Uso:
 *   node scripts/elegir-poster-evento.mjs              # sin args = --missing-only (límite 20 o EVENTS_POSTER_DEFAULT_LIMIT)
 *   node scripts/elegir-poster-evento.mjs hibrida-fest-2026
 *   node scripts/elegir-poster-evento.mjs --missing-only --limit 15
 *   node scripts/elegir-poster-evento.mjs --all --limit 5 --force
 *   node scripts/elegir-poster-evento.mjs slug --dry-run
 *   node scripts/elegir-poster-evento.mjs slug --json-only
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal } from './lib/artist-upsert.mjs'
import { fetchGoogleImageCandidates } from './lib/serp-google-images.mjs'
import {
  uploadEventPosterFromUrl,
  hasStorageCredentials,
} from './lib/upload-event-poster-to-storage.mjs'

const DEFAULT_MAX_CANDIDATES = 18
const DEFAULT_DELAY_MS = 1400

function parseArgs(argv) {
  const flags = new Set()
  const positional = []
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a)
    else positional.push(a)
  }
  return { flags, positional }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function hostFromUrl(u) {
  try {
    return new URL(u).hostname
  } catch {
    return ''
  }
}

function hasHttpsImage(url) {
  return typeof url === 'string' && url.trim().startsWith('https://')
}

function buildEventPosterQuery(event, extraSuffix) {
  const name = String(event.name || '').trim()
  const city =
    event.city && String(event.city).trim() && String(event.city).trim() !== 'TBA'
      ? String(event.city).trim()
      : ''
  const country = event.country ? String(event.country).trim() : ''
  const venue = event.venue ? String(event.venue).trim() : ''
  let year = ''
  if (event.date_start) year = String(event.date_start).slice(0, 4)
  let q = `"${name}"`
  if (year) q += ` ${year}`
  if (city) q += ` ${city}`
  if (country) q += ` ${country}`
  if (venue) q += ` ${venue}`
  q += ' festival club night poster flyer cartel event'
  if (extraSuffix) q += ` ${extraSuffix}`
  return q.replace(/\s+/g, ' ').trim()
}

const SYSTEM_POSTER = `Eres editor de Optimal Breaks (música dance / breakbeat). Recibes candidatos de Google Imágenes como METADATOS (no ves el píxel salvo modo visión aparte).
Tu tarea: elegir a lo sumo UN candidato que sea muy probablemente el cartel, póster o flyer oficial o promocional del evento indicado (fecha, ciudad, nombre coherente).
Rechaza: fotos de público genéricas sin diseño de evento, capturas de Instagram/Twitter sin cartel, logos sueltos, otra ciudad o año claramente distinto, merchandising, memes, resultados dudoso-homónimos.
Prefiere proporción vertical u horizontal típica de flyer (no exijas datos EXIF; usa título y fuente).
Responde SOLO JSON:
{"chosen": <índice 0-based del array "candidates" o null>, "reason": <string breve en español>}
Si ningún candidato es fiable, chosen debe ser null.`

async function openAiChoosePosterText({ event, candidates, quiet }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4'

  const lines = candidates.map((c, i) => {
    const dim = c.width && c.height ? `${c.width}x${c.height}` : 'unknown'
    const host = hostFromUrl(c.original)
    return `[${i}] title: ${c.title}\n    source: ${c.source}\n    page: ${c.link}\n    image_host: ${host}\n    size: ${dim}`
  })

  const user = `Evento:
- nombre: ${event.name}
- slug: ${event.slug}
- ciudad: ${event.city ?? 'null'}
- pais: ${event.country ?? 'null'}
- venue: ${event.venue ?? 'null'}
- fecha_inicio: ${event.date_start ?? 'null'}
- tipo: ${event.event_type ?? 'null'}

Candidatos (índices 0..n-1):
${lines.join('\n\n')}

Devuelve JSON: {"chosen": number|null, "reason": string}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_POSTER },
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
  const parsed = JSON.parse(raw)
  const chosen = parsed.chosen
  const reason = typeof parsed.reason === 'string' ? parsed.reason : ''
  if (chosen !== null && chosen !== undefined) {
    const n = Number(chosen)
    if (!Number.isInteger(n) || n < 0 || n >= candidates.length) {
      if (!quiet) console.warn('[event-poster] Índice inválido:', chosen)
      return { url: null, reason: reason || 'índice inválido' }
    }
    return { url: candidates[n].original, reason }
  }
  return { url: null, reason: reason || 'sin candidato' }
}

async function openAiChoosePosterVision({ event, candidates, quiet }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model =
    process.env.OPENAI_VISION_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-4o-mini'

  const maxImg = Math.min(8, candidates.length)
  const content = [
    {
      type: 'text',
      text: `Evento: "${event.name}" (${event.slug}). Ciudad: ${event.city || '?'}. Fecha: ${event.date_start || '?'}. Elige UN índice 0..${candidates.length - 1} cuyo cartel/flyer corresponda a este evento, o null. JSON: {"chosen": number|null, "reason": "..."}`,
    },
  ]

  for (let i = 0; i < maxImg; i++) {
    const c = candidates[i]
    const imgUrl = c.thumbnail && c.thumbnail.startsWith('https://') ? c.thumbnail : c.original
    content.push({ type: 'text', text: `\n--- [${i}] ${c.source} ---` })
    content.push({
      type: 'image_url',
      image_url: { url: imgUrl, detail: 'low' },
    })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Eres experto en identificar carteles y flyers de eventos musicales. Solo JSON válido.',
        },
        { role: 'user', content },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI vision ${res.status}: ${err}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Respuesta OpenAI vacía')
  let raw = text.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  const parsed = JSON.parse(raw)
  const chosen = parsed.chosen
  const reason = typeof parsed.reason === 'string' ? parsed.reason : ''
  if (chosen !== null && chosen !== undefined) {
    const n = Number(chosen)
    if (!Number.isInteger(n) || n < 0 || n >= candidates.length) {
      if (!quiet) console.warn('[event-poster] Vision: índice inválido:', chosen)
      return { url: null, reason }
    }
    return { url: candidates[n].original, reason }
  }
  return { url: null, reason }
}

async function fetchEvents(sb, { slug, missingOnly, all, limit }) {
  const sel =
    'slug, name, city, country, date_start, venue, event_type, image_url'
  if (slug) {
    const { data, error } = await sb.from('events').select(sel).eq('slug', slug).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? [data] : []
  }
  let q = sb.from('events').select(sel).order('date_start', { ascending: false })
  if (missingOnly && !all) {
    q = q.is('image_url', null)
  }
  if (limit && Number.isFinite(limit)) {
    q = q.limit(limit)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = data || []
  if (missingOnly && !all) {
    return rows.filter((r) => !hasHttpsImage(r.image_url))
  }
  return rows
}

async function processOneEvent({ event, flags, serpKey, maxCandidates, querySuffix, quiet, sb }) {
  const slug = event.slug
  if (!slug || !event.name) {
    return { ok: false, slug, error: 'fila sin slug o name' }
  }

  const force = flags.has('--force')
  if (flags.has('--skip-existing') && !force && hasHttpsImage(event.image_url)) {
    if (!quiet) console.log(`[event-poster] ${slug}: ya tiene image_url, omitido`)
    return { ok: true, slug, skipped: true }
  }

  const q = buildEventPosterQuery(event, querySuffix)
  if (!quiet) console.log(`[event-poster] ${slug}: SerpAPI →`, q)

  let candidates
  try {
    candidates = await fetchGoogleImageCandidates(q, serpKey, maxCandidates)
  } catch (e) {
    console.error(`[event-poster] ${slug}: SerpAPI`, e.message)
    return { ok: false, slug, error: e.message }
  }

  if (candidates.length === 0) {
    if (!quiet) console.log(`[event-poster] ${slug}: sin candidatos`)
    return { ok: true, slug, url: null, reason: 'sin resultados' }
  }

  if (!quiet) console.log(`[event-poster] ${slug}: ${candidates.length} candidatos → OpenAI…`)

  let url = null
  let reason = ''
  try {
    if (flags.has('--vision')) {
      ;({ url, reason } = await openAiChoosePosterVision({ event, candidates, quiet }))
    } else {
      ;({ url, reason } = await openAiChoosePosterText({ event, candidates, quiet }))
    }
  } catch (e) {
    console.error(`[event-poster] ${slug}: OpenAI`, e.message)
    return { ok: false, slug, error: e.message }
  }

  if (!quiet) {
    console.log(`[event-poster] ${slug}: decisión →`, url ? url.slice(0, 72) + '…' : null)
    console.log(`              motivo: ${reason}`)
  }

  if (flags.has('--dry-run')) {
    return { ok: true, slug, url, reason, dryRun: true }
  }

  let imageUrlFinal = url || null
  if (url && !flags.has('--json-only')) {
    try {
      imageUrlFinal = await uploadEventPosterFromUrl({ slug, sourceUrl: url, quiet })
    } catch (e) {
      console.error(`[event-poster] ${slug}: Storage`, e.message)
      return { ok: false, slug, error: e.message }
    }
  }

  if (flags.has('--json-only')) {
    if (!quiet) {
      console.log(`[event-poster] ${slug}: --json-only → solo URL en BD (sin subir a Storage)`)
    }
    if (!imageUrlFinal) return { ok: true, slug, url: null, reason }
    const { error } = await sb.from('events').update({ image_url: imageUrlFinal }).eq('slug', slug)
    if (error) {
      console.error(`[event-poster] ${slug}: UPDATE`, error.message)
      return { ok: false, slug, error: error.message }
    }
    if (!quiet) console.log(`[event-poster] ${slug}: image_url actualizado (externa)`)
    return { ok: true, slug, url: imageUrlFinal, reason }
  }

  if (!imageUrlFinal) {
    return { ok: true, slug, url: null, reason }
  }

  const { error } = await sb.from('events').update({ image_url: imageUrlFinal }).eq('slug', slug)
  if (error) {
    console.error(`[event-poster] ${slug}: UPDATE`, error.message)
    return { ok: false, slug, error: error.message }
  }
  if (!quiet) console.log(`[event-poster] ${slug}: OK`)
  return { ok: true, slug, url: imageUrlFinal, reason }
}

async function main() {
  loadEnvLocal()
  const defaultMissingBatchLimit =
    parseInt(process.env.EVENTS_POSTER_DEFAULT_LIMIT || '20', 10) || 20
  const { flags, positional } = parseArgs(process.argv.slice(2))

  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (!serpKey) {
    console.error('Falta SERPAPI_API_KEY')
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('Falta OPENAI_API_KEY')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ''

  if (!flags.has('--json-only') && !flags.has('--dry-run') && !hasStorageCredentials()) {
    console.error(
      'Falta Storage (URL + SERVICE_ROLE) para subir carteles. Usa --dry-run o --json-only para probar sin bucket.',
    )
    process.exit(1)
  }

  if ((!url || !serviceKey) && !flags.has('--dry-run')) {
    console.error('Falta NEXT_PUBLIC_SUPABASE_URL y SERVICE_ROLE para leer/actualizar events')
    process.exit(1)
  }

  const sb =
    url && serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : null

  const quiet = flags.has('--quiet')
  const maxCandidates = (() => {
    const a = process.argv.find((x) => x.startsWith('--max-candidates='))
    if (!a) return DEFAULT_MAX_CANDIDATES
    const n = parseInt(a.split('=')[1], 10)
    return Number.isFinite(n) && n > 2 ? Math.min(n, 30) : DEFAULT_MAX_CANDIDATES
  })()

  const delayMs = (() => {
    const a = process.argv.find((x) => x.startsWith('--delay-ms='))
    if (!a) return DEFAULT_DELAY_MS
    const n = parseInt(a.split('=')[1], 10)
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELAY_MS
  })()

  const limitArg = process.argv.find((x) => x.startsWith('--limit='))
  const limitParsed = limitArg ? parseInt(limitArg.split('=')[1], 10) : NaN

  const querySuffixArg = process.argv.find((x) => x.startsWith('--query-suffix='))
  const querySuffix = querySuffixArg ? querySuffixArg.split('=').slice(1).join('=').trim() : ''

  const slugArg = positional[0]?.trim()
  let missingOnly = flags.has('--missing-only')
  const all = flags.has('--all')

  if (flags.has('--help') || flags.has('-h')) {
    console.log(`Uso:
  npm run db:events:poster                    # sin args → --missing-only (límite ${defaultMissingBatchLimit}; env EVENTS_POSTER_DEFAULT_LIMIT)
  node scripts/elegir-poster-evento.mjs <slug>
  node scripts/elegir-poster-evento.mjs --missing-only [--limit=N]
  node scripts/elegir-poster-evento.mjs --all [--limit=N]   # todos (peligroso)

Opciones:
  --skip-existing   omitir si image_url ya es https (útil con --all)
  --force           volver a buscar aunque ya haya imagen
  --dry-run         no sube ni actualiza BD
  --json-only       guarda URL externa en image_url sin subir a Storage
  --vision          modelo multimodal con miniaturas
  --max-candidates=N (default ${DEFAULT_MAX_CANDIDATES})
  --delay-ms=N      pausa entre eventos (default ${DEFAULT_DELAY_MS})
  --limit=N         tope de filas en lote (sin --limit con --all: 200)
  --query-suffix=   texto extra en la búsqueda Google Imágenes
  --quiet
  --help, -h        esta ayuda
`)
    process.exit(0)
  }

  let limit = Number.isFinite(limitParsed) && limitParsed > 0 ? limitParsed : 200
  if (!slugArg && !missingOnly && !all) {
    missingOnly = true
    if (!limitArg) limit = defaultMissingBatchLimit
    if (!quiet) {
      console.log(
        `[event-poster] Sin argumentos: modo --missing-only, límite ${limit}. Más: npm run db:events:poster -- --help`,
      )
    }
  }

  let rows = []
  try {
    rows = await fetchEvents(sb, {
      slug: slugArg || null,
      missingOnly,
      all,
      limit: Number.isFinite(limit) && limit > 0 ? limit : defaultMissingBatchLimit,
    })
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }

  if (slugArg && rows.length === 0) {
    console.error('No existe evento con slug:', slugArg)
    process.exit(1)
  }

  if (!quiet) console.log(`[event-poster] A procesar: ${rows.length} evento(s)`)

  let ok = 0
  let fail = 0
  for (let i = 0; i < rows.length; i++) {
    const r = await processOneEvent({
      event: rows[i],
      flags,
      serpKey,
      maxCandidates,
      querySuffix,
      quiet,
      sb,
    })
    if (r.ok) ok++
    else fail++
    if (i < rows.length - 1 && delayMs > 0) await sleep(delayMs)
  }

  if (!quiet) console.log(`\nListo: ${ok} ok, ${fail} errores (${rows.length} filas)`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
