#!/usr/bin/env node
// ============================================
// OPTIMAL BREAKS — OG promocional por sección (estética FANZINE PUNK BRUTALIST)
// Salida: public/images/opengraph/sections/<sección>[-en].png   (1200×1000, 1.2:1)
//
// Adapta el lenguaje visual del banner promo de Charts (cinta amarilla,
// hazard stripes, plaque inferior, halftone, sello de goma, papel rasgado)
// al formato OG landscape esperado por la app, y produce ES + EN.
//
// gpt-image-2 → 1536×1024 → sharp (cover-resize + recorte centrado + marco crema) → PNG
// Compatible con `src/lib/og-section-images.ts` y `staticPageMetadata`.
//
// Uso:
//   npm run og:promo                                  # todas las secciones soportadas
//   npm run og:promo -- --sections charts,events      # subconjunto
//   npm run og:promo -- --sections charts --lang en   # solo EN
//   npm run og:promo -- --dry-run                     # mostrar prompts sin llamar a la API
//   npm run og:promo -- --force                       # sobrescribir si ya existe
//
// Nota: NO usar `--only` cuando se invoca a través de `npm run` — npm lo
// intercepta como flag propia (`--only=prod|dev`) y el script no lo recibe.
// El alias `--only` sigue funcionando si invocas el .mjs directamente con node.
// ============================================

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Lazy import: sharp tarda varios segundos en montar binarios (en Windows + Dropbox
// llega a ~100s). En --dry-run no se necesita; se importa al primer uso.
let _sharp
async function getSharp() {
  if (!_sharp) _sharp = (await import('sharp')).default
  return _sharp
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'images', 'opengraph', 'sections')

const OPENAI_WIDTH = 1536
const OPENAI_HEIGHT = 1024
const OPENAI_SIZE = `${OPENAI_WIDTH}x${OPENAI_HEIGHT}`
const FB_OG_WIDTH = 1200
const FB_OG_HEIGHT = 1000
/** Secciones que deben salir en ratio OG clásico de Meta (1200×630 ≈ 1.91:1). */
const SECTION_OUTPUT_SIZE = {
  top100: { width: 1200, height: 630, cropBias: 0.5, framePadding: 0.03 },
}
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
  const base = existsSync(join(ROOT, '.env'))
    ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8'))
    : {}
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

function sectionOutputSize(sectionKey) {
  return (
    SECTION_OUTPUT_SIZE[sectionKey] ?? {
      width: FB_OG_WIDTH,
      height: FB_OG_HEIGHT,
      cropBias: undefined,
      framePadding: undefined,
    }
  )
}

// ============================================================
// Recorte/marco al ratio de salida (1200×1000 por defecto; top100 → 1200×630)
// ============================================================
async function toFacebookOgPng(buf, output = sectionOutputSize('charts')) {
  const targetW = output.width
  const targetH = output.height
  const sharp = await getSharp()
  const rawBias = output.cropBias ?? process.env.OG_PROMO_CROP_BIAS?.trim()
  const bias = rawBias !== undefined && rawBias !== '' ? Number(rawBias) : 0.41
  const t = Number.isFinite(bias) ? Math.min(1, Math.max(0, bias)) : 0.41

  const rawPad = output.framePadding ?? process.env.OG_PROMO_FRAME_PADDING?.trim()
  const padFrac =
    rawPad !== undefined && rawPad !== '' ? Number(rawPad) : 0.045
  const p = Number.isFinite(padFrac) ? Math.min(0.14, Math.max(0, padFrac)) : 0.045

  const meta = await sharp(buf).metadata()
  const w = meta.width || OPENAI_WIDTH
  const h = meta.height || OPENAI_HEIGHT
  const scale = Math.max(targetW / w, targetH / h)
  const scaledW = Math.round(w * scale)
  const scaled = await sharp(buf).resize({ width: scaledW }).toBuffer()
  const m2 = await sharp(scaled).metadata()
  const rh = m2.height || Math.round(h * scale)
  const rw = m2.width || scaledW
  const spanX = rw - targetW
  const spanY = rh - targetH
  const left = Math.max(0, Math.floor(spanX / 2))
  const top = Math.max(0, Math.min(Math.round(spanY * t), spanY))

  const cropped = await sharp(scaled)
    .extract({ left, top, width: targetW, height: targetH })
    .png()
    .toBuffer()

  if (p <= 0) return cropped

  const maxW = Math.floor(targetW * (1 - 2 * p))
  const maxH = Math.floor(targetH * (1 - 2 * p))
  const inner = await sharp(cropped)
    .resize(maxW, maxH, { fit: 'inside' })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: targetW,
      height: targetH,
      channels: 3,
      background: '#e8dcc8',
    },
  })
    .composite([{ input: inner, gravity: 'centre' }])
    .png()
    .toBuffer()
}

