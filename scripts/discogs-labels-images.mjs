/**
 * OPTIMAL BREAKS — Recupera logos de sellos desde Discogs (label.images).
 *
 * Para cada sello de public.labels con `discogs_id` pero SIN `image_url`
 * (o con `--all`), consulta https://api.discogs.com/labels/<id>, elige la
 * imagen primaria (o la primera disponible), la descarga desde la CDN
 * pública de Discogs (i.discogs.com), la sube al bucket `media`
 * (labels/<slug>/logo.<ext>) y actualiza `image_url` en Supabase + el JSON
 * local en data/labels/<slug>.json.
 *
 * Índice: scripts/guia-base-datos.mjs → run labels-discogs-images [flags]
 *
 * Uso:
 *   node scripts/discogs-labels-images.mjs                     # dry-run, solo sellos sin image_url
 *   node scripts/discogs-labels-images.mjs --apply             # sube a Storage + UPSERT
 *   node scripts/discogs-labels-images.mjs --slug against-the-grain --apply
 *   node scripts/discogs-labels-images.mjs --limit 20 --apply
 *   node scripts/discogs-labels-images.mjs --all --apply       # fuerza re-descarga aunque haya image_url
 *
 * Credenciales:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY        (obligatorias)
 *   DISCOGS_TOKEN                                               (MUY recomendado:
 *     sin token, /labels/<id> suele devolver 401 para las imágenes.)
 *
 * Rate-limit Discogs: 25 req/min sin token, 60 con token. Usamos 2500ms / 1100ms.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { upsertLabel } from './lib/label-upsert.mjs'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'
import { uploadLabelLogoFromUrl } from './lib/upload-artist-portrait-to-storage.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const LABELS_DIR = join(ROOT, 'data', 'labels')

const USER_AGENT = 'OptimalBreaks/1.0 (+https://www.optimalbreaks.com)'
const DISCOGS_BASE = 'https://api.discogs.com'

// Orden canónico (igual que discogs-find-labels.mjs) para diffs legibles.
const CANONICAL_KEYS = [
  'slug',
  'name',
  'country',
  'founded_year',
  'description_en',
  'description_es',
  'image_url',
  'og_image_url',
  'website',
  'discogs_id',
  'discogs_url',
  'beatport_id',
  'beatport_url',
  'key_artists',
  'key_releases',
  'is_active',
  'is_featured',
]

function parseArgs(argv) {
  const opts = { apply: false, all: false, slug: null, limit: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') opts.apply = true
    else if (a === '--all') opts.all = true
    else if (a === '--slug') opts.slug = (argv[++i] || '').trim()
    else if (a === '--limit') opts.limit = Number(argv[++i])
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 28).join('\n'))
      process.exit(0)
    } else {
      console.error('Flag desconocida:', a)
      process.exit(1)
    }
  }
  return opts
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function applyCanonicalKeyOrder(obj) {
  const out = {}
  for (const k of CANONICAL_KEYS) if (k in obj) out[k] = obj[k]
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k]
  return out
}

function updateLocalJson(slug, patch) {
  const p = join(LABELS_DIR, `${slug}.json`)
  if (!existsSync(p)) return { path: p, wrote: false, reason: 'no-json' }
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  const merged = applyCanonicalKeyOrder({ ...raw, ...patch })
  writeFileSync(p, JSON.stringify(merged, null, 2) + '\n', 'utf8')
  return { path: p, wrote: true }
}

async function discogsGetLabel({ id, token }) {
  const url = new URL(`${DISCOGS_BASE}/labels/${id}`)
  if (token) url.searchParams.set('token', token)
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  })
  if (res.status === 429) {
    const err = new Error('Discogs 429 (rate limit)')
    err.retryable = true
    throw err
  }
  if (res.status === 404) {
    const err = new Error(`Discogs label #${id} no existe (404)`)
    err.notFound = true
    throw err
  }
  if (!res.ok) {
    throw new Error(`Discogs HTTP ${res.status}: ${await res.text().catch(() => '')}`)
  }
  return res.json()
}

/** Elige la mejor URL de imagen pública (uri) del array de images de Discogs. */
function pickBestImage(images) {
  if (!Array.isArray(images) || images.length === 0) return null
  const primary = images.find((im) => im?.type === 'primary' && typeof im?.uri === 'string' && im.uri.trim())
  if (primary) return primary.uri.trim()
  const anyUri = images.find((im) => typeof im?.uri === 'string' && im.uri.trim())
  if (anyUri) return anyUri.uri.trim()
  // Fallback: uri150 (thumbnail) si no hay uri.
  const thumb = images.find((im) => typeof im?.uri150 === 'string' && im.uri150.trim())
  return thumb ? thumb.uri150.trim() : null
}

async function fetchAllLabels(supabase) {
  const { data, error } = await supabase
    .from('labels')
    .select('slug, name, country, image_url, discogs_id, discogs_url')
    .order('name', { ascending: true })
  if (error) throw new Error(`Supabase labels: ${error.message}`)
  return data || []
}

function hasUsableImageUrl(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v) return false
  return /^https?:\/\//i.test(v) || v.startsWith('/images/')
}

