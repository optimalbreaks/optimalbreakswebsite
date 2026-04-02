#!/usr/bin/env node
// ============================================
// OPTIMAL BREAKS — OG para páginas de listado (artists, labels, …)
// gpt-image-1 no exporta 1200×630; generamos 1536×1024 y encajamos a 1200×630 (ratio Meta ~1.91:1).
// Recorte vertical (OG_SECTION_CROP_BIAS) + marco crema (OG_SECTION_FRAME_PADDING) para padding real en píxeles.
// ============================================

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'images', 'opengraph', 'sections')

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

const OPENAI_WIDTH = 1536
const OPENAI_HEIGHT = 1024
const OG_SIZE = `${OPENAI_WIDTH}x${OPENAI_HEIGHT}`
/** Salida final = recomendación Meta para og:image de enlaces (no cuadrado). */
const FB_OG_WIDTH = 1200
const FB_OG_HEIGHT = 630
const MAX_PROMPT_LEN = 4000

/**
 * Recorte a 1200×630 + encogido centrado sobre fondo crema (padding fijo, sin depender solo del prompt).
 */
async function toFacebookOgPng(buf) {
  const rawBias = process.env.OG_SECTION_CROP_BIAS?.trim()
  const bias = rawBias !== undefined && rawBias !== '' ? Number(rawBias) : 0.41
  const t = Number.isFinite(bias) ? Math.min(1, Math.max(0, bias)) : 0.41

  const rawPad = process.env.OG_SECTION_FRAME_PADDING?.trim()
  const padFrac =
    rawPad !== undefined && rawPad !== '' ? Number(rawPad) : 0.065
  const p = Number.isFinite(padFrac) ? Math.min(0.14, Math.max(0, padFrac)) : 0.065

  const meta = await sharp(buf).metadata()
  const w = meta.width || OPENAI_WIDTH
  const h = meta.height || OPENAI_HEIGHT
  const scale = Math.max(FB_OG_WIDTH / w, FB_OG_HEIGHT / h)
  const scaledW = Math.round(w * scale)
  const scaled = await sharp(buf).resize({ width: scaledW }).toBuffer()
  const m2 = await sharp(scaled).metadata()
  const rh = m2.height || Math.round(h * scale)
  const rw = m2.width || scaledW
  const spanX = rw - FB_OG_WIDTH
  const spanY = rh - FB_OG_HEIGHT
  const left = Math.max(0, Math.floor(spanX / 2))
  const top = Math.max(0, Math.min(Math.round(spanY * t), spanY))

  let cropped = await sharp(scaled)
    .extract({ left, top, width: FB_OG_WIDTH, height: FB_OG_HEIGHT })
    .png()
    .toBuffer()

  if (p <= 0) return cropped

  const maxW = Math.floor(FB_OG_WIDTH * (1 - 2 * p))
  const maxH = Math.floor(FB_OG_HEIGHT * (1 - 2 * p))
  const inner = await sharp(cropped)
    .resize(maxW, maxH, { fit: 'inside' })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: FB_OG_WIDTH,
      height: FB_OG_HEIGHT,
      channels: 3,
      background: '#e8dcc8',
    },
  })
    .composite([{ input: inner, gravity: 'centre' }])
    .png()
    .toBuffer()
}

function env(key) {
  const v = process.env[key]?.trim()
  if (!v) throw new Error(`Falta variable de entorno: ${key}`)
  return v
}

/**
 * La IA no puede dibujar en 1200×630 real; le pedimos que mentalice ese marco y coloque el texto en una franja segura.
 */
