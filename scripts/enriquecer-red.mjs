#!/usr/bin/env node
/**
 * Enriquecimiento de La Red del Break con GPT-5.4.
 *
 * Lee el catálogo completo de Supabase (artistas, sellos, escenas, eventos) y,
 * para cada entidad, pide al modelo que identifique qué OTROS slugs del archivo
 * están relacionados (co-apariciones, sellos con los que trabajó, escenas a las
 * que pertenece, etc.). El modelo SOLO puede devolver slugs del catálogo, no
 * inventa nombres. Las sugerencias con confidence < umbral se descartan.
 *
 * Los resultados se FUSIONAN en columnas existentes (related_artists,
 * labels_founded, key_artists, key_labels, lineup...) con dedupe, y se marca
 * `ai_enriched_at = now()` para trazabilidad.
 *
 * Uso:
 *   node scripts/enriquecer-red.mjs --dry-run
 *   node scripts/enriquecer-red.mjs --only artists --limit 5
 *   node scripts/enriquecer-red.mjs --only artists --slug bubu
 *   node scripts/enriquecer-red.mjs --only labels --country ES
 *   node scripts/enriquecer-red.mjs --min-confidence 0.7
 *
 * Requisitos en .env.local:
 *   OPENAI_API_KEY, OPENAI_MODEL (opcional, por defecto gpt-5.4)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)
 *
 * Coste aproximado con gpt-5.4: ~3-5k tokens input por entidad (si usamos
 * candidatos filtrados). Con prompt caching del catálogo el coste baja.
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadEnvLocal,
  supabaseApiCredentials,
} from './lib/artist-upsert.mjs'

// ============================================
// CLI args
// ============================================

function parseArgs(argv) {
  const out = {
    dryRun: false,
    only: null, // 'artists' | 'labels' | 'scenes' | 'events' | null (todo)
    slug: null,
    country: null,
    limit: null,
    minConfidence: 0.65,
    force: false,
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-5.4',
    concurrency: 2,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--force') out.force = true
    else if (a === '--only') out.only = String(argv[++i] || '').toLowerCase() || null
    else if (a === '--slug') out.slug = String(argv[++i] || '').toLowerCase() || null
    else if (a === '--country') out.country = String(argv[++i] || '').toUpperCase() || null
    else if (a === '--limit') out.limit = Number(argv[++i]) || null
    else if (a === '--min-confidence') out.minConfidence = Number(argv[++i]) || 0.65
    else if (a === '--model') out.model = String(argv[++i] || '').trim() || out.model
    else if (a === '--concurrency') out.concurrency = Math.max(1, Number(argv[++i]) || 2)
    else if (a === '--help' || a === '-h') {
      console.log(
        `\nscripts/enriquecer-red.mjs — agente IA para La Red del Break\n` +
          `\n  --dry-run          No escribe en BD, solo imprime sugerencias` +
          `\n  --only <tipo>      artists | labels | scenes | events (por defecto: todos)` +
          `\n  --slug <slug>      Procesa solo esa entidad (combinable con --only)` +
          `\n  --country <ISO>    Filtra por país (ej: ES, UK, US)` +
          `\n  --limit <N>        Máximo N entidades por tipo` +
          `\n  --min-confidence F Umbral 0–1 (default 0.65)` +
          `\n  --force            Reprocesa aunque ai_enriched_at < 30 días` +
          `\n  --model <name>     Override OPENAI_MODEL (default ${out.model})` +
          `\n  --concurrency <N>  Requests OpenAI simultáneos (default 2)\n`,
      )
      process.exit(0)
    }
  }
  return out
}

// ============================================
// Supabase helpers
// ============================================

async function loadAllCatalog(supabase) {
  const [aRes, lRes, eRes, sRes] = await Promise.all([
    supabase
      .from('artists')
      .select(
        'id, slug, name, name_display, country, category, era, styles, bio_es, bio_en, related_artists, labels_founded, ai_enriched_at',
      )
      .order('slug'),
    supabase
      .from('labels')
      .select(
        'id, slug, name, country, founded_year, key_artists, description_es, description_en, ai_enriched_at',
      )
      .order('slug'),
    supabase
      .from('events')
      .select(
        'id, slug, name, country, city, date_start, event_type, lineup, description_es, description_en, ai_enriched_at',
      )
      .order('slug'),
    supabase
      .from('scenes')
      .select(
        'id, slug, name_es, name_en, country, region, era, key_artists, key_labels, description_es, description_en, ai_enriched_at',
      )
      .order('slug'),
  ])
  if (aRes.error) throw aRes.error
  if (lRes.error) throw lRes.error
  if (eRes.error) throw eRes.error
  if (sRes.error) throw sRes.error
  return {
    artists: aRes.data || [],
    labels: lRes.data || [],
    events: eRes.data || [],
    scenes: sRes.data || [],
  }
}

// ============================================
// Prompt builders
// ============================================

/** Serializa un catálogo a TSV compacto (slug\tname\tcountry\tera). */
function serializeCatalog(artists, labels, scenes, events, { maxEntries = 350 } = {}) {
  const lines = []
  lines.push('# ARTISTS (slug | name | country | era)')
  for (const a of artists.slice(0, maxEntries)) {
    lines.push(`A: ${a.slug} | ${a.name_display || a.name} | ${a.country || ''} | ${a.era || ''}`)
  }
  lines.push('# LABELS (slug | name | country | founded)')
  for (const l of labels.slice(0, maxEntries)) {
    lines.push(`L: ${l.slug} | ${l.name} | ${l.country || ''} | ${l.founded_year || ''}`)
  }
  lines.push('# SCENES (slug | name_en | country | era)')
  for (const s of scenes.slice(0, maxEntries)) {
    lines.push(`S: ${s.slug} | ${s.name_en || s.name_es} | ${s.country || ''} | ${s.era || ''}`)
  }
  lines.push('# EVENTS (slug | name | country | year)')
  for (const e of events.slice(0, maxEntries)) {
    const year = e.date_start ? String(e.date_start).slice(0, 4) : ''
    lines.push(`E: ${e.slug} | ${e.name} | ${e.country || ''} | ${year}`)
  }
  return lines.join('\n')
}

