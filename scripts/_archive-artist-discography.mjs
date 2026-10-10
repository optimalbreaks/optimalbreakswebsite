/**
 * Piloto: discografía Beatport de unos artistas → Selecciones de archivo.
 *
 * Lee /artist/…/tracks (publish_date hasta 2025-12-31), agrupa cada tema en el
 * lunes ISO de su release y hace INSERT en chart_featured_tracks. No borra picks
 * ya publicados. Un tema que ya está (mismo id Beatport) se salta.
 * Lo de 2026 no entra: eso es New Releases, no este archivo.
 *
 *   node scripts/_archive-artist-discography.mjs
 *   node scripts/_archive-artist-discography.mjs terrie-kynd
 *   node scripts/_archive-artist-discography.mjs --dry-run
 *   node scripts/_archive-artist-discography.mjs --nr-2026
 *   node scripts/_archive-artist-discography.mjs --outside
 *   node scripts/_archive-artist-discography.mjs --outside --nr-2026
 *   node scripts/_archive-artist-discography.mjs --full vazteria-x
 *   node scripts/_archive-artist-discography.mjs --nr-2026 --all-weeks evil-crew
 *
 * --full mete todo el catálogo hasta hoy (archivo + 2026 en su semana real).
 * --all-weeks con --nr-2026 mete el 2026 aunque la semana ya tenga 20 temas.
 *
 * --nr-2026 mete releases de 2026 (1 ene → hoy) solo en las semanas de New
 * Releases que tienen menos de 20 temas. El corte del 22 mar dejó flojas
 * el 23 y el 30 de marzo; la semana en curso también entra si está corta.
 * Lo que ya está por id de Beatport se salta. Progreso aparte del lote viejo.
 *
 * --outside es el lote de fuera del Top 50 con 6+ «+» editoriales (sep 2026).
 * SANS y Kritycal System ya estaban importados: SANS solo entra en --nr-2026.
 * Face y Book son el dúo Face & Book (un solo scrape). Vazteria X: solo temas.
 *
 * Sin argumentos recorre el Top 50 de artistas (salvo Shade K, Guau y Yo Speed,
 * ya importados). El progreso va a scripts/_archive-top50-progress.txt: si se
 * corta, el siguiente arranque salta los slugs ya cerrados.
 */
