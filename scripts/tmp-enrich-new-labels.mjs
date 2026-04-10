/**
 * Temporary script: run label-agent for the 28 newly added labels only.
 * Then run label-photo for those missing images.
 */

import { spawnSync } from 'child_process'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const NEW_SLUGS = [
  ['banana-club', 'Banana Club'],
  ['punks', 'Punks'],
  ['funktasty-crew-records', 'Funktasty Crew Records'],
  ['electrobreakz', 'ElectroBreakz'],
  ['lowering-the-tone', 'Lowering The Tone'],
  ['jungle-cakes', 'Jungle Cakes'],
  ['13monkeys-records', '13monkeys Records'],
  ['most-valuable-records', 'Most Valuable Records'],
  ['dirty-kitchen-rave', 'DIRTY KITCHEN RAVE'],
  ['space-pizza-records', 'SPACE PIZZA Records'],
  ['br8kn-records', 'Br8kn Records'],
  ['bombstrikes', 'Bombstrikes'],
  ['rough-division', 'Rough Division'],
  ['guachinche-records', 'Guachinche Records'],
  ['old-skool-records', 'Old Skool Records'],
  ['jalapeno-records', 'Jalapeno Records'],
  ['crosspoint-records', 'CrossPoint Records'],
  ['cyberfunk-music', 'Cyberfunk Music'],
  ['etiqueta-negra', 'Etiqueta Negra'],
  ['pata-negra-records', 'Pata Negra Records'],
  ['westwood-recordings', 'Westwood Recordings'],
  ['breakbeat-paradise-recordings', 'Breakbeat Paradise Recordings'],
  ['bass-win', 'Bass=Win'],
  ['cyclone-records', 'Cyclone Records'],
  ['rebel-bass', 'Rebel Bass'],
  ['more-time-records', 'More Time Records'],
  ['architektur-records', 'Architektur Records'],
  ['frequency-fusion-records', 'Frequency Fusion Records'],
]

const mode = process.argv[2] || 'bios'

if (mode === 'bios') {
  console.log(`\n  === Generando bios para ${NEW_SLUGS.length} sellos ===\n`)
  let ok = 0, fail = 0
  for (let i = 0; i < NEW_SLUGS.length; i++) {
    const [slug, name] = NEW_SLUGS[i]
    console.log(`  [${i + 1}/${NEW_SLUGS.length}] ${name} (${slug})`)
    const r = spawnSync('node', [
      'scripts/generar-sello-agente.mjs',
      slug, name,
      '--save-json',
    ], { cwd: ROOT, stdio: 'inherit', timeout: 120_000 })
    if (r.status === 0) { ok++; console.log(`    ✓ done`) }
    else { fail++; console.log(`    ✗ exit ${r.status}`) }
  }
  console.log(`\n  Bios OK: ${ok} | Fallos: ${fail}\n`)
}

if (mode === 'photos') {
  console.log(`\n  === Buscando fotos para ${NEW_SLUGS.length} sellos ===\n`)
  let ok = 0, fail = 0
  for (let i = 0; i < NEW_SLUGS.length; i++) {
    const [slug] = NEW_SLUGS[i]
    console.log(`  [${i + 1}/${NEW_SLUGS.length}] ${slug}`)
    const r = spawnSync('node', [
      'scripts/elegir-foto-sello.mjs',
      slug,
    ], { cwd: ROOT, stdio: 'inherit', timeout: 120_000 })
    if (r.status === 0) { ok++; console.log(`    ✓ done`) }
    else { fail++; console.log(`    ✗ exit ${r.status}`) }
  }
  console.log(`\n  Fotos OK: ${ok} | Fallos: ${fail}\n`)
}