/** Devuelve un catálogo relevante: mismo país/era + hubs globales. */
function buildRelevantCatalog(target, all, opts = {}) {
  const { country = '', era = '' } = opts
  const scored = (arr, weightFn) =>
    arr
      .map((x) => ({ x, w: weightFn(x) }))
      .sort((a, b) => b.w - a.w)
      .map((r) => r.x)

  const byRelevance = (x) => {
    let w = 0
    if (country && x.country && String(x.country).toUpperCase() === country.toUpperCase()) w += 10
    if (era && x.era && String(x.era) === era) w += 5
    w += Number(x.degree || 0) * 0.01
    return w
  }
  return {
    artists: scored(all.artists, byRelevance).slice(0, 250),
    labels: scored(all.labels, byRelevance).slice(0, 150),
    scenes: scored(all.scenes, byRelevance).slice(0, 80),
    events: scored(all.events, byRelevance).slice(0, 150),
  }
}

const SYSTEM_PROMPT = `
Eres un archivero experto en cultura breakbeat (rave UK, big beat, nu skool, hardcore,
electro-funk, breaks andaluces, hip-hop de origen, etc.). Te entregan (a) una ficha de
una entidad del archivo y (b) un catálogo de slugs reales ya existentes en la base de
datos (artistas, sellos, escenas, eventos). Tu tarea: decir con qué slugs del catálogo
está MEJOR conectada la entidad, con justificación breve y un score 0..1.

Reglas INNEGOCIABLES:
1) SOLO puedes devolver slugs que aparezcan LITERALMENTE en el catálogo. Si dudas, omítelo.
2) No inventes personas, sellos, escenas ni eventos.
3) No añadas slugs "meta" (ej. no repitas la propia entidad).
4) Prioriza conexiones con evidencia real (firmó en ese sello, remix cruzado, mismo
   cartel recurrente, co-productores habituales, pertenencia clara a esa escena, etc.).
5) Escena: si el artista pertenece claramente a una escena (nu skool UK, big beat UK,
   andalusian rave, bronx hip-hop, uk hardcore...), inclúyela.
6) Usa confidence alta (0.8+) solo cuando haya evidencia de dominio público.
   Cosas "posibles" pero dudosas: confidence 0.55–0.7.
7) Devuelve SIEMPRE JSON válido, nada más. NO añadas texto fuera del JSON.

Formato JSON estricto (omite claves vacías):
{
  "related_artists": [{"slug":"...","confidence":0.9,"evidence":"..."}],
  "labels": [{"slug":"...","confidence":0.9,"evidence":"..."}],
  "scenes": [{"slug":"...","confidence":0.9,"evidence":"..."}],
  "events": [{"slug":"...","confidence":0.9,"evidence":"..."}]
}
`.trim()

