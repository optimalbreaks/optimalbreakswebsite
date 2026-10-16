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
 *   npm run db:blog:agent -- --quincena [YYYY-MM-DD último día] [--solo-datos] [--brief notas.txt]
 *
 * --quincena: artículo de los 14 días que acaban ese día (por defecto, hoy en Madrid).
 * Lanzamientos, Top 100, escuchas, votos (misma regla que /top100, vía
 * /api/public/charts/community-monthly?since&until de producción), sonido,
 * debutantes, sesiones y adelantos. Se guarda como BORRADOR, categoría ranking,
 * con los temas destacados en beatport_tracks. --solo-datos imprime las notas y sale.
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

  const bodyMdEs = String(obj.body_md_es || obj.content_md_es || '').trim()
  const bodyMdEn = String(obj.body_md_en || obj.content_md_en || '').trim()
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
    fetchAllRows(sb, 'chart_editions', 'id, is_published'),
    fetchAllRows(
      sb,
      'chart_featured_tracks',
      'id, chart_edition_id, title, mix_name, artists, label, bpm, music_key, release_date, release_year, link_url, artwork_url, sample_url, full_audio_url, spotify_url, tidal_url',
      (q) => q.not('release_date', 'is', null),
    ),
    fetchAllRows(sb, 'artists', 'id, slug, name, name_display, country'),
    fetchAllRows(sb, 'labels', 'id, slug, name'),
  ])
  const unpublished = new Set(editions.filter((e) => e.is_published === false).map((e) => e.id))
  const feat = featAll
    .filter((f) => !unpublished.has(f.chart_edition_id))
    .map((f) => ({ ...f, names: artistNames(f.artists) }))
  const win = feat.filter((f) => inWin(f.release_date))
  const prev = feat.filter((f) => f.release_date >= prevFrom && f.release_date < from)
  const future = feat.filter((f) => f.release_date > until)

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
    fetchCommunityTop(`limit=15&since=${from}&until=${until}`),
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
  const futureByArtist = tracksByArtist(future)
  const top100Releases = top100
    .filter((a) => winByArtist.has(normName(a.name)))
    .map((a) => `#${a.rank} ${artistLink(a.name)}: ${[...new Set(winByArtist.get(normName(a.name)).map((f) => `«${f.title}»${f.mix_name && !/^original mix$/i.test(f.mix_name) ? ` (${f.mix_name})` : ''}`))].slice(0, 6).join(', ')}`)
  const top100Upcoming = top100
    .filter((a) => futureByArtist.has(normName(a.name)))
    .slice(0, 12)
    .map((a) => {
      const f = futureByArtist.get(normName(a.name)).sort((x, y) => x.release_date.localeCompare(y.release_date))[0]
      return `#${a.rank} ${artistLink(a.name)}: «${f.title}» sale el ${f.release_date}`
    })

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
  const playedFuture = ranked(new Map([...playCount].filter(([id]) => featById.get(id).release_date > until)), 5)

  // Sesiones.
  const mixPlays = await fetchAllRows(sb, 'mix_play_events', 'id, mix_id, created_at', (q) => q.gte('created_at', sinceIso))
  const mixCount = new Map()
  for (const p of mixPlays) if (inWin(madridDay(p.created_at))) inc(mixCount, p.mix_id)
  const newMixes = (await fetchAllRows(sb, 'mixes', 'id, slug, title, artist_name, download_url, created_at', (q) => q.gte('created_at', sinceIso)))
    .filter((m) => inWin(madridDay(m.created_at)) && !/^unknown$/i.test(String(m.artist_name || '').trim()))
  const mixIds = [...new Set([...mixCount.keys(), ...newMixes.map((m) => m.id)])]
  const mixRows = mixIds.length
    ? (await sb.from('mixes').select('id, slug, title, artist_name, download_url').in('id', mixIds.slice(0, 200))).data || []
    : []
  const mixById = new Map(mixRows.map((m) => [m.id, m]))
  const mixLine = (m) => `[${m.title}](/mixes/${m.slug})${m.download_url ? ' — descarga gratis en MP3' : ''}`

  const exclusives = win.filter((f) => f.full_audio_url)

  // Temas que se podrán escuchar dentro del artículo (Beatport con preview).
  const voteKeys = (votes.top_tracks || []).map((t) => t.canonical_key)
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
  sec('Lo más escuchado que aún no ha salido (adelantos)', playedFuture.map(([id, c]) => `${trackLine(featById.get(id))} — sale el ${featById.get(id).release_date} — ${c}`))
  sec(
    `Lo más votado («+» en Mis Tracks) en la quincena, mismas reglas que el Top 100: ${votes.totals?.saves ?? 0} votos de ${votes.totals?.unique_users ?? 0} usuarios`,
    (votes.top_tracks || []).slice(0, 10).map((t) => `${t.rank}. ${t.artists} — «${t.title}»${t.mix_name && !/^original mix$/i.test(t.mix_name) ? ` (${t.mix_name})` : ''} — ${t.unique_users} usuario(s)`),
  )
  sec('Artistas más votados en la quincena (créditos, mismas reglas que el Top 100)', (votes.top_artists || []).slice(0, 10).map((a) => `${a.rank}. ${artistLink(a.name)} — ${a.save_count}`))
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
  sec('Sesiones añadidas a /mixes en la quincena', newMixes.slice(0, 12).map((m) => `${m.artist_name} — ${mixLine(m)}`))
  sec('Sesiones más escuchadas en la quincena (reproducciones)', ranked(mixCount, 5).map(([id, c]) => (mixById.get(id) ? `${mixById.get(id).artist_name} — ${mixLine(mixById.get(id))} — ${c}` : null)).filter(Boolean))
  sec(`Lo que se viene: ${future.length} adelantos ya en /charts. Artistas del Top 100 con fecha anunciada`, top100Upcoming)

  const data = L.join('\n')
  const brief = `ARTÍCULO QUINCENAL DE OPTIMAL BREAKS — DATOS DE LA WEB (fuente única; no inventes ni redondees cifras)
${data}

INSTRUCCIONES:
- Artículo periódico tipo ranking: «qué ha pasado en el breakbeat en estos 14 días». Mismo contenido en ES y EN.
- Estructura con ## por bloque, en este orden: panorama; artistas con más lanzamientos (explica que un álbum largo pesa más que un single); estrellas del Top 100 con temas nuevos (el bloque estrella, desarrolla 4–6 nombres); lo más escuchado; lo más votado; sellos y remixers; radiografía sonora; debutantes (destaca solo nombres conocidos con seguridad); sesiones y exclusivas; lo que se viene. Salta un bloque si no hay datos.
- Escuchas y votos son de una comunidad pequeña: cuenta sobre todo puestos («el más escuchado», «segundo»), cifras solo cuando aporten.
- Mantén los enlaces internos tal y como vienen ([Nombre](/artists/slug), [Sello](/labels/slug), [Sesión](/mixes/slug)). No inventes slugs. Cierra invitando a /charts, /top100 y /mixes.
- Nada de suposiciones sobre estilo, biografía o país de un artista que no esté en los datos.
- Al final del artículo se monta un reproductor con los temas destacados: puedes decir «escúchalos abajo».
- category: "ranking". tags: incluye "quincena", "new releases", "breakbeat", "top 100" y 2–4 más. is_published: false.`

  return {
    from,
    until,
    slug: `quincena-breakbeat-${from}-${until}`,
    titleHint: `Breakbeat: la quincena del ${fechaLarga(from, 'es')} al ${fechaLarga(until, 'es')}`,
    brief,
    beatportTracks,
    votesReady,
  }
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
  const user = buildUserPrompt({ slug: q.slug, titleHint: q.titleHint, brief, research: '', featured: false })
  console.log('[blog-agent] Redactando…')
  const raw = await openAiJson({ system: loadSystemPrompt(), user })
  const row = normalizePost(raw, q.slug, { featured: false })
  row.slug = q.slug
  row.is_published = false
  row.category = 'ranking'
  row.tags = uniqueTags(['quincena', ...row.tags])
  row.beatport_tracks = q.beatportTracks
  if (args.jsonOnly) {
    console.log(JSON.stringify({ ...row, content_es: undefined, content_en: undefined }, null, 2))
    console.log('[blog-agent] --json-only: sin BD')
    return
  }
  const result = await upsertBlogPost(row, { refusePublished: true })
  console.log(`[blog-agent] Borrador ${result.action} id=${result.id} — ${row.title_es}`)
  console.log(`[blog-agent] Revísalo y publícalo en /es/administrator/blog/${result.id}`)
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
