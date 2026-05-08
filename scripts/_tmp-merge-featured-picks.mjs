/**
 * Fusiona picks New Releases desde URLs Beatport (/release/) en un JSON semanal.
 * Uso: node scripts/_tmp-merge-featured-picks.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PICKS_JSON = resolve(__dirname, '..', 'data/charts/picks/2026-05-04.json')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** Una sola instancia navegador (Playwright oficial; sin playwright-extra). */
let _bw = null
async function getBrowser() {
  if (_bw) return _bw
  try {
    _bw = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    })
  } catch {
    _bw = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    })
  }
  return _bw
}

async function closeHeadlessBrowser() {
  if (_bw) {
    try {
      await _bw.close()
    } catch {}
    _bw = null
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchBeatportPageHeadless(url) {
  const browser = await getBrowser()
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: url.includes('/es/') ? 'es-ES' : 'en-US',
    viewport: { width: 1366, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': url.includes('/es/') ? 'es,en-US;q=0.9' : 'en-US,en;q=0.9',
    },
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      const has = await page
        .evaluate(() => !!document.querySelector('script#__NEXT_DATA__'))
        .catch(() => false)
      if (has) break
      await sleep(1500)
    }
    const html = await page.content()
    return html
  } finally {
    await ctx.close()
  }
}

async function fetchBeatportHtml(url) {
  const preferHeadless = process.argv.includes('--headless')
  if (preferHeadless) return fetchBeatportPageHeadless(url)

  const acceptLang = url.includes('/es/')
    ? 'es,en-US;q=0.9,en;q=0.8'
    : 'en-US,en;q=0.9'
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': acceptLang,
      },
    })
    if (!res.ok && (res.status === 403 || res.status === 503)) {
      console.warn(`  ↳ HTTP ${res.status} → headless`)
      return fetchBeatportPageHeadless(url)
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
    return await res.text()
  } catch (err) {
    console.warn(`  ↳ fetch: ${err.message} → headless`)
    return fetchBeatportPageHeadless(url)
  }
}

async function fetchNextData(pageUrl) {
  const html = await fetchBeatportHtml(pageUrl)
  const marker = '__NEXT_DATA__'
  const idx = html.indexOf(marker)
  if (idx === -1) throw new Error('no NEXT_DATA')
  const start = html.indexOf('>', idx) + 1
  const end = html.indexOf('</script>', start)
  return JSON.parse(html.slice(start, end).trim())
}

function artworkUrlFromBeatportEntity(t) {
  const rel = t.release?.image
  const trk = t.image
  const pick = (img) => {
    if (!img) return ''
    if (img.dynamic_uri) {
      return String(img.dynamic_uri).replace(/\{w\}/g, '250').replace(/\{h\}/g, '250')
    }
    if (img.uri) return String(img.uri)
    return ''
  }
  return pick(rel) || pick(trk) || ''
}

