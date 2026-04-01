#!/usr/bin/env node
// ============================================
// OPTIMAL BREAKS — Generador de imágenes OpenGraph con OpenAI
// Genera portadas OG 1200×630 para artistas, eventos, labels, scenes y blog
// usando gpt-image-1, las sube a Supabase Storage y actualiza og_image_url.
// ============================================

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
  const local = existsSync(join(ROOT, '.env.local')) ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8')) : {}
  const merged = { ...base, ...local }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnv()

const TABLES = ['artists', 'events', 'labels', 'scenes', 'blog_posts']
const OG_WIDTH = 1536
const OG_HEIGHT = 1024
const OG_SIZE = `${OG_WIDTH}x${OG_HEIGHT}`
const MAX_PROMPT_LEN = 4000

function env(key) {
  const v = process.env[key]?.trim()
  if (!v) throw new Error(`Falta variable de entorno: ${key}`)
  return v
}

function createSb() {
  return createClient(
    env('NEXT_PUBLIC_SUPABASE_URL'),
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      (() => { throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY') })(),
    { auth: { persistSession: false } },
  )
}

// ── Prompt builders por tipo de entidad ──

function buildArtistPrompt(row) {
  const styles = (row.styles || []).join(', ') || 'breakbeat'
  const era = row.era || ''
  const country = row.country || ''
  const name = row.name_display || row.name
  return `Create a striking 1200×630 OpenGraph social media preview image for the breakbeat music artist "${name}".
Style direction: Bold neo-brutalist editorial design with a raw, punk zine aesthetic. Use a limited palette of cream/beige (#e8dcc8) background, deep black (#1a1a1a), and vivid red (#d62828) accents, with optional cyan (#00b4d8) or yellow (#f0c808) highlights.
Layout: The artist name "${name}" must be the dominant typographic element, large and impactful. Include subtle visual references to their musical style (${styles}), era (${era}), and origin (${country}). Add the text "OPTIMAL BREAKS" small in the bottom-left corner and "www.optimalbreaks.com" small in the bottom-right.
Mood: Energetic, underground, vinyl culture, like a record sleeve or gig poster. No photographs of real people. Use abstract shapes, geometric patterns, halftone dots, vinyl record motifs, or turntable elements. Bold typography only, no cursive.`
}

function buildEventPrompt(row) {
  const city = row.city || ''
  const country = row.country || ''
  const venue = row.venue || ''
  const type = row.event_type || 'event'
  const date = row.date_start ? new Date(row.date_start + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''
  return `Create a striking 1200×630 OpenGraph social media preview image for the breakbeat music event "${row.name}".
Style direction: Bold neo-brutalist gig poster aesthetic with a raw, punk zine feel. Use a limited palette of cream/beige (#e8dcc8) background, deep black (#1a1a1a), and vivid red (#d62828), with optional cyan (#00b4d8) or yellow (#f0c808) accents.
Layout: The event name "${row.name}" must be the dominant text, like a bold gig poster headline. Include the location "${venue ? venue + ', ' : ''}${city}, ${country}" and ${date ? `the date "${date}"` : 'an abstract date placeholder'}. Type: ${type}. Add "OPTIMAL BREAKS" small in the bottom-left corner and "www.optimalbreaks.com" small in the bottom-right.
Mood: Festival energy, underground rave culture, warehouse vibes. Use abstract shapes, sound system motifs, speaker stacks, neon-lit grids, or crowd silhouettes. No photographs of real people. Bold stencil typography, screen-print texture.`
}

function buildLabelPrompt(row) {
  const country = row.country || ''
  const year = row.founded_year || ''
  return `Create a striking 1200×630 OpenGraph social media preview image for the breakbeat record label "${row.name}".
Style direction: Bold neo-brutalist editorial design with a raw, vinyl-culture aesthetic. Limited palette: cream/beige (#e8dcc8) background, deep black (#1a1a1a), vivid red (#d62828), with optional cyan (#00b4d8) or yellow (#f0c808).
Layout: The label name "${row.name}" as dominant typographic element. Include subtle references to ${country ? `its origin (${country})` : 'underground music culture'}${year ? ` and founding year (${year})` : ''}. Add "OPTIMAL BREAKS" small in the bottom-left and "www.optimalbreaks.com" in the bottom-right.
Mood: Record store, vinyl stacks, label catalog energy. Use abstract shapes, vinyl grooves, press stamps, halftone patterns. No photographs of real people. Bold typography only.`
}

function buildScenePrompt(row) {
  const nameEn = row.name_en || row.name_es || 'Scene'
  const country = row.country || ''
  const era = row.era || ''
  return `Create a striking 1200×630 OpenGraph social media preview image for the breakbeat music scene "${nameEn}".
Style direction: Bold neo-brutalist editorial with punk zine aesthetic. Palette: cream (#e8dcc8), black (#1a1a1a), red (#d62828), optional cyan (#00b4d8) or yellow (#f0c808).
Layout: "${nameEn}" as dominant headline. Visual references to ${country ? `the ${country} scene` : 'underground music culture'}${era ? `, era: ${era}` : ''}. "OPTIMAL BREAKS" small bottom-left, "www.optimalbreaks.com" bottom-right.
Mood: Regional identity, local club culture, city skyline abstractions, map fragments. No real people photos. Geometric patterns, halftone dots, bold stencil type.`
}

function buildBlogPrompt(row) {
  const title = row.title_en || row.title_es || 'Article'
  const category = row.category || 'article'
  return `Create a striking 1200×630 OpenGraph social media preview image for a breakbeat music blog post titled "${title}".
Style direction: Bold neo-brutalist editorial with punk magazine aesthetic. Palette: cream (#e8dcc8), black (#1a1a1a), red (#d62828), optional cyan (#00b4d8) or yellow (#f0c808).
Layout: The title "${title}" as a bold editorial headline, like a magazine cover. Category: ${category}. "OPTIMAL BREAKS" small bottom-left, "www.optimalbreaks.com" bottom-right.
Mood: Music journalism, zine culture, ink-stained layouts, typewriter text. No real people photos. Collage elements, cut-and-paste aesthetic, bold type.`
}

const PROMPT_BUILDERS = {
  artists: buildArtistPrompt,
  events: buildEventPrompt,
  labels: buildLabelPrompt,
  scenes: buildScenePrompt,
  blog_posts: buildBlogPrompt,
}

const SELECT_FIELDS = {
  artists: 'slug, name, name_display, country, styles, era, og_image_url',
  events: 'slug, name, city, country, venue, event_type, date_start, og_image_url',
  labels: 'slug, name, country, founded_year, og_image_url',
  scenes: 'slug, name_en, name_es, country, era, og_image_url',
  blog_posts: 'slug, title_en, title_es, category, og_image_url',
}

// ── OpenAI image generation ──

async function generateOgImage(prompt) {
  const key = env('OPENAI_API_KEY')
  const model = process.env.OG_IMAGE_MODEL?.trim() || 'gpt-image-1'

  const body = {
    model,
    prompt: prompt.slice(0, MAX_PROMPT_LEN),
    size: OG_SIZE,
    quality: 'medium',
    output_format: 'png',
    n: 1,
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
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
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI no devolvió imagen (b64_json vacío)')
  return Buffer.from(b64, 'base64')
}

// ── Upload to Supabase Storage ──

async function uploadOgImage(sb, table, slug, buf) {
  const objectPath = `og/${table}/${slug}.png`
  const { error } = await sb.storage.from('media').upload(objectPath, buf, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw new Error(`Storage upload: ${error.message}`)
  const base = env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/media/${objectPath}`
}

// ── Procesamiento individual ──

async function processEntity(sb, table, row, { dryRun, force }) {
  if (!force && row.og_image_url) {
    console.log(`  ⏭  ${row.slug} — ya tiene og_image_url, skip (usa --force para regenerar)`)
    return { slug: row.slug, skipped: true }
  }

  const buildPrompt = PROMPT_BUILDERS[table]
  const prompt = buildPrompt(row)

  if (dryRun) {
    console.log(`  🔍 ${row.slug} — dry-run, prompt generado (${prompt.length} chars)`)
    return { slug: row.slug, dryRun: true, promptLength: prompt.length }
  }

  console.log(`  🎨 ${row.slug} — generando imagen OG...`)
  const buf = await generateOgImage(prompt)
  console.log(`  📤 ${row.slug} — subiendo a Storage (${(buf.length / 1024).toFixed(0)} KB)...`)
  const publicUrl = await uploadOgImage(sb, table, row.slug, buf)

  // Escenas: el front histórico usa `image_url` (/images/scenes/…). Unificamos con la OG en Storage
  // para que listado y ficha muestren la imagen IA sin depender solo de og_image_url.
  const payload =
    table === 'scenes'
      ? { og_image_url: publicUrl, image_url: publicUrl }
      : { og_image_url: publicUrl }

  const { error: dbErr } = await sb.from(table).update(payload).eq('slug', row.slug)

  if (dbErr) {
    console.error(`  ❌ ${row.slug} — error BD: ${dbErr.message}`)
    return { slug: row.slug, error: dbErr.message }
  }

  console.log(`  ✅ ${row.slug} → ${publicUrl}`)
  return { slug: row.slug, url: publicUrl }
}

// ── CLI ──

function printHelp() {
  console.log(`
Uso: node scripts/generar-og-image.mjs <tabla> [slug] [opciones]

  <tabla>    artists | events | labels | scenes | blog_posts
  [slug]     Slug específico (si se omite: todas las filas sin og_image_url)

Opciones:
  --force       Regenerar aunque ya tenga og_image_url
  --dry-run     Solo mostrar qué se generaría, sin llamar a OpenAI
  --limit N     Limitar a N entidades (por defecto: sin límite)
  --help        Mostrar esta ayuda

Variables de entorno requeridas:
  OPENAI_API_KEY              Clave de OpenAI
  NEXT_PUBLIC_SUPABASE_URL    URL de Supabase
  SUPABASE_SERVICE_ROLE_KEY   Service role key

Ejemplos:
  node scripts/generar-og-image.mjs artists fatboy-slim
  node scripts/generar-og-image.mjs events --limit 5
  node scripts/generar-og-image.mjs labels --dry-run
  npm run og:generate -- artists the-prodigy
`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp()
    process.exit(0)
  }

  const table = args[0]
  if (!TABLES.includes(table)) {
    console.error(`Tabla inválida: "${table}". Usa: ${TABLES.join(', ')}`)
    process.exit(1)
  }

  const slug = args[1] && !args[1].startsWith('-') ? args[1] : null
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 20 : null

  const sb = createSb()
  const fields = SELECT_FIELDS[table]

  let rows
  if (slug) {
    const { data, error } = await sb.from(table).select(fields).eq('slug', slug).maybeSingle()
    if (error) { console.error(error.message); process.exit(1) }
    if (!data) { console.error(`No encontrado: ${table}/${slug}`); process.exit(1) }
    rows = [data]
  } else {
    let query = sb.from(table).select(fields)
    if (!force) query = query.is('og_image_url', null)
    if (limit) query = query.limit(limit)
    const { data, error } = await query
    if (error) { console.error(error.message); process.exit(1) }
    rows = data || []
  }

  console.log(`\n🖼  OG Image Generator — ${table} (${rows.length} filas)${dryRun ? ' [DRY-RUN]' : ''}${force ? ' [FORCE]' : ''}\n`)

  const results = []
  for (const row of rows) {
    try {
      const r = await processEntity(sb, table, row, { dryRun, force })
      results.push(r)
    } catch (err) {
      console.error(`  ❌ ${row.slug} — ${err.message}`)
      results.push({ slug: row.slug, error: err.message })
    }
  }

  const ok = results.filter(r => r.url).length
  const skipped = results.filter(r => r.skipped).length
  const errors = results.filter(r => r.error).length
  console.log(`\n📊  Resumen: ${ok} generadas, ${skipped} saltadas, ${errors} errores\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
