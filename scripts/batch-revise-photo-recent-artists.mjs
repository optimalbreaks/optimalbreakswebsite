/**
 * Una sola pasada: agente --revise + save JSON + UPSERT, luego foto (--skip-existing).
 * Artistas añadidos en sesiones recientes (breaks UK + Ed Solo / Master Blaster / nota Deekline).
 *
 *   node scripts/batch-revise-photo-recent-artists.mjs
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadEnvLocal } from './lib/artist-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const AGENT_SCRIPT = join(__dirname, 'generar-artista-agente.mjs')
const PHOTO_SCRIPT = join(__dirname, 'elegir-foto-artista.mjs')

const REVISE_DELAY_MS = 5000
const PHOTO_DELAY_MS = 2000

/** [slug, nombre para agente / búsqueda] */
const ARTISTS = [
  ['cut-run', 'Cut & Run'],
  ['skool-of-thought', 'Skool of Thought'],
  ['red-polo', 'Red Polo'],
  ['spl', 'SPL drum and bass producer'],
  ['wes-smith', 'Wes Smith DJ breaks'],
  ['tc', 'TC Tom Casswell drum and bass'],
  ['basement-freaks', 'Basement Freaks'],
  ['breaksmafia', 'BreaksMafia'],
  ['slamboree', 'Slamboree'],
  ['skeewiff', 'Skeewiff'],
  ['punks-jump-up', 'Punks Jump Up'],
  ['pyramyth', 'Pyramyth'],
  ['rench', 'Rench'],
  ['under-break', 'Under Break'],
  ['neologisticism', 'Neologisticism'],
  ['seven-g', 'SevenG'],
  ['wardian', 'Wardian'],
  ['dubaxface', 'Dubaxface'],
  ['kl2', 'KL2'],
  ['electric-soulside', 'Electric Soulside'],
  ['shockillaz', 'Shockillaz'],
  ['yankee', 'Yankee'],
  ['ed-solo', 'Ed Solo breakbeat'],
  ['master-blaster', 'Master Blaster Aquasky'],
  ['deekline', 'Deekline'],
  ['aquasky', 'Aquasky'],
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  loadEnvLocal()

  const reviseFailed = []
  console.log(`\n=== FASE 1: agente --revise (${ARTISTS.length} fichas) ===\n`)
  for (let i = 0; i < ARTISTS.length; i++) {
    const [slug, name] = ARTISTS[i]
    console.log(`\n[${i + 1}/${ARTISTS.length}] REVISE ${slug} — ${name}`)
    const r = spawnSync(process.execPath, [AGENT_SCRIPT, slug, name, '--revise', '--save-json'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    if (r.status !== 0) {
      console.error(`[FAIL revise] ${slug} exit ${r.status}`)
      reviseFailed.push(slug)
    }
    if (i < ARTISTS.length - 1) await sleep(REVISE_DELAY_MS)
  }

  console.log(`\n=== FASE 2: fotos --skip-existing (${ARTISTS.length} slugs) ===\n`)
  const photoFailed = []
  for (let i = 0; i < ARTISTS.length; i++) {
    const [slug] = ARTISTS[i]
    console.log(`\n[${i + 1}/${ARTISTS.length}] PHOTO ${slug}`)
    const r = spawnSync(process.execPath, [PHOTO_SCRIPT, slug, '--skip-existing'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    if (r.status !== 0) {
      console.error(`[photo] exit ${r.status} ${slug}`)
      photoFailed.push(slug)
    }
    if (i < ARTISTS.length - 1) await sleep(PHOTO_DELAY_MS)
  }

  console.log('\n=== RESUMEN ===')
  if (reviseFailed.length) console.log('Revise fallidos:', reviseFailed.join(', '))
  else console.log('Revise: todos OK')
  if (photoFailed.length) console.log('Foto fallidos / omitidos con error:', photoFailed.join(', '))
  else console.log('Foto: proceso completado sin códigos de error')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
