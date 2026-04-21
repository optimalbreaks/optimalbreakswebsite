/**
 * OPTIMAL BREAKS — Busca en Discogs ficha para cada sello de la BD.
 *
 * Índice: scripts/guia-base-datos.mjs → run labels-discogs [flags]
 *
 * Uso:
 *   node scripts/discogs-find-labels.mjs                    # dry-run, solo sellos sin discogs_url
 *   node scripts/discogs-find-labels.mjs --apply            # escribe JSON + UPSERT
 *   node scripts/discogs-find-labels.mjs --slug lot49       # solo un slug
 *   node scripts/discogs-find-labels.mjs --limit 20         # primeros 20 pendientes
 *   node scripts/discogs-find-labels.mjs --all --apply      # procesa TODOS (también los ya enlazados)
 *   node scripts/discogs-find-labels.mjs --strict --apply   # solo aplica si coincidencia EXACTA por nombre
 *
 * Credenciales:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  (obligatorias)
 *   DISCOGS_TOKEN                                         (opcional, sube rate 25→60 req/min)
 *
 * Rate-limit Discogs: 25 req/min sin token, 60 con token (https://www.discogs.com/developers/).
 * Usamos 2500ms sin token, 1100ms con token.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { upsertLabel } from './lib/label-upsert.mjs'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const LABELS_DIR = join(ROOT, 'data', 'labels')

const USER_AGENT = 'OptimalBreaks/1.0 (+https://www.optimalbreaks.com)'
const DISCOGS_BASE = 'https://api.discogs.com'

// Orden canónico de claves para data/labels/<slug>.json (legibilidad de diffs)
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
  const opts = {
    apply: false,
    all: false,
    strict: false,
    slug: null,
    limit: null,
    perPage: 5,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') opts.apply = true
    else if (a === '--all') opts.all = true
    else if (a === '--strict') opts.strict = true
    else if (a === '--slug') opts.slug = (argv[++i] || '').trim()
    else if (a === '--limit') opts.limit = Number(argv[++i])
    else if (a === '--per-page') opts.perPage = Math.max(1, Math.min(25, Number(argv[++i]) || 5))
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 24).join('\n'))
      process.exit(0)
    } else {
      console.error('Flag desconocida:', a)
      process.exit(1)
    }
  }
  return opts
}

/** Normaliza un nombre de sello (con espacios) para matching laxo. */
function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // diacríticos
    .replace(/\s*\(\d+\)\s*$/, '') // "Foo (2)" → "Foo"
    .replace(/^the\s+/, '') // "The Acme" === "Acme"
    .replace(/\brecord(ing)?s?\b/g, '') // "Acme Records" === "Acme Recordings" === "Acme"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Variante sin espacios, para cubrir casos tipo "13monkeys" vs "13 Monkeys". */
function normalizeNameCompact(name) {
  return normalizeName(name).replace(/\s+/g, '')
}

/** Coincidencia equivalente por cualquiera de las dos normalizaciones. */
function namesEqual(a, b) {
  return normalizeName(a) === normalizeName(b) || normalizeNameCompact(a) === normalizeNameCompact(b)
}

/** Construye URL pública de Discogs a partir del resultado de /database/search. */
function publicDiscogsUrl(searchHit) {
  if (searchHit?.uri) {
    const path = searchHit.uri.startsWith('/') ? searchHit.uri : `/${searchHit.uri}`
    return `https://www.discogs.com${path}`
  }
  if (searchHit?.id && searchHit?.title) {
    const safe = String(searchHit.title).replace(/\s+/g, '-').replace(/[^A-Za-z0-9-]/g, '')
    return `https://www.discogs.com/label/${searchHit.id}-${safe}`
  }
  return null
}

