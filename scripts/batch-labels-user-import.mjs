/**
 * Import masivo: agente de sello (OpenAI + Serp) + JSON + UPSERT, luego logos (--skip-existing).
 * Lista del usuario con deduplicación (Spektra+iBreaks+Island+Supercharged+Punks cortos → una entrada).
 *
 * Omite generación nueva: finger-lickin, neom-recordings (ya en repo). Les aplica solo --revise.
 *
 *   node scripts/batch-labels-user-import.mjs
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadEnvLocal } from './lib/artist-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const AGENT_SCRIPT = join(__dirname, 'generar-sello-agente.mjs')
const LOGO_SCRIPT = join(__dirname, 'elegir-foto-sello.mjs')

const AGENT_DELAY_MS = 6000
const LOGO_DELAY_MS = 2000

/** Re-enriquecer fichas ya existentes en repo */
const REVISE_ONLY = [
  ['finger-lickin', "Finger Lickin' Records"],
  ['neom-recordings', 'NEOM Recordings'],
]

/**
 * Slugs nuevos: [slug, nombre exacto para el agente]
 * (sin Spektra suelto, iBreaks Records duplicado, Island suelto, Supercharged duplicado, Punks suelto)
 */
const NEW_LABELS = [
  ['elektroshok-records', 'Elektroshok Records'],
  ['spektra-recordings', 'Spektra Recordings'],
  ['the-pooty-club-records', 'The Pooty Club Records'],
  ['ibreaks', 'iBreaks'],
  ['distorsion-records', 'Distorsion Records'],
  ['ravesta-records', 'Ravesta Records'],
  ['supercharger-records', 'Supercharger Records'],
  ['beat-by-brain', 'Beat By Brain'],
  ['against-the-grain', 'Against the Grain'],
  ['sound-break-records', 'Sound Break Records'],
  ['rat-records-uk', 'Rat Records UK'],
  ['hot-cakes', 'Hot Cakes'],
  ['zone-records', 'Zone Records'],
  ['acida-records', 'Acida Records'],
  ['selecta-breaks-records', 'Selecta Breaks Records'],
  ['funn-dark-records', 'Funn Dark Records'],
  ['mute', 'Mute'],
  ['yes-mate-recordings', 'Yes Mate Recordings'],
  ['digital-records', 'Digital Records'],
  ['xclubsive-recordings', 'Xclubsive Recordings'],
  ['ayra-recordings', 'Ayra Recordings'],
  ['booty-trax', 'Booty Trax'],
  ['cut-run', 'Cut & Run record label'],
  ['instant-vibes', 'Instant Vibes'],
  ['illeven-eleven', 'Illeven Eleven'],
  ['musication-records', 'Musication Records'],
  ['juice-recordings-usa', 'Juice Recordings USA'],
  ['teknical-records', 'Teknical Records'],
  ['move-it-records', 'Move It! Records'],
  ['stars-and-knights-records', 'Stars & Knights Records'],
  ['vim-records', 'VIM Records'],
  ['smog', 'SMOG record label'],
  ['lot49', 'Lot49'],
  ['tcr-thursday-club-recordings', 'TCR Thursday Club Recordings'],
  ['soundeo', 'Soundeo.com'],
  ['breakz-r-boss-records', 'Breakz R Boss Records'],
  ['expand-records', 'Expand Records'],
  ['renegade-alien-records', 'Renegade Alien Records'],
  ['free-download', 'Free Download record label'],
  ['atlantic-records', 'Atlantic Records'],
  ['mau5trap', 'mau5trap'],
  ['skint-records', 'Skint Records'],
  ['lets-go-recordings', "Let's Go! Recordings"],
  ['ego-shot-recordings', 'Ego Shot Recordings'],
  ['noisybreaks', 'NoisyBreaks'],
  ['en-vision-recordings', 'En:Vision Recordings'],
  ['gutter-gutter', 'Gutter Gutter'],
  ['radd-dope-kings', 'Radd Dope Kings'],
  ['kindcrime-recordings', 'KindCrime Recordings'],
  ['kitsune', 'Kitsuné Musique'],
  ['booty-cakes', 'Booty Cakes'],
  ['n-mitysound-records', 'N-Mitysound Records'],
  ['disco-cakes', 'Disco Cakes'],
  ['diablo-loco', 'Diablo Loco'],
  ['sound-perfect-breakz-records', 'Sound Perfect Breakz Records'],
  ['island-records', 'Island Records'],
  ['breaks-sk-records', 'Breaks.sk Records'],
  ['champion-records', 'Champion record label'],
  ['perfecto-records', 'Perfecto Records'],
  ['freskanova', 'Freskanova'],
  ['so-called', 'So Called record label'],
  ['grand-hotel-records', 'Grand Hotel Records'],
  ['boysnoize-records', 'Boysnoize Records'],
  ['ras-records', 'Ras record label'],
  ['spirit-led', 'Spirit-Led'],
  ['bombeatz-music', 'BomBeatz Music'],
  ['fantomas-records', 'Fantomas Records'],
  ['rune-recordings', 'Rune Recordings'],
  ['bingo-beats', 'Bingo Beats'],
  ['divergence-records', 'Divergence record label'],
  ['dogeatdog-records', 'DogEatDog Records'],
  ['passenger-records', 'Passenger record label'],
  ['tek-records', 'Tek Records'],
  ['big-beat-records', 'Big Beat Records'],
  ['virgin-records', 'Virgin Records'],
  ['need-money-records', 'Need Money record label'],
  ['modular-interscope', 'Modular Interscope'],
  ['ground-level-records', 'Ground Level Records'],
  ['toast-and-jam-recordings', 'Toast & Jam Recordings'],
  ['never-say-die-records', 'Never Say Die Records'],
  ['big-fish-recordings', 'Big Fish Recordings'],
  ['interscope', 'Interscope Records'],
  ['box-set-records', 'Box Set Records'],
  ['booty-break-uk', 'Booty Break UK'],
  ['barely-legal-records', 'Barely Legal Records'],
  ['tempa', 'Tempa'],
  ['gigabeat-records', 'Gigabeat Records'],
  ['ultimate-breaks', 'Ultimate Breaks'],
  ['punk-funk', 'Punk Funk record label'],
  ['moving-shadow', 'Moving Shadow'],
  ['hard-and-hits', 'Hard & Hits'],
  ['solitude-studios', 'Solitude Studios'],
  ['punks-recordings', 'Punks Recordings'],
  ['mantra-vibes', 'Mantra Vibes'],
  ['kaleidoscope-music', 'Kaleidoscope Music'],
  ['modular', 'Modular Recordings'],
  ['kick-it-recordings', 'Kick It Recordings'],
  ['distinctive-records', "Distinct'ive Records"],
  ['fabric', 'Fabric Records London'],
  ['aei-music', 'AEI Music'],
  ['moonshine-music', 'Moonshine Music'],
  ['rkdeeplove-records', 'RkDeepLove Records'],
  ['columbia-red-dmz', 'Columbia Red DMZ'],
  ['rump-shaker-records', 'Rump Shaker Records'],
  ['u-and-a-recordings', 'U&A Recordings'],
  ['fort-knox-recordings', 'Fort Knox Recordings'],
  ['kompakt', 'Kompakt'],
  ['wearhouse-music', 'Wearhouse Music'],
  ['young-nrg-productions', 'Young NRG Productions'],
  ['xl-recordings', 'XL Recordings'],
  ['drop-the-world', 'Drop The World'],
  ['inbeatwetrust-music', 'InBeatWeTrust Music'],
  ['lizplay-records', 'Lizplay Records'],
  ['monstercat', 'Monstercat'],
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function runAgent(slug, labelName, revise) {
  const args = [AGENT_SCRIPT, slug, labelName, '--save-json']
  if (revise) args.push('--revise')
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
}

async function main() {
  loadEnvLocal()

  const agentFailed = []
  const logoFailed = []

  console.log(`\n=== FASE 0: --revise sellos ya en repo (${REVISE_ONLY.length}) ===\n`)
  for (let i = 0; i < REVISE_ONLY.length; i++) {
    const [slug, name] = REVISE_ONLY[i]
    console.log(`\n[revise ${i + 1}/${REVISE_ONLY.length}] ${slug}`)
    const r = runAgent(slug, name, true)
    if (r.status !== 0) {
      console.error(`[FAIL] ${slug} exit ${r.status}`)
      agentFailed.push(slug)
    }
    if (i < REVISE_ONLY.length - 1) await sleep(AGENT_DELAY_MS)
  }

  console.log(`\n=== FASE 1: sellos nuevos (${NEW_LABELS.length}) ===\n`)
  for (let i = 0; i < NEW_LABELS.length; i++) {
    const [slug, name] = NEW_LABELS[i]
    console.log(`\n[${i + 1}/${NEW_LABELS.length}] NEW ${slug}`)
    const r = runAgent(slug, name, false)
    if (r.status !== 0) {
      console.error(`[FAIL] ${slug} exit ${r.status}`)
      agentFailed.push(slug)
    }
    if (i < NEW_LABELS.length - 1) await sleep(AGENT_DELAY_MS)
  }

  const allSlugs = [
    ...REVISE_ONLY.map(([s]) => s),
    ...NEW_LABELS.map(([s]) => s),
  ]

  console.log(`\n=== FASE 2: logos --skip-existing (${allSlugs.length}) ===\n`)
  for (let i = 0; i < allSlugs.length; i++) {
    const slug = allSlugs[i]
    console.log(`\n[logo ${i + 1}/${allSlugs.length}] ${slug}`)
    const r = spawnSync(process.execPath, [LOGO_SCRIPT, slug, '--skip-existing'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    if (r.status !== 0) {
      console.error(`[logo] exit ${r.status} ${slug}`)
      logoFailed.push(slug)
    }
    if (i < allSlugs.length - 1) await sleep(LOGO_DELAY_MS)
  }

  console.log('\n=== RESUMEN ===')
  if (agentFailed.length) console.log('Agente fallidos:', agentFailed.join(', '))
  else console.log('Agente: OK')
  if (logoFailed.length) console.log('Logo fallidos:', logoFailed.join(', '))
  else console.log('Logos: sin errores de proceso')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