const MASTER_OG_BLOCK = `
OUTPUT: One landscape illustration for Optimal Breaks (breakbeat encyclopedia) — used as Open Graph when links are shared.

SITE SCOPE (mandatory): This project documents breakbeat / breaks culture across ALL eras and ALL regions worldwide — not UK-only, not 1990s-only. Do NOT use decorative stickers, stamps, or tags that say UK, 90s, 00s, London, or any single country/decade as a default motif. If a small secondary word-sticker fits the layout, prefer the word BREAKS (or abstract shapes: vinyl, waveform, sync arrows, BPM dots) — era- and region-neutral.

TARGET FRAME (read carefully): The final file shown on Facebook is exactly aspect ratio 1.91:1, i.e. 1200 pixels wide × 630 pixels tall. Your output bitmap is slightly taller; the pipeline will trim top/bottom. You must therefore “design for 1200×630” mentally: NO letter may be clipped in that final card.

TYPOGRAPHY — FIT INSIDE THE VISIBLE CARD:
• The TOPMOST pixel of the tallest capital in the MAIN HEADLINE must be at or BELOW 26% of the full image height (from top). Never put headline caps in the top 22% band.
• The BOTTOMMOST pixel of the SUBTITLE line must be at or ABOVE 48% of full image height (subtitle sits tight under headline with normal leading).
• Main headline + subtitle block: horizontally centered, occupying ~55–75% of image width. Generous cream padding between text block and left/right edges (at least ~10% of width each side) as part of the artwork — full-bleed background still touches both sides.
• Decorative tags, stickers, vinyl, icons: keep at least ~6% of canvas height/width away from the final crop edges — never flush in a corner.
• Decorative icons/graphics: only between ~50% and 74% of full height, grouped; nothing important below 76% (bottom strip may be cropped).
• Tiny credits "OPTIMAL BREAKS" (bottom-left) and "www.optimalbreaks.com" (bottom-right): very small, entire glyphs between 72% and 82% from top — if unsure, omit credits rather than placing them too low.

BACKGROUND: Cream #e8dcc8 with paper grain/halftone; can extend to all edges. Top 15% and bottom 12% should be mostly quiet background only.

STYLE: Neo-brutalist punk zine graphic — not a photo. No real identifiable people. Bold block type, no script. Palette: #e8dcc8, #1a1a1a, #d62828, optional #00b4d8 / #f0c808.

LIGHTING: Prefer daylight, high-key, editorial desk, record fair — not uniform dark club. If night vibe, keep mid-tones legible; no muddy blacks, no lazy all-neon look.
`.trim()

const SECTION_PROMPTS = {
  artists: `Section: ARTISTS index (encyclopedia of breakbeat DJs and producers).

Main headline word: ARTISTS (dominant). Subtitle: DJs · producers · archive

Motifs: abstract vinyl groove, stylus, 7" label circle, optional one small BREAKS sticker or neutral geometric shards — never UK/90s/00s/country tags. Collage zine, not stock photo.

${MASTER_OG_BLOCK}`,

  labels: `Section: LABELS index (breakbeat record labels).

Main headline: exactly one word LABELS (do not duplicate or prefix another LABEL). Subtitle: imprints · catalogs · vinyl culture

Motifs: rubber stamp shapes, catalog cards, spine strips as geometry, generic “label mark” placeholders (no real trademark).

${MASTER_OG_BLOCK}`,

  events: `Section: EVENTS index (festivals, club nights, breakbeat parties).

Main headline: EVENTS. Subtitle: festivals · bills · nights out

Motifs: stacked gig-poster rectangles, calendar/date block, sound-system silhouette as bold graphic (not a photo) — energetic but legible at small size.

${MASTER_OG_BLOCK}`,

  scenes: `Section: SCENES index (regional scenes and crews).

Main headline: SCENES. Subtitle: cities · crews · local history

Motifs: map shards, skyline cut-paper, compass, halftone blocks — place identity as graphic design.

${MASTER_OG_BLOCK}`,

  blog: `Section: BLOG index (long-form articles).

Main headline: BLOG. Subtitle: essays · deep cuts · journalism

Motifs: magazine rules, torn paper layers, ink splatter, typewriter grid — editorial desk energy, not a rave flyer.

${MASTER_OG_BLOCK}`,

  mixes: `Section: MIXES index (DJ sets).

Main headline: MIXES. Subtitle: DJ sets · sessions · archives

Motifs: bold waveform bar, headphone silhouette, cassette hubs as circles — can suggest studio daylight as well as club.

${MASTER_OG_BLOCK}`,

  about: `Section: ABOUT Optimal Breaks (encyclopedia + editorial project).

Main headline: OPTIMAL BREAKS (may be two lines, same brutal style). Subtitle: encyclopedia · culture · breaks

Motifs: masthead / charter / open fanzine spread suggestion — welcoming, archival, bright.

${MASTER_OG_BLOCK}`,
}

