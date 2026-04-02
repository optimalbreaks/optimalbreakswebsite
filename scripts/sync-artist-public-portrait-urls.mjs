/**
 * Pone image_url = /images/artists/<archivo.webp> según data/artist-public-portrait-map.json
 * y hace UPSERT en Supabase. Ejecutar tras añadir retratos manuales en public/images/artists/.
 *
 * En la web, la prioridad de visualización es: (1) https remoto en BD, (2) public/mapa, (3) fallback.
 * Guardar /images/… en BD sirve sobre todo para OG/APIs que lean image_url sin pasar por displayArtistImageUrl;
 * si dejas image_url null y solo el mapa, el retrato local sigue viéndose (prioridad 2).
 *
 *   node scripts/sync-artist-public-portrait-urls.mjs
 *   npm run db:artist:sync-public-portraits
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  loadEnvLocal,
  upsertArtist,
  validateArtistRow,
} from './lib/artist-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

async function main() {
  loadEnvLocal()
  const mapPath = join(ROOT, 'data', 'artist-public-portrait-map.json')
  if (!existsSync(mapPath)) {
    console.error('Falta', mapPath)
    process.exit(1)
  }
  const map = JSON.parse(readFileSync(mapPath, 'utf8'))
  let ok = 0
  let skip = 0
  let fail = 0

  for (const [slug, file] of Object.entries(map)) {
    if (!file || typeof file !== 'string') continue
    const jsonPath = join(ROOT, 'data', 'artists', `${slug}.json`)
    if (!existsSync(jsonPath)) {
      console.warn(`[omit] ${slug}: no existe data/artists/${slug}.json`)
      fail++
      continue
    }
    const webpPath = join(ROOT, 'public', 'images', 'artists', file.trim())
    if (!existsSync(webpPath)) {
      console.warn(`[omit] ${slug}: no existe public/images/artists/${file.trim()}`)
      fail++
      continue
    }

    const url = `/images/artists/${file.trim()}`
    let artist
    try {
      artist = JSON.parse(readFileSync(jsonPath, 'utf8'))
    } catch (e) {
      console.error(`[err] ${slug}:`, e.message)
      fail++
      continue
    }

    if (String(artist.image_url || '').trim() === url) {
      console.log(`[ok] ${slug} (sin cambios)`)
      skip++
      continue
    }

    artist.image_url = url
    writeFileSync(jsonPath, JSON.stringify(artist, null, 2) + '\n', 'utf8')

    const errors = validateArtistRow(artist)
    if (errors.length) {
      console.error(`[err] ${slug} validación:`, errors.join('; '))
      fail++
      continue
    }

    try {
      await upsertArtist(artist)
      console.log(`[ok] ${slug} → ${url}`)
      ok++
    } catch (e) {
      console.error(`[err] ${slug} UPSERT:`, e.message || e)
      fail++
    }
  }

  console.log(`\nListo: ${ok} actualizados, ${skip} ya correctos, ${fail} errores/omitidos`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