import { appendFileSync, readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { extractRemixerNames, mergeArtistCreditObjects } from './lib/remixer-credits.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry-run')
const NR2026 = process.argv.includes('--nr-2026')
const OUTSIDE = process.argv.includes('--outside')
const FULL = process.argv.includes('--full')
const ALL_WEEKS = FULL || process.argv.includes('--all-weeks')
const CUTOFF = '2026-01-01'
const NR_FROM = '2026-01-01'
const NR_UNTIL = '2026-10-07'
const THIN_UNDER = 20
const PER_PAGE = 150
const PAUSE_MS = 1800
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const ARTISTS = [
  { slug: 'terrie-kynd', id: 527766, name: 'Terrie Kynd' },
  { slug: 'huda-hudia', id: 446, name: 'Huda Hudia' },
  { slug: 'slug-fl', id: 998525, name: 'SluG (FL)' },
  { slug: 'ed-solo', id: 750, name: 'Ed Solo' },
  { slug: 'plump-djs', id: 2955, name: 'Plump DJs' },
  { slug: 'specimen-a', id: 36682, name: 'Specimen A' },
  { slug: 'ondamike', id: 201484, name: 'Ondamike' },
  { slug: 'freestylers', id: 711, name: 'Freestylers' },
  { slug: 'afghan-headspin', id: 30700, name: 'Afghan Headspin' },
  { slug: 'devis-hard', id: 1255603, name: 'Devis Hard' },
  { slug: 'deekline', id: 3171, name: 'Deekline' },
  { slug: 'j-break', id: 3234, name: 'J-Break' },
  { slug: 'dj-brownie', id: 355093, name: 'DJ Brownie' },
  { slug: 'krafty-kuts', id: 2163, name: 'Krafty Kuts' },
  { slug: 'skool-of-thought', id: 759, name: 'Skool of Thought' },
  { slug: 'ivory', id: 11641, name: 'IVORY' },
  { slug: 'ctrl-z', id: 977116, name: 'CTRL-Z' },
  { slug: 'bad-legs', id: 668750, name: 'Bad Legs' },
  { slug: 'phoenixrising', id: 1182286, name: 'PhoenixRising' },
  { slug: 'd-fast-beats', id: 681171, name: 'D-Fast Beats' },
  { slug: 'mbreaks', id: 1043009, name: 'MBREAKS' },
  { slug: 'bowser', id: 47029, name: 'Bowser' },
  { slug: 'wizard', id: 15539, name: 'Wizard' },
  { slug: 'paket', id: 386044, name: 'Paket' },
  { slug: 'gruv42', id: 1048007, name: 'Gruv42' },
  { slug: 'the-return-good', id: 1331560, name: 'The Return Good' },
  { slug: 'maxuka', id: 1280569, name: 'Maxuka' },
  { slug: 'danny-phr3ntic', id: 1233230, name: 'Danny Phr3ntic' },
  { slug: 'dj-wavs', id: 921459, name: 'DJ WAVS' },
  { slug: 'perfect-kombo', id: 131092, name: 'Perfect Kombo' },
  { slug: 'anuschka', id: 323367, name: 'Anuschka' },
  { slug: 'sellrude', id: 753458, name: 'Sellrude' },
  { slug: 'future-funk-squad', id: 463, name: 'Future Funk Squad' },
  { slug: 'greenflamez', id: 918834, name: 'GreenFlamez' },
  { slug: 'mizzo', id: 605037, name: 'Mizzo' },
  { slug: 'dj-sploo', id: 1110808, name: 'Dj Sploo' },
  { slug: 'bzrnt', id: 1075789, name: 'Bzrnt' },
  { slug: 'dr-beats', id: 227118, name: 'Dr Beats' },
  { slug: 'ro73', id: 1113665, name: 'Ro73' },
  { slug: 'miau', id: 633679, name: 'MIAU' },
  { slug: 'stacy-mcclure', id: 1369918, name: 'Stacy McClure' },
  { slug: 'rutek', id: 1271329, name: 'Rutek' },
  { slug: 'seekflow', id: 672775, name: 'SeekFlow' },
  { slug: 'andrewfx', id: 1176911, name: 'AndrewFx' },
  { slug: 'ryan-blake', id: 1258986, name: 'Ryan Blake' },
  { slug: 'brothers-of-funk', id: 16697, name: 'Brothers Of Funk' },
  { slug: 'bryan', id: 191653, name: 'Bryan' },
  { slug: 'kritycal-system', id: 1291419, name: 'Kritycal System' },
]
const ALREADY_DONE_PRE2026 = [
  { slug: 'shade-k', id: 221354, name: 'Shade K' },
  { slug: 'guau', id: 117449, name: 'Guau' },
  { slug: 'yo-speed', id: 526398, name: 'Yo Speed' },
]
// Fuera del Top 50, 6+ «+» de la cuenta editorial. SANS y Kritycal System ya
// importados (SANS solo falta el tramo Q1). Face + Book = Face & Book.
const OUTSIDE_PRE = [
  { slug: 'vital-drums', id: 1305200, name: 'Vital Drums' },
  { slug: 'evil-crew', id: 1162066, name: 'Evil Crew' },
  { slug: 'woter', id: 310684, name: 'Woter' },
  { slug: 'killerblitz', id: 1258735, name: 'Killerblitz' },
  { slug: 'vazteria-x', id: 227121, name: 'Vazteria X' },
  { slug: 'dj-guanxe', id: 1256028, name: 'Dj Guanxe' },
  { slug: 'aspect-one', id: 2380413, name: 'Aspect One' },
  { slug: 'fm-3', id: 402033, name: 'FM-3' },
  { slug: 'mixedup-mike', id: 1384671, name: 'Mixedup-Mike' },
  { slug: 'manxito', id: 1283708, name: 'Manxito' },
  { slug: 'godino', id: 1280587, name: 'Godino' },
  { slug: 'destroyers', id: 80323, name: 'Destroyers' },
  { slug: 'twook', id: 1114645, name: 'Twook' },
  { slug: 'mutant-breakz', id: 135018, name: 'Mutantbreakz' },
  { slug: 'macgroove', id: 2286106, name: 'MacGroove' },
  { slug: 'datafunk', id: 1298577, name: 'DataFunk' },
  { slug: 'hankook', id: 395511, name: 'Hankook' },
  { slug: 'macho', id: 112381, name: 'Macho' },
  { slug: 'jem-haynes', id: 88378, name: 'Jem Haynes' },
  { slug: 'urso-sp', id: 1449335, name: 'URSO (SP)' },
  { slug: 'fortuny', id: 785047, name: 'Fortuny' },
  { slug: 'four-motion', id: 138396, name: 'Four Motion' },
  { slug: 'nitro-esp', id: 1035102, name: 'Nitro (ESP)' },
  { slug: 'vkyng', id: 1237777, name: 'Vkyng' },
  { slug: 'nosk', id: 435512, name: 'NOSK' },
  { slug: 'orebeat', id: 1105377, name: 'Orebeat' },
  { slug: 'stanton-warriors', id: 2181, name: 'Stanton Warriors' },
  { slug: 'aggresivnes', id: 110518, name: 'Aggresivnes' },
  { slug: 'sir1', id: 1394149, name: 'Sir1' },
  { slug: 'hatstandy', id: 613048, name: 'HatStandy' },
  { slug: 'fran-break', id: 871993, name: 'Fran Break' },
  { slug: 'code-breakerz', id: 1077289, name: 'CODE BREAKERZ' },
  { slug: 'pumbass', id: 373029, name: 'Pumbass' },
  { slug: 'timonk', id: 373028, name: 'Timonk' },
  { slug: 'dj-hero', id: 34439, name: 'DJ Hero' },
  { slug: 'helicopter', id: 336085, name: 'Helicopter' },
  { slug: 'lady-waks', id: 37583, name: 'Lady Waks' },
  { slug: 'acenoise', id: 1205597, name: 'AceNoise' },
  { slug: 'face-book', id: 592996, name: 'Face & Book' },
  { slug: 'buson', id: 1295722, name: 'Buson' },
  { slug: 'welder-b', id: 1212957, name: 'Welder B' },
  { slug: 'sulivanz', id: 2402453, name: 'SulivanZ' },
  { slug: 'tomy', id: 479402, name: 'TOMY' },
]
const OUTSIDE_NR = [{ slug: 'sans', id: 254398, name: 'SANS' }, ...OUTSIDE_PRE]
// Fichas nuevas con página de Beatport de una sola persona. En --nr-2026
// entran con el resto. DJ Tokyo (186585) mezcla a otro artista; The Legends
// no tiene página limpia.
const ON_REQUEST = [
  { slug: 'pray-for-bass', id: 550087, name: 'Pray For Bass' },
  { slug: 'kid-kenobi', id: 24390, name: 'Kid Kenobi' },
  { slug: 'kenny-beeper', id: 403456, name: 'Kenny Beeper' },
]
// Puestos 51–100 del tablero (7 oct 2026). Vazteria X: solo temas, sin ficha.
// Koma y Bones en el tablero son el dúo Koma & Bones (un solo scrape).
const RANK_51_100 = [
  { slug: 'evil-crew', id: 1162066, name: 'Evil Crew' },
  { slug: 'brothers-of-funk', id: 16697, name: 'Brothers Of Funk' },
  { slug: 'orebeat', id: 1105377, name: 'Orebeat' },
  { slug: 'hankook', id: 395511, name: 'Hankook' },
  { slug: 'bryan', id: 191653, name: 'Bryan' },
  { slug: 'dj-guanxe', id: 1256028, name: 'Dj Guanxe' },
  { slug: 'nosk', id: 435512, name: 'NOSK' },
  { slug: 'fm-3', id: 402033, name: 'FM-3' },
  { slug: 'destroyers', id: 80323, name: 'Destroyers' },
  { slug: 'keith-mackenzie', id: 3315, name: 'Keith MacKenzie' },
  { slug: 'mixedup-mike', id: 1384671, name: 'Mixedup-Mike' },
  { slug: 'mutant-breakz', id: 135018, name: 'Mutantbreakz' },
  { slug: 'vital-drums', id: 1305200, name: 'Vital Drums' },
  { slug: 'stanton-warriors', id: 2181, name: 'Stanton Warriors' },
  { slug: 'macho', id: 112381, name: 'Macho' },
  { slug: 'killerblitz', id: 1258735, name: 'Killerblitz' },
  { slug: 'godino', id: 1280587, name: 'Godino' },
  { slug: 'k5', id: 36761, name: 'K5' },
  { slug: 'sir1', id: 1394149, name: 'Sir1' },
  { slug: 'aggresivnes', id: 110518, name: 'Aggresivnes' },
  { slug: 'woter', id: 310684, name: 'Woter' },
  { slug: 'the-breakfastaz', id: 3710, name: 'The Breakfastaz' },
  { slug: 'dj-fixx', id: 443, name: 'DJ Fixx' },
  { slug: 'manxito', id: 1283708, name: 'Manxito' },
  { slug: 'hatstandy', id: 613048, name: 'HatStandy' },
  { slug: 'dj-icey', id: 11440, name: 'DJ Icey' },
  { slug: 'wez-whatevr', id: 674005, name: 'WeZ WhaTevR' },
  { slug: 'vazteria-x', id: 227121, name: 'Vazteria X' },
  { slug: 'urso-sp', id: 1449335, name: 'URSO (SP)' },
  { slug: 'jem-haynes', id: 88378, name: 'Jem Haynes' },
  { slug: 'shenanigoons', id: 1394148, name: 'ShenaniGoons' },
  { slug: 'godfader', id: 1285179, name: 'Godfader' },
  { slug: 'blow-sp', id: 1258568, name: 'BLOW (SP)' },
  { slug: 'deep-impact', id: 3174, name: 'Deep Impact' },
  { slug: 'citybox', id: 503314, name: 'Citybox' },
  { slug: 'macgroove', id: 2286106, name: 'MacGroove' },
  { slug: 'queen-of-breakbeat-dirty-d', id: 2330158, name: 'Queen of Breakbeat (Dirty D)' },
  { slug: 'jormek', id: 956125, name: 'Jormek' },
  { slug: '936', id: 2383913, name: '936' },
  { slug: 'datafunk', id: 1298577, name: 'DataFunk' },
  { slug: 'koma-bones', id: 2176, name: 'Koma & Bones' },
  { slug: 'fortuny', id: 785047, name: 'Fortuny' },
  { slug: 'wutam', id: 3233, name: 'Wutam' },
  { slug: 'jiro', id: 20535, name: 'Jiro' },
  { slug: 'fran-break', id: 871993, name: 'Fran Break' },
  { slug: 'neva', id: 482658, name: 'Neva' },
  { slug: 'brothers-bud', id: 2958, name: 'Brothers Bud' },
  { slug: 'loopcrashing', id: 854454, name: 'Loopcrashing' },
  { slug: 'prato', id: 72360, name: 'Prato' },
]
const ROSTER = OUTSIDE
  ? NR2026
    ? OUTSIDE_NR
    : OUTSIDE_PRE
  : NR2026
    ? [...ALREADY_DONE_PRE2026, ...ARTISTS, ...ON_REQUEST]
    : ARTISTS