async function main() {
  loadEnvLocal()
  const opts = parseArgs(process.argv)

  const creds = supabaseApiCredentials()
  if (!creds) {
    console.error(
      'Faltan credenciales: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY).',
    )
    process.exit(1)
  }
  const supabase = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const token = (process.env.DISCOGS_TOKEN || '').trim() || null
  const throttleMs = token ? 1100 : 2500

  if (!token) {
    console.log(
      '⚠ Sin DISCOGS_TOKEN: Discogs suele devolver images=[] en /labels/<id> sin auth. ' +
        'Añade DISCOGS_TOKEN a .env.local para tener imágenes.',
    )
  }

  let labels = await fetchAllLabels(supabase)
  if (opts.slug) labels = labels.filter((l) => l.slug === opts.slug)
  // Solo candidatos con discogs_id (sin él no podemos ir a /labels/<id>).
  labels = labels.filter((l) => Number.isFinite(Number(l.discogs_id)) && Number(l.discogs_id) > 0)
  // Salvo --all, procesa solo los que no tienen una image_url utilizable.
  if (!opts.all) labels = labels.filter((l) => !hasUsableImageUrl(l.image_url))
  if (opts.limit && Number.isFinite(opts.limit)) labels = labels.slice(0, opts.limit)

  if (!labels.length) {
    console.log('No hay sellos con discogs_id que necesiten imagen. (Usa --all para re-descargar.)')
    return
  }

  console.log(`Recuperando imágenes Discogs de ${labels.length} sello(s)${token ? ' [con token]' : ' [sin token]'}`)
  console.log(`Modo: ${opts.apply ? 'APPLY (Storage + UPSERT + JSON)' : 'DRY-RUN (solo log)'}`)
  console.log(`Throttle: ${throttleMs}ms entre peticiones\n`)

  const summary = { applied: [], noImage: [], errored: [], skipped: [], dryrun: [] }

  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]
    const tag = `[${i + 1}/${labels.length}] ${l.name} (#${l.discogs_id})`

    let labelData
    try {
      labelData = await discogsGetLabel({ id: Number(l.discogs_id), token })
    } catch (err) {
      if (err.retryable) {
        console.log(`${tag}\n  … 429 rate-limit, espero 30s y reintento\n`)
        await sleep(30_000)
        try {
          labelData = await discogsGetLabel({ id: Number(l.discogs_id), token })
        } catch (e2) {
          console.log(`${tag}\n  ✗ Error Discogs: ${e2.message}\n`)
          summary.errored.push(l.slug)
          await sleep(throttleMs)
          continue
        }
      } else {
        console.log(`${tag}\n  ✗ Error Discogs: ${err.message}\n`)
        summary.errored.push(l.slug)
        await sleep(throttleMs)
        continue
      }
    }

    const sourceUrl = pickBestImage(labelData?.images)
    if (!sourceUrl) {
      console.log(`${tag}\n  · Discogs no devuelve imagen (images=${Array.isArray(labelData?.images) ? labelData.images.length : 'n/a'})\n`)
      summary.noImage.push(l.slug)
      await sleep(throttleMs)
      continue
    }

    console.log(`${tag}\n  → imagen: ${sourceUrl}`)

    if (!opts.apply) {
      summary.dryrun.push({ slug: l.slug, source: sourceUrl })
      console.log('')
      await sleep(throttleMs)
      continue
    }

    try {
      const publicUrl = await uploadLabelLogoFromUrl({
        slug: l.slug,
        sourceUrl,
        quiet: true,
      })
      console.log(`     Storage OK → ${publicUrl}`)

      const jsonResult = updateLocalJson(l.slug, { image_url: publicUrl })
      if (jsonResult.wrote) console.log(`     JSON actualizado: ${jsonResult.path}`)

      const row = await upsertLabel({
        slug: l.slug,
        name: l.name,
        image_url: publicUrl,
      })
      console.log(`     Supabase UPSERT OK (id=${row.id})\n`)
      summary.applied.push({ slug: l.slug, image_url: publicUrl })
    } catch (err) {
      console.log(`     ✗ Error aplicando: ${err.message}\n`)
      summary.errored.push(l.slug)
    }

    await sleep(throttleMs)
  }

  console.log('='.repeat(60))
  console.log('Resumen:')
  console.log(`  Aplicados (Storage+BD+JSON): ${summary.applied.length}`)
  console.log(`  Dry-run (URL detectada):     ${summary.dryrun.length}`)
  console.log(`  Sin imagen en Discogs:       ${summary.noImage.length}`)
  console.log(`  Con error:                   ${summary.errored.length}`)
  console.log(`  Saltados:                    ${summary.skipped.length}`)

  if (summary.noImage.length) {
    console.log('\nSin imagen en Discogs (posible falta de DISCOGS_TOKEN o Discogs no la tiene):')
    for (const s of summary.noImage) console.log(`  - ${s}`)
  }
  if (summary.errored.length) {
    console.log('\nErrores:')
    for (const s of summary.errored) console.log(`  - ${s}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
