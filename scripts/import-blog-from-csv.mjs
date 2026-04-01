#!/usr/bin/env node
/**
 * Borra entradas actuales de blog_posts e importa desde Table 1-Grid view.csv
 * Fechas: orden aleatorio de artículos; published_at desde hoy hacia atrás con saltos 11/13/15 días.
 * Imágenes: agente (Chat Completions) lee el artículo + un SESGO de composición por slug;
 * la columna "Promp IMAGEN" del CSV se usa solo como PLANTILLA de formato y estilo (hiperrealista editorial),
 * no como sujeto literal — el agente rellena contenido variado siguiendo esa misma estructura.
 *
 * Uso:
 *   node scripts/import-blog-from-csv.mjs
 *   node scripts/import-blog-from-csv.mjs --csv "ruta.csv" --limit 3 --skip-images
 *   node scripts/import-blog-from-csv.mjs --refresh-images
 *   node scripts/import-blog-from-csv.mjs --refresh-images --dry-run
 *
 * --refresh-images: empareja CSV ↔ blog_posts por title_es; regenera portada (agente + imagen).
 *
 * --refresh-images-from-db: recorre TODOS los posts publicados en Supabase (sin CSV); el agente usa
 * title_es, excerpt_es y content_es de la BD. Ideal tras terminar un import masivo para uniformar
 * criterio (luz/paleta variada, menos “serie oscura”).
 *
 * --only-missing: no borra nada. Inserta solo filas cuyo title_es no está ya en blog_posts.
 * published_at: desde la fecha más antigua ya guardada hacia atrás, saltos aleatorios 11/13/15 días
 * (misma regla que el import completo). Orden de inserción: aleatorio respecto al CSV.
 *
 * Opcional: BLOG_IMAGE_PROMPT_MODEL (default: OPENAI_MODEL o gpt-4o-mini)
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY (salvo --skip-images)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function parseEnvText(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

function loadEnv() {
  const base = existsSync(join(ROOT, '.env')) ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8')) : {}
  const local = existsSync(join(ROOT, '.env.local'))
    ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8'))
    : {}
  const merged = { ...base, ...local }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnv()

function env(key) {
  const v = process.env[key]?.trim()
  if (!v) throw new Error(`Falta variable de entorno: ${key}`)
  return v
}

function createSb() {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
}

/** RFC 4180-ish con campos multilínea entre comillas */
function parseCsv(text) {
  const rows = []
  let row = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const n = text[i + 1]
    if (inQ) {
      if (c === '"' && n === '"') {
        cur += '"'
        i++
        continue
      }
      if (c === '"') {
        inQ = false
        continue
      }
      cur += c
      continue
    }
    if (c === '"') {
      inQ = true
      continue
    }
    if (c === ',' && !inQ) {
      row.push(cur)
      cur = ''
      continue
    }
    if ((c === '\n' || (c === '\r' && n === '\n')) && !inQ) {
      if (c === '\r') i++
      row.push(cur)
      cur = ''
      if (row.some((x) => x.length)) rows.push(row)
      row = []
      continue
    }
    if (c === '\r') continue
    cur += c
  }
  if (cur.length || row.length) {
    row.push(cur)
    if (row.some((x) => x.length)) rows.push(row)
  }
  return rows
}

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineFormat(s) {
  const parts = s.split(/\*\*/)
  return parts.map((p, i) => (i % 2 ? `<strong>${escHtml(p)}</strong>` : escHtml(p))).join('')
}