async function discogsSearchLabel({ name, perPage, token }) {
  const url = new URL(`${DISCOGS_BASE}/database/search`)
  url.searchParams.set('q', name)
  url.searchParams.set('type', 'label')
  url.searchParams.set('per_page', String(perPage))
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
  if (!res.ok) {
    throw new Error(`Discogs HTTP ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const data = await res.json()
  return Array.isArray(data?.results) ? data.results : []
}

/**
 * Dado el sello de nuestra BD y los resultados de búsqueda, decide:
 *  - match exacto (auto-aplicar)
 *  - ambiguo (listar top candidatos)
 *  - sin resultados
 */
function pickBestMatch(dbLabel, hits) {
  if (!hits.length) return { kind: 'none', hits: [] }
  const exacts = hits.filter((h) => namesEqual(h.title, dbLabel.name))

  const chooseByCountry = (candidates) => {
    if (dbLabel.country && candidates.length > 1) {
      const c = dbLabel.country.toUpperCase()
      const sameCountry = candidates.filter(
        (h) => (h.country || '').toUpperCase().startsWith(c.slice(0, 2)),
      )
      if (sameCountry.length === 1) return sameCountry[0]
    }
    return candidates[0]
  }

  if (exacts.length >= 1) {
    const picked = chooseByCountry(exacts)
    return { kind: exacts.length === 1 ? 'exact' : 'exact-tie', picked, hits: exacts.slice(0, 3) }
  }
  return { kind: 'fuzzy', picked: null, hits: hits.slice(0, 3) }
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

async function fetchAllLabels(supabase) {
  const { data, error } = await supabase
    .from('labels')
    .select('slug, name, country, discogs_id, discogs_url')
    .order('name', { ascending: true })
  if (error) throw new Error(`Supabase labels: ${error.message}`)
  return data || []
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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

  let labels = await fetchAllLabels(supabase)
  if (opts.slug) labels = labels.filter((l) => l.slug === opts.slug)
  if (!opts.all) labels = labels.filter((l) => !l.discogs_url)
  if (opts.limit && Number.isFinite(opts.limit)) labels = labels.slice(0, opts.limit)

  if (!labels.length) {
    console.log('No hay sellos pendientes de Discogs. (Usa --all para re-matchear ya enlazados.)')
    return
  }

  console.log(`Buscando en Discogs ${labels.length} sello(s)${token ? ' [con token]' : ' [sin token]'}`)
  console.log(`Modo: ${opts.apply ? 'APPLY (escribe JSON + UPSERT)' : 'DRY-RUN'}${opts.strict ? ' · STRICT (solo exactos)' : ''}`)
  console.log(`Throttle: ${throttleMs}ms entre peticiones\n`)

  const summary = { exact: [], ambiguous: [], none: [], already: [], errored: [], applied: [] }

  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]
    const tag = `[${i + 1}/${labels.length}] ${l.name}${l.country ? ` (${l.country})` : ''}`
    if (l.discogs_url && !opts.all) {
      console.log(`${tag}\n  ✓ Ya tiene discogs_url (${l.discogs_url}) — skip\n`)
      summary.already.push(l.slug)
      continue
    }

    let hits = []
    try {
      hits = await discogsSearchLabel({ name: l.name, perPage: opts.perPage, token })
    } catch (err) {
      if (err.retryable) {
        console.log(`${tag}\n  … 429 rate-limit, esperando 30s y reintentando\n`)
        await sleep(30_000)
        try {
          hits = await discogsSearchLabel({ name: l.name, perPage: opts.perPage, token })
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

    const verdict = pickBestMatch(l, hits)
    if (verdict.kind === 'none') {
      console.log(`${tag}\n  ✗ Sin resultados en Discogs\n`)
      summary.none.push(l.slug)
      await sleep(throttleMs)
      continue
    }
    if (verdict.kind === 'fuzzy') {
      const topLines = verdict.hits.map(
        (h) => `     · #${h.id} ${h.title}${h.country ? ` [${h.country}]` : ''}  ${publicDiscogsUrl(h)}`,
      )
      console.log(`${tag}\n  ? Sin match exacto (candidatos):\n${topLines.join('\n')}\n`)
      summary.ambiguous.push({ slug: l.slug, candidates: verdict.hits })
      await sleep(throttleMs)
      continue
    }

    const picked = verdict.picked
    const discogsUrl = publicDiscogsUrl(picked)
    const discogsId = Number(picked.id)
    const extra = verdict.kind === 'exact-tie'
      ? ` (desempate por país sobre ${verdict.hits.length} coincidencias exactas)`
      : ''
    console.log(
      `${tag}\n  → MATCH${verdict.kind === 'exact' ? '' : ' (tie)'}: #${discogsId} ${picked.title}${picked.country ? ` [${picked.country}]` : ''}${extra}\n     ${discogsUrl}`,
    )

    if (!opts.apply) {
      summary.exact.push({ slug: l.slug, discogs_id: discogsId, discogs_url: discogsUrl })
      console.log('')
      await sleep(throttleMs)
      continue
    }

    if (opts.strict && verdict.kind !== 'exact') {
      console.log('  ↷ --strict activo, no aplica desempate\n')
      summary.ambiguous.push({ slug: l.slug, candidates: verdict.hits })
      await sleep(throttleMs)
      continue
    }

    try {
      const jsonResult = updateLocalJson(l.slug, {
        discogs_id: discogsId,
        discogs_url: discogsUrl,
      })
      if (jsonResult.wrote) {
        console.log(`     JSON actualizado: ${jsonResult.path}`)
      } else {
        console.log(`     JSON local no existe (${jsonResult.path}), UPSERT directo.`)
      }

      const row = await upsertLabel({
        slug: l.slug,
        name: l.name,
        discogs_id: discogsId,
        discogs_url: discogsUrl,
      })
      console.log(`     Supabase UPSERT OK (id=${row.id})\n`)
      summary.applied.push({ slug: l.slug, discogs_id: discogsId })
    } catch (err) {
      console.log(`     ✗ Error aplicando: ${err.message}\n`)
      summary.errored.push(l.slug)
    }

    await sleep(throttleMs)
  }

  console.log('='.repeat(60))
  console.log('Resumen:')
  console.log(`  Aplicados (JSON+BD):   ${summary.applied.length}`)
  console.log(`  Match exacto (dry):    ${summary.exact.length}`)
  console.log(`  Ambiguos:              ${summary.ambiguous.length}`)
  console.log(`  Sin resultados:        ${summary.none.length}`)
  console.log(`  Ya tenían discogs_url: ${summary.already.length}`)
  console.log(`  Con error:             ${summary.errored.length}`)

  if (summary.ambiguous.length) {
    console.log('\nAmbiguos (resolver con --slug <slug> + edición manual del JSON):')
    for (const a of summary.ambiguous) console.log(`  - ${a.slug}`)
  }
  if (summary.none.length) {
    console.log('\nSin match en Discogs:')
    for (const s of summary.none) console.log(`  - ${s}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