const wanted = new Set(
  process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase()),
)
const PROGRESS = join(
  ROOT,
  wanted.size
    ? FULL
      ? 'scripts/_archive-rank51-full-progress.txt'
      : NR2026
        ? 'scripts/_archive-rank51-2026-progress.txt'
        : 'scripts/_archive-rank51-progress.txt'
    : OUTSIDE
      ? NR2026
        ? 'scripts/_archive-outside-2026-oct-progress.txt'
        : 'scripts/_archive-outside-progress.txt'
      : NR2026
        ? 'scripts/_archive-top50-2026-oct-progress.txt'
        : 'scripts/_archive-top50-progress.txt',
)
const PUBLISH_FILTER = FULL ? `:${NR_UNTIL}` : NR2026 ? `${NR_FROM}:${NR_UNTIL}` : ':2025-12-31'
const already = new Set()
if (existsSync(PROGRESS)) {
  for (const line of readFileSync(PROGRESS, 'utf8').split('\n')) {
    const s = line.trim()
    if (s) already.add(s)
  }
}
const POOL = wanted.size
  ? [...new Map([...ROSTER, ...ON_REQUEST, ...RANK_51_100].map((a) => [a.slug, a])).values()]
  : ROSTER
const TODO = (wanted.size ? POOL.filter((a) => wanted.has(a.slug)) : ROSTER).filter(
  (a) => !already.has(a.slug),
)
if (wanted.size && TODO.length === 0) {
  console.error(`Ningún artista conocido en: ${[...wanted].join(', ')}`)
  process.exit(1)
}