/**
 * El CSV trae texto plano (estilo markdown ligero), no HTML: es más fácil de editar en hoja de cálculo.
 * Aquí lo convertimos a HTML antes del INSERT; en BD vive `content_*` ya como HTML y la ficha del blog
 * lo renderiza con sanitizeHtml + .prose-ob. El <h1> de la página es `title_es` / `title_en`, no el cuerpo.
 */
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
    if (/^\d+\)\s/.test(t)) {
      flushPara()
      out.push(`<h3>${inlineFormat(t)}</h3>`)
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

function stripLeadingTitleLine(fullText, title) {
  const lines = fullText.replace(/\r\n/g, '\n').split('\n')
  const first = lines[0]?.trim()
  const t = title.trim()
  if (first && first.toLowerCase() === t.toLowerCase()) {
    return lines.slice(1).join('\n').replace(/^\s+/, '')
  }
  return fullText.trim()
}

function splitEnglishArticle(raw) {
  const text = (raw || '').replace(/\r\n/g, '\n').trim()
  if (!text) return { title_en: '', body: '' }
  const lines = text.split('\n')
  const title_en = (lines[0] || '').trim()
  const body = lines.slice(1).join('\n').replace(/^\s+/, '')
  return { title_en, body }
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

/** HTML guardado en BD → texto plano para el agente de imagen */
function stripHtmlToPlain(html) {
  if (!html) return ''
  return html
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(s, used) {
  let base = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96)
  if (!base) base = 'articulo'
  let slug = base
  let n = 2
  while (used.has(slug)) {
    slug = `${base}-${n}`
    n++
  }
  used.add(slug)
  return slug
}

function shuffle(arr) {
  const a = [...arr]
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1))
    ;[a[j], a[k]] = [a[k], a[j]]
  }
  return a
}

function randomGapDays() {
  const opts = [11, 13, 15]
  return opts[Math.floor(Math.random() * opts.length)]
}

const IMAGE_SUFFIX =
  ' Formato panorámico 16:9, fotografía hiperrealista editorial, nitidez alta, sin texto legible ni logotipos ni marcas de agua. Personas solo anónimas, lejanas, de espaldas o desenfocadas salvo que el artículo exija un retrato concreto. Evita subexponer: debe haber detalle en sombras salvo que el guion de luz pida lo contrario. Respeta la paleta e iluminación descritas en el prompt (incluidas escenas claras o diurnas cuando toquen).'

const OG_SIZE = '1536x1024'
const MAX_PROMPT_LEN = 4000
const MAX_ARTICLE_CHARS_FOR_AGENT = 6000