function buildUserPrompt(entityDesc, catalogText) {
  return [
    '## ENTIDAD OBJETIVO',
    entityDesc,
    '',
    '## CATÁLOGO DISPONIBLE (slugs reales — SOLO puedes referenciar estos)',
    catalogText,
    '',
    'Devuelve JSON con los slugs del catálogo con los que esta entidad está conectada.',
  ].join('\n')
}

// ============================================
// OpenAI
// ============================================

async function callOpenAi({ system, user, model }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY en .env.local')
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
    const txt = await res.text().catch(() => '')
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 400)}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || '{}'
  try {
    return JSON.parse(content)
  } catch {
    const cleaned = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    return JSON.parse(cleaned)
  }
}

// ============================================
// Entity descriptors
// ============================================

function describeArtist(a) {
  const parts = [
    `Tipo: artista`,
    `Slug: ${a.slug}`,
    `Nombre: ${a.name_display || a.name}`,
    `País: ${a.country || '—'}`,
    `Categoría: ${a.category || '—'}`,
    `Era: ${a.era || '—'}`,
    `Estilos: ${(a.styles || []).join(', ') || '—'}`,
    `Relacionados actuales: ${(a.related_artists || []).join(', ') || '—'}`,
    `Sellos fundados/firmados: ${(a.labels_founded || []).join(', ') || '—'}`,
    `Bio ES: ${(a.bio_es || '').trim().slice(0, 1200) || '—'}`,
    `Bio EN: ${(a.bio_en || '').trim().slice(0, 1200) || '—'}`,
  ]
  return parts.join('\n')
}
function describeLabel(l) {
  return [
    `Tipo: sello`,
    `Slug: ${l.slug}`,
    `Nombre: ${l.name}`,
    `País: ${l.country || '—'}`,
    `Fundado: ${l.founded_year || '—'}`,
    `Artistas clave actuales: ${(l.key_artists || []).join(', ') || '—'}`,
    `Descripción ES: ${(l.description_es || '').trim().slice(0, 1200) || '—'}`,
    `Descripción EN: ${(l.description_en || '').trim().slice(0, 1200) || '—'}`,
  ].join('\n')
}
function describeScene(s) {
  return [
    `Tipo: escena`,
    `Slug: ${s.slug}`,
    `Nombre: ${s.name_en || s.name_es}`,
    `País: ${s.country || '—'}`,
    `Región: ${s.region || '—'}`,
    `Era: ${s.era || '—'}`,
    `Artistas clave actuales: ${(s.key_artists || []).join(', ') || '—'}`,
    `Sellos clave actuales: ${(s.key_labels || []).join(', ') || '—'}`,
    `Descripción ES: ${(s.description_es || '').trim().slice(0, 1200) || '—'}`,
    `Descripción EN: ${(s.description_en || '').trim().slice(0, 1200) || '—'}`,
  ].join('\n')
}
function describeEvent(e) {
  return [
    `Tipo: evento`,
    `Slug: ${e.slug}`,
    `Nombre: ${e.name}`,
    `País: ${e.country || '—'}`,
    `Ciudad: ${e.city || '—'}`,
    `Fecha: ${e.date_start || '—'}`,
    `Tipo de evento: ${e.event_type || '—'}`,
    `Lineup actual: ${(e.lineup || []).slice(0, 50).join(', ') || '—'}`,
    `Descripción ES: ${(e.description_es || '').trim().slice(0, 1200) || '—'}`,
    `Descripción EN: ${(e.description_en || '').trim().slice(0, 1200) || '—'}`,
  ].join('\n')
}