function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    const p = join(ROOT, file)
    if (!existsSync(p)) continue
    let text = readFileSync(p, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    for (const line of text.split('\n')) {
      let t = line.trim()
      if (t.startsWith('export ')) t = t.slice(7).trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[k] === undefined) process.env[k] = v
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function weekMonday(iso) {
  const s = String(iso || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [ys, ms, ds] = s.split('-')
  const d = new Date(Number(ys), Number(ms) - 1, Number(ds))
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function artworkUrl(raw) {
  if (!raw) return null
  return String(raw).replace(/\{w\}/g, '250').replace(/\{h\}/g, '250')
}

function beatportIdFromLink(url) {
  const m = String(url || '').match(/\/track\/[^/]+\/(\d+)/i)
  return m ? m[1] : ''
}

function foldTrackText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Mismo título + mismo mix + mismos artistas. Otro mix no cuenta como duplicado. */
function sameMixIdentity(title, mix, artistNames) {
  const t = foldTrackText(title)
  const names = (Array.isArray(artistNames) ? artistNames : String(artistNames || '').split(','))
    .map((n) => foldTrackText(n))
    .filter(Boolean)
    .sort()
  if (!t || !names.length) return ''
  return `${t}\u0001${foldTrackText(mix)}\u0001${names.join('|')}`
}

async function waitForNextData(page) {
  const deadline = Date.now() + 150000
  while (Date.now() < deadline) {
    const has = await page.evaluate(() => !!document.querySelector('script#__NEXT_DATA__')).catch(() => false)
    if (has) return
    const title = await page.title().catch(() => '')
    console.log(`    · esperando — "${title}"`)
    await page.waitForTimeout(1500)
  }
  throw new Error('__NEXT_DATA__ no apareció')
}

async function readTracksPage(page) {
  return page.evaluate(() => {
    const el = document.querySelector('script#__NEXT_DATA__')
    if (!el) return null
    const data = JSON.parse(el.textContent)
    const queries = data?.props?.pageProps?.dehydratedState?.queries || []
    const q = queries.find((item) => Array.isArray(item.queryKey) && item.queryKey[0] === 'tracks')
    const results = q?.state?.data?.results || []
    return {
      count: q?.state?.data?.count ?? results.length,
      results: results.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        mix_name: t.mix_name || '',
        publish_date: t.publish_date || t.new_release_date || '',
        bpm: t.bpm ?? null,
        music_key: t.key?.name || '',
        sample_url: t.sample_url || '',
        genre: t.genre?.name || '',
        artists: [...(t.artists || []), ...(t.remixers || [])].map((a) => ({
          name: a?.name || '',
          slug: a?.slug || '',
          id: a?.id || null,
        })),
        label: t.release?.label?.name || t.label?.name || '',
        image:
          t.release?.image?.dynamic_uri ||
          t.release?.image?.uri ||
          t.image?.dynamic_uri ||
          t.image?.uri ||
          '',
      })),
    }
  })
}

