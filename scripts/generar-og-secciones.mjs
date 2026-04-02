#!/usr/bin/env node
// ============================================
// OPTIMAL BREAKS — OG 16:9 para páginas de listado (artists, labels, …)
// Escribe PNG en public/images/opengraph/sections/<clave>.png
// Misma API que generar-og-image.mjs (gpt-image-1, 1536×1024) + reglas de luz variada.
// ============================================

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
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

const OG_WIDTH = 1536
const OG_HEIGHT = 1024
const OG_SIZE = `${OG_WIDTH}x${OG_HEIGHT}`
const MAX_PROMPT_LEN = 4000

function env(key) {
  const v = process.env[key]?.trim()
  if (!v) throw new Error(`Falta variable de entorno: ${key}`)
  return v
}

/** Alineado con la filosofía del blog CSV: no homogeneizar en cueva nocturna + neón. */
const LIGHTING_AND_MOOD_BLOCK = `
LIGHTING AND MOOD (mandatory — do not ignore): This is a bold graphic OpenGraph illustration; it must stay READABLE at tiny thumbnail size. Prefer compositions where a large area is cream/beige (#e8dcc8), warm off-white paper, daylight studio flatness, or high-key color blocks — NOT a uniform pitch-black nightclub void. If night or rave appears, use poster-style separation, rim light, or visible mid-tones so every shape stays legible. Avoid muddy underexposure and generic "all neon dystopia". Welcome variety: sunlit record fair, daytime festival field, bright archive shelf, radio booth with window light, editorial desk — break the "everything is a dark club" cliché.

NO photographs of identifiable real people. Neo-brutalist punk zine / gig poster / record-sleeve graphic design. Bold stencil or block typography only, no cursive. Small text "OPTIMAL BREAKS" bottom-left corner, "www.optimalbreaks.com" bottom-right corner.
`.trim()

const SECTION_PROMPTS = {
  artists: `Create a striking OpenGraph preview image (landscape, social share card) for the "Artists" index of a breakbeat music encyclopedia site.

Headline typography: the word "ARTISTS" must dominate (huge, brutal). Secondary line (smaller): "DJs · producers · archive".

Visual direction: collage of abstract turntable parts, vinyl groove macros, era tags, country pins as flat shapes — underground editorial, not a stock photo. Palette: cream (#e8dcc8), black (#1a1a1a), red (#d62828), optional cyan (#00b4d8) or yellow (#f0c808).

${LIGHTING_AND_MOOD_BLOCK}`,

  labels: `Create a striking OpenGraph preview image for the "Record labels" index of a breakbeat music site.

Headline: "LABELS" dominant. Secondary: "imprints · catalogs · vinyl culture".

Visuals: press stamps, catalog cards, spine stacks as abstract geometry, label-logo placeholders (generic shapes only). Neo-brutalist record-industry zine.

Palette: cream (#e8dcc8), black (#1a1a1a), red (#d62828), optional cyan or yellow accents.

${LIGHTING_AND_MOOD_BLOCK}`,

  events: `Create a striking OpenGraph preview image for the "Events" index: festivals, club nights, breakbeat parties.

Headline: "EVENTS" dominant. Secondary: "festivals · bills · nights out".

Visuals: gig-poster stack abstraction, date blocks, sound-system silhouette with STRONG graphic contrast (not a black void), ticket stub shapes. Festival energy without a cliché neon-only cave.

Palette: cream (#e8dcc8), black (#1a1a1a), red (#d62828), optional cyan (#00b4d8).

${LIGHTING_AND_MOOD_BLOCK}`,

  scenes: `Create a striking OpenGraph preview image for the "Scenes" index: regional breakbeat communities and cities.

Headline: "SCENES" dominant. Secondary: "cities · crews · local history".

Visuals: map fragments, skyline as flat cut-paper shapes, compass rose, halftone city blocks — regional identity as graphic design, not a photo of a crowd.

Palette: cream (#e8dcc8), black (#1a1a1a), red (#d62828), optional yellow (#f0c808).

${LIGHTING_AND_MOOD_BLOCK}`,

  blog: `Create a striking OpenGraph preview image for the "Blog" index: long-form articles and essays about breakbeat culture.

Headline: "BLOG" dominant. Secondary: "essays · deep cuts · journalism".

Visuals: magazine spread feel — torn paper layers, column rules, ink splatter, typewriter keys as abstract shapes; intellectual zine, not a dark club flyer.

Palette: cream (#e8dcc8), black (#1a1a1a), red (#d62828), optional cyan.

${LIGHTING_AND_MOOD_BLOCK}`,

  mixes: `Create a striking OpenGraph preview image for the "Mixes" index: DJ sets and recorded sessions.

Headline: "MIXES" dominant. Secondary: "DJ sets · sessions · archives".

Visuals: waveform as bold graphic, headphone cups as geometric icons, cassette reels abstracted, mixer faders as flat shapes — studio or daytime listening vibe welcome alongside club accents.

Palette: cream (#e8dcc8), black (#1a1a1a), red (#d62828), optional cyan or yellow.

${LIGHTING_AND_MOOD_BLOCK}`,

  about: `Create a striking OpenGraph preview image for the "About" page of Optimal Breaks, a breakbeat music encyclopedia and editorial project.

Headline: "OPTIMAL BREAKS" as main title (can span two lines). Secondary: "about the project" or "encyclopedia · culture · breaks".

Visuals: masthead / editorial charter feel — open book or fanzine layout, mission statement energy, vinyl and paper textures as graphic elements. Welcoming, archival, daytime studio or bright editorial table — avoid default nightclub darkness.

Palette: cream (#e8dcc8), black (#1a1a1a), red (#d62828), optional yellow (#f0c808).

${LIGHTING_AND_MOOD_BLOCK}`,
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

Genera PNG en public/images/opengraph/sections/<sección>.png

Opciones:
  --dry-run              Solo listar secciones y longitud de prompt
  --only <a,b,c>         Solo estas claves (coma): ${SECTION_KEYS.join(', ')}
  --force                Sobrescribir aunque el archivo ya exista
  --help

Variable: OPENAI_API_KEY (requerida salvo --dry-run)

Ejemplo:
  npm run og:sections
  npm run og:sections -- --only blog,about --force
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

  console.log(`\n🖼  OG secciones → ${OUT_DIR}${dryRun ? ' [DRY-RUN]' : ''}\n`)

  for (const sectionKey of keys) {
    const prompt = SECTION_PROMPTS[sectionKey]
    const outPath = join(OUT_DIR, `${sectionKey}.png`)

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
      const buf = await generateOgImage(prompt)
      writeFileSync(outPath, buf)
      console.log(`  ✅ ${sectionKey}.png (${(buf.length / 1024).toFixed(0)} KB)`)
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
