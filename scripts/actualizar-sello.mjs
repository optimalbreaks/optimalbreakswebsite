/**
 * OPTIMAL BREAKS — Actualizar / insertar sello desde JSON
 *
 * Índice: scripts/guia-base-datos.mjs → run label-json <slug>
 *
 * Uso:
 *   node scripts/actualizar-sello.mjs data/labels/lot49.json
 *   npm run db:label -- data/labels/lot49.json
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { upsertLabel, validateLabelRow } from './lib/label-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

async function main() {
  const jsonPath = process.argv[2]
  if (!jsonPath) {
    console.error('Uso: node scripts/actualizar-sello.mjs <ruta-al-json>')
    console.error('  Ej: node scripts/actualizar-sello.mjs data/labels/lot49.json')
    process.exit(1)
  }

  const fullPath = resolve(ROOT, jsonPath)
  if (!existsSync(fullPath)) {
    console.error(`Archivo no encontrado: ${fullPath}`)
    process.exit(1)
  }

  let data
  try {
    data = JSON.parse(readFileSync(fullPath, 'utf8'))
  } catch (e) {
    console.error(`Error parseando JSON: ${e.message}`)
    process.exit(1)
  }

  const errors = validateLabelRow(data)
  if (errors.length) {
    console.error('Errores de validación:')
    errors.forEach((e) => console.error(`  - ${e}`))
    process.exit(1)
  }

  let row
  try {
    row = await upsertLabel(data)
  } catch (e) {
    console.error(e.message || e)
    process.exit(1)
  }

  console.log('UPSERT exitoso (label):')
  console.log(`  ID:      ${row.id}`)
  console.log(`  Slug:    ${row.slug}`)
  console.log(`  Nombre:  ${row.name}`)
  console.log(`  Creado:  ${row.created_at}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