async function openTracksPage(browser, url) {
  const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US', viewport: { width: 1366, height: 800 } })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await waitForNextData(page)
    const payload = await readTracksPage(page)
    if (!payload) throw new Error(`sin tracks query en ${url}`)
    return payload
  } finally {
    await ctx.close()
  }
}

async function scrapeArtist(browser, artist) {
  const out = []
  let pageNum = 1
  let total = Infinity
  while ((pageNum - 1) * PER_PAGE < total) {
    const url = `https://www.beatport.com/artist/${artist.slug}/${artist.id}/tracks?page=${pageNum}&per_page=${PER_PAGE}&publish_date=${PUBLISH_FILTER}`
    console.log(`  · ${artist.name} p${pageNum}`)
    const payload = await openTracksPage(browser, url)
    total = payload.count
    console.log(`    ${payload.results.length} en página, total ${total}`)
    out.push(...payload.results)
    if (!payload.results.length || out.length >= total) break
    pageNum += 1
    await sleep(PAUSE_MS)
  }
  return out
}

function toPick(raw) {
  const day = String(raw.publish_date || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  if (FULL) {
    if (day > NR_UNTIL) return null
  } else if (NR2026) {
    if (day < NR_FROM || day > NR_UNTIL) return null
  } else if (day >= CUTOFF) return null
  if (!raw.id || !raw.slug || !raw.name) return null
  const credited = mergeArtistCreditObjects(
    (raw.artists || [])
      .filter((a) => a?.name)
      .map((a) => ({
        name: a.name,
        ...(a.slug && a.id ? { url: `https://www.beatport.com/artist/${a.slug}/${a.id}` } : {}),
      })),
    extractRemixerNames(raw.mix_name),
  )
  const artists = credited.length ? credited : [{ name: 'Unknown' }]
  const bpm = raw.bpm != null && Number(raw.bpm) > 0 ? Number(raw.bpm) : null
  return {
    beatportId: String(raw.id),
    week: weekMonday(day),
    title: String(raw.name).trim(),
    mix_name: String(raw.mix_name || '').trim(),
    artists,
    label: String(raw.label || '').trim(),
    platform: 'beatport',
    link_url: `https://www.beatport.com/track/${raw.slug}/${raw.id}`,
    link_label: '',
    artwork_url: artworkUrl(raw.image),
    sample_url: String(raw.sample_url || '').trim() || null,
    bpm,
    music_key: String(raw.music_key || '').trim(),
    release_year: Number(day.slice(0, 4)),
    release_date: day,
    genre: raw.genre || '',
    note_en: '',
    note_es: '',
  }
}

async function loadAll(supabase, table, columns) {
  const rows = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + page - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < page) break
  }
  return rows
}

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y service role')
  process.exit(1)
}
const supabase = createClient(url, key, { auth: { persistSession: false } })

