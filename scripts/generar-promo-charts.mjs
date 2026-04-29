#!/usr/bin/env node
// ============================================
// OPTIMAL BREAKS — Imagen promocional para el modal de CHARTS
// Salida: public/images/promo/charts-promo.webp        (ES)
//         public/images/promo/charts-promo-en.webp     (EN)
// 1024×1536 portrait · gpt-image-2 → sharp → WebP calidad 88
// ============================================

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'images', 'promo')

const OPENAI_WIDTH = 1024
const OPENAI_HEIGHT = 1536
const OPENAI_SIZE = `${OPENAI_WIDTH}x${OPENAI_HEIGHT}`
const MAX_PROMPT_LEN = 4000

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

// ============================================================
// Prompts: estética PUNK BRUTALIST consistente con la web
// (paper crema, ink negro, rojo, amarillo, halftone, cinta
// adhesiva, sello de goma, hazard stripes). Diseño VERTICAL
// pensado para un modal emergente.
// "40 Breaks Vitales" se mantiene en español en ambas versiones
// (es nombre propio del producto, igual que el `charts.title` en
// `src/dictionaries/en.json`). Solo cambian los rótulos
// secundarios y el plaque inferior.
// ============================================================

function buildPrompt({ kicker, sub, plaqueTop, plaqueBottom, language }) {
  return `
PROMOTIONAL POSTER — vertical 1024×1536 (2:3) for an in-site promo modal that pushes the CHARTS section of "Optimal Breaks" (online breakbeat encyclopedia & radio).

GOAL: stop-the-scroll fanzine artwork inviting visitors to discover the weekly chart and pick lists. The brand name "40 BREAKS VITALES" stays in Spanish in BOTH language versions (it is the product name).

LAYOUT (top → bottom, all centered on the vertical axis, generous margins):
  1. Top kicker strip: thin hazard-stripe band (yellow + ink) about 3% tall.
  2. Small uppercase tag in a stamped rectangle: "${kicker}".
  3. MAIN HEADLINE in three to five stacked stencil lines, dominant: "40 BREAKS VITALES". Letters heavy block / stencil, slightly misregistered, ink black with a red shadow offset 4–6px to the right.
  4. Sub-headline in smaller block type: "${sub}".
  5. Center collage cluster (denser, slightly overloaded but legible at thumbnail): one big abstract vinyl record with deep groove rings, a halftone-dotted speaker silhouette, a tape-deck cassette hub as a circle, a torn paper strip, a rubber stamp shape labelled "TOP" and another labelled "PLAY", a bold play triangle ▶ icon, a hand-drawn tally mark "//// /". Keep this cluster bunched in the middle ⅓; do NOT crowd the edges.
  6. Bottom plaque (a brutal black rectangle with a 4px ink border) containing two short white block-type lines: top line "${plaqueTop}" and beneath it a smaller line "${plaqueBottom}".
  7. Bottom hazard-stripe band, mirroring the top.

PALETTE (strict): cream paper #e8dcc8 background, ink #1a1a1a for type and rules, red #d62828 as accent / shadow / stamp, industrial yellow #f7e733 for the hazard stripes and a couple of highlights. Optional desaturated cyan #0891b2 only as a tiny halftone dot accent. NO other hues, no neon gradients, no photographic skies.

STYLE — PUNK BRUTALIST FANZINE: photocopy grain, paper grain, slightly torn paper edges, rubber-stamp marks, halftone dots, misregistered ink layers, scotch-tape pieces in the corners (semi-transparent yellow with darker edges), a faint repeating-line "lined paper" texture in the background, occasional ink splatters. Slightly OVERLOADED collage energy — but the typography stays crisp and instantly readable.

TYPOGRAPHY: bold block / stencil sans (think Unbounded Black + military stencil); ALL caps; tight tracking; no script, no thin fonts, no italic flourishes. Spelling MUST be exact for every visible word listed above (target language: ${language}). No other text on the canvas.

DO NOT include: any human face, any real brand logo, real DJ name, country flag, year, web URL, neon glow, AI-3D plastic look, drop-shadow blur. No photograph backgrounds — this is a flat printed poster.

SAFE REGION: keep glyphs and key icons within 8%–92% W and 8%–92% H. The outermost ~6% should remain quiet cream paper so the modal can frame the image cleanly.
`.trim()
}