const SECTION_KEYS = Object.keys(SECTION_PROMPTS)

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

function printHelp() {
  console.log(`
Uso: node scripts/generar-og-secciones.mjs [opciones]

Salida: PNG 1200×630 en public/images/opengraph/sections/<sección>.png

Opciones:
  --dry-run              Solo listar secciones y longitud de prompt
  --only <a,b,c>         Solo estas claves (coma): ${SECTION_KEYS.join(', ')}
  --force                Sobrescribir aunque el archivo ya exista
  --resize-only          Normalizar PNG existentes a 1200×630 con cover (sin OpenAI; ideal si son 1536×1024)
  --help

Variables:
  OPENAI_API_KEY     (requerida salvo --dry-run y --resize-only)
  OG_SECTION_CROP_BIAS     0–1, sesgo vertical al recortar (default 0.41)
  OG_SECTION_FRAME_PADDING 0–0.14 fracción de marco crema alrededor del diseño (default 0.065 ≈ 6.5% por lado)

Ejemplo:
  npm run og:sections
  npm run og:sections -- --only blog,about --force
  node scripts/generar-og-secciones.mjs --resize-only
`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const resizeOnly = args.includes('--resize-only')
  let only = null
  const onlyIdx = args.indexOf('--only')
  if (onlyIdx !== -1 && args[onlyIdx + 1]) {
    only = new Set(
      args[onlyIdx + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  }

  let keys = SECTION_KEYS
  if (only) {
    keys = keys.filter((k) => only.has(k))
    const bad = [...only].filter((k) => !SECTION_KEYS.includes(k))
    if (bad.length) {
      console.error(`Claves desconocidas: ${bad.join(', ')}`)
      process.exit(1)
    }
  }

  mkdirSync(OUT_DIR, { recursive: true })

  console.log(
    `\n🖼  OG secciones → ${OUT_DIR}${dryRun ? ' [DRY-RUN]' : ''}${resizeOnly ? ' [RESIZE-ONLY]' : ''}\n`,
  )

  for (const sectionKey of keys) {
    const prompt = SECTION_PROMPTS[sectionKey]
    const outPath = join(OUT_DIR, `${sectionKey}.png`)

    if (resizeOnly) {
      if (dryRun) {
        console.log(`  🔍 ${sectionKey} — resize-only dry-run`)
        continue
      }
      if (!existsSync(outPath)) {
        console.log(`  ⏭  ${sectionKey}.png no existe, skip`)
        continue
      }
      try {
        const raw = readFileSync(outPath)
        const out = await toFacebookOgPng(raw)
        writeFileSync(outPath, out)
        console.log(`  📐 ${sectionKey}.png → ${FB_OG_WIDTH}×${FB_OG_HEIGHT} (${(out.length / 1024).toFixed(0)} KB)`)
      } catch (e) {
        console.error(`  ❌ ${sectionKey}: ${e.message}`)
      }
      continue
    }

    if (!force && existsSync(outPath) && !dryRun) {
      console.log(`  ⏭  ${sectionKey}.png ya existe (usa --force)`)
      continue
    }

    if (dryRun) {
      console.log(`  🔍 ${sectionKey} — prompt ${prompt.length} chars`)
      continue
    }

    try {
      console.log(`  🎨 ${sectionKey} — generando…`)
      let buf = await generateOgImage(prompt)
      buf = await toFacebookOgPng(buf)
      writeFileSync(outPath, buf)
      console.log(`  ✅ ${sectionKey}.png ${FB_OG_WIDTH}×${FB_OG_HEIGHT} (${(buf.length / 1024).toFixed(0)} KB)`)
    } catch (e) {
      console.error(`  ❌ ${sectionKey}: ${e.message}`)
    }
  }

  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