if (TODO.length === 0) {
  console.log(already.size ? 'Top 50 ya importado (progreso completo).' : 'Nada que importar.')
  process.exit(0)
}
console.log(`Cola: ${TODO.length} artistas${already.size ? ` (${already.size} ya cerrados)` : ''}${FULL ? ` · catálogo completo hasta ${NR_UNTIL}` : NR2026 ? ` · New Releases ${NR_FROM} → ${NR_UNTIL}${ALL_WEEKS ? ' · todas las semanas' : ''}` : ''}`)

const existingLinks = await loadAll(supabase, 'chart_featured_tracks', 'link_url, title, mix_name, artist_names_text')
const existingIds = new Set(existingLinks.map((r) => beatportIdFromLink(r.link_url)).filter(Boolean))
const existingIdentities = new Set()
for (const row of existingLinks) {
  const key = sameMixIdentity(row.title, row.mix_name, row.artist_names_text)
  if (key) existingIdentities.add(key)
}
const editions = await loadAll(supabase, 'chart_editions', 'id, week_date')
const editionByWeek = new Map(editions.map((e) => [e.week_date, e.id]))
const sortRows = await loadAll(supabase, 'chart_featured_tracks', 'chart_edition_id, sort_order')
const maxSort = new Map()
const editionCount = new Map()
for (const r of sortRows) {
  const n = Number(r.sort_order) || 0
  maxSort.set(r.chart_edition_id, Math.max(maxSort.get(r.chart_edition_id) || 0, n))
  editionCount.set(r.chart_edition_id, (editionCount.get(r.chart_edition_id) || 0) + 1)
}
const thinWeeks = new Set()
if (NR2026) {
  for (const e of editions) {
    if (e.week_date < NR_FROM || e.week_date > NR_UNTIL) continue
    const n = editionCount.get(e.id) || 0
    if (n < THIN_UNDER) thinWeeks.add(e.week_date)
  }
  console.log(
    thinWeeks.size
      ? `Semanas con menos de ${THIN_UNDER}: ${[...thinWeeks].sort().join(', ')}`
      : `Ninguna semana de 2026 por debajo de ${THIN_UNDER}.`,
  )
}

