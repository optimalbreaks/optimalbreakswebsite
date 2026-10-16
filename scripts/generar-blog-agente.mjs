/**
 * OPTIMAL BREAKS — Agente redactor de artículos de blog (OpenAI → blog_posts)
 *
 * Índice: scripts/guia-base-datos.mjs → run blog-agent -- …
 *
 * Uso:
 *   npm run db:blog:agent -- que-es-el-breakbeat "¿Qué es el breakbeat?"
 *   npm run db:blog:agent -- slug "Título ES" [--brief notas.txt] [--featured] [--no-search]
 *   npm run db:blog:agent -- slug "Título" --json-only
 *   npm run db:blog:agent -- slug "Título" --save-json
 *   npm run db:blog:agent -- slug --from-json
 *   npm run db:blog:agent -- slug --from-json data/blog/slug.json
 *   npm run db:blog:agent -- --quincena [YYYY-MM-DD último día] [--solo-datos] [--borrador] [--forzar] [--brief notas.txt]
 *
 * --quincena: resumen de los 14 días que acaban ese día (por defecto, hoy en Madrid).
 * Lanzamientos, Top 100, escuchas, votos (misma regla que /top100, vía
 * /api/public/charts/community-monthly?since&until de producción), sonido,
 * debutantes; solo de temas que salieron en esos 14 días (sin sesiones ni
 * adelantos). Los datos van a `blog_posts.digest` y la ficha
 * los pinta con gráficos y carátulas (FortnightDigest); el modelo solo escribe
 * frases cortas por bloque. Se publica al momento (--borrador para no publicar).
 * No pisa una quincena publicada salvo con --forzar. --mantener-textos (con --forzar)
 * refresca los datos y conserva título y frases ya publicados. --solo-datos imprime los datos y sale.
 *
 * Modelo por defecto: gpt-5.6-terra (override: OPENAI_BLOG_MODEL o OPENAI_MODEL).
 * Búsqueda web: OpenAI web_search; SerpAPI solo como respaldo.
 * Requiere OPENAI_API_KEY. Para BD: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'
import { pingPublicRevalidate } from './lib/ping-public-revalidate.mjs'
import {
  fetchWebResearchContext,
  openAiChatCompletionsBody,
  resolveOpenAiModel,
} from './lib/openai-editorial.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SYSTEM_PROMPT_PATH = join(__dirname, 'prompts', 'blog-agente-system.txt')
const VALID_CATEGORIES = ['article', 'ranking', 'retrospective', 'interview', 'review', 'opinion']

loadEnvLocal()

function loadSystemPrompt() {
  if (!existsSync(SYSTEM_PROMPT_PATH)) {
    console.error('Falta el prompt:', SYSTEM_PROMPT_PATH)
    process.exit(1)
  }
  return readFileSync(SYSTEM_PROMPT_PATH, 'utf8').trim()
}

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineFormat(s) {
  // Marcadores temporales para imágenes, links internos y https antes de ** y escape
  const marked = s
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/gi, '\0IMG\0$1\0$2\0')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '\0EXT\0$1\0$2\0')
    .replace(/\[([^\]]+)\]\((\/[a-z0-9/_-]*)\)/gi, '\0LINK\0$1\0$2\0')
  const parts = marked.split(/\*\*/)
  let html = parts.map((p, i) => (i % 2 ? `<strong>${escHtml(p)}</strong>` : escHtml(p))).join('')
  html = html.replace(
    /\0LINK\0([^\0]+)\0(\/[^\0]+)\0/g,
    (_, label, href) => `<a href="${escHtml(href)}">${escHtml(label)}</a>`,
  )
  html = html.replace(
    /\0EXT\0([^\0]+)\0([^\0]+)\0/g,
    (_, label, href) =>
      `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${escHtml(label)}</a>`,
  )
  html = html.replace(
    /\0IMG\0([^\0]*)\0([^\0]+)\0/g,
    (_, alt, src) => `<img src="${escHtml(src)}" alt="${escHtml(alt)}" />`,
  )
  return html
}

