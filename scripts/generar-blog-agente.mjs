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
 *
 * Modelo por defecto: gpt-5.6-terra (override: OPENAI_BLOG_MODEL o OPENAI_MODEL).
 * Requiere OPENAI_API_KEY. Para BD: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Opcional: SERPAPI_API_KEY.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'

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

async function fetchSerpContext(query, apiKey) {
  if (!apiKey) return ''
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', '10')
  url.searchParams.set('hl', 'es')
  url.searchParams.set('api_key', apiKey)
  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      console.warn('[blog-agent] SerpAPI HTTP', res.status)
      return ''
    }
    const data = await res.json()
    const bits = []
    if (Array.isArray(data.organic_results)) {
      for (const r of data.organic_results.slice(0, 8)) {
        if (r.title) bits.push(`Título: ${r.title}`)
        if (r.snippet) bits.push(`Resumen: ${r.snippet}`)
        if (r.link) bits.push(`URL: ${r.link}`)
        bits.push('---')
      }
    }
    if (data.answer_box?.answer) bits.push(`Answer: ${data.answer_box.answer}`)
    return bits.join('\n').slice(0, 12000)
  } catch (e) {
    console.warn('[blog-agent] SerpAPI error:', e.message)
    return ''
  }
}

/** Búsqueda web nativa OpenAI (Responses + web_search), mismo patrón que admin-chat. */
async function fetchOpenAIWebSearchContext(query, apiKey) {
  const model =
    process.env.OPENAI_SEARCH_MODEL?.trim() ||
    process.env.OPENAI_BLOG_MODEL?.trim() ||
    'gpt-5.6-terra'
  const prompt = `Investiga en la web: ${query}

Devuelve SOLO un resumen factual en texto plano (sin markdown) útil para un artículo enciclopédico sobre breakbeat:
- Definición musical (ritmo, BPM aproximados, contraste con four-on-the-floor)
- Orígenes (breaks, funk/soul, Kool Herc, Amen break si aplica)
- Líneas principales: UK hardcore/rave, big beat, nu skool, Florida breaks, jungle/DnB adyacente, UK bass
- Escenas territoriales relevantes (UK, EE. UU., España/Andalucía) si aparecen en fuentes serias
Incluye URL de fuente junto a datos clave. No inventes.`

  for (const toolType of ['web_search', 'web_search_preview']) {
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          tools: [{ type: toolType }],
          tool_choice: 'auto',
          input: prompt,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        if (res.status === 400) continue
        const err = await res.text()
        console.warn(`[blog-agent] OpenAI web_search ${res.status}:`, err.slice(0, 200))
        continue
      }
      const data = await res.json()
      let text = ''
      if (typeof data.output_text === 'string') text = data.output_text
      else if (Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item?.type === 'message' && Array.isArray(item.content)) {
            for (const c of item.content) {
              if (
                (c?.type === 'output_text' || c?.type === 'text') &&
                typeof c.text === 'string'
              ) {
                text += c.text + '\n'
              }
            }
          }
        }
      }
      text = text.trim().slice(0, 14000)
      if (text) {
        console.log(`[blog-agent] Contexto web OpenAI (${toolType}, ${model}): ${text.length} chars`)
        return text
      }
    } catch (e) {
      console.warn('[blog-agent] OpenAI web_search error:', e.message)
    }
  }
  return ''
}

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineFormat(s) {
  // Marcadores temporales para links [texto](/ruta) antes de ** y escape
  const marked = s.replace(/\[([^\]]+)\]\((\/[a-z0-9/_-]*)\)/gi, '\0LINK\0$1\0$2\0')
  const parts = marked.split(/\*\*/)
  let html = parts.map((p, i) => (i % 2 ? `<strong>${escHtml(p)}</strong>` : escHtml(p))).join('')
  html = html.replace(
    /\0LINK\0([^\0]+)\0(\/[^\0]+)\0/g,
    (_, label, href) => `<a href="${escHtml(href)}">${escHtml(label)}</a>`,
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
  const model =
    process.env.OPENAI_BLOG_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-5.6-terra'
  console.log(`[blog-agent] Modelo redacción: ${model}`)

  const body = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }

  // gpt-5.x: max_completion_tokens; temperature custom a menudo no está soportada
  if (/^gpt-5/i.test(model)) {
    body.max_completion_tokens = 16000
  } else {
    body.temperature = 0.35
    body.max_tokens = 12000
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
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
    image_url: null,
    og_image_url: null,
    // Guardamos markdown fuente en JSON local (no columna BD)
    _body_md_es: bodyMdEs,
    _body_md_en: bodyMdEn,
  }
}

async function upsertBlogPost(row) {
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
  }

  const { data: existing, error: findErr } = await sb
    .from('blog_posts')
    .select('id, image_url, og_image_url, published_at')
    .eq('slug', row.slug)
    .maybeSingle()
  if (findErr) throw new Error(`Buscar blog_posts: ${findErr.message}`)

  if (existing?.id) {
    // Conservar portada y fecha original si ya existía
    if (existing.image_url) payload.image_url = existing.image_url
    if (existing.og_image_url) payload.og_image_url = existing.og_image_url
    if (existing.published_at) payload.published_at = existing.published_at
    const { error } = await sb.from('blog_posts').update(payload).eq('id', existing.id)
    if (error) throw new Error(`UPDATE blog_posts: ${error.message}`)
    return { id: existing.id, action: 'update' }
  }

  const { data, error } = await sb.from('blog_posts').insert(payload).select('id').single()
  if (error) throw new Error(`INSERT blog_posts: ${error.message}`)
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
  }
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--featured') out.featured = true
    else if (a === '--no-search') out.noSearch = true
    else if (a === '--json-only') out.jsonOnly = true
    else if (a === '--save-json') out.saveJson = true
    else if (a === '--stdout') out.stdout = true
    else if (a === '--brief' || a === '--notes') {
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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.slug || !args.titleHint) {
    console.error(
      'Uso: node scripts/generar-blog-agente.mjs <slug> "Título ES" [--featured] [--brief archivo.txt] [--no-search] [--json-only] [--save-json]',
    )
    process.exit(1)
  }

  const system = loadSystemPrompt()
  const brief = loadBrief(args.briefPaths)

  let research = ''
  if (!args.noSearch) {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    const serp = process.env.SERPAPI_API_KEY?.trim()
    const q = `${args.titleHint} breakbeat definición qué es`
    if (apiKey) {
      research = await fetchOpenAIWebSearchContext(q, apiKey)
    }
    if (!research && serp) {
      console.log('[blog-agent] Fallback SerpAPI…')
      research = await fetchSerpContext(q, serp)
    }
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
    '[blog-agent] Portada: null (genera con npm run blog:refresh-images si quieres imagen)',
  )
}

main().catch((e) => {
  console.error('[blog-agent]', e.message || e)
  process.exit(1)
})