function beatportReleaseDateStr(t) {
  const raw = t.publish_date || t.new_release_date
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function pickFromTrackBlob(t) {
  if (!t || !t.id || !t.slug) return null
  const artists = (t.artists || [])
    .map((a) => ({ name: (a?.name || '').trim() }))
    .filter((x) => x.name)
  const link_url = `https://www.beatport.com/track/${t.slug}/${t.id}`
  const rd = beatportReleaseDateStr(t)
  const y = rd ? Number.parseInt(rd.slice(0, 4), 10) : null
  return {
    title: (t.name || '').trim(),
    mix_name: (t.mix_name || '').trim(),
    artists: artists.length ? artists : [{ name: 'Unknown' }],
    label: (t.release?.label?.name || '').trim(),
    platform: 'beatport',
    link_url,
    link_label: '',
    artwork_url: artworkUrlFromBeatportEntity(t),
    sample_url: (t.sample_url || '').trim() || '',
    bpm: typeof t.bpm === 'number' && t.bpm > 0 ? t.bpm : null,
    music_key: (t.key?.name_short || t.key?.name || '').trim(),
    release_year:
      Number.isFinite(y) && y >= 1970 && y <= 2100 ? y : undefined,
    release_date: rd || undefined,
    note_en: '',
    note_es: '',
  }
}

function findFirstTrackFromReleaseNextData(nextData) {
  let pick = null
  const qs = nextData?.props?.pageProps?.dehydratedState?.queries || []
  for (const q of qs) {
    const data = q?.state?.data
    if (!data || typeof data !== 'object') continue
    if (Array.isArray(data.results) && data.results[0]?.id && data.results[0]?.slug) {
      const p = pickFromTrackBlob(data.results[0])
      if (p?.title && p?.link_url && !pick) pick = p
    }
  }
  return pick
}

function normalizeFeaturedLinkUrl(raw) {
  let u = (raw || '').trim()
  if (!u) return ''
  u = u.replace(/^http:\/\//i, 'https://')
  u = u.replace(/^https:\/\/(www\.)?beatport\.com/i, 'https://www.beatport.com')
  u = u.replace(/\/+$/, '')
  return u.toLowerCase()
}

function dedupeKeyForFeaturedLink(linkUrl) {
  const n = normalizeFeaturedLinkUrl(linkUrl)
  const m = n.match(/\/track\/[^/]+\/(\d+)$/)
  if (m) return `beatport:${m[1]}`
  return n || linkUrl
}

function normalizeReleaseUrl(u) {
  return u
    .trim()
    .replace(/^https?:\/\/(www\.)?beatport\.com\/(es\/)?release\//i, 'https://www.beatport.com/release/')
}

const NEW_RELEASE_URLS = [
  'https://www.beatport.com/es/release/kinetic/6756323',
  'https://www.beatport.com/es/release/military-march/6652196',
  'https://www.beatport.com/es/release/armored/6586014',
  'https://www.beatport.com/es/release/my-apocolypse/6393847',
  'https://www.beatport.com/es/release/tricycle/6024665',
  'https://www.beatport.com/es/release/invisible/5945800',
  'https://www.beatport.com/es/release/fire-startr/5944059',
  'https://www.beatport.com/es/release/can-you/6771072',
  'https://www.beatport.com/es/release/drop/6764610',
  'https://www.beatport.com/es/release/i-dont-kno/6756353',
  'https://www.beatport.com/es/release/explosion/6899683',
  'https://www.beatport.com/es/release/as-as/6897104',
  'https://www.beatport.com/es/release/go/6895706',
  'https://www.beatport.com/es/release/clan-terrie-kynd-remix/6882492',
  'https://www.beatport.com/es/release/xray/6866170',
  'https://www.beatport.com/es/release/interface-frisson/6865191',
  'https://www.beatport.com/es/release/pump-the-base/6860382',
  'https://www.beatport.com/es/release/shake-the-room/6859267',
  'https://www.beatport.com/es/release/flippin-the-script/6823558',
  'https://www.beatport.com/es/release/rave-funk/6857628',
  'https://www.beatport.com/es/release/sonic-shift/6822466',
  'https://www.beatport.com/es/release/scarlet/6806858',
  'https://www.beatport.com/es/release/foghorns-lasers-bassbins-ep/6800218',
  'https://www.beatport.com/es/release/go-towards-the-light/6795811',
  'https://www.beatport.com/es/release/gotta-crush/6795360',
  'https://www.beatport.com/es/release/heartbeat/6795581',
  'https://www.beatport.com/es/release/days-with-you/6791109',
  'https://www.beatport.com/es/release/the-over-take-mine/6787632',
  'https://www.beatport.com/es/release/shake-it-baby/6787606',
  'https://www.beatport.com/es/release/solar-hallucinate/6783171',
  'https://www.beatport.com/es/release/feels-like/6780433',
]

const data = JSON.parse(readFileSync(PICKS_JSON, 'utf8'))
const weekDate = data.week_date
const existing = Array.isArray(data.picks) ? data.picks : []

const seenKeys = new Set()
for (const p of existing) {
  const k = dedupeKeyForFeaturedLink(p.link_url || '')
  if (k) seenKeys.add(k)
}

const added = []
let skippedDupUrl = 0
const seenReleaseUrls = new Set()

for (const raw of NEW_RELEASE_URLS) {
  const url = normalizeReleaseUrl(raw)
  if (seenReleaseUrls.has(url)) {
    console.log('Saltado (release repetido en lista):', url)
    continue
  }
  seenReleaseUrls.add(url)
  console.log('Fetch', url)
  await new Promise((r) => setTimeout(r, 450))
  try {
    const nd = await fetchNextData(url)
    const pick = findFirstTrackFromReleaseNextData(nd)
    if (!pick?.link_url) {
      console.warn('  ✗ sin primer track')
      continue
    }
    const k = dedupeKeyForFeaturedLink(pick.link_url)
    if (seenKeys.has(k)) {
      console.warn('  ⊗ ya en semana (mismo track):', pick.title, pick.link_url)
      skippedDupUrl++
      continue
    }
    seenKeys.add(k)
    added.push(pick)
    console.log('  ✓', pick.title, '→', pick.link_url)
  } catch (e) {
    console.warn('  ✗', e.message)
  }
}

const merged = [...existing, ...added]
merged.forEach((p, i) => {
  p.sort_order = i + 1
})

writeFileSync(
  PICKS_JSON,
  `${JSON.stringify({ week_date: weekDate, picks: merged }, null, 2)}\n`,
  'utf8',
)
console.log(
  `\nListo: ${existing.length} + ${added.length} nuevos (${skippedDupUrl} omitidos por track ya presente). Total ${merged.length}.`,
)

await closeHeadlessBrowser()