function hashString(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Encuadre / tipo de escena por slug. Mezcla club con objeto, archivo, calle, estudio — para no parecer una sola serie.
 */
const COMPOSITION_BIAS = [
  'Macro extremo: surco de vinilo, aguja, polvo en haz de luz suave — cero rostros.',
  'Plano cenital still life: discos, fundas genéricas, tickets, auriculares sobre madera clara o hormigón claro.',
  'Estudio o mesa de trabajo diurna: equipo, cables, taza, revistas — sensación de taller iluminado, no cueva.',
  'Interior cultural de día: librería, archivo, vitrina o pasillo de museo con luz ambiente clara.',
  'Gran angular de sala de concierto vacía o ensayando luces (haz visible pero ambiente NO totalmente negro: detalle en gradas/pared).',
  'Contrapicado a sound system o subgrave como volumen escultórico — puede ser noche de club pero con relleno de luz ambiental visible.',
  'Calle o patio urbano de día: fachada, cartel genérico ilegible, asfalto, sombras de mediodía o tarde temprana.',
  'Multitud desde atrás en pico de bolo: siluetas, manos, sin rostros; mezcla de strobo Y área con luz de relleno.',
  'Solo manos y plato/mesas de mezcla — encuadre muy cerrado, piel y metal legibles, sin retrato.',
  'Abstracción luminosa: humo, prisma, reflejos, gradientes — puede ser vibrante pero no todo negro; deja zonas claras o medias.',
  'Objetos de época en mesa: cassette, CRT, radio, fanzine — escena doméstica o estudio con luz de ventana o flexo + ambiente.',
  'Pasillo backstage o flight cases: sensación documental; mezcla de work light cálido y sombras abiertas (no silueta pura).',
  'Ventana con lluvia o reflejo urbano desde interior iluminado: exterior gris pero interior con tonos claros visibles.',
  'Espacio vacío tipo galería o sala polivalente con pared clara y una sola pieza de equipo como protagonista.',
  'Explanada o mercadillo / feria de discos al aire libre de día, mesas y cajas, gente como borrones de movimiento.',
]

/**
 * Eje de luz y color OBLIGATORIO por slug (independiente del encuadre). Rompe el “todo club oscuro + neón”.
 */
const LIGHTING_PALETTE = [
  'Luz natural lateral de ventana, día nublado o velado: sombras suaves, fondo o superficie en tonos claros (blanco roto, beige, gris claro).',
  'High-key de estudio: fondo muy claro, exposición generosa, pocas sombras duras; sensación limpia tipo revista de diseño.',
  'Interior diurno con sol entrando por puerta o vidriera: polvo en el aire legible, paleta cálida y aireada.',
  'Atardecer suave (no noche cerrada): cielo claro anaranjado o rosa, relleno de sombra con detalle visible.',
  'Flash o strobe rebotado en techo/pared clara: look documental; colores naturales, sin apagar la escena.',
  'Día lluvioso: luz gris-azulada fuera, interior o primer plano suficientemente iluminado para texturas (vinilo, papel).',
  'Neón o color de escena solo como ACENTO: el 70–85% de la imagen en tonos medios o claros; un solo bloque de color artificial.',
  'Luz de flexo de escritorio + ambiente de sala clara; madera clara, papeles, objetos reconocibles sin cueva.',
  'Ciudad a mediodía: sombras definidas pero exposición alta en fachadas; cielo o pavimento aportan claridad.',
  'Galería / museo: pared blanca, foco suave, ambiente cultural diurno, sombras abiertas.',
  'Golden hour en espacio semiabierto: contraste moderado, calidez sin subexponer siluetas.',
  'Paleta pastel desaturada en gran parte del encuadre con un detalle saturado puntual (objeto o luz).',
  'Iluminación mixta tungsteno + luz fría de ventana: contraste de temperaturas, pero con medios tonos visibles (no solo negro).',
  'Contraluz controlado con viñeta ligera: halo claro en bordes o fondo, sujeto aún legible en tonos medios.',
]

/** Si una fila no trae columna de imagen, usamos el mismo “tipo” de prompt que el CSV habitual. */
const DEFAULT_CSV_PROMPT_SKELETON = `Imagen fotográfica hiperrealista de calidad editorial.

Sujeto:
(describe el tema visual principal alineado con el artículo y el encuadre obligatorio)

Encuadre y composición:
(toma de cámara, profundidad de campo, punto de vista)

Iluminación y color:
(luces, contrastes, paleta, atmósfera)

Ambiente y detalle:
(ubicación, texturas, época o contexto cultural si aplica)

Estilo:
(fotoperiodismo editorial, nitidez, mood general)`

/**
 * Agente: replica el formato del prompt del CSV (estilo hiperrealista editorial) pero
 * inventa sujeto y detalles a partir del artículo + sesgo de composición (evita repetir siempre DJ en primer plano).
 */
async function buildImagePromptFromArticleAgent({
  slug,
  title_es,
  title_en,
  excerpt_es,
  body_plain_es,
  csvPromptExample,
}) {
  const key = env('OPENAI_API_KEY')
  const model =
    process.env.BLOG_IMAGE_PROMPT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-4o-mini'
  const bias = COMPOSITION_BIAS[hashString(slug) % COMPOSITION_BIAS.length]
  const lightPalette =
    LIGHTING_PALETTE[hashString(`${slug}|lux`) % LIGHTING_PALETTE.length]
  const snippet = body_plain_es.replace(/\s+/g, ' ').trim().slice(0, MAX_ARTICLE_CHARS_FOR_AGENT)
  const ejemplo = (csvPromptExample || '').trim() || DEFAULT_CSV_PROMPT_SKELETON

  const system = `Eres director/a de arte para Optimal Breaks (cultura breakbeat). Debes escribir UN solo prompt para generar la imagen de portada de un artículo del blog.

Recibirás un EJEMPLO de prompt en español (plantilla editorial del equipo). Ese ejemplo define el FORMATO y el TONO que debes respetar: mismas secciones o etiquetas (por ejemplo "Sujeto:", "Iluminación", párrafos separados, nivel de detalle hiperrealista). No lo copies palabra por palabra.

Reglas:
- El SESGO DE COMPOSICIÓN y la PALETA / ILUMINACIÓN asignados son OBLIGATORIOS. La sección "Iluminación y color" del prompt final debe reflejar con claridad la paleta indicada (incluidas escenas claras, diurnas o high-key cuando toque).
- NO homogeneices todo como "club oscuro + magenta y azul". El breakbeat tiene noche, pero también vinilos de día, archivo, calle, estudio, ferias, cultura material. Si el encuadre es objeto o interior cultural, la luz debe poder ser natural, de estudio o diurna sin parecer una segunda copia de cabina nocturna.
- Evita que el conjunto de portadas parezca un batch de IA con el mismo LUT: varía temperatura de color, ratio de sombras y momento del día según las instrucciones que recibes, no según un default oscuro.
- No sustituyas el encuadre por el cliché de "primer plano de DJ en cabina" salvo que el sesgo lo pida.
- El contenido de "Sujeto" y detalles debe reflejar el artículo (temas, época, geografía, objetos) según el texto en español.
- Mantén el estilo del ejemplo: fotografía hiperrealista, calidad editorial, descripciones sensoriales concretas.
- La escena no debe incluir texto legible, logotipos ni marcas de agua. No uses celebridades reconocibles. Personas anónimas, lejanas, de espaldas o desenfocadas.

Salida: SOLO el texto del prompt final en español, sin comillas, sin markdown, sin prefijos tipo "Prompt:". Longitud similar al ejemplo (varias secciones con saltos de línea).`

  const user = `SESGO DE COMPOSICIÓN (obligatorio, respétalo en Sujeto y Encuadre):
${bias}

PALETA E ILUMINACIÓN OBLIGATORIAS (deben notarse en tu sección "Iluminación y color"; no las sustituyas por oscuridad genérica):
${lightPalette}

EJEMPLO DE FORMATO Y ESTILO (replica estructura y riqueza de detalle, no el sujeto genérico):
---
${ejemplo.slice(0, 3500)}
---

TÍTULO (ES): ${title_es}
TÍTULO (EN): ${title_en}
EXTRACTO (ES): ${excerpt_es}

ARTÍCULO — texto plano (truncado):
${snippet}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1200,
      temperature: 0.88,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Chat prompt agent ${res.status}: ${err}`)
  }

  const data = await res.json()
  let text = data.choices?.[0]?.message?.content?.trim() || ''
  text = text.replace(/^[`"']|[`"']$/g, '').replace(/^(prompt:\s*)/i, '').trim()
  if (!text) throw new Error('El agente no devolvió texto de prompt')
  return text.slice(0, MAX_PROMPT_LEN - IMAGE_SUFFIX.length - 80)
}

async function generateCoverImage(prompt) {
  const key = env('OPENAI_API_KEY')
  const model = process.env.OG_IMAGE_MODEL?.trim() || 'gpt-image-1'
  const full = (prompt + IMAGE_SUFFIX).slice(0, MAX_PROMPT_LEN)
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt: full,
      size: OG_SIZE,
      quality: 'medium',
      output_format: 'png',
      n: 1,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI ${res.status}: ${err}`)
  }
  const data = await res.json()
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI no devolvió imagen')
  return Buffer.from(b64, 'base64')
}

async function uploadBlogCover(sb, slug, buf) {
  const objectPath = `blog/covers/${slug}.png`
  const { error } = await sb.storage.from('media').upload(objectPath, buf, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw new Error(`Storage: ${error.message}`)
  const base = env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/media/${objectPath}`
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Regenera solo imágenes: CSV + BD por title_es (debe coincidir exactamente con title_es del post).
 */
async function refreshBlogCoverImages(sb, args) {
  const text = readFileSync(args.csvPath, 'utf8')
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('CSV vacío o sin datos')

  const header = rows[0].map((c) => c.replace(/^\uFEFF/, '').trim())
  const col = (name) => {
    const i = header.indexOf(name)
    if (i === -1) throw new Error(`Columna no encontrada: ${name}`)
    return i
  }
  const promptCol = header.indexOf('Promp IMAGEN')
  const I = {
    titulo: col('Titulo'),
    articulo: col('Articulo'),
    ingles: col('Ingles'),
  }

  let dataRows = rows.slice(1).filter((r) => r[I.titulo]?.trim())
  if (args.limit) dataRows = dataRows.slice(0, args.limit)

  const { data: posts, error: listErr } = await sb.from('blog_posts').select('id, slug, title_es')
  if (listErr) throw new Error(`Listar blog_posts: ${listErr.message}`)

  const byTitle = new Map()
  for (const p of posts || []) {
    const t = (p.title_es || '').trim()
    if (!t) continue
    if (!byTitle.has(t)) byTitle.set(t, [])
    byTitle.get(t).push(p)
  }

  console.log(
    `\n🖼  Regenerar portadas: ${dataRows.length} filas CSV, ${(posts || []).length} posts en BD${args.dryRun ? ' [DRY-RUN]' : ''}\n`,
  )

  let ok = 0
  let miss = 0
  let fail = 0

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx]
    const title_es = row[I.titulo].trim()
    const matches = byTitle.get(title_es) || []
    if (matches.length === 0) {
      console.log(`  ⏭️  [${idx + 1}/${dataRows.length}] Sin post en BD (title_es): ${title_es.slice(0, 72)}${title_es.length > 72 ? '…' : ''}`)
      miss++
      continue
    }

    const { title_en: title_en_raw } = splitEnglishArticle(row[I.ingles] || '')
    const title_en = title_en_raw || title_es
    const body_es_src = stripLeadingTitleLine((row[I.articulo] || '').trim(), title_es)
    const excerpt_es = excerptFromBody(markdownishToHtml(body_es_src))
    const csvPromptExample = promptCol >= 0 ? (row[promptCol] || '').trim() : ''

    for (const post of matches) {
      if (args.dryRun) {
        console.log(`  🔍 [dry-run] ${post.slug} ← "${title_es.slice(0, 56)}${title_es.length > 56 ? '…' : ''}"`)
        ok++
        continue
      }
      try {
        console.log(`  🎨 [${idx + 1}/${dataRows.length}] ${post.slug} — agente + imagen…`)
        const imagePrompt = await buildImagePromptFromArticleAgent({
          slug: post.slug,
          title_es,
          title_en,
          excerpt_es,
          body_plain_es: body_es_src,
          csvPromptExample,
        })
        const buf = await generateCoverImage(imagePrompt)
        const url = await uploadBlogCover(sb, post.slug, buf)
        const { error: upErr } = await sb
          .from('blog_posts')
          .update({ image_url: url, og_image_url: url })
          .eq('id', post.id)
        if (upErr) throw new Error(upErr.message)
        console.log(`  ✅ ${post.slug}`)
        ok++
        await sleep(1200)
      } catch (e) {
        console.error(`  ⚠️  ${post.slug}: ${e.message}`)
        fail++
      }
    }
  }

  const okLabel = args.dryRun ? 'filas con post y coincidencia listadas' : 'portadas regeneradas'
  console.log(`\n📊 ${okLabel}: ${ok}; sin post en BD para el título: ${miss}; errores: ${fail}.\n`)
}

