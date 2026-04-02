#!/usr/bin/env node
// ============================================
// OPTIMAL BREAKS — OG para páginas de listado (artists, labels, …)
// Salida final 1200×1000 (ratio 1.2:1). gpt-image-1 → 1536×1024 + sharp (recorte + marco crema).
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
/** Ratio 1.2:1 — más tolerante al recorte cuadrado central de Facebook que 1.91:1. */
const FB_OG_WIDTH = 1200
const FB_OG_HEIGHT = 1000
const MAX_PROMPT_LEN = 4000

/**
 * Recorte a 1200×1000 (1.2:1) + encogido centrado sobre fondo crema.
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
 * 1.2:1 (1200×1000) + texto con alineación CENTRADA para sobrevivir al recorte cuadrado de Facebook.
 */
const MASTER_OG_BLOCK = `
OPEN GRAPH CARD for Optimal Breaks (breakbeat encyclopedia). Link previews on Facebook / Meta / X.

(1) FINAL ASPECT RATIO 1.2:1: The delivered image is 1200 pixels wide by 1000 pixels tall (width ÷ height = 1.2). You draw a slightly taller source; our pipeline crops to this ratio. Think in 1200×1000 when placing content.

(2) TEXT IN THE CENTER OF THE IMAGE: If you draw any words, the whole text block (headline + subtitle + credits) must sit in the CENTER of the frame — both horizontally and vertically the mass of typography should cluster around the image’s geometric center (slightly above true center is OK so subtitle fits below). No text hugging top, bottom, or sides.

(3) ALL TEXT CENTER-ALIGNED (non-negotiable): Every line center-aligned on the vertical midline. NO left-flush, NO right-flush. Icons and graphics in a denser cluster ON that same center axis, around and under the type.

(4) VERTICAL STACK (top to bottom), same center axis:
  - MAIN HEADLINE (largest, center-aligned)
  - subtitle (center-aligned)
  - graphic cluster (centered, can be busier)
  - optional tiny credits line (center-aligned)

(5) WHY: Facebook often SQUARE-crops the center; centered text survives. Pipeline trims top/bottom — keep the message in the middle.

(6) SAFE REGION (percent from left / top): Glyphs and key icons ~12%–88% W, ~18%–82% H. Outer rim = cream #e8dcc8 only.

SITE SCOPE: Breaks worldwide, all eras. No UK/90s cliché tags. Prefer BREAKS or abstract shapes.

STYLE — PUNK BRUTALIST INDUSTRIAL (amp it up): Push harder than a clean minimal poster. Think warehouse flyer, stencil spray, photocopy grime, hazard stripes, rivet/bolt motifs, warning-stamp frames, halftone noise, misregistered layers, torn paper edges, rubber-stamp marks, grid lines, scratched ink. Slightly OVERLOADED and dense — collage energy, not empty minimalism — but the MAIN HEADLINE must still read instantly at thumbnail size. Not a photograph. No identifiable people. Bold block / stencil type only, no script. Palette: cream #e8dcc8, ink #1a1a1a, red #d62828, optional cyan #00b4d8 / industrial yellow #f0c808.

LIGHTING: Harsh contrast OK; gritty paper + workshop / print-shop feel; keep the headline letterforms crisp enough for social previews.
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

Salida: PNG 1200×1000 (1.2:1) en public/images/opengraph/sections/<sección>.png

Opciones:
  --dry-run              Solo listar secciones y longitud de prompt
  --only <a,b,c>         Solo estas claves (coma): ${SECTION_KEYS.join(', ')}
  --force                Sobrescribir aunque el archivo ya exista
  --resize-only          Reprocesar PNG existentes a 1200×1000 (sin OpenAI; mejor si el PNG ya es grande)
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
