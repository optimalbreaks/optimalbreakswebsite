/**
 * OPTIMAL BREAKS — Actualizar / insertar artista desde JSON
 *
 * Índice / frontera unificada para el agente: scripts/guia-base-datos.mjs (run artist-json, run artist-file).
 *
 * Uso:
 *   node scripts/actualizar-artista.mjs data/artists/deekline.json
 *   npm run db:artist -- data/artists/deekline.json
 *
 * Hace UPSERT por slug: si el artista existe lo actualiza, si no lo crea.
 * Lee credenciales de .env.local (mismo mecanismo que seed-supabase.mjs).
 *
 * Conexión: solo API Supabase — NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY).
 * Migraciones SQL siguen usando Postgres vía seed-supabase.mjs si configuras DATABASE_URL, etc.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { upsertArtist, validateArtistRow } from './lib/artist-upsert.mjs'
import { pingPublicRevalidate } from './lib/ping-public-revalidate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

async function main() {
  const jsonPath = process.argv[2]
  if (!jsonPath) {
    console.error('Uso: node scripts/actualizar-artista.mjs <ruta-al-json>')
    console.error('  Ej: node scripts/actualizar-artista.mjs data/artists/deekline.json')
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

  const errors = validateArtistRow(data)
  if (errors.length) {
    console.error('Errores de validación:')
    errors.forEach((e) => console.error(`  - ${e}`))
    process.exit(1)
  }

  let row
  try {
    row = await upsertArtist(data)
  } catch (e) {
    console.error(e.message || e)
    process.exit(1)
  }

  console.log('UPSERT exitoso:')
  console.log(`  ID:      ${row.id}`)
  console.log(`  Slug:    ${row.slug}`)
  console.log(`  Nombre:  ${row.name}`)
  console.log(`  Creado:  ${row.created_at}`)
  await pingPublicRevalidate({ artistSlug: row.slug })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
