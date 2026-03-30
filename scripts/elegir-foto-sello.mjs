/**
 * OPTIMAL BREAKS — Logos de sellos: SerpAPI (Google Imágenes) + OpenAI → Storage + BD
 *
 * Misma lógica que GET/POST /api/admin/agent/label-logo (sin sesión admin).
 *
 *   node scripts/elegir-foto-sello.mjs <slug>
 *   node scripts/elegir-foto-sello.mjs                    # sin args = --missing-only (cola admin)
 *   node scripts/elegir-foto-sello.mjs --missing-only [--limit=N] [--delay-ms=1200]
 *   node scripts/elegir-foto-sello.mjs --all [--skip-existing] [--limit=N]
 *
 * Índice: node scripts/guia-base-datos.mjs run label-photo -- …
 *
 * Requiere: OPENAI_API_KEY, SERPAPI_API_KEY, NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'
import {
  uploadLabelLogoFromUrl,
  hasStorageCredentials,
} from './lib/upload-artist-portrait-to-storage.mjs'
import { fetchGoogleImageCandidates } from './lib/serp-google-images.mjs'

const DEFAULT_MAX_CANDIDATES = 18
const DEFAULT_DELAY_MS = 1200

/** Alineado con src/app/api/admin/agent/label-logo/route.ts */
const SYSTEM_LOGO = `Eres editor de Optimal Breaks (música dance / breakbeat). Te pasan candidatos de Google Imágenes como METADATOS (no ves el píxel).
Tu tarea: elegir a lo sumo UN candidato que sea muy probablemente el logo o imagen oficial del sello discográfico indicado.
Prefiere: logotipo oficial, imagotipo, imagen de perfil del sello en redes, arte de cabecera de la discográfica.
Rechaza: portadas de disco individuales, fotos de artistas, memes, resultados de otro sello homónimo, capturas de baja calidad, imágenes genéricas, merchandising.
Responde SOLO JSON:
{"chosen": <índice 0-based del array "candidates" o null>, "reason": <string breve en español>}
Si ningún candidato es fiable, chosen debe ser null.`

function parseArgs(argv) {
  const flags = new Set()
  const rest = []
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a)
    else rest.push(a)
  }
  return { flags, positional: rest }
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

function buildLogoQuery(labelName) {
  return `"${String(labelName).trim()}" record label logo discography music`.replace(/\s+/g, ' ').trim()
}

async function openAiChooseLogo(labelName, slug, candidates, quiet) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY en .env.local')
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4'

  const lines = candidates.map((c, i) => {
    const dim = c.width && c.height ? `${c.width}x${c.height}` : 'unknown'
    const host = hostFromUrl(c.original)
    return `[${i}] title: ${c.title}\n    source: ${c.source}\n    page: ${c.link}\n    image_host: ${host}\n    size: ${dim}`
  })

  const user = `Sello discográfico:\n- nombre: ${labelName}\n- slug: ${slug}\n\nCandidatos (índices 0..${candidates.length - 1}):\n${lines.join('\n\n')}\n\nDevuelve JSON: {"chosen": number|null, "reason": string}`

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
        { role: 'system', content: SYSTEM_LOGO },
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
    if (Number.isInteger(n) && n >= 0 && n < candidates.length) {
      return { url: candidates[n].original, reason }
    }
    if (!quiet) console.warn('[logo-sello] Índice inválido del modelo:', chosen)
  }
  return { url: null, reason: reason || 'sin candidato adecuado' }
}

