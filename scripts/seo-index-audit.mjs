/**
 * Auditoría de la política de indexación (fase 2 SEO). No escribe en la BD.
 *
 * Réplica de:
 *   · src/lib/index-policy.ts  (wordCount, *Indexability)
 *   · src/lib/event-series.ts  (stem, FESTIVAL_SERIES, eventsOfSeries)
 *   · src/lib/event-agenda.ts  (slugifyCity, buildCityBuckets, buildMonthBuckets)
 *
 * Los umbrales numéricos y FESTIVAL_SERIES se leen de esos archivos al arrancar
 * para no divergir de lo que publican las páginas y el sitemap.
 *
 *   node scripts/seo-index-audit.mjs
 * TLS Acttax: node --use-system-ca … o NODE_TLS_REJECT_UNAUTHORIZED=0
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

function loadEnv() {
  const base = existsSync(join(ROOT, '.env')) ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8')) : {}
  const local = existsSync(join(ROOT, '.env.local')) ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8')) : {}
  const merged = { ...base, ...local }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function readSrc(rel) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function loadNumber(src, name) {
  const m = src.match(new RegExp(`export const ${name} = (\\d+)`))
  if (!m) throw new Error(`No encuentro ${name} en el fuente`)
  return Number(m[1])
}

function loadBool(src, name) {
  const m = src.match(new RegExp(`export const ${name} = (true|false)`))
  if (!m) throw new Error(`No encuentro ${name} en el fuente`)
  return m[1] === 'true'
}

function loadFestivalSeries(src) {
  const start = src.indexOf('export const FESTIVAL_SERIES')
  const end = src.indexOf('export function festivalSeriesBySlug')
  if (start < 0 || end < 0) throw new Error('No encuentro FESTIVAL_SERIES')
  const block = src.slice(start, end)
  const series = []
  const re = /\{\s*slug:\s*'([^']+)',\s*name:\s*'([^']*)',\s*aliases:\s*\[([^\]]*)\]/g
  let m
  while ((m = re.exec(block))) {
    const aliases = []
    const ar = /'([^']*)'/g
    let a
    while ((a = ar.exec(m[3]))) aliases.push(a[1])
    series.push({ slug: m[1], name: m[2], aliases })
  }
  if (!series.length) throw new Error('FESTIVAL_SERIES vacío')
  return series
}

// ── Réplica de src/lib/index-policy.ts ──

function wordCount(text) {
  if (!text) return 0
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9\u00C0-\u024F]/.test(w)).length
}

function normalizedForCompare(text) {
  return (text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function isRealTranslation(text, other) {
  const a = normalizedForCompare(text)
  if (!a) return false
  return a !== normalizedForCompare(other)
}

function monthsAgoYmd(months) {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

function artistIndexability(a, policy) {
  if (!policy.enabled) return { es: true, en: true }
  return {
    es: wordCount(a.bio_es) >= policy.artistMin,
    en: wordCount(a.bio_en) >= policy.artistMin && isRealTranslation(a.bio_en, a.bio_es),
  }
}

function labelIndexability(l, policy) {
  if (!policy.enabled) return { es: true, en: true }
  return {
    es: wordCount(l.description_es) >= policy.labelMin,
    en: wordCount(l.description_en) >= policy.labelMin && isRealTranslation(l.description_en, l.description_es),
  }
}

function blogIndexability(p, policy) {
  if (!policy.enabled) return { es: true, en: true }
  return {
    es: wordCount(p.content_es) >= policy.blogMin,
    en: wordCount(p.content_en) >= policy.blogMin && isRealTranslation(p.content_en, p.content_es),
  }
}

function eventIndexability(e, policy) {
  if (!policy.enabled) return { es: true, en: true }
  const last = (e.date_end || e.date_start || '').slice(0, 10)
  const stale = Boolean(last) && last < monthsAgoYmd(policy.eventStaleMonths)
  const hasLineup = (e.lineup?.length ?? 0) > 0
  if (!stale || hasLineup) return { es: true, en: true }
  return {
    es: wordCount(e.description_es) >= policy.eventMinDesc,
    en: wordCount(e.description_en) >= policy.eventMinDesc && isRealTranslation(e.description_en, e.description_es),
  }
}

// ── Réplica de src/lib/event-series.ts ──

function eventSeriesStem(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function festivalSeriesForEventName(name, seriesList) {
  const stem = ` ${eventSeriesStem(name)} `
  for (const series of seriesList) {
    if (series.aliases.some((alias) => stem.includes(` ${alias} `))) return series
  }
  return null
}

function eventsOfSeries(series, events, seriesList) {
  return events
    .filter((e) => festivalSeriesForEventName(e.name, seriesList)?.slug === series.slug)
    .sort((a, b) => String(b.date_start ?? '').localeCompare(String(a.date_start ?? '')))
}

// ── Réplica de src/lib/event-agenda.ts ──
// CITY_ALIASES y ANDALUSIAN_CITIES: copia de ese archivo.

const CITY_ALIASES = {
  seville: 'sevilla',
  cordova: 'cordoba',
  cadis: 'cadiz',
  londres: 'london',
  'nueva-york': 'new-york',
  'new-york-city': 'new-york',
  nyc: 'new-york',
}

function slugifyCity(city) {
  const base = (city ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return CITY_ALIASES[base] ?? base
}

function cityDisplayName(events) {
  const counts = new Map()
  for (const e of events) {
    const c = (e.city ?? '').trim()
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  let best = ''
  let bestN = -1
  for (const [name, n] of counts) {
    const accentBonus = name !== name.normalize('NFD').replace(/[\u0300-\u036f]/g, '') ? 0.5 : 0
    if (n + accentBonus > bestN) {
      best = name
      bestN = n + accentBonus
    }
  }
  return best
}

function todayYmdMadrid() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function isUpcomingOrOngoing(e, today) {
  const last = (e.date_end || e.date_start || '').slice(0, 10)
  return Boolean(last) && last >= today
}

function buildCityBuckets(events, cityMin) {
  const today = todayYmdMadrid()
  const recentCut = monthsAgoYmd(12)
  const byCity = new Map()
  for (const e of events) {
    const slug = slugifyCity(e.city)
    if (!slug) continue
    const list = byCity.get(slug) ?? []
    list.push(e)
    byCity.set(slug, list)
  }
  const out = []
  for (const [slug, list] of byCity) {
    if (list.length < cityMin) continue
    const upcoming = list.filter((e) => isUpcomingOrOngoing(e, today))
    const past = list.filter((e) => !isUpcomingOrOngoing(e, today))
    const alive = upcoming.length > 0 || past.some((e) => (e.date_start ?? '') >= recentCut)
    if (!alive) continue
    out.push({
      slug,
      name: cityDisplayName(list),
      events: list.length,
      upcoming: upcoming.length,
    })
  }
  return out.sort((a, b) => b.upcoming - a.upcoming || b.events - a.events)
}

function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function eventsInMonth(events, key) {
  const first = `${key}-01`
  const next = `${addMonths(key, 1)}-01`
  return events.filter((e) => {
    const start = (e.date_start ?? '').slice(0, 10)
    if (!start) return false
    const end = (e.date_end ?? e.date_start ?? '').slice(0, 10)
    return start < next && end >= first
  })
}

function buildMonthBuckets(events, monthMin, monthsAhead) {
  const start = todayYmdMadrid().slice(0, 7)
  const keys = Array.from({ length: monthsAhead + 1 }, (_, i) => addMonths(start, i))
  return keys
    .map((key) => ({ key, events: eventsInMonth(events, key).length }))
    .filter((b) => b.events >= monthMin)
}

function isEventCancelled(event) {
  const tags = event?.tags
  if (!tags?.length) return false
  return tags.some((tag) => {
    const n = String(tag)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
    return n === 'cancelado' || n === 'cancelled' || n === 'canceled'
  })
}

async function fetchAll(supabase, table, columns, extra) {
  const pageSize = 400
  const out = []
  for (let page = 0; page < 200; page++) {
    const from = page * pageSize
    let q = supabase.from(table).select(columns).order('id', { ascending: true })
    if (extra) q = extra(q)
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

function pct(part, total) {
  if (!total) return '0.0'
  return ((part / total) * 100).toFixed(1)
}

function summarize(label, rows, indexOf, wordsOf) {
  const lines = []
  for (const lang of ['es', 'en']) {
    const total = rows.length
    const indexable = rows.filter((r) => indexOf(r)[lang]).length
    const noindex = total - indexable
    lines.push(
      `  ${lang}: total ${total} · indexables ${indexable} · noindex ${noindex} · ${pct(noindex, total)}% noindex`,
    )
  }
  const noindexEs = rows
    .filter((r) => !indexOf(r).es)
    .map((r) => ({ label: r._label, words: wordsOf(r) }))
    .sort((a, b) => b.words - a.words || a.label.localeCompare(b.label))
  return { header: label, lines, noindexEs }
}

function printBlock(block) {
  console.log(`\n${block.header}`)
  for (const line of block.lines) console.log(line)
  console.log(`  noindex es (${block.noindexEs.length}), de más a menos palabras:`)
  if (!block.noindexEs.length) console.log('    (ninguna)')
  for (const row of block.noindexEs) console.log(`    ${String(row.words).padStart(5, ' ')}  ${row.label}`)
}

function artistThresholdScan(artists, current) {
  const words = artists.map((a) => wordCount(a.bio_es)).sort((a, b) => a - b)
  const at = (p) => words[Math.min(words.length - 1, Math.floor((words.length - 1) * p))] ?? 0
  const rate = (min) => {
    const noindex = words.filter((n) => n < min).length
    return noindex / (words.length || 1)
  }
  console.log('\nDistribución de palabras en bio_es (artistas):')
  console.log(`  p25=${at(0.25)}  p50=${at(0.5)}  p75=${at(0.75)}  vacío=${words.filter((n) => n === 0).length}`)
  console.log(`  Umbral actual ARTIST_MIN_BIO_WORDS=${current} → ${pct(rate(current) * words.length, words.length)}% noindex es`)
  const candidates = [20, 30, 40, 50, 60, 80]
  console.log('  Misma regla, otros umbrales (solo es, sin tocar el archivo):')
  for (const n of candidates) {
    console.log(`    ${String(n).padStart(3, ' ')} palabras → ${pct(rate(n) * words.length, words.length)}% noindex es`)
  }
  const under = candidates.filter((n) => rate(n) <= 0.5)
  if (rate(current) > 0.5) {
    const proposed = under.length ? under[under.length - 1] : null
    console.log('\nAVISO: más del 50% de artistas quedarían noindex en español.')
    if (proposed != null) {
      console.log(
        `Propuesta: bajar ARTIST_MIN_BIO_WORDS de ${current} a ${proposed} en src/lib/index-policy.ts (el mayor múltiplo de 10 de la lista que deja el noindex es en 50% o menos). No lo he cambiado.`,
      )
    } else {
      console.log(
        'Ni con 20 palabras baja del 50%: hay muchas bios vacías o muy cortas. Bajar el umbral no arregla el índice; haría falta completar bios. No he cambiado el umbral.',
      )
    }
  }
}

async function main() {
  loadEnv()
  const policySrc = readSrc('src/lib/index-policy.ts')
  const seriesSrc = readSrc('src/lib/event-series.ts')
  const agendaSrc = readSrc('src/lib/event-agenda.ts')
  const policy = {
    enabled: loadBool(policySrc, 'INDEX_POLICY_ENABLED'),
    artistMin: loadNumber(policySrc, 'ARTIST_MIN_BIO_WORDS'),
    labelMin: loadNumber(policySrc, 'LABEL_MIN_DESC_WORDS'),
    blogMin: loadNumber(policySrc, 'BLOG_MIN_WORDS'),
    eventStaleMonths: loadNumber(policySrc, 'EVENT_STALE_MONTHS'),
    eventMinDesc: loadNumber(policySrc, 'EVENT_MIN_DESC_WORDS'),
  }
  const cityMin = loadNumber(agendaSrc, 'CITY_MIN_EVENTS')
  const monthMin = loadNumber(agendaSrc, 'MONTH_MIN_EVENTS')
  const monthsAhead = loadNumber(agendaSrc, 'MONTHS_AHEAD')
  const seriesList = loadFestivalSeries(seriesSrc)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY) en .env.local')

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const REDIRECTED_BLOG =
    'que-es-el-breakbeat-guia-clara-para-entender-el-genero-sus-raices-y-su-evolucion'

  const [artists, labels, blog, events] = await Promise.all([
    fetchAll(supabase, 'artists', 'slug, name, bio_es, bio_en'),
    fetchAll(supabase, 'labels', 'slug, name, description_es, description_en'),
    fetchAll(supabase, 'blog_posts', 'slug, title_es, content_es, content_en, is_published', (q) =>
      q.eq('is_published', true),
    ),
    fetchAll(
      supabase,
      'events',
      'slug, name, date_start, date_end, description_es, description_en, lineup, event_type, city, tags',
    ),
  ])

  const blogRows = blog.filter((p) => p.slug !== REDIRECTED_BLOG)
  const redirected = blog.find((p) => p.slug === REDIRECTED_BLOG)

  console.log('Política leída de src/lib/index-policy.ts')
  console.log(
    `  INDEX_POLICY_ENABLED=${policy.enabled}  artistas≥${policy.artistMin}  sellos≥${policy.labelMin}  blog≥${policy.blogMin}  eventos: >${policy.eventStaleMonths} meses y desc≥${policy.eventMinDesc} (si no hay cartel)`,
  )
  console.log(`Agenda: CITY_MIN_EVENTS=${cityMin}  MONTH_MIN_EVENTS=${monthMin}  MONTHS_AHEAD=${monthsAhead} (src/lib/event-agenda.ts)`)
  console.log(`Series leídas: ${seriesList.length} (src/lib/event-series.ts)`)

  const blocks = [
    summarize(
      'ARTISTAS',
      artists.map((a) => ({ ...a, _label: `${a.slug}  ${a.name ?? ''}` })),
      (a) => artistIndexability(a, policy),
      (a) => wordCount(a.bio_es),
    ),
    summarize(
      'SELLOS',
      labels.map((l) => ({ ...l, _label: `${l.slug}  ${l.name ?? ''}` })),
      (l) => labelIndexability(l, policy),
      (l) => wordCount(l.description_es),
    ),
    summarize(
      'BLOG (publicados, sin el post redirigido a /breakbeat)',
      blogRows.map((p) => ({ ...p, _label: `${p.slug}  ${p.title_es ?? ''}` })),
      (p) => blogIndexability(p, policy),
      (p) => wordCount(p.content_es),
    ),
    summarize(
      'EVENTOS',
      events.map((e) => ({ ...e, _label: `${e.slug}  ${e.name ?? ''}` })),
      (e) => eventIndexability(e, policy),
      (e) => wordCount(e.description_es),
    ),
  ]
  for (const block of blocks) printBlock(block)
  if (redirected) {
    console.log(`\nPost redirigido (excluido del recuento y del sitemap): ${REDIRECTED_BLOG}`)
    console.log(`  palabras es=${wordCount(redirected.content_es)} en=${wordCount(redirected.content_en)}`)
  } else {
    console.log(`\nPost redirigido: no está publicado (o no existe) — ${REDIRECTED_BLOG}`)
  }

  console.log('\nSERIES DE FESTIVAL')
  for (const series of seriesList) {
    const editions = eventsOfSeries(series, events, seriesList)
    console.log(`\n  ${series.slug} (${series.name}) — ${editions.length} ediciones — aliases: ${series.aliases.join(' | ')}`)
    for (const e of editions) {
      console.log(`    ${(e.date_start ?? '????-??-??').slice(0, 10)}  ${e.name}`)
    }
  }
  const unmatched = events
    .filter((e) => e.event_type === 'festival' && !festivalSeriesForEventName(e.name, seriesList))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))
  console.log(`\nFestivales (event_type=festival) que no encajan en ninguna serie: ${unmatched.length}`)
  for (const e of unmatched) {
    console.log(`  ${(e.date_start ?? '????-??-??').slice(0, 10)}  ${e.name}  [${e.slug}]`)
  }

  const open = events.filter((e) => !isEventCancelled(e))
  const cities = buildCityBuckets(open, cityMin)
  const months = buildMonthBuckets(open, monthMin, monthsAhead)
  console.log(`\nCIUDADES PUBLICABLES (${cities.length}, sin cancelados, mínimo ${cityMin})`)
  for (const c of cities) console.log(`  ${c.slug}  ${c.name}  ${c.events} eventos (${c.upcoming} próximos)`)
  console.log(`\nMESES PUBLICABLES (${months.length}, sin cancelados, mínimo ${monthMin})`)
  for (const m of months) console.log(`  ${m.key}  ${m.events} eventos`)

  artistThresholdScan(artists, policy.artistMin)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