// ============================================================
// Prompt builder — adaptación landscape 1200×1000 del estilo fanzine
// (charts-promo): cinta amarilla en esquinas, hazard stripes arriba/abajo,
// plaque inferior, halftone, sello de goma, papel rasgado. Tipografía
// stencil/block con sombra roja desplazada. Colores estrictos.
// ============================================================

function buildFanzineWideOgPrompt({
  language,
  kicker,
  mainHeadline,
  sub,
  plaqueTop,
  plaqueBottom,
  motifs,
  width,
  height,
}) {
  const ratio = (width / height).toFixed(2)
  return `
PROMOTIONAL OPEN-GRAPH BANNER — landscape ${width}×${height} (${ratio}:1) for the website "Optimal Breaks". Designed for Facebook / Meta / WhatsApp / X / LinkedIn link previews in WIDE format (same ratio as 1200×630). This is a CINEMA-WIDE banner, NOT a tall poster.

GOAL: stop-the-scroll fanzine artwork in a horizontal strip. Punk brutalist energy; headline MUST stay legible at thumbnail size.

LAYOUT (wide horizontal strip, content uses full width):
  1. Top hazard-stripe band (~5% tall): yellow + ink diagonal stripes spanning full width.
  2. Small uppercase tag in a stamped rectangle, top-left or top-center: "${kicker}".
  3. LEFT ZONE (~45% width): MAIN HEADLINE "${mainHeadline}" in 1–2 stacked stencil lines, very large. Sub-headline "${sub}" directly beneath in smaller block type.
  4. RIGHT ZONE (~45% width): collage cluster: ${motifs}. Spread horizontally, not stacked vertically.
  5. Bottom plaque (full-width black bar ~14% tall, 4px ink border): white block type — line 1 "${plaqueTop}", line 2 smaller "${plaqueBottom}".
  6. Bottom hazard-stripe band mirroring the top (~5% tall).
  7. Optional small yellow scotch-tape corners.

PALETTE (strict): cream #e8dcc8, ink #1a1a1a, red #d62828, industrial yellow #f7e733. Optional tiny cyan #0891b2 halftone only.

STYLE — PUNK BRUTALIST FANZINE: photocopy grain, halftone, rubber stamps, torn paper, ink splatters. Typography crisp at small size.

TYPOGRAPHY: bold block / stencil sans, ALL caps. Exact spelling (${language}). No other text.

DO NOT: human faces, real logos, URLs, neon glow, 3D plastic, tall portrait layout.

SAFE REGION: key text and icons within 5%–95% W and 10%–88% H — optimized for wide Facebook preview, not square crop.
`.trim()
}