// ============================================
// Merge logic
// ============================================

/** Filtra sugerencias por confidence y valida que el slug exista en el catálogo. */
function filterSuggestions(suggestions, catalogSlugs, minConfidence) {
  if (!Array.isArray(suggestions)) return []
  const out = []
  for (const s of suggestions) {
    if (!s || typeof s !== 'object') continue
    const slug = String(s.slug || '').trim().toLowerCase()
    if (!slug) continue
    const conf = Number(s.confidence ?? 0)
    if (!Number.isFinite(conf) || conf < minConfidence) continue
    if (!catalogSlugs.has(slug)) continue
    out.push({ slug, confidence: conf, evidence: String(s.evidence || '').slice(0, 240) })
  }
  return out
}

/**
 * Guard-rail anti-contaminación cross-país.
 * Para escenas territoriales y sellos con país, descarta sugerencias de
 * entidades de otro país. Imprescindible para no mezclar breakbeat UK con
 * sellos andaluces, etc. Si el objetivo no tiene país claro, no filtra.
 */
function normCountryTok(c) {
  if (!c) return ''
  const s = String(c).trim().toUpperCase()
  const MAP = {
    SPAIN: 'ES', ESPAÑA: 'ES', ES: 'ES', ESP: 'ES',
    UK: 'UK', 'UNITED KINGDOM': 'UK', 'GREAT BRITAIN': 'UK',
    ENGLAND: 'UK', SCOTLAND: 'UK', WALES: 'UK', GB: 'UK',
    USA: 'US', 'UNITED STATES': 'US', US: 'US',
    AUSTRALIA: 'AU', AU: 'AU',
    RUSSIA: 'RU', RU: 'RU',
  }
  return MAP[s] || s
}
function filterByCountry(list, targetCountry, lookupBySlug) {
  const tc = normCountryTok(targetCountry)
  if (!tc) return list
  const out = []
  for (const item of list) {
    const row = lookupBySlug(item.slug)
    const rc = normCountryTok(row?.country)
    if (!rc) out.push(item)
    else if (rc === tc) out.push(item)
    // diferente país → se descarta silenciosamente
  }
  return out
}

/** Dedupa un array case-insensitive conservando el orden. */
function uniqCI(list) {
  const seen = new Set()
  const out = []
  for (const x of list || []) {
    const k = typeof x === 'string' ? x.trim() : ''
    if (!k) continue
    const key = k.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(k)
  }
  return out
}

function namesForSlug(type, slug, catalog) {
  const row =
    type === 'artist'
      ? catalog.artists.find((x) => x.slug === slug)
      : type === 'label'
      ? catalog.labels.find((x) => x.slug === slug)
      : type === 'scene'
      ? catalog.scenes.find((x) => x.slug === slug)
      : catalog.events.find((x) => x.slug === slug)
  if (!row) return null
  if (type === 'scene') return row.name_en || row.name_es || row.slug
  return row.name_display || row.name || row.slug
}

// ============================================
// Run
// ============================================