/**
 * Regenera portadas para todos los posts publicados usando datos ya en BD (sin CSV).
 */
async function refreshAllBlogCoversFromDb(sb, args) {
  let q = sb
    .from('blog_posts')
    .select('id, slug, title_es, title_en, excerpt_es, content_es')
    .eq('is_published', true)
    .order('published_at', { ascending: false })
  if (args.limit) q = q.limit(args.limit)
  const { data: posts, error: listErr } = await q
  if (listErr) throw new Error(`Listar blog_posts: ${listErr.message}`)
  const list = posts || []

  console.log(
    `\n🖼  Regenerar TODAS las portadas desde BD: ${list.length} posts${args.dryRun ? ' [DRY-RUN]' : ''}\n`,
  )

  let ok = 0
  let fail = 0

  for (let idx = 0; idx < list.length; idx++) {
    const post = list[idx]
    const title_es = (post.title_es || '').trim()
    const title_en = (post.title_en || '').trim() || title_es
    const excerpt_es =
      (post.excerpt_es || '').trim() || excerptFromBody(post.content_es || '')
    const body_plain_es = stripHtmlToPlain(post.content_es || '')

    if (args.dryRun) {
      console.log(`  🔍 [dry-run] ${post.slug}`)
      ok++
      continue
    }

    try {
      console.log(`  🎨 [${idx + 1}/${list.length}] ${post.slug} — agente + imagen…`)
      const imagePrompt = await buildImagePromptFromArticleAgent({
        slug: post.slug,
        title_es,
        title_en,
        excerpt_es,
        body_plain_es,
        csvPromptExample: '',
      })
      const buf = await generateCoverImage(imagePrompt)
      const url = await uploadBlogCover(sb, post.slug, buf)
      const { error: upErr } = await sb
        .from('blog_posts')
        .update({ image_url: url, og_image_url: url })
        .eq('id', post.id)
      if (upErr) throw new Error(upErr.message)
      console.log(`  ✅ ${post.slug}`)
      ok++
      await sleep(1200)
    } catch (e) {
      console.error(`  ⚠️  ${post.slug}: ${e.message}`)
      fail++
    }
  }

  const okLabel = args.dryRun ? 'posts listados' : 'portadas regeneradas'
  console.log(`\n📊 ${okLabel}: ${ok}; errores: ${fail}.\n`)
}