function buildFanzineLandscapePrompt({
  language,
  kicker,
  mainHeadline,
  sub,
  plaqueTop,
  plaqueBottom,
  motifs,
  width = FB_OG_WIDTH,
  height = FB_OG_HEIGHT,
}) {
  const ratio = (width / height).toFixed(2)
  return `
PROMOTIONAL OPEN-GRAPH BANNER — landscape ${width}×${height} (${ratio}:1) for the website "Optimal Breaks" (online breakbeat encyclopedia & radio). Designed for link previews on Facebook / WhatsApp / X / LinkedIn — Facebook will square-crop the center, so the message MUST sit centered.

GOAL: stop-the-scroll fanzine artwork. Punk brutalist energy, slightly overloaded collage, but the headline MUST stay legible at 200px wide thumbnail.

LAYOUT (treat the canvas as a wide flyer 1.2:1, content centered both axes):
  1. Top hazard-stripe band (~3% tall): yellow + ink diagonal stripes spanning the full width.
  2. Small uppercase tag in a stamped rectangle, top-center: "${kicker}".
  3. MAIN HEADLINE in 1–3 stacked stencil lines, dominant in the upper-middle: "${mainHeadline}". Letters heavy block / stencil, slightly misregistered, ink black (#1a1a1a) with a red (#d62828) shadow offset 4–6px to the right and down.
  4. Sub-headline in smaller block type, just under the headline, ink with low opacity: "${sub}".
  5. Center collage cluster (denser, slightly overloaded but legible): ${motifs}. Keep this cluster bunched in the middle 60% of the canvas; do NOT crowd the edges.
  6. Bottom plaque (a brutal black rectangle with a 4px ink border) containing two short white block-type lines: top line "${plaqueTop}" and beneath it a smaller line "${plaqueBottom}".
  7. Bottom hazard-stripe band, mirroring the top.
  8. Two small pieces of semi-transparent yellow scotch-tape with darker ragged edges, one in the top-left corner and one in the bottom-right corner, diagonally placed as if taping the poster to a wall.

PALETTE (strict, no other colors): cream paper #e8dcc8 background, ink #1a1a1a for type and rules, red #d62828 as accent / shadow / stamp, industrial yellow #f7e733 for the hazard stripes and a couple of highlights. Optional desaturated cyan #0891b2 only as a tiny halftone dot accent. NO neon gradients, NO photographic skies, NO sepia.

STYLE — PUNK BRUTALIST FANZINE: photocopy grain, paper grain, slightly torn paper edges, rubber-stamp marks, halftone dots, misregistered ink layers, a faint repeating-line "lined paper" texture in the background, occasional ink splatters. Slightly OVERLOADED collage energy — but the typography stays crisp and instantly readable.

TYPOGRAPHY: bold block / stencil sans (think Unbounded Black + military stencil); ALL caps; tight tracking; no script, no thin fonts, no italic flourishes. Spelling MUST be exact for every visible word listed above (target language: ${language}). No other text on the canvas — no extra credits, no URL, no year, no photographer mark.

DO NOT include: any human face, any real brand logo, real DJ name, country flag, year, web URL outside of what is listed above, neon glow, AI-3D plastic look, drop-shadow blur. No photograph backgrounds — this is a flat printed poster.

SAFE REGION: keep glyphs and key icons within 8%–92% W and 8%–92% H. The outermost ~6% should remain quiet cream paper so social platforms can frame the image cleanly. The center 60%×60% MUST contain the full headline (Facebook square-crop survives).
`.trim()
}

// ============================================================
// Diccionario por sección — copys ES / EN
// ============================================================

