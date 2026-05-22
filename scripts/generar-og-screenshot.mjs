#!/usr/bin/env node
// ============================================
// OPTIMAL BREAKS — Captura OG 1200×630 de /charts (y /mixes)
// Playwright → PNG (sin menú nav, sin cookies). El resaltado rojo de la
// semana ACTUAL vive en ChartView (WeekAccordion) y sale en la captura.
// Salida: public/images/opengraph/sections/<sección>-screenshot.png
// ============================================

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'images', 'opengraph', 'sections')

const OG_WIDTH = 1200
const OG_HEIGHT = 630

const CAPTURE = {
  charts: { path: '/charts', outFile: 'charts-screenshot.png' },
  mixes: { path: '/mixes', outFile: 'mixes-screenshot.png' },
}

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

async function launchBrowser() {
  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    try {
      ;({ chromium } = await import('patchright'))
    } catch {
      ;({ chromium } = await import('playwright'))
    }
  }
  const args = ['--disable-dev-shm-usage', '--no-sandbox']
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, args })
  } catch {
    return await chromium.launch({ headless: true, args })
  }
}

async function captureSection({ sectionKey, lang, baseUrl, viewportHeight }) {
  const cfg = CAPTURE[sectionKey]
  const url = `${baseUrl.replace(/\/$/, '')}/${lang}${cfg.path}`
  const origin = new URL(url)
  const consentVal = encodeURIComponent(JSON.stringify({ necessary: true, analytics: false }))

  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({
      viewport: { width: OG_WIDTH, height: viewportHeight },
      deviceScaleFactor: 1,
      locale: lang === 'es' ? 'es-ES' : 'en-GB',
    })
    await context.addCookies([
      {
        name: 'ob_consent',
        value: consentVal,
        url: `${origin.protocol}//${origin.host}/`,
      },
    ])
    await context.addInitScript(() => {
      try {
        localStorage.setItem('ob_charts_promo_last_shown_at', String(Date.now()))
      } catch {
        /* ignore */
      }
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })

    const acceptCookies = page.getByRole('button', { name: /Aceptar todas|Accept all/i })
    if (await acceptCookies.isVisible({ timeout: 1500 }).catch(() => false)) {
      await acceptCookies.click()
      await page.waitForTimeout(400)
    }

    await page.waitForSelector('.danger-bar', { timeout: 60_000 })
    await page.waitForSelector('main header h1', { timeout: 60_000 })

    if (sectionKey === 'charts') {
      await page.waitForSelector('button[id^="picks-trigger-"]', { timeout: 60_000 }).catch(() => null)
    }

    const cropTop = await page.evaluate(() => {
      const bar = document.querySelector('.danger-bar')
      if (bar) return Math.max(0, Math.round(bar.getBoundingClientRect().top))
      const main = document.querySelector('main')
      return main ? Math.max(0, Math.round(main.getBoundingClientRect().top)) : 0
    })

    const buf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: cropTop, width: OG_WIDTH, height: OG_HEIGHT },
    })
    await context.close()
    return buf
  } finally {
    await browser.close()
  }
}

async function toOgPng(buf) {
  return sharp(buf)
    .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'top' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

function printHelp() {
  console.log(`
Uso: node scripts/generar-og-screenshot.mjs [opciones]

Captura 1200×630 de /charts o /mixes → public/images/opengraph/sections/
La semana ACTUAL ya lleva borde rojo en la UI (ChartView).

Opciones:
  --section <charts|mixes|all>   Sección (default: charts)
  --lang <es|en>                 Idioma (default: es)
  --base-url <url>               Origen (default: https://www.optimalbreaks.com)
  --viewport-height <n>          Alto viewport antes del clip (default: 900)
  --dry-run                      Solo mostrar config
  --force                        Sobrescribir salida
  --help

Ejemplos:
  npm run og:screenshot
  npm run og:screenshot -- --section charts --lang es --force
  npm run og:screenshot -- --base-url http://localhost:3000 --force
`)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const out = {
    section: 'charts',
    lang: 'es',
    baseUrl: process.env.OG_SCREENSHOT_BASE_URL?.trim() || 'https://www.optimalbreaks.com',
    viewportHeight: 900,
    dryRun: false,
    force: false,
    help: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--force') out.force = true
    else if (a === '--section') {
      out.section = (args[++i] || 'charts').trim().toLowerCase()
    } else if (a === '--lang') {
      out.lang = (args[++i] || 'es').trim().toLowerCase()
    } else if (a === '--base-url') {
      out.baseUrl = (args[++i] || out.baseUrl).trim()
    } else if (a === '--viewport-height') {
      out.viewportHeight = Number(args[++i]) || out.viewportHeight
    } else {
      throw new Error(`Argumento no reconocido: ${a}`)
    }
  }
  if (out.section === 'all') out.sections = Object.keys(CAPTURE)
  else {
    if (!CAPTURE[out.section]) throw new Error(`Sección desconocida: ${out.section}`)
    out.sections = [out.section]
  }
  if (!['es', 'en'].includes(out.lang)) throw new Error('--lang debe ser es o en')
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

  for (const sectionKey of opts.sections) {
    const cfg = CAPTURE[sectionKey]
    const outPath = join(OUT_DIR, cfg.outFile)
    const rawPath = join(OUT_DIR, cfg.outFile.replace('.png', '-raw.png'))

    if (opts.dryRun) {
      console.log(`🔍 [${sectionKey}] ${opts.baseUrl}/${opts.lang}${cfg.path} → ${outPath}`)
      continue
    }

    if (existsSync(outPath) && !opts.force) {
      console.log(`⏭  ${cfg.outFile} ya existe (--force para regenerar)`)
      continue
    }

    console.log(`📸 [${sectionKey}] capturando ${opts.baseUrl}/${opts.lang}${cfg.path}…`)
    let buf = await captureSection({
      sectionKey,
      lang: opts.lang,
      baseUrl: opts.baseUrl,
      viewportHeight: opts.viewportHeight,
    })
    writeFileSync(rawPath, buf)
    console.log(`   raw → ${rawPath} (${(buf.length / 1024).toFixed(0)} KB)`)

    buf = await toOgPng(buf)
    writeFileSync(outPath, buf)
    console.log(`✅ [${sectionKey}] ${outPath}  ${OG_WIDTH}×${OG_HEIGHT}  (${(buf.length / 1024).toFixed(0)} KB)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