/**
 * Inserta solo artículos del CSV cuyo title_es no existe en BD. Fechas hacia el pasado desde el
 * published_at más antiguo ya guardado (o ancla 2026-04-01 si la tabla está vacía).
 */
async function insertMissingBlogPostsOnly(sb, args, parsed) {
  const { rows, I, promptCol } = parsed

  const dataRows = rows.slice(1).filter((r) => r[I.titulo]?.trim())

  const { data: existing, error: exErr } = await sb
    .from('blog_posts')
    .select('slug, title_es, published_at')
  if (exErr) throw new Error(`Listar blog_posts: ${exErr.message}`)

  const titlesInDb = new Set(
    (existing || []).map((p) => (p.title_es || '').trim()).filter(Boolean),
  )
  const usedSlugs = new Set((existing || []).map((p) => (p.slug || '').trim()).filter(Boolean))

  let missing = dataRows.filter((r) => !titlesInDb.has(r[I.titulo].trim()))
  missing = shuffle(missing)
  if (args.limit) missing = missing.slice(0, args.limit)
  const shuffled = missing

  let cursorMs
  if (!existing || existing.length === 0) {
    cursorMs = new Date('2026-04-01T12:00:00.000Z').getTime()
  } else {
    let min = Infinity
    for (const p of existing) {
      const t = new Date(p.published_at).getTime()
      if (!Number.isNaN(t) && t < min) min = t
    }
    cursorMs = min - randomGapDays() * 86400000
  }

  const dated = shuffled.map((row) => {
    const published = new Date(cursorMs).toISOString()
    cursorMs -= randomGapDays() * 86400000
    return { row, published_at: published }
  })

  const inCsv = dataRows.length
  const missingCount = dataRows.filter((r) => !titlesInDb.has(r[I.titulo].trim())).length
  const already = inCsv - missingCount

  console.log(
    `\n📥 Solo faltantes: ${dated.length} a insertar (${already} ya en BD por título, ${missingCount} faltaban en CSV completo, ${inCsv} filas CSV${args.limit ? `, --limit ${args.limit}` : ''})${args.dryRun ? ' [DRY-RUN]' : ''}\n`,
  )

  if (args.dryRun) {
    dated.slice(0, 15).forEach((d, i) => {
      const t = d.row[I.titulo].trim()
      console.log(`  ${i + 1}. ${t.slice(0, 72)}${t.length > 72 ? '…' : ''} → ${d.published_at.slice(0, 10)}`)
    })
    if (dated.length > 15) console.log(`  … y ${dated.length - 15} más`)
    console.log('')
    return
  }

  let ok = 0
  let fail = 0

  for (let idx = 0; idx < dated.length; idx++) {
    const { row, published_at } = dated[idx]
    const title_es = row[I.titulo].trim()
    const { title_en: title_en_raw, body: body_en_src } = splitEnglishArticle(row[I.ingles] || '')
    const title_en = title_en_raw || title_es
    const body_es_src = stripLeadingTitleLine((row[I.articulo] || '').trim(), title_es)
    const body_es = markdownishToHtml(body_es_src)
    const body_en = markdownishToHtml(body_en_src)
    const excerpt_es = excerptFromBody(body_es)
    const excerpt_en = excerptFromBody(body_en)
    const slug = slugify(title_es, usedSlugs)
    const csvPromptExample = promptCol >= 0 ? (row[promptCol] || '').trim() : ''

    let image_url = null
    let og_image_url = null

    if (!args.skipImages) {
      try {
        console.log(`  🎨 [${idx + 1}/${dated.length}] ${slug} — agente + imagen…`)
        const imagePrompt = await buildImagePromptFromArticleAgent({
          slug,
          title_es,
          title_en,
          excerpt_es,
          body_plain_es: body_es_src,
          csvPromptExample,
        })
        const buf = await generateCoverImage(imagePrompt)
        const url = await uploadBlogCover(sb, slug, buf)
        image_url = url
        og_image_url = url
        await sleep(1200)
      } catch (e) {
        console.error(`  ⚠️  Imagen falló (${slug}): ${e.message}`)
      }
    }

    const { error: insErr } = await sb.from('blog_posts').insert({
      slug,
      title_en,
      title_es,
      excerpt_en,
      excerpt_es,
      content_en: body_en,
      content_es: body_es,
      category: 'article',
      tags: ['breakbeat', 'editorial'],
      image_url,
      og_image_url,
      author: 'Optimal Breaks',
      published_at,
      is_published: true,
      is_featured: false,
    })

    if (insErr) {
      console.error(`  ❌ Insert ${slug}: ${insErr.message}`)
      fail++
    } else {
      console.log(`  ✅ ${slug} — ${published_at.slice(0, 10)}`)
      ok++
    }
  }

  console.log(`\n📊 Faltantes: ${ok} insertados, ${fail} errores.\n`)
}