const PROMPTS = {
  es: buildPrompt({
    language: 'Spanish',
    kicker: 'RADIO DE BREAKS · ONLINE',
    sub: 'CHART SEMANAL · NEW RELEASES · VINYL PICKS',
    plaqueTop: 'ESCUCHA · DESCUBRE · GUARDA',
    plaqueBottom: 'AÑADE TUS TEMAS A LA LISTA DE LA COMUNIDAD',
  }),
  en: buildPrompt({
    language: 'English',
    kicker: 'BREAKS RADIO · ONLINE',
    sub: 'WEEKLY CHART · NEW RELEASES · VINYL PICKS',
    plaqueTop: 'LISTEN · DISCOVER · SAVE',
    plaqueBottom: 'ADD YOUR TRACKS TO THE COMMUNITY LIST',
  }),
}

const OUTPUT_BY_LANG = {
  es: 'charts-promo.webp',
  en: 'charts-promo-en.webp',
}

const SUPPORTED_LANGS = Object.keys(PROMPTS)

async function generatePromoImage(prompt) {
  const key = env('OPENAI_API_KEY')
  const model = process.env.PROMO_IMAGE_MODEL?.trim() || 'gpt-image-2'

  const body = {
    model,
    prompt: prompt.slice(0, MAX_PROMPT_LEN),
    size: OPENAI_SIZE,
    quality: 'high',
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

async function toWebp(buf) {
  return sharp(buf)
    .resize({ width: OPENAI_WIDTH, height: OPENAI_HEIGHT, fit: 'cover' })
    .webp({ quality: 88 })
    .toBuffer()
}

function printHelp() {
  console.log(`
Uso: node scripts/generar-promo-charts.mjs [opciones]

Genera la imagen promocional vertical para el modal emergente de CHARTS.
Salida: public/images/promo/charts-promo[-<lang>].webp (1024×1536, 2:3)

Opciones:
  --lang <es|en|all>   Idioma a generar (default: all)
  --dry-run            No llama a OpenAI, solo muestra los prompts
  --force              Sobrescribir aunque ya exista
  --help

Variables:
  OPENAI_API_KEY       (requerida salvo --dry-run)
  PROMO_IMAGE_MODEL    opcional, default 'gpt-image-2'

Ejemplos:
  npm run promo:charts                         # genera ES + EN si faltan
  npm run promo:charts -- --lang en --force    # solo EN, regenerando
  node scripts/generar-promo-charts.mjs --dry-run --lang all
`)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const out = { dryRun: false, force: false, langs: SUPPORTED_LANGS.slice() }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--help' || a === '-h') return { help: true }
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--force') out.force = true
    else if (a === '--lang') {
      const v = (args[++i] || '').trim().toLowerCase()
      if (v === 'all') out.langs = SUPPORTED_LANGS.slice()
      else if (SUPPORTED_LANGS.includes(v)) out.langs = [v]
      else throw new Error(`--lang desconocido: ${v} (admitidos: ${SUPPORTED_LANGS.join(', ')}, all)`)
    } else {
      throw new Error(`Argumento no reconocido: ${a}`)
    }
  }
  return out
}

async function main() {
  let opts
  try {
    opts = parseArgs(process.argv)
  } catch (e) {
    console.error(e.message)
    printHelp()
    process.exit(1)
  }
  if (opts.help) {
    printHelp()
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })

  for (const lang of opts.langs) {
    const prompt = PROMPTS[lang]
    const outFile = join(OUT_DIR, OUTPUT_BY_LANG[lang])

    if (opts.dryRun) {
      console.log(`\n🔍 [${lang}] DRY-RUN — ${prompt.length} chars (máx ${MAX_PROMPT_LEN}) → ${outFile}\n`)
      console.log(prompt)
      continue
    }

    if (existsSync(outFile) && !opts.force) {
      console.log(`⏭  [${lang}] ${outFile} ya existe (usa --force para regenerar).`)
      continue
    }

    console.log(`🎨 [${lang}] Generando imagen promocional charts (${OPENAI_SIZE})…`)
    try {
      const raw = await generatePromoImage(prompt)
      const webp = await toWebp(raw)
      writeFileSync(outFile, webp)
      console.log(`✅ [${lang}] ${outFile}  (${(webp.length / 1024).toFixed(0)} KB)`)
    } catch (e) {
      console.error(`❌ [${lang}] ${e.message}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