/** Misma lógica ligera que import-blog-from-csv (markdown → HTML para BD). */
function markdownishToHtml(src) {
  if (!src || !src.trim()) return '<p></p>'
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let para = []

  function flushPara() {
    if (para.length) {
      out.push(`<p>${para.map(inlineFormat).join(' ')}</p>`)
      para = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const t = raw.trim()
    if (!t) {
      flushPara()
      i++
      continue
    }
    if (t === '---') {
      flushPara()
      out.push('<hr/>')
      i++
      continue
    }
    const imgBlock = t.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)$/i)
    if (imgBlock) {
      flushPara()
      out.push(`<img src="${escHtml(imgBlock[2])}" alt="${escHtml(imgBlock[1])}" />`)
      i++
      continue
    }
    if (t.startsWith('#### ')) {
      flushPara()
      out.push(`<h4>${inlineFormat(t.slice(5))}</h4>`)
      i++
      continue
    }
    if (t.startsWith('### ')) {
      flushPara()
      out.push(`<h3>${inlineFormat(t.slice(4))}</h3>`)
      i++
      continue
    }
    if (t.startsWith('## ')) {
      flushPara()
      out.push(`<h2>${inlineFormat(t.slice(3))}</h2>`)
      i++
      continue
    }
    if (t.startsWith('# ') && !t.startsWith('##')) {
      flushPara()
      out.push(`<h2>${inlineFormat(t.slice(2))}</h2>`)
      i++
      continue
    }
    if (t.startsWith('- ') || t.startsWith('* ')) {
      flushPara()
      const items = []
      while (i < lines.length) {
        const L = lines[i].trim()
        if (!L) break
        if (!(L.startsWith('- ') || L.startsWith('* '))) break
        items.push(`<li>${inlineFormat(L.slice(2))}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    para.push(t)
    i++
  }
  flushPara()
  return out.join('\n')
}

function excerptFromBody(html, max = 220) {
  const plain = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + '…'
}

function buildUserPrompt({ slug, titleHint, brief, research, featured }) {
  let s = `Genera el JSON del artículo de blog siguiendo el prompt de sistema (redactor Optimal Breaks).

slug (kebab-case EXACTO): ${slug}
Título orientativo (ES; puedes afinar wording SEO sin cambiar el sentido): ${titleHint}
`
  if (featured) {
    s += `\nis_featured: true (pillar / home).\n`
  }
  if (research) {
    s += `
CONTEXTO DE BÚSQUEDA WEB (puede contener errores; contrasta y no inventes cifras exactas sin soporte):
---
${research}
---
`
  } else {
    s +=
      '\nNo hay contexto web adicional; usa conocimiento fiable hasta tu fecha de corte y sé conservador.\n'
  }
  if (brief) {
    s += `
BRIEF / NOTAS DEL EDITOR (máxima prioridad si hay conflicto):
---
${brief}
---
`
  }
  s += `
CHECKLIST:
- Solo un objeto JSON parseable; sin markdown fuera del JSON.
- slug EXACTO: "${slug}"
- body_md_es y body_md_en en markdown ligero (## / ### / ** / listas / [texto](/ruta)); SIN HTML.
- No repetir el título como primera línea del cuerpo.
- Enlaces internos relativos cuando aporten: /history /artists /labels /scenes /charts /mixes.
`
  return s
}

async function openAiJson({ system, user }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY en .env.local')
  const model = resolveOpenAiModel('OPENAI_BLOG_MODEL')
  console.log(`[blog-agent] Modelo redacción: ${model}`)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(
      openAiChatCompletionsBody({
        model,
        temperature: 0.35,
        maxCompletionTokens: 16_000,
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
  if (!content) throw new Error('Respuesta OpenAI vacía')
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

function uniqueTags(arr) {
  if (!Array.isArray(arr)) return ['breakbeat']
  const seen = new Set()
  const out = []
  for (const x of arr) {
    const t = String(x ?? '')
      .trim()
      .toLowerCase()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out.length ? out.slice(0, 12) : ['breakbeat']
}

function normalizePost(obj, expectedSlug, { featured }) {
  const slug =
    String(obj.slug || expectedSlug)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-|-$/g, '') || expectedSlug

  const bodyMdEs = String(obj.body_md_es || obj.content_md_es || '').replace(/&amp;/g, '&').trim()
  const bodyMdEn = String(obj.body_md_en || obj.content_md_en || '').replace(/&amp;/g, '&').trim()
  if (!bodyMdEs || !bodyMdEn) {
    throw new Error('Faltan body_md_es / body_md_en en la respuesta del modelo')
  }

  const content_es = markdownishToHtml(bodyMdEs)
  const content_en = markdownishToHtml(bodyMdEn)

  let excerpt_es = String(obj.excerpt_es || '').trim()
  let excerpt_en = String(obj.excerpt_en || '').trim()
  if (!excerpt_es) excerpt_es = excerptFromBody(content_es)
  if (!excerpt_en) excerpt_en = excerptFromBody(content_en)

  const category = VALID_CATEGORIES.includes(obj.category) ? obj.category : 'article'

  return {
    slug,
    title_es: String(obj.title_es || '').trim() || expectedSlug,
    title_en: String(obj.title_en || '').trim() || expectedSlug,
    excerpt_es,
    excerpt_en,
    content_es,
    content_en,
    category,
    tags: uniqueTags(obj.tags),
    author: String(obj.author || 'Optimal Breaks').trim() || 'Optimal Breaks',
    is_published: obj.is_published !== false,
    is_featured: featured || obj.is_featured === true,
    published_at: new Date().toISOString(),
    image_url: String(obj.image_url || '').trim() || null,
    og_image_url: String(obj.og_image_url || '').trim() || null,
    beatport_tracks: Array.isArray(obj.beatport_tracks) ? obj.beatport_tracks : [],
    beatport_release_url: String(obj.beatport_release_url || '').trim() || null,
    // Guardamos markdown fuente en JSON local (no columna BD)
    _body_md_es: bodyMdEs,
    _body_md_en: bodyMdEn,
  }
}

// ── Artículo quincenal ──────────────────────────────────────────────────

const SITE_URL = (
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://www.optimalbreaks.com'
).replace(/\/$/, '')

const AGGREGATOR_LABELS = new Set([
  'distrokid', 'tunecore', 'cd baby', 'amuse', 'routenote',
  'united masters', 'unitedmasters', 'artistfy', 'create music group',
])

const madridDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

function addDaysYmd(ymd, days) {
  const dt = new Date(`${ymd}T12:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

const normName = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

function normUrl(u) {
  const s = String(u || '').trim().toLowerCase()
  if (!s) return ''
  try {
    const url = new URL(s)
    return `${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return s.replace(/[?#].*$/, '').replace(/\/$/, '')
  }
}

const artistNames = (a) =>
  Array.isArray(a) ? a.map((x) => (x && typeof x === 'object' ? x.name : x)).map((x) => String(x || '').trim()).filter(Boolean) : []

const inc = (m, k, v = 1) => m.set(k, (m.get(k) || 0) + v)
const ranked = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

function fechaLarga(ymd, lang) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

async function fetchAllRows(sb, table, select, apply = (q) => q) {
  const out = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await apply(sb.from(table).select(select)).order('id').range(from, from + 499)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 500) break
  }
  return out
}

async function fetchCommunityTop(params) {
  const res = await fetch(`${SITE_URL}/api/public/charts/community-monthly?${params}`)
  if (!res.ok) throw new Error(`Top 100 ${res.status} (${SITE_URL})`)
  return res.json()
}

async function computeQuincena(until) {
  const creds = supabaseApiCredentials()
  if (!creds) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(creds.url, creds.key, { auth: { persistSession: false } })

  const from = addDaysYmd(until, -13)
  const prevFrom = addDaysYmd(from, -14)
  const inWin = (d) => d >= from && d <= until
  const sinceIso = `${addDaysYmd(from, -1)}T00:00:00Z`

  const [editions, featAll, artistRows, labelRows] = await Promise.all([
    fetchAllRows(sb, 'chart_editions', 'id, is_published, week_date'),
    fetchAllRows(
      sb,
      'chart_featured_tracks',
      'id, chart_edition_id, title, mix_name, artists, label, bpm, music_key, release_date, release_year, link_url, platform, artwork_url, sample_url, full_audio_url, spotify_url, tidal_url',
      (q) => q.not('release_date', 'is', null),
    ),
    fetchAllRows(sb, 'artists', 'id, slug, name, name_display, country'),
    fetchAllRows(sb, 'labels', 'id, slug, name'),
  ])
  const unpublished = new Set(editions.filter((e) => e.is_published === false).map((e) => e.id))
  const weekBy = new Map(editions.map((e) => [e.id, e.week_date]))
  const feat = featAll
    .filter((f) => !unpublished.has(f.chart_edition_id))
    .map((f) => ({ ...f, names: artistNames(f.artists) }))
  const win = feat.filter((f) => inWin(f.release_date))
  const prev = feat.filter((f) => f.release_date >= prevFrom && f.release_date < from)
  const artistBy = new Map()
  for (const a of artistRows) {
    for (const n of [a.name, a.name_display]) if (n && !artistBy.has(normName(n))) artistBy.set(normName(n), a)
  }
  const labelBy = new Map(labelRows.map((l) => [normName(l.name), l]))
  const artistLink = (n) => (artistBy.get(normName(n)) ? `[${n}](/artists/${artistBy.get(normName(n)).slug})` : n)
  const labelLink = (n) => (labelBy.get(normName(n)) ? `[${n}](/labels/${labelBy.get(normName(n)).slug})` : n)
  const trackLine = (f) =>
    `${f.names.map(artistLink).join(', ')} — «${f.title}»${f.mix_name && !/^original mix$/i.test(f.mix_name) ? ` (${f.mix_name})` : ''}${f.label ? ` [${f.label}]` : ''}`

  // Lanzamientos: un disco = mismo sello, mismo día y mismo primer artista.
  const releases = new Map()
  for (const f of win) {
    const key = `${normName(f.label)}|${f.release_date}|${normName(f.names[0])}`
    if (!releases.has(key)) releases.set(key, [])
    releases.get(key).push(f)
  }
  const perArtistTracks = new Map()
  const perArtistReleases = new Map()
  for (const [key, tracks] of releases) {
    const seen = new Set()
    for (const f of tracks) for (const n of f.names) {
      inc(perArtistTracks, n)
      if (!seen.has(n)) { seen.add(n); if (!perArtistReleases.has(n)) perArtistReleases.set(n, new Set()); perArtistReleases.get(n).add(key) }
    }
  }
  const topArtists = [...perArtistTracks.entries()]
    .map(([n, t]) => ({ n, t, r: perArtistReleases.get(n)?.size || 0 }))
    .sort((a, b) => b.t - a.t || b.r - a.r)
    .slice(0, 10)
  const albums = [...releases.values()].filter((t) => t.length >= 6)
    .sort((a, b) => b.length - a.length)
    .map((t) => `${t[0].names.slice(0, 2).map(artistLink).join(', ')} — ${t.length} temas en ${t[0].label || 'sello sin nombre'} (${t[0].release_date})`)

  const labels = new Map()
  for (const f of win) if (f.label && !AGGREGATOR_LABELS.has(normName(f.label))) inc(labels, f.label)
  const remixers = new Map()
  for (const f of win) {
    const mix = normName(f.mix_name)
    if (!/remix|rmx|edit|bootleg|refix|rework/.test(mix)) continue
    for (const n of f.names) if (normName(n) && mix.includes(normName(n))) inc(remixers, n)
  }

  const bpms = win.map((f) => Number(f.bpm)).filter(Boolean)
  const prevBpms = prev.map((f) => Number(f.bpm)).filter(Boolean)
  const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null)
  const bands = new Map()
  for (const b of bpms) { const lo = Math.floor(b / 5) * 5; inc(bands, `${lo}–${lo + 4}`) }
  const keys = new Map()
  for (const f of win) if (f.music_key) inc(keys, f.music_key)

  const seenBefore = new Set(feat.filter((f) => f.release_date < from).flatMap((f) => f.names.map(normName)))
  const debutantes = [...perArtistTracks.keys()].filter((n) => !seenBefore.has(normName(n)))

  const countries = new Map()
  for (const n of perArtistTracks.keys()) {
    const c = String(artistBy.get(normName(n))?.country || '').toUpperCase()
    if (!c) continue
    for (const part of c.split(/[\/,]/).map((x) => x.trim()).filter(Boolean)) {
      const iso = { UK: 'GB', USA: 'US', SPAIN: 'ES', ESPAÑA: 'ES', AUSTRALIA: 'AU', RUSSIA: 'RU', GERMANY: 'DE', FRANCE: 'FR', ITALY: 'IT' }[part]
      inc(countries, iso || part)
    }
  }

  // Top 100 de artistas (all-time) y votos de la quincena, con la misma ruta pública.
  const [board, votes] = await Promise.all([
    fetchCommunityTop('limit=5'),
    fetchCommunityTop(`limit=100&since=${from}&until=${until}`),
  ])
  const votesReady = votes.scope === 'window'
  if (!votesReady) {
    votes.top_tracks = []
    votes.top_artists = []
    votes.totals = null
  }
  const top100 = board.top_artists || []
  const tracksByArtist = (list) => {
    const m = new Map()
    for (const f of list) for (const n of f.names) {
      const k = normName(n)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(f)
    }
    return m
  }
  const winByArtist = tracksByArtist(win)
  const top100Releases = top100
    .filter((a) => winByArtist.has(normName(a.name)))
    .map((a) => `#${a.rank} ${artistLink(a.name)}: ${[...new Set(winByArtist.get(normName(a.name)).map((f) => `«${f.title}»${f.mix_name && !/^original mix$/i.test(f.mix_name) ? ` (${f.mix_name})` : ''}`))].slice(0, 6).join(', ')}`)

  // Escuchas de la quincena (previews y temas completos en la web).
  const plays = await fetchAllRows(sb, 'track_play_events', 'id, canonical_key, created_at', (q) => q.gte('created_at', sinceIso))
  const playsWin = plays.filter((p) => inWin(madridDay(p.created_at)))
  const featByKey = new Map(feat.filter((f) => f.link_url).map((f) => [normUrl(f.link_url), f]))
  const playCount = new Map()
  for (const p of playsWin) {
    const f = featByKey.get(p.canonical_key.replace(/\/$/, ''))
    if (f) inc(playCount, f.id)
  }
  const featById = new Map(feat.map((f) => [f.id, f]))
  const playedWin = ranked(new Map([...playCount].filter(([id]) => inWin(featById.get(id).release_date))), 10)

  // Votos de la quincena, solo de temas que salieron en la quincena.
  const votedWin = (votes.top_tracks || [])
    .filter((t) => {
      const f = featByKey.get(t.canonical_key)
      return inWin(f ? f.release_date : t.release_date)
    })
    .slice(0, 10)

  const exclusives = win.filter((f) => f.full_audio_url)

  // Temas que se podrán escuchar dentro del artículo (Beatport con preview).
  const voteKeys = votedWin.map((t) => t.canonical_key)
  const pick = []
  const addPick = (f) => {
    if (!f || pick.includes(f) || !f.sample_url || !/beatport\.com/i.test(f.link_url || '')) return
    pick.push(f)
  }
  exclusives.forEach(addPick)
  playedWin.forEach(([id]) => addPick(featById.get(id)))
  voteKeys.forEach((k) => { const f = featByKey.get(k); if (f && inWin(f.release_date)) addPick(f) })
  for (const a of top100) for (const f of winByArtist.get(normName(a.name)) || []) if (pick.length < 20) addPick(f)
  const beatportTracks = pick.slice(0, 20).map((f, i) => ({
    position: i + 1,
    title: f.title,
    mix_name: f.mix_name || '',
    artists: f.names.map((name) => ({ name, beatport_url: '' })),
    label: f.label || '',
    bpm: f.bpm ?? null,
    key: f.music_key || '',
    beatport_url: f.link_url,
    artwork_url: f.artwork_url || null,
    sample_url: f.sample_url || null,
    release_year: f.release_year ?? null,
    release_date: f.release_date || null,
    spotify_url: f.spotify_url ?? null,
    tidal_url: f.tidal_url ?? null,
  }))

  const L = []
  const sec = (title, lines) => {
    if (!lines.length) return
    L.push(`\n### ${title}`)
    for (const l of lines) L.push(`- ${l}`)
  }
  L.push(`QUINCENA: del ${from} al ${until} (ambos incluidos). Quincena anterior: del ${prevFrom} al ${addDaysYmd(from, -1)}.`)
  sec('Panorama de lanzamientos (New Releases de /charts, fecha de salida en tienda)', [
    `${win.length} temas, ${perArtistTracks.size} artistas acreditados (remixers incluidos), ${new Set(win.map((f) => f.label).filter(Boolean)).size} sellos, ${releases.size} discos/lanzamientos.`,
    `Quincena anterior: ${prev.length} temas.`,
  ])
  sec('Artistas con más temas (t = temas, r = discos)', topArtists.map((a) => `${artistLink(a.n)}: ${a.t} temas en ${a.r} lanzamiento(s)`))
  sec('Discos largos de la quincena (6 temas o más: son álbumes, no ráfagas de singles)', albums.slice(0, 6))
  sec('Estrellas del Top 100 de artistas (tablero de /top100, puesto actual) con temas nuevos', top100Releases.slice(0, 20))
  sec('Sellos con más temas (sin agregadores tipo DistroKid)', ranked(labels, 8).map(([n, c]) => `${labelLink(n)}: ${c}`))
  sec('Remixers de la quincena', ranked(remixers, 6).filter(([, c]) => c >= 1).map(([n, c]) => `${artistLink(n)}: ${c} remix(es)`))
  sec('Lo más escuchado en la web de lo que salió esta quincena (puesto; reproducciones)', playedWin.map(([id, c], i) => `${i + 1}. ${trackLine(featById.get(id))} — ${c}`))
  sec(
    'Lo más votado («+» en Mis Tracks) en la quincena de lo que salió en la quincena, mismas reglas que el Top 100',
    votedWin.map((t, i) => `${i + 1}. ${t.artists} — «${t.title}»${t.mix_name && !/^original mix$/i.test(t.mix_name) ? ` (${t.mix_name})` : ''} — ${t.unique_users} usuario(s)`),
  )
  sec('Radiografía sonora', [
    `BPM medio ${avg(bpms) ?? '—'} (quincena anterior ${avg(prevBpms) ?? '—'}), sobre ${bpms.length} temas con BPM.`,
    `Tramos: ${ranked(bands, 5).map(([b, c]) => `${b} BPM: ${c}`).join('; ')}.`,
    `Tonalidades más repetidas: ${ranked(keys, 5).map(([k, c]) => `${k} (${c})`).join(', ')}.`,
  ])
  sec(
    `Debutantes: ${debutantes.length} artistas publican por primera vez en el catálogo`,
    debutantes.length ? [debutantes.slice(0, 30).map(artistLink).join(', ')] : [],
  )
  sec('Países de los artistas con ficha (código ISO)', countries.size ? [ranked(countries, 6).map(([c, n]) => `${c}: ${n}`).join(', ')] : [])
  sec('Exclusivas: tema completo cedido por el artista, se escucha entero gratis en la web', exclusives.map(trackLine))

  const data = L.join('\n')
  const brief = `ARTÍCULO QUINCENAL DE OPTIMAL BREAKS — DATOS DE LA WEB (fuente única; no inventes ni redondees cifras)
${data}

QUÉ ESCRIBES: SOLO TEXTOS CORTOS
La página ya pinta los datos con gráficos, carátulas, rankings y fotos. Tú pones la voz: frases de revista musical, con gancho, que digan lo que el gráfico no dice (quién destaca, qué sorprende, qué conviene escuchar).
- El artículo trata SOLO de los temas que han salido en estas dos semanas: qué ha salido, quién lo firma, qué se ha escuchado y votado. Nada de sesiones, ni de adelantos, ni de lo que saldrá.
- Un texto por bloque: intro, released, played, voted, artists, top100, labels, sound, debut.
- released: los discos que hay que escuchar de la quincena (2–3 nombres).
- intro: 2 frases como máximo. Los demás: 1–2 frases, 40 palabras como máximo cada uno.
- No repitas listas ni cifras que ya enseña el gráfico; cita como mucho 1–3 nombres por bloque.
- En «artists», di si el primero lo es por un álbum largo.
- Escuchas y votos vienen de una comunidad pequeña: puestos, no cifras.
- Texto plano: sin markdown, sin enlaces, sin comillas tipográficas dobles anidadas.
- Nada que no esté en los datos (ni estilo, ni biografía, ni país). Si un bloque no tiene datos, cadena vacía.

Devuelve SOLO este JSON:
{
  "title_es": "titular con gancho, menos de 70 caracteres, que nombre a 1–2 protagonistas y diga que es la quincena",
  "title_en": "...",
  "excerpt_es": "1 frase, 150–200 caracteres",
  "excerpt_en": "...",
  "tags": ["quincena", "new releases", "breakbeat", "top 100", "… 2–4 nombres propios"],
  "copy_es": { "intro": "", "released": "", "played": "", "voted": "", "artists": "", "top100": "", "labels": "", "sound": "", "debut": "" },
  "copy_en": { mismas claves, en inglés }
}`

  // Audio del ▶ del artículo: mismo orden que buildFeaturedBundle de /charts.
  const proxied = (u) => {
    try {
      const host = new URL(u).hostname.toLowerCase()
      if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') return `/api/audio-proxy?url=${encodeURIComponent(u)}`
    } catch { /* url cruda */ }
    return u
  }
  const audioSrc = (f) => {
    if (f.platform === 'bandcamp' && f.link_url) return `/api/bandcamp-preview?track=${encodeURIComponent(f.link_url)}`
    if (f.full_audio_url) return f.full_audio_url
    if (f.sample_url && f.platform !== 'soundcloud') return proxied(f.sample_url)
    return null
  }

  const toTrack = (f, value = 0) => ({
    title: f.title,
    mix_name: f.mix_name || null,
    artists: f.names.join(', '),
    artwork_url: f.artwork_url || null,
    label: f.label || null,
    release_date: f.release_date || null,
    value,
    featured_id: f.id,
    week_date: weekBy.get(f.chart_edition_id) || null,
    external_url: f.link_url || null,
    audio_src: audioSrc(f),
  })
  const slugOf = (n) => artistBy.get(normName(n))?.slug || null

  const coverSeen = new Set()
  const covers = []
  const pushCover = (u) => { if (u && !coverSeen.has(u) && covers.length < 12) { coverSeen.add(u); covers.push(u) } }
  playedWin.forEach(([id]) => pushCover(featById.get(id)?.artwork_url))
  exclusives.forEach((f) => pushCover(f.artwork_url))
  for (const a of top100) for (const f of winByArtist.get(normName(a.name)) || []) pushCover(f.artwork_url)
  win.forEach((f) => pushCover(f.artwork_url))

  // Discos de la quincena: primero los que más se han escuchado y votado.
  const votesByKey = new Map((votes.top_tracks || []).map((t) => [t.canonical_key, t.unique_users || 0]))
  const releaseScore = (tracks) =>
    tracks.reduce((s, f) => s + (playCount.get(f.id) || 0) + 3 * (votesByKey.get(normUrl(f.link_url)) || 0), 0)
  const released = [...releases.values()]
    .map((tracks) => ({ tracks, score: releaseScore(tracks) }))
    .sort((a, b) => b.score - a.score || b.tracks.length - a.tracks.length)
    .slice(0, 24)
    .map(({ tracks }) => {
      const best = [...tracks].sort((a, b) => (playCount.get(b.id) || 0) - (playCount.get(a.id) || 0))[0]
      return toTrack(best, tracks.length)
    })

  const voted = votedWin.map((v) => featByKey.has(v.canonical_key) ? toTrack(featByKey.get(v.canonical_key), v.unique_users) : ({
    title: v.title,
    mix_name: v.mix_name || null,
    artists: v.artists,
    artwork_url: v.artwork_url || null,
    label: v.label || null,
    release_date: v.release_date || null,
    value: v.unique_users,
    featured_id: v.primary?.source === 'featured' ? v.primary.id : null,
    week_date: v.primary?.source === 'featured' ? v.primary.week_date || null : null,
    external_url: v.external_url || v.youtube_url || null,
    audio_src: v.sample_url ? proxied(v.sample_url) : null,
  }))

  const digest = {
    from,
    until,
    totals: {
      tracks: win.length,
      artists: perArtistTracks.size,
      labels: new Set(win.map((f) => f.label).filter(Boolean)).size,
      releases: releases.size,
      prev_tracks: prev.length,
    },
    covers,
    copy: null,
    released,
    top100: top100
      .filter((a) => winByArtist.has(normName(a.name)))
      .slice(0, 8)
      .map((a) => ({
        rank: a.rank,
        name: a.name,
        slug: a.slug || slugOf(a.name),
        image_url: a.image_url || null,
        tracks: winByArtist.get(normName(a.name)).slice(0, 6).map((f) => toTrack(f)),
      })),
    played: playedWin.map(([id, c]) => toTrack(featById.get(id), c)),
    voted,
    votes_total: votes.totals?.saves ?? 0,
    voters_total: votes.totals?.unique_users ?? 0,
    artists: topArtists.slice(0, 8).map((a) => ({ name: a.n, slug: slugOf(a.n), tracks: a.t, releases: a.r })),
    labels: ranked(labels, 8).map(([n, c]) => ({ name: n, slug: labelBy.get(normName(n))?.slug || null, tracks: c })),
    sound: {
      avg_bpm: avg(bpms) == null ? null : Number(avg(bpms)),
      prev_avg_bpm: avg(prevBpms) == null ? null : Number(avg(prevBpms)),
      bands: [...bands.entries()]
        .filter(([, c]) => c >= 2)
        .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
        .map(([band, count]) => ({ band, count })),
      keys: ranked(keys, 6).map(([key, count]) => ({ key, count })),
    },
    debut: debutantes.slice(0, 24).map((n) => ({ name: n, slug: slugOf(n) })),
    debut_total: debutantes.length,
  }

  return {
    from,
    until,
    slug: `quincena-breakbeat-${from}-${until}`,
    titleHint: `Breakbeat: la quincena del ${fechaLarga(from, 'es')} al ${fechaLarga(until, 'es')}`,
    brief,
    beatportTracks,
    votesReady,
    digest,
  }
}

const QUINCENA_SYSTEM = `Eres el editor de Optimal Breaks (revista y archivo de breakbeat, bilingüe ES/EN). Escribes los textos cortos del resumen quincenal. Tono: revista musical con criterio, directo, nada de relleno ni frases infladas, sin meta-comentarios sobre datos o fuentes. Devuelves UN objeto JSON válido y nada más.`

const COPY_KEYS = ['intro', 'released', 'played', 'voted', 'artists', 'top100', 'labels', 'sound', 'debut']

function cleanCopy(obj) {
  const out = {}
  for (const k of COPY_KEYS) out[k] = String(obj?.[k] ?? '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  return out
}

/** HTML de respaldo (buscador, JSON-LD, RSS): la ficha pinta el digest. */
function digestToHtml(digest, lang) {
  const c = digest.copy[lang]
  const h = (title, text) => (text ? `<h2>${escHtml(title)}</h2>\n<p>${escHtml(text)}</p>` : '')
  const es = lang === 'es'
  return [
    c.intro ? `<p>${escHtml(c.intro)}</p>` : '',
    h(es ? 'Lo que ha salido' : 'Out this fortnight', c.released),
    h(es ? 'Lo más escuchado' : 'Most played', c.played),
    h(es ? 'Lo más votado' : 'Most voted', c.voted),
    h(es ? 'Quién más ha publicado' : 'Who released the most', c.artists),
    h(es ? 'Estrellas del Top 100 con temas nuevos' : 'Top 100 stars with new music', c.top100),
    h(es ? 'Sellos de la quincena' : 'Labels of the fortnight', c.labels),
    h(es ? 'Radiografía sonora' : 'Sound check', c.sound),
    h(es ? 'Debutantes' : 'Debut artists', c.debut),
  ].filter(Boolean).join('\n')
}

async function upsertBlogPost(row, { refusePublished = false } = {}) {
  const creds = supabaseApiCredentials()
  if (!creds) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)',
    )
  }
  const sb = createClient(creds.url, creds.key, { auth: { persistSession: false } })
  const payload = {
    slug: row.slug,
    title_en: row.title_en,
    title_es: row.title_es,
    excerpt_en: row.excerpt_en,
    excerpt_es: row.excerpt_es,
    content_en: row.content_en,
    content_es: row.content_es,
    category: row.category,
    tags: row.tags,
    author: row.author,
    is_published: row.is_published,
    is_featured: row.is_featured,
    published_at: row.published_at,
    image_url: row.image_url,
    og_image_url: row.og_image_url,
    beatport_tracks: Array.isArray(row.beatport_tracks) ? row.beatport_tracks : [],
    beatport_release_url: row.beatport_release_url || null,
  }
  if (row.digest !== undefined) payload.digest = row.digest

  const { data: existing, error: findErr } = await sb
    .from('blog_posts')
    .select('id, image_url, og_image_url, published_at, is_published')
    .eq('slug', row.slug)
    .maybeSingle()
  if (findErr) throw new Error(`Buscar blog_posts: ${findErr.message}`)

  if (existing?.id) {
    if (refusePublished && existing.is_published) {
      throw new Error(`/blog/${row.slug} ya está publicado: no se pisa. Despublícalo en el admin para regenerarlo.`)
    }
    // Conservar portada y fecha original si ya existía
    if (existing.image_url && !payload.image_url) payload.image_url = existing.image_url
    if (existing.og_image_url && !payload.og_image_url) payload.og_image_url = existing.og_image_url
    if (existing.published_at) payload.published_at = existing.published_at
    const { error } = await sb.from('blog_posts').update(payload).eq('id', existing.id)
    if (error) throw new Error(`UPDATE blog_posts: ${error.message}`)
    await pingPublicRevalidate({ blogSlug: row.slug })
    return { id: existing.id, action: 'update' }
  }

  const { data, error } = await sb.from('blog_posts').insert(payload).select('id').single()
  if (error) throw new Error(`INSERT blog_posts: ${error.message}`)
  await pingPublicRevalidate({ blogSlug: row.slug })
  return { id: data.id, action: 'insert' }
}

function parseArgs(argv) {
  const out = {
    slug: '',
    titleHint: '',
    briefPaths: [],
    briefInline: '',
    featured: false,
    noSearch: false,
    jsonOnly: false,
    saveJson: false,
    stdout: false,
    fromJson: null,
    quincena: null,
    soloDatos: false,
  }
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--quincena') {
      const next = argv[i + 1]
      out.quincena = next && /^\d{4}-\d{2}-\d{2}$/.test(next) ? argv[++i] : madridDay(Date.now())
    } else if (a === '--solo-datos') out.soloDatos = true
    else if (a === '--borrador') out.borrador = true
    else if (a === '--forzar') out.forzar = true
    else if (a === '--mantener-textos') out.mantenerTextos = true
    else if (a === '--featured') out.featured = true
    else if (a === '--no-search') out.noSearch = true
    else if (a === '--json-only') out.jsonOnly = true
    else if (a === '--save-json') out.saveJson = true
    else if (a === '--stdout') out.stdout = true
    else if (a === '--from-json') {
      const next = argv[i + 1]
      if (next && !next.startsWith('-')) out.fromJson = argv[++i]
      else out.fromJson = true
    } else if (a.startsWith('--from-json=')) {
      out.fromJson = a.slice('--from-json='.length)
    } else if (a === '--brief' || a === '--notes') {
      const next = argv[++i]
      if (next) out.briefPaths.push(next)
    } else if (a.startsWith('--brief=')) {
      out.briefPaths.push(a.slice('--brief='.length))
    } else if (!a.startsWith('-')) {
      pos.push(a)
    }
  }
  out.slug = (pos[0] || '').trim()
  out.titleHint = (pos[1] || '').trim()
  return out
}

function loadBrief(paths) {
  const parts = []
  for (const p of paths) {
    const abs = resolve(ROOT, p)
    if (!existsSync(abs)) {
      console.warn('[blog-agent] Brief no encontrado:', abs)
      continue
    }
    parts.push(readFileSync(abs, 'utf8').trim())
  }
  return parts.filter(Boolean).join('\n\n---\n\n')
}

async function mainQuincena(args) {
  console.log(`[blog-agent] Quincena que acaba el ${args.quincena}: leyendo datos…`)
  const q = await computeQuincena(args.quincena)
  const brief = [q.brief, loadBrief(args.briefPaths)].filter(Boolean).join('\n\n---\n\nNOTAS DEL EDITOR:\n')
  if (!q.votesReady) {
    console.warn(`[blog-agent] ${SITE_URL} aún no filtra el Top 100 por fechas: falta desplegar. Sin bloque de votos.`)
  }
  if (args.soloDatos) {
    console.log(brief)
    console.log(`\n[blog-agent] ${q.beatportTracks.length} temas para el reproductor del artículo.`)
    return
  }
  if (!q.votesReady) throw new Error('Despliega antes de generar la quincena (los votos salen de producción).')
  let raw
  if (args.mantenerTextos) {
    const creds = supabaseApiCredentials()
    const sb = createClient(creds.url, creds.key, { auth: { persistSession: false } })
    const { data: old } = await sb.from('blog_posts').select('title_es, title_en, excerpt_es, excerpt_en, tags, digest').eq('slug', q.slug).maybeSingle()
    if (!old?.digest?.copy) throw new Error(`--mantener-textos: ${q.slug} no tiene textos guardados`)
    console.log('[blog-agent] Datos nuevos, mismos textos')
    raw = { ...old, copy_es: old.digest.copy.es, copy_en: old.digest.copy.en }
  } else {
    console.log('[blog-agent] Redactando…')
    raw = await openAiJson({ system: QUINCENA_SYSTEM, user: brief })
  }
  const digest = { ...q.digest, copy: { es: cleanCopy(raw.copy_es), en: cleanCopy(raw.copy_en) } }
  const row = {
    slug: q.slug,
    title_es: String(raw.title_es || '').trim() || q.titleHint,
    title_en: String(raw.title_en || '').trim() || q.titleHint,
    excerpt_es: String(raw.excerpt_es || '').trim() || digest.copy.es.intro,
    excerpt_en: String(raw.excerpt_en || '').trim() || digest.copy.en.intro,
    content_es: digestToHtml(digest, 'es'),
    content_en: digestToHtml(digest, 'en'),
    category: 'ranking',
    tags: uniqueTags(['quincena', ...(Array.isArray(raw.tags) ? raw.tags : [])]),
    author: 'Optimal Breaks',
    is_published: !args.borrador,
    is_featured: false,
    published_at: new Date().toISOString(),
    image_url: q.digest.covers[0] || null,
    og_image_url: null,
    beatport_tracks: q.beatportTracks,
    beatport_release_url: null,
    digest,
  }
  if (args.jsonOnly) {
    console.log(JSON.stringify({ title_es: row.title_es, title_en: row.title_en, excerpt_es: row.excerpt_es, tags: row.tags, copy: digest.copy }, null, 2))
    console.log('[blog-agent] --json-only: sin BD')
    return
  }
  const result = await upsertBlogPost(row, { refusePublished: !args.forzar })
  console.log(`[blog-agent] ${row.is_published ? 'Publicado' : 'Borrador'} (${result.action}) — ${row.title_es}`)
  console.log(`[blog-agent] ${SITE_URL}/es/blog/${row.slug}`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.quincena) return mainQuincena(args)
  if (!args.slug || (!args.titleHint && !args.fromJson)) {
    console.error(
      'Uso: node scripts/generar-blog-agente.mjs <slug> "Título ES" [--featured] [--brief archivo.txt] [--no-search] [--json-only] [--save-json] [--from-json [ruta]]',
    )
    process.exit(1)
  }

  if (args.fromJson) {
    const jsonPath =
      args.fromJson === true
        ? join(ROOT, 'data', 'blog', `${args.slug}.json`)
        : resolve(ROOT, args.fromJson)
    if (!existsSync(jsonPath)) {
      throw new Error(`No existe ${jsonPath}`)
    }
    console.log('[blog-agent] --from-json:', jsonPath)
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8'))
    const row = normalizePost(raw, args.slug, { featured: args.featured })
    if (args.jsonOnly) {
      console.log('[blog-agent] --json-only: sin BD')
      return
    }
    const result = await upsertBlogPost(row)
    console.log(
      `[blog-agent] OK ${result.action} id=${result.id} → /es/blog/${row.slug} — ${row.title_es}`,
    )
    console.log(
      `[blog-agent] Portada: ${row.image_url || 'null'} (si falta, npm run blog:refresh-images o artwork Beatport)`,
    )
    return
  }

  const system = loadSystemPrompt()
  const brief = loadBrief(args.briefPaths)

  let research = ''
  if (!args.noSearch) {
    const isDefinition = /qu[eé]\s+es\b|what is\b|definici[oó]n/i.test(args.titleHint)
    const q = isDefinition
      ? `${args.titleHint} breakbeat definición qué es`
      : `${args.titleHint} breakbeat Beatport`
    const blogPrompt = isDefinition
      ? `Investiga en la web: ${q}

Devuelve SOLO un resumen factual en texto plano (sin markdown) útil para un artículo enciclopédico sobre breakbeat:
- Definición musical (ritmo, BPM aproximados, contraste con four-on-the-floor)
- Orígenes (breaks, funk/soul, Kool Herc, Amen break si aplica)
- Líneas principales: UK hardcore/rave, big beat, nu skool, Florida breaks, jungle/DnB adyacente, UK bass
- Escenas territoriales relevantes (UK, EE. UU., España/Andalucía) si aparecen en fuentes serias
Incluye URL de fuente junto a datos clave. No inventes.`
      : `Investiga en la web el tema de este artículo editorial de Optimal Breaks: ${args.titleHint}

Devuelve SOLO un resumen factual en texto plano (sin markdown):
- Artista(s), sello, fecha de publicación, catálogo, tracklist, BPM/género si aparecen
- Singles previos que formen parte del disco, charts o apoyo editorial de Beatport
- Contexto de escena (breakbeat, UK bass, Andalucía) y URLs oficiales junto a cada dato
No inventes. Si es un álbum, prioriza la ficha de tienda (Beatport) y la discografía del artista.`
    const web = await fetchWebResearchContext(q, {
      prompt: blogPrompt,
      logPrefix: '[blog-agent]',
    })
    research = web.context
    if (web.source === 'serpapi') console.log('[blog-agent] Fallback SerpAPI…')
  }

  const user = buildUserPrompt({
    slug: args.slug,
    titleHint: args.titleHint,
    brief,
    research,
    featured: args.featured,
  })

  console.log('[blog-agent] Redactando…')
  const raw = await openAiJson({ system, user })
  const row = normalizePost(raw, args.slug, { featured: args.featured })

  const jsonOut = {
    slug: row.slug,
    title_es: row.title_es,
    title_en: row.title_en,
    excerpt_es: row.excerpt_es,
    excerpt_en: row.excerpt_en,
    body_md_es: row._body_md_es,
    body_md_en: row._body_md_en,
    category: row.category,
    tags: row.tags,
    author: row.author,
    is_featured: row.is_featured,
    is_published: row.is_published,
    image_url: row.image_url || null,
    beatport_release_url: row.beatport_release_url || null,
    beatport_tracks: Array.isArray(row.beatport_tracks) ? row.beatport_tracks : [],
  }

  if (args.stdout) {
    process.stdout.write(JSON.stringify(jsonOut, null, 2) + '\n')
  }

  if (args.jsonOnly || args.saveJson) {
    const dir = join(ROOT, 'data', 'blog')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${row.slug}.json`)
    writeFileSync(path, JSON.stringify(jsonOut, null, 2) + '\n', 'utf8')
    console.log('[blog-agent] JSON:', path)
  }

  if (args.jsonOnly) {
    console.log('[blog-agent] --json-only: sin BD')
    return
  }

  const result = await upsertBlogPost(row)
  console.log(
    `[blog-agent] OK ${result.action} id=${result.id} → /es/blog/${row.slug} — ${row.title_es}`,
  )
  console.log(
    `[blog-agent] Portada: ${row.image_url || 'null'} (si falta, npm run blog:refresh-images o artwork Beatport)`,
  )
}

main().catch((e) => {
  console.error('[blog-agent]', e.message || e)
  process.exit(1)
})