let createdEditions = 0
let inserted = 0
const byYear = new Map()
const byGenre = new Map()
const report = []

async function persistFresh(fresh) {
  const byWeek = new Map()
  for (const pick of fresh) {
    if (!pick.week) continue
    const list = byWeek.get(pick.week) || []
    list.push(pick)
    byWeek.set(pick.week, list)
  }
  let added = 0
  for (const [week, picks] of [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let editionId = editionByWeek.get(week)
    if (!editionId) {
      const { data, error } = await supabase
        .from('chart_editions')
        .insert({
          week_date: week,
          title: `40 Breaks Vitales — ${week}`,
          description_en: `The 40 breakbeat tracks defining the week of ${week}.`,
          description_es: `Los 40 temas de breakbeat que definen la semana del ${week}.`,
          sources: [],
          is_published: true,
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (error) throw new Error(`edition ${week}: ${error.message}`)
      editionId = data.id
      editionByWeek.set(week, editionId)
      createdEditions += 1
    }
    let sort = maxSort.get(editionId) || 0
    for (let i = 0; i < picks.length; i += 100) {
      const slicePicks = picks.slice(i, i + 100)
      const rows = slicePicks.map((p) => {
        sort += 1
        if (sort > 32767) throw new Error(`sort_order agotado en ${week}`)
        return {
          chart_edition_id: editionId,
          sort_order: sort,
          title: p.title,
          mix_name: p.mix_name,
          artists: p.artists,
          label: p.label,
          platform: p.platform,
          link_url: p.link_url,
          link_label: '',
          artwork_url: p.artwork_url,
          sample_url: p.sample_url,
          bpm: p.bpm,
          music_key: p.music_key,
          release_year: p.release_year,
          release_date: p.release_date,
          note_en: '',
          note_es: '',
        }
      })
      const { error } = await supabase.from('chart_featured_tracks').insert(rows)
      if (error) throw new Error(`insert ${week}: ${error.message}`)
      maxSort.set(editionId, sort)
      for (const p of slicePicks) {
        existingIds.add(p.beatportId)
        const key = sameMixIdentity(p.title, p.mix_name, (p.artists || []).map((a) => a.name))
        if (key) existingIdentities.add(key)
      }
      added += rows.length
    }
  }
  return added
}

function launchBrowser() {
  return chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox'],
  })
}

let browser = await launchBrowser()
let pageOpens = 0
const origOpen = openTracksPage
async function openCounted(url) {
  pageOpens += 1
  if (pageOpens > 1 && pageOpens % 12 === 0) {
    console.log('  · pausa larga')
    await sleep(12000)
  }
  return origOpen(browser, url)
}

try {
  for (const artist of TODO) {
    console.log(`\n${artist.name}`)
    let raw
    try {
      raw = await (async () => {
        const out = []
        let pageNum = 1
        let total = Infinity
        while ((pageNum - 1) * PER_PAGE < total) {
          const pageUrl = `https://www.beatport.com/artist/${artist.slug}/${artist.id}/tracks?page=${pageNum}&per_page=${PER_PAGE}&publish_date=${PUBLISH_FILTER}`
          console.log(`  · ${artist.name} p${pageNum}`)
          let payload
          let lastErr
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              payload = await openCounted(pageUrl)
              break
            } catch (e) {
              lastErr = e
              console.warn(`    reintento ${attempt}: ${e.message}`)
              await sleep(5000)
              try { await browser.close() } catch { /* sigue */ }
              browser = await launchBrowser()
            }
          }
          if (!payload) throw lastErr
          total = payload.count
          console.log(`    ${payload.results.length} en página, total ${total}`)
          out.push(...payload.results)
          if (!payload.results.length || out.length >= total) break
          pageNum += 1
          await sleep(PAUSE_MS)
        }
        return out
      })()
    } catch (e) {
      console.error(`  FALLO ${artist.name}: ${e.message}`)
      report.push({ name: artist.name, error: e.message })
      try { await browser.close() } catch { /* sigue */ }
      browser = await launchBrowser()
      continue
    }

    const byId = new Map()
    for (const row of raw) {
      const pick = toPick(row)
      if (!pick || byId.has(pick.beatportId)) continue
      pick.sourceArtist = artist.name
      byId.set(pick.beatportId, pick)
    }
    const unique = [...byId.values()]
    const chosen = new Map()
    const fresh = []
    for (const p of unique) {
      if (NR2026 && !ALL_WEEKS && !thinWeeks.has(p.week)) continue
      if (existingIds.has(p.beatportId)) continue
      const key = sameMixIdentity(p.title, p.mix_name, (p.artists || []).map((a) => a.name))
      if (key && existingIdentities.has(key)) continue
      if (key && chosen.has(key)) {
        const prev = chosen.get(key)
        if (String(p.release_date || '9999') < String(prev.release_date || '9999')) chosen.set(key, p)
        continue
      }
      if (key) chosen.set(key, p)
      else fresh.push(p)
    }
    fresh.push(...chosen.values())
    const years = new Map()
    for (const p of fresh) {
      const y = String(p.release_year)
      years.set(y, (years.get(y) || 0) + 1)
      byYear.set(y, (byYear.get(y) || 0) + 1)
      byGenre.set(p.genre || '?', (byGenre.get(p.genre || '?') || 0) + 1)
    }
    console.log(`  → ${unique.length} en rango, nuevos ${fresh.length}`)
    if (DRY) {
      report.push({ name: artist.name, scraped: unique.length, fresh: fresh.length, inserted: 0 })
      continue
    }
    try {
      const added = fresh.length ? await persistFresh(fresh) : 0
      inserted += added
      appendFileSync(PROGRESS, `${artist.slug}\n`)
      report.push({ name: artist.name, scraped: unique.length, fresh: fresh.length, inserted: added, years: [...years.entries()].sort((a, b) => b[0].localeCompare(a[0])) })
      console.log(`  guardados ${added}`)
    } catch (e) {
      console.error(`  FALLO al guardar ${artist.name}: ${e.message}`)
      report.push({ name: artist.name, error: e.message, scraped: unique.length, fresh: fresh.length })
    }
    await sleep(PAUSE_MS)
  }
} finally {
  await browser.close()
}

console.log(`\nScrapeados en esta pasada. Nuevos insertados: ${inserted}. Ediciones nuevas: ${createdEditions}.`)
console.log('Por año:', [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([y, n]) => `${y}:${n}`).join('  '))
console.log('Por género:', [...byGenre.entries()].sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g}:${n}`).join('  '))
for (const row of report) {
  if (row.error) console.log(`  ${row.name}: ERROR ${row.error}`)
  else console.log(`  ${row.name}: catálogo ${row.scraped}, nuevos ${row.inserted}`)
}

if (DRY) {
  console.log('Dry-run: no se escribe.')
  process.exit(0)
}

const secret = (process.env.REVALIDATE_SECRET || key).trim()
try {
  const res = await fetch('https://www.optimalbreaks.com/api/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret, catalog: true }),
  })
  console.log(res.ok ? 'Caché pública invalidada.' : `Revalidate HTTP ${res.status}`)
} catch (e) {
  console.warn('Revalidate falló:', e.message)
}
console.log('\nListo.')