const SECTIONS = {
  top100: {
    es: {
      kicker: 'ALL-TIME · COMUNIDAD · SIN FILTROS',
      mainHeadline: 'TOP 100',
      sub: 'LAS MEJORES CANCIONES DE BREAKBEAT DE LA HISTORIA',
      plaqueTop: 'RANKING DEFINITIVO · LA ESCENA DECIDE',
      plaqueBottom: 'SIN VOTOS · SOLO SAVES REALES',
      motifs:
        'a bold vertical numbered list strip showing ranks 1 2 3 in stencil type, a rubber stamp shape labelled "BEST" in red ink, a rubber stamp shape labelled "EVER", a trophy silhouette as bold black graphic crowned with a jagged crown shape (not a photo), three vinyl record sleeves stacked and slightly fanned, a hand-drawn tally cluster suggesting "100" (///// × 20 style), a rubber stamp shape labelled "#1" stamped hard and slightly rotated, explosive halftone dot bursts, scattered ink splatters, a torn chart printout strip with rank numbers, a bold exclamation mark block',
    },
    en: {
      kicker: 'ALL-TIME · COMMUNITY · NO FILTERS',
      mainHeadline: 'TOP 100',
      sub: 'THE BEST BREAKBEAT TRACKS IN HISTORY',
      plaqueTop: 'DEFINITIVE RANKING · THE SCENE DECIDES',
      plaqueBottom: 'NO POLLS · JUST REAL SAVES',
      motifs:
        'a bold vertical numbered list strip showing ranks 1 2 3 in stencil type, a rubber stamp shape labelled "BEST" in red ink, a rubber stamp shape labelled "EVER", a trophy silhouette as bold black graphic crowned with a jagged crown shape (not a photo), three vinyl record sleeves stacked and slightly fanned, a hand-drawn tally cluster suggesting "100" (///// × 20 style), a rubber stamp shape labelled "#1" stamped hard and slightly rotated, explosive halftone dot bursts, scattered ink splatters, a torn chart printout strip with rank numbers, a bold exclamation mark block',
    },
  },
  charts: {
    es: {
      kicker: 'RADIO DE BREAKS · ONLINE',
      mainHeadline: '40 BREAKS VITALES',
      sub: 'CHART SEMANAL · NEW RELEASES · VINYL PICKS',
      plaqueTop: 'ESCUCHA · DESCUBRE · GUARDA',
      plaqueBottom: 'AÑADE TUS TEMAS A LA LISTA DE LA COMUNIDAD',
      motifs:
        'one big abstract vinyl record with deep groove rings, a halftone-dotted speaker silhouette, a tape-deck cassette hub as a circle, a torn paper strip, a rubber stamp shape labelled "TOP" and another labelled "PLAY", a bold play triangle ▶ icon, a hand-drawn tally mark "//// /"',
    },
    en: {
      kicker: 'BREAKS RADIO · ONLINE',
      mainHeadline: '40 BREAKS VITALES',
      sub: 'WEEKLY CHART · NEW RELEASES · VINYL PICKS',
      plaqueTop: 'LISTEN · DISCOVER · SAVE',
      plaqueBottom: 'ADD YOUR TRACKS TO THE COMMUNITY LIST',
      motifs:
        'one big abstract vinyl record with deep groove rings, a halftone-dotted speaker silhouette, a tape-deck cassette hub as a circle, a torn paper strip, a rubber stamp shape labelled "TOP" and another labelled "PLAY", a bold play triangle ▶ icon, a hand-drawn tally mark "//// /"',
    },
  },
  events: {
    es: {
      kicker: 'AGENDA DE BREAKBEAT · LIVE',
      mainHeadline: 'EVENTOS',
      sub: 'FESTIVALES · CLUB NIGHTS · BREAKBEAT PARTIES',
      plaqueTop: 'CALENDARIO · LINEUPS · TICKETS',
      plaqueBottom: 'NO TE PIERDAS UNA NOCHE',
      motifs:
        'a stack of three slightly tilted gig-poster rectangles with bold stencil titles (no real brand text), a large calendar/date block with a torn corner, a pair of crossed sound-system speakers as bold black silhouettes, a "SOLD OUT" rubber stamp shape angled in the cluster, a few halftone dot bursts, scattered ticket-stub strips with perforation marks',
    },
    en: {
      kicker: 'BREAKBEAT AGENDA · LIVE',
      mainHeadline: 'EVENTS',
      sub: 'FESTIVALS · CLUB NIGHTS · BREAKBEAT PARTIES',
      plaqueTop: 'CALENDAR · LINEUPS · TICKETS',
      plaqueBottom: 'DO NOT MISS A NIGHT',
      motifs:
        'a stack of three slightly tilted gig-poster rectangles with bold stencil titles (no real brand text), a large calendar/date block with a torn corner, a pair of crossed sound-system speakers as bold black silhouettes, a "SOLD OUT" rubber stamp shape angled in the cluster, a few halftone dot bursts, scattered ticket-stub strips with perforation marks',
    },
  },
  artists: {
    es: {
      kicker: 'ENCICLOPEDIA · ARCHIVO',
      mainHeadline: 'ARTISTAS',
      sub: 'DJS · PRODUCTORES · BREAKBEAT',
      plaqueTop: 'BIOGRAFÍA · DISCOGRAFÍA · MAPA',
      plaqueBottom: 'CIENTOS DE FICHAS, UNA CULTURA',
      motifs:
        'an abstract vinyl record with deep groove rings, a turntable stylus arm cutting across the cluster, a 7" label circle with a black-and-red bullseye, a halftone-dotted speaker silhouette, a rubber stamp shape labelled "ARCHIVE", a torn rolodex card, scattered ink splatters',
    },
    en: {
      kicker: 'ENCYCLOPEDIA · ARCHIVE',
      mainHeadline: 'ARTISTS',
      sub: 'DJS · PRODUCERS · BREAKBEAT',
      plaqueTop: 'BIOGRAPHY · DISCOGRAPHY · MAP',
      plaqueBottom: 'HUNDREDS OF PROFILES, ONE CULTURE',
      motifs:
        'an abstract vinyl record with deep groove rings, a turntable stylus arm cutting across the cluster, a 7" label circle with a black-and-red bullseye, a halftone-dotted speaker silhouette, a rubber stamp shape labelled "ARCHIVE", a torn rolodex card, scattered ink splatters',
    },
  },
  labels: {
    es: {
      kicker: 'ENCICLOPEDIA · CATÁLOGO',
      mainHeadline: 'SELLOS',
      sub: 'IMPRINTS · CATÁLOGOS · CULTURA VINILO',
      plaqueTop: 'HISTORIA · ROSTER · DISCOS',
      plaqueBottom: 'EL MAPA DEL BREAKBEAT, SELLO A SELLO',
      motifs:
        'three stylised rubber stamp shapes (square, oval, hexagon) with abstract crests (no real trademark), a row of vinyl spines as bold rectangles, a catalog index card with a torn corner, a generic record-sleeve placeholder with halftone dots',
    },
    en: {
      kicker: 'ENCYCLOPEDIA · CATALOG',
      mainHeadline: 'LABELS',
      sub: 'IMPRINTS · CATALOGS · VINYL CULTURE',
      plaqueTop: 'HISTORY · ROSTER · RELEASES',
      plaqueBottom: 'THE BREAKBEAT MAP, LABEL BY LABEL',
      motifs:
        'three stylised rubber stamp shapes (square, oval, hexagon) with abstract crests (no real trademark), a row of vinyl spines as bold rectangles, a catalog index card with a torn corner, a generic record-sleeve placeholder with halftone dots',
    },
  },
  scenes: {
    es: {
      kicker: 'GEOGRAFÍA · MOVIMIENTO',
      mainHeadline: 'ESCENAS',
      sub: 'CIUDADES · CREWS · HISTORIA LOCAL',
      plaqueTop: 'BRISTOL · BERLIN · MADRID · TOKYO',
      plaqueBottom: 'EL BREAKBEAT EN CADA CÓDIGO POSTAL',
      motifs:
        'shards of map line-art (no real country borders), a compass rose shape, a cut-paper city skyline silhouette, a halftone dot block, a rubber stamp shape labelled "CITY", a small flag-shaped torn paper element',
    },
    en: {
      kicker: 'GEOGRAPHY · MOVEMENT',
      mainHeadline: 'SCENES',
      sub: 'CITIES · CREWS · LOCAL HISTORY',
      plaqueTop: 'BRISTOL · BERLIN · MADRID · TOKYO',
      plaqueBottom: 'BREAKBEAT IN EVERY ZIP CODE',
      motifs:
        'shards of map line-art (no real country borders), a compass rose shape, a cut-paper city skyline silhouette, a halftone dot block, a rubber stamp shape labelled "CITY", a small flag-shaped torn paper element',
    },
  },
  blog: {
    es: {
      kicker: 'EDITORIAL · LARGO FORMATO',
      mainHeadline: 'BLOG',
      sub: 'ARTÍCULOS · ENSAYOS · ENTREVISTAS',
      plaqueTop: 'ESCRIBIMOS LA HISTORIA',
      plaqueBottom: 'DEEP CUTS Y CULTURA BREAKBEAT',
      motifs:
        'a stack of torn magazine pages with bold headline rules, a typewriter glyph block, ink splatters around a paragraph mark "¶", a rubber stamp shape labelled "READ", a folded newspaper corner, halftone dot strips',
    },
    en: {
      kicker: 'EDITORIAL · LONG FORM',
      mainHeadline: 'BLOG',
      sub: 'ARTICLES · ESSAYS · INTERVIEWS',
      plaqueTop: 'WE WRITE THE HISTORY',
      plaqueBottom: 'DEEP CUTS AND BREAKBEAT CULTURE',
      motifs:
        'a stack of torn magazine pages with bold headline rules, a typewriter glyph block, ink splatters around a paragraph mark "¶", a rubber stamp shape labelled "READ", a folded newspaper corner, halftone dot strips',
    },
  },
  mixes: {
    es: {
      kicker: 'SESIONES · DJ SETS',
      mainHeadline: 'MIXES',
      sub: 'CLASSIC SETS · ESSENTIAL MIXES · RADIO SHOWS',
      plaqueTop: 'DOS HORAS, MIL BREAKS',
      plaqueBottom: 'DARLE AL PLAY ES NUESTRA RELIGIÓN',
      motifs:
        'a bold horizontal waveform bar made of vertical stripes, a pair of headphones drawn as bold black silhouette, two cassette hubs as concentric circles, a rubber stamp shape labelled "MIX", a play triangle ▶ icon, halftone dot bursts',
    },
    en: {
      kicker: 'SESSIONS · DJ SETS',
      mainHeadline: 'MIXES',
      sub: 'CLASSIC SETS · ESSENTIAL MIXES · RADIO SHOWS',
      plaqueTop: 'TWO HOURS, A THOUSAND BREAKS',
      plaqueBottom: 'HITTING PLAY IS OUR RELIGION',
      motifs:
        'a bold horizontal waveform bar made of vertical stripes, a pair of headphones drawn as bold black silhouette, two cassette hubs as concentric circles, a rubber stamp shape labelled "MIX", a play triangle ▶ icon, halftone dot bursts',
    },
  },
  about: {
    es: {
      kicker: 'EL PROYECTO · MANIFIESTO',
      mainHeadline: 'OPTIMAL BREAKS',
      sub: 'ENCICLOPEDIA · CULTURA · BREAKS',
      plaqueTop: 'LA BIBLIA DEL BREAKBEAT',
      plaqueBottom: 'ARCHIVO · HISTORIA · COMUNIDAD',
      motifs:
        'an open fanzine spread suggestion with two facing pages, a masthead-style ribbon, a rubber stamp shape labelled "EST.", a halftone dot block, a torn paper banner, scattered ink splatters',
    },
    en: {
      kicker: 'THE PROJECT · MANIFESTO',
      mainHeadline: 'OPTIMAL BREAKS',
      sub: 'ENCYCLOPEDIA · CULTURE · BREAKS',
      plaqueTop: 'THE BREAKBEAT BIBLE',
      plaqueBottom: 'ARCHIVE · HISTORY · COMMUNITY',
      motifs:
        'an open fanzine spread suggestion with two facing pages, a masthead-style ribbon, a rubber stamp shape labelled "EST.", a halftone dot block, a torn paper banner, scattered ink splatters',
    },
  },
}