async function main() {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))

  const creds = supabaseApiCredentials()
  if (!creds) {
    throw new Error(
      'Faltan credenciales: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY) en .env.local',
    )
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error('Falta OPENAI_API_KEY en .env.local')
  }
  const supabase = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`\n[enriquecer-red] modelo=${args.model}  dry-run=${args.dryRun}  min-confidence=${args.minConfidence}`)
  console.log('[enriquecer-red] cargando catálogo…')
  const cat = await loadAllCatalog(supabase)
  console.log(
    `[enriquecer-red] catálogo: ${cat.artists.length} artistas · ${cat.labels.length} sellos · ${cat.scenes.length} escenas · ${cat.events.length} eventos`,
  )

  const slugsArtists = new Set(cat.artists.map((x) => x.slug))
  const slugsLabels = new Set(cat.labels.map((x) => x.slug))
  const slugsScenes = new Set(cat.scenes.map((x) => x.slug))
  const slugsEvents = new Set(cat.events.map((x) => x.slug))

  const types = args.only
    ? [args.only]
    : ['artists', 'labels', 'scenes', 'events']

  const THIRTY_DAYS = 30 * 24 * 3600 * 1000
  const now = Date.now()

  const stats = {
    attempted: 0,
    updated: 0,
    addedConns: 0,
    skipped: 0,
    errors: 0,
  }

  for (const type of types) {
    const rows = (cat[type] || []).filter((r) => {
      if (args.slug && r.slug !== args.slug) return false
      if (args.country && (r.country || '').toUpperCase() !== args.country) return false
      if (!args.force && r.ai_enriched_at) {
        const enrichedAt = new Date(r.ai_enriched_at).getTime()
        if (Number.isFinite(enrichedAt) && now - enrichedAt < THIRTY_DAYS) {
          stats.skipped++
          return false
        }
      }
      return true
    })

    const targets = args.limit ? rows.slice(0, args.limit) : rows
    console.log(
      `\n[enriquecer-red] === ${type.toUpperCase()} === a procesar: ${targets.length} (de ${rows.length})`,
    )

    const queue = [...targets]
    const workers = Array.from({ length: args.concurrency }, async () => {
      while (queue.length) {
        const entity = queue.shift()
        if (!entity) break
        try {
          await processEntity(type, entity, {
            supabase,
            catalog: cat,
            slugsArtists,
            slugsLabels,
            slugsScenes,
            slugsEvents,
            args,
            stats,
          })
        } catch (err) {
          stats.errors++
          console.error(
            `[enriquecer-red] ERROR ${type}/${entity.slug}: ${err.message || err}`,
          )
        }
      }
    })
    await Promise.all(workers)
  }

  console.log(
    `\n[enriquecer-red] ✔ fin. intentos=${stats.attempted} · actualizados=${stats.updated} · nuevas conexiones=${stats.addedConns} · saltados=${stats.skipped} · errores=${stats.errors}`,
  )
}