async function deleteAllBlogPosts(sb) {
  const { data: rows, error } = await sb.from('blog_posts').select('id')
  if (error) throw new Error(`Listar blog_posts: ${error.message}`)
  const ids = (rows || []).map((r) => r.id)
  if (ids.length === 0) {
    console.log('No había entradas en blog_posts.')
    return
  }
  const chunk = 200
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk)
    const { error: delErr } = await sb.from('blog_posts').delete().in('id', part)
    if (delErr) throw new Error(`Borrar blog_posts: ${delErr.message}`)
  }
  console.log(`Eliminadas ${ids.length} entradas de blog_posts.`)
}

function parseArgs() {
  const a = process.argv.slice(2)
  const out = {
    csvPath: join(ROOT, 'Table 1-Grid view.csv'),
    skipImages: false,
    skipDelete: false,
    limit: null,
    dryRun: false,
    refreshImages: false,
    refreshImagesFromDb: false,
    onlyMissing: false,
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--csv' && a[i + 1]) {
      out.csvPath = a[++i]
      continue
    }
    if (a[i] === '--skip-images') {
      out.skipImages = true
      continue
    }
    if (a[i] === '--skip-delete') {
      out.skipDelete = true
      continue
    }
    if (a[i] === '--limit' && a[i + 1]) {
      out.limit = parseInt(a[++i], 10) || null
      continue
    }
    if (a[i] === '--dry-run') {
      out.dryRun = true
      continue
    }
    if (a[i] === '--refresh-images') {
      out.refreshImages = true
      continue
    }
    if (a[i] === '--refresh-images-from-db') {
      out.refreshImagesFromDb = true
      continue
    }
    if (a[i] === '--only-missing') {
      out.onlyMissing = true
      continue
    }
  }
  return out
}