async function fetchLabelSlugsToProcess(sb, mode, skipExisting) {
  const pageSize = 1000
  let from = 0
  const rows = []
  for (;;) {
    const { data, error } = await sb
      .from('labels')
      .select('slug,name,image_url')
      .order('slug', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  const out = []
  for (const row of rows) {
    if (!row.slug || !row.name) continue
    const url = String(row.image_url || '').trim()
    const hasImage = url.startsWith('https://')
    if (mode === 'missing-only') {
      if (!hasImage) out.push({ slug: row.slug, name: row.name })
    } else {
      if (skipExisting && hasImage) continue
      out.push({ slug: row.slug, name: row.name })
    }
  }
  return out
}

async function processOneLabel({ slug, labelName, sb, serpKey, maxCandidates, flags, quiet }) {
  if (flags.has('--skip-existing')) {
    const { data: row } = await sb.from('labels').select('image_url').eq('slug', slug).maybeSingle()
    const u = row?.image_url
    if (typeof u === 'string' && u.trim().startsWith('https://')) {
      if (!quiet) console.log(`[logo-sello] ${slug}: ya tiene image_url, omitido`)
      return { ok: true, slug, skipped: true }
    }
  }

  const q = buildLogoQuery(labelName)
  if (!quiet) console.log(`[logo-sello] ${slug}: SerpAPI →`, q)

  let candidates
  try {
    candidates = await fetchGoogleImageCandidates(q, serpKey, maxCandidates)
  } catch (e) {
    console.error(`[logo-sello] ${slug}: SerpAPI`, e.message)
    return { ok: false, slug, error: e.message }
  }

  if (candidates.length === 0) {
    if (!quiet) console.log(`[logo-sello] ${slug}: sin candidatos`)
    return { ok: true, slug, url: null, reason: 'sin resultados' }
  }

  if (!quiet) console.log(`[logo-sello] ${slug}: ${candidates.length} candidatos → OpenAI…`)

  let url = null
  let reason = ''
  try {
    ;({ url, reason } = await openAiChooseLogo(labelName, slug, candidates, quiet))
  } catch (e) {
    console.error(`[logo-sello] ${slug}: OpenAI`, e.message)
    return { ok: false, slug, error: e.message }
  }

  if (!quiet) {
    console.log(`[logo-sello] ${slug}: decisión →`, url ? url.slice(0, 80) + '…' : null)
    console.log(`         motivo: ${reason}`)
  }

  if (flags.has('--dry-run')) {
    return { ok: true, slug, url, reason, dryRun: true }
  }

  if (!url) {
    return { ok: true, slug, url: null, reason }
  }

  if (flags.has('--json-only')) {
    const { error: dbErr } = await sb.from('labels').update({ image_url: url }).eq('slug', slug)
    if (dbErr) {
      console.error(`[logo-sello] ${slug}: BD`, dbErr.message)
      return { ok: false, slug, error: dbErr.message }
    }
    if (!quiet) console.log(`[logo-sello] ${slug}: --json-only → URL externa en BD`)
    return { ok: true, slug, url, reason }
  }

  let storageUrl
  try {
    storageUrl = await uploadLabelLogoFromUrl({ slug, sourceUrl: url, quiet })
  } catch (e) {
    console.error(`[logo-sello] ${slug}: Storage`, e.message)
    return { ok: false, slug, error: e.message }
  }

  const { error: dbErr } = await sb.from('labels').update({ image_url: storageUrl }).eq('slug', slug)
  if (dbErr) {
    console.error(`[logo-sello] ${slug}: BD`, dbErr.message)
    return { ok: false, slug, error: dbErr.message }
  }
  if (!quiet) console.log(`[logo-sello] ${slug}: guardado en BD OK`)
  return { ok: true, slug, url: storageUrl, reason }
}

async function main() {
  loadEnvLocal()
  const { flags, positional } = parseArgs(process.argv.slice(2))

  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (!serpKey) {
    console.error('Falta SERPAPI_API_KEY en .env.local')
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('Falta OPENAI_API_KEY en .env.local')
    process.exit(1)
  }

  const creds = supabaseApiCredentials()
  if (!creds) {
    console.error(
      'Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)',
    )
    process.exit(1)
  }

  if (!flags.has('--json-only') && !flags.has('--dry-run') && !hasStorageCredentials()) {
    console.error(
      'Falta Storage: misma URL + service role para subir al bucket media. O usa --dry-run / --json-only.',
    )
    process.exit(1)
  }

  const sb = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

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

  let jobs = []

  if (flags.has('--help') || flags.has('-h')) {
    console.log(`Uso:
  node scripts/elegir-foto-sello.mjs              # igual que --missing-only (sellos sin logo en BD)
  node scripts/elegir-foto-sello.mjs <slug>
  node scripts/elegir-foto-sello.mjs --missing-only
  node scripts/elegir-foto-sello.mjs --all [--skip-existing]

Diferencia con elegir-foto-artista: el de artistas usa --all sobre archivos en data/artists/*.json;
este lee la cola desde Supabase (image_url vacía o no https).

Opciones:
  --dry-run            no Storage ni BD
  --json-only          URL externa en image_url (sin subir a Storage)
  --skip-existing      con --all, omitir filas que ya tienen https en image_url
  --limit=N
  --max-candidates=N   (default ${DEFAULT_MAX_CANDIDATES})
  --delay-ms=N         (default ${DEFAULT_DELAY_MS})
  --quiet`)
    process.exit(0)
  }

  if (positional.length >= 1 && !flags.has('--all') && !flags.has('--missing-only')) {
    const slug = positional[0].replace(/\.json$/i, '')
    const { data: row, error } = await sb
      .from('labels')
      .select('slug,name')
      .eq('slug', slug)
      .maybeSingle()
    if (error) {
      console.error(error.message)
      process.exit(1)
    }
    if (!row?.name) {
      console.error('No existe sello con slug:', slug)
      process.exit(1)
    }
    jobs = [{ slug: row.slug, name: row.name }]
  } else if (flags.has('--missing-only')) {
    jobs = await fetchLabelSlugsToProcess(sb, 'missing-only', false)
  } else if (flags.has('--all')) {
    jobs = await fetchLabelSlugsToProcess(sb, 'all', flags.has('--skip-existing'))
  } else {
    if (!quiet) {
      console.log(
        '[logo-sello] Sin argumentos → modo --missing-only (sellos sin image_url https, como el admin).',
      )
    }
    jobs = await fetchLabelSlugsToProcess(sb, 'missing-only', false)
  }

  const limitArg = process.argv.find((x) => x.startsWith('--limit='))
  if (limitArg) {
    const n = parseInt(limitArg.split('=')[1], 10)
    if (Number.isFinite(n) && n > 0) jobs = jobs.slice(0, n)
  }

  if (!quiet) {
    console.log(`[logo-sello] ${jobs.length} sellos a procesar\n`)
  }

  let ok = 0
  let fail = 0
  for (let i = 0; i < jobs.length; i++) {
    const { slug, name } = jobs[i]
    const r = await processOneLabel({
      slug,
      labelName: name,
      sb,
      serpKey,
      maxCandidates,
      flags,
      quiet,
    })
    if (r.ok) ok++
    else fail++
    if (i < jobs.length - 1 && delayMs > 0) await sleep(delayMs)
  }

  if (!quiet) {
    console.log(`\nListo: ${ok} ok, ${fail} errores (${jobs.length} procesados)`)
  }
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