async function processEntity(type, entity, ctx) {
  const {
    supabase,
    catalog,
    slugsArtists,
    slugsLabels,
    slugsScenes,
    slugsEvents,
    args,
    stats,
  } = ctx
  stats.attempted++

  const country = entity.country || ''
  const era = entity.era || ''
  const relevant = buildRelevantCatalog(entity, catalog, { country, era })
  const catalogText = serializeCatalog(
    relevant.artists,
    relevant.labels,
    relevant.scenes,
    relevant.events,
  )

  let entityDesc
  if (type === 'artists') entityDesc = describeArtist(entity)
  else if (type === 'labels') entityDesc = describeLabel(entity)
  else if (type === 'scenes') entityDesc = describeScene(entity)
  else entityDesc = describeEvent(entity)

  const json = await callOpenAi({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(entityDesc, catalogText),
    model: args.model,
  })

  const suggRelatedArtists = filterSuggestions(
    json.related_artists,
    slugsArtists,
    args.minConfidence,
  )
  const suggLabels = filterSuggestions(json.labels, slugsLabels, args.minConfidence)
  const suggScenes = filterSuggestions(json.scenes, slugsScenes, args.minConfidence)
  const suggEvents = filterSuggestions(json.events, slugsEvents, args.minConfidence)

  // No se permite autoenlace
  const selfSlug = entity.slug
  const dropSelf = (arr) => arr.filter((x) => x.slug !== selfSlug)
  let sa = dropSelf(suggRelatedArtists)
  let sl = dropSelf(suggLabels)
  const ss = dropSelf(suggScenes)
  const se = dropSelf(suggEvents)

  // Guard-rail país: escenas territoriales y sellos con país no admiten cross-country.
  if (type === 'scenes' || type === 'labels') {
    const tc = entity.country
    const artistBySlug = (s) => catalog.artists.find((x) => x.slug === s)
    const labelBySlug = (s) => catalog.labels.find((x) => x.slug === s)
    sa = filterByCountry(sa, tc, artistBySlug)
    sl = filterByCountry(sl, tc, labelBySlug)
  }

  // Mapea a nombres con los que se guarda (respetando case del catálogo)
  const namesFrom = (list, kind) =>
    list
      .map((r) => namesForSlug(kind, r.slug, catalog))
      .filter(Boolean)

  const patch = {}
  let addedConns = 0

  if (type === 'artists') {
    const merged = uniqCI([...(entity.related_artists || []), ...namesFrom(sa, 'artist')])
    if (merged.length !== (entity.related_artists || []).length) {
      patch.related_artists = merged
      addedConns += merged.length - (entity.related_artists || []).length
    }
    const mergedLabels = uniqCI([
      ...(entity.labels_founded || []),
      ...namesFrom(sl, 'label'),
    ])
    if (mergedLabels.length !== (entity.labels_founded || []).length) {
      patch.labels_founded = mergedLabels
      addedConns += mergedLabels.length - (entity.labels_founded || []).length
    }
    // Escena y evento: no hay columnas directas en artists. Se reflejarán al enriquecer
    // las fichas de escena/evento (bidireccional).
  } else if (type === 'labels') {
    const merged = uniqCI([...(entity.key_artists || []), ...namesFrom(sa, 'artist')])
    if (merged.length !== (entity.key_artists || []).length) {
      patch.key_artists = merged
      addedConns += merged.length - (entity.key_artists || []).length
    }
  } else if (type === 'scenes') {
    const mergedA = uniqCI([...(entity.key_artists || []), ...namesFrom(sa, 'artist')])
    if (mergedA.length !== (entity.key_artists || []).length) {
      patch.key_artists = mergedA
      addedConns += mergedA.length - (entity.key_artists || []).length
    }
    const mergedL = uniqCI([...(entity.key_labels || []), ...namesFrom(sl, 'label')])
    if (mergedL.length !== (entity.key_labels || []).length) {
      patch.key_labels = mergedL
      addedConns += mergedL.length - (entity.key_labels || []).length
    }
  } else if (type === 'events') {
    const merged = uniqCI([...(entity.lineup || []), ...namesFrom(sa, 'artist')])
    if (merged.length !== (entity.lineup || []).length) {
      patch.lineup = merged
      addedConns += merged.length - (entity.lineup || []).length
    }
  }

  const label = `${type}/${entity.slug}`
  const summary = [
    sa.length ? `${sa.length} artistas` : null,
    sl.length ? `${sl.length} sellos` : null,
    ss.length ? `${ss.length} escenas` : null,
    se.length ? `${se.length} eventos` : null,
  ]
    .filter(Boolean)
    .join(', ')

  if (!Object.keys(patch).length) {
    console.log(`  · ${label}  (sin cambios; modelo sugirió: ${summary || 'nada'})`)
    return
  }

  if (args.dryRun) {
    console.log(
      `  · ${label}  [DRY] +${addedConns} conexiones. Sugerencias: ${summary}`,
    )
    if (patch.related_artists) console.log(`      related_artists: ${patch.related_artists.join(' · ')}`)
    if (patch.labels_founded) console.log(`      labels_founded:  ${patch.labels_founded.join(' · ')}`)
    if (patch.key_artists) console.log(`      key_artists:     ${patch.key_artists.join(' · ')}`)
    if (patch.key_labels) console.log(`      key_labels:      ${patch.key_labels.join(' · ')}`)
    if (patch.lineup) console.log(`      lineup:          ${patch.lineup.join(' · ')}`)
    stats.addedConns += addedConns
    return
  }

  patch.ai_enriched_at = new Date().toISOString()
  const { error } = await supabase.from(type).update(patch).eq('slug', entity.slug)
  if (error) {
    throw new Error(`UPSERT ${type}/${entity.slug}: ${error.message}`)
  }
  stats.updated++
  stats.addedConns += addedConns
  console.log(`  · ${label}  +${addedConns} conexiones. ${summary}`)
}

main().catch((err) => {
  console.error('\n[enriquecer-red] FALLO:', err.message || err)
  process.exit(1)
})