async function main() {
  const args = parseArgs()

  if (args.refreshImages && args.refreshImagesFromDb) {
    console.error('Elige --refresh-images O --refresh-images-from-db, no ambos.')
    process.exit(1)
  }
  if ((args.refreshImages || args.refreshImagesFromDb) && args.onlyMissing) {
    console.error('No combines refresh de imágenes con --only-missing.')
    process.exit(1)
  }

  if (args.refreshImagesFromDb) {
    if (args.skipImages) {
      console.error('No uses --skip-images con --refresh-images-from-db.')
      process.exit(1)
    }
    const sb = createSb()
    await refreshAllBlogCoversFromDb(sb, args)
    return
  }

  if (args.refreshImages) {
    if (args.skipImages) {
      console.error('No uses --skip-images con --refresh-images.')
      process.exit(1)
    }
    const sb = createSb()
    await refreshBlogCoverImages(sb, args)
    return
  }

  const text = readFileSync(args.csvPath, 'utf8')
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('CSV vacío o sin datos')

  const header = rows[0].map((c) => c.replace(/^\uFEFF/, '').trim())
  const col = (name) => {
    const i = header.indexOf(name)
    if (i === -1) throw new Error(`Columna no encontrada: ${name}`)
    return i
  }
  const promptCol = header.indexOf('Promp IMAGEN')

  const I = {
    titulo: col('Titulo'),
    articulo: col('Articulo'),
    ingles: col('Ingles'),
  }

  if (args.onlyMissing) {
    const sb = createSb()
    await insertMissingBlogPostsOnly(sb, args, { rows, header, I, promptCol })
    return
  }

  let dataRows = rows.slice(1).filter((r) => r[I.titulo]?.trim())
  if (args.limit) dataRows = dataRows.slice(0, args.limit)

  const shuffled = shuffle(dataRows)
  const anchor = new Date('2026-04-01T12:00:00.000Z')
  let t = anchor.getTime()
  const dated = shuffled.map((r) => {
    const published = new Date(t).toISOString()
    t -= randomGapDays() * 86400000
    return { row: r, published_at: published }
  })

  console.log(`\n📰 Import blog: ${dated.length} artículos (orden aleatorio, fechas hacia atrás desde 2026-04-01)\n`)

  if (args.dryRun) {
    dated.slice(0, 3).forEach((d, i) => {
      console.log(`${i + 1}. ${d.row[I.titulo].slice(0, 60)}… → ${d.published_at}`)
    })
    console.log('… dry-run, sin BD ni imágenes.\n')
    return
  }

  const sb = createSb()
  if (!args.skipDelete) await deleteAllBlogPosts(sb)

  const usedSlugs = new Set()
  let ok = 0
  let fail = 0

  for (let idx = 0; idx < dated.length; idx++) {
    const { row, published_at } = dated[idx]
    const title_es = row[I.titulo].trim()
    const { title_en: title_en_raw, body: body_en_src } = splitEnglishArticle(row[I.ingles] || '')
    const title_en = title_en_raw || title_es
    const body_es_src = stripLeadingTitleLine((row[I.articulo] || '').trim(), title_es)
    const body_es = markdownishToHtml(body_es_src)
    const body_en = markdownishToHtml(body_en_src)
    const excerpt_es = excerptFromBody(body_es)
    const excerpt_en = excerptFromBody(body_en)
    const slug = slugify(title_es, usedSlugs)
    const csvPromptExample = promptCol >= 0 ? (row[promptCol] || '').trim() : ''

    let image_url = null
    let og_image_url = null

    if (!args.skipImages) {
      try {
        console.log(`  🎨 [${idx + 1}/${dated.length}] ${slug} — agente + imagen…`)
        const imagePrompt = await buildImagePromptFromArticleAgent({
          slug,
          title_es,
          title_en,
          excerpt_es,
          body_plain_es: body_es_src,
          csvPromptExample,
        })
        const buf = await generateCoverImage(imagePrompt)
        const url = await uploadBlogCover(sb, slug, buf)
        image_url = url
        og_image_url = url
        await sleep(1200)
      } catch (e) {
        console.error(`  ⚠️  Imagen falló (${slug}): ${e.message}`)
      }
    }

    const is_featured = idx < 2

    const { error: insErr } = await sb.from('blog_posts').insert({
      slug,
      title_en,
      title_es,
      excerpt_en,
      excerpt_es,
      content_en: body_en,
      content_es: body_es,
      category: 'article',
      tags: ['breakbeat', 'editorial'],
      image_url,
      og_image_url,
      author: 'Optimal Breaks',
      published_at,
      is_published: true,
      is_featured,
    })

    if (insErr) {
      console.error(`  ❌ Insert ${slug}: ${insErr.message}`)
      fail++
    } else {
      console.log(`  ✅ ${slug} — ${published_at.slice(0, 10)}`)
      ok++
    }
  }

  console.log(`\n📊 Listo: ${ok} insertados, ${fail} errores.\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