const SECTION_KEYS = Object.keys(SECTIONS)
const SUPPORTED_LANGS = ['es', 'en']

const LANG_NAME = { es: 'Spanish', en: 'English' }

function buildPromptFor(sectionKey, lang) {
  const cfg = SECTIONS[sectionKey][lang]
  const output = sectionOutputSize(sectionKey)
  const args = {
    language: LANG_NAME[lang],
    kicker: cfg.kicker,
    mainHeadline: cfg.mainHeadline,
    sub: cfg.sub,
    plaqueTop: cfg.plaqueTop,
    plaqueBottom: cfg.plaqueBottom,
    motifs: cfg.motifs,
    width: output.width,
    height: output.height,
  }
  if (output.height === 630) return buildFanzineWideOgPrompt(args)
  return buildFanzineLandscapePrompt(args)
}

function fileFor(sectionKey, lang) {
  return lang === 'en' ? `${sectionKey}-en.png` : `${sectionKey}.png`
}

async function generateOgImage(prompt) {
  const key = env('OPENAI_API_KEY')
  const model = process.env.OG_PROMO_IMAGE_MODEL?.trim() || 'gpt-image-2'

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

function parseArgs(argv) {
  const args = argv.slice(2)
  const out = {
    dryRun: false,
    force: false,
    sections: SECTION_KEYS.slice(),
    langs: SUPPORTED_LANGS.slice(),
    help: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--help' || a === '-h') {
      out.help = true
    } else if (a === '--dry-run') out.dryRun = true
    else if (a === '--force') out.force = true
    else if (a === '--sections' || a === '--only') {
      // `--only` se mantiene por compatibilidad, pero ojo: npm lo intercepta como
      // su propia config (warn `invalid config only=`) y el flag no llega al
      // script. Usar `--sections` cuando se invoca a través de `npm run`.
      const v = (args[++i] || '').trim()
      const keys = v.split(',').map((s) => s.trim()).filter(Boolean)
      const bad = keys.filter((k) => !SECTION_KEYS.includes(k))
      if (bad.length) throw new Error(`Secciones desconocidas: ${bad.join(', ')}`)
      out.sections = keys
    } else if (a === '--lang') {
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

function printHelp() {
  console.log(`
Uso: node scripts/generar-og-promo.mjs [opciones]

Genera el banner OG promocional (1200×1000, fanzine punk brutalist) por sección,
en español e inglés. Salida en public/images/opengraph/sections/<key>[-en].png

Opciones:
  --sections <a,b,c>   Solo estas secciones (coma): ${SECTION_KEYS.join(', ')}
                       (alias: --only — pero NO usable a través de npm run, npm lo intercepta)
  --lang <es|en|all>   Idioma a generar (default: all)
  --dry-run            Solo mostrar prompts y rutas, sin llamar a OpenAI
  --force              Sobrescribir aunque el archivo ya exista
  --help

Variables:
  OPENAI_API_KEY              (requerida salvo --dry-run)
  OG_PROMO_IMAGE_MODEL        opcional, default 'gpt-image-2'
  OG_PROMO_CROP_BIAS          0–1, sesgo vertical al recortar (default 0.41)
  OG_PROMO_FRAME_PADDING      0–0.14 fracción de marco crema (default 0.045)

Ejemplos:
  npm run og:promo -- --sections charts,events
  npm run og:promo -- --sections charts --lang en --force
  npm run og:promo -- --dry-run --sections events
`)
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

  console.log(
    `\n🖼  OG promo → ${OUT_DIR}` +
      `${opts.dryRun ? ' [DRY-RUN]' : ''}` +
      `  ·  secciones: ${opts.sections.join(', ')}` +
      `  ·  idiomas: ${opts.langs.join(', ')}\n`,
  )

  for (const sectionKey of opts.sections) {
    for (const lang of opts.langs) {
      const prompt = buildPromptFor(sectionKey, lang)
      const fileName = fileFor(sectionKey, lang)
      const outPath = join(OUT_DIR, fileName)

      if (opts.dryRun) {
        console.log(`  🔍 [${sectionKey}/${lang}] prompt ${prompt.length} chars → ${outPath}`)
        continue
      }

      if (existsSync(outPath) && !opts.force) {
        console.log(`  ⏭  [${sectionKey}/${lang}] ${fileName} ya existe (--force para regenerar)`)
        continue
      }

      try {
        const output = sectionOutputSize(sectionKey)
        console.log(`  🎨 [${sectionKey}/${lang}] generando… (${output.width}×${output.height})`)
        let buf = await generateOgImage(prompt)
        buf = await toFacebookOgPng(buf, output)
        writeFileSync(outPath, buf)
        console.log(
          `  ✅ [${sectionKey}/${lang}] ${fileName}  ${output.width}×${output.height}  (${(buf.length / 1024).toFixed(0)} KB)`,
        )
      } catch (e) {
        console.error(`  ❌ [${sectionKey}/${lang}] ${e.message}`)
      }
    }
  }

  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
