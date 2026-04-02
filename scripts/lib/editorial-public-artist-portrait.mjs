/**
 * Artistas con retrato manual: data/artist-public-portrait-map.json + archivo en public/images/artists/.
 * El agente de foto por internet no debe tocarlos salvo --force-rephoto o ?force=1 (API).
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

let mapCache = null

export function getEditorialPortraitMap() {
  if (mapCache) return mapCache
  const p = join(ROOT, 'data', 'artist-public-portrait-map.json')
  if (!existsSync(p)) {
    mapCache = {}
    return mapCache
  }
  try {
    mapCache = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    mapCache = {}
  }
  return mapCache
}

export function hasEditorialPortraitFile(slug) {
  if (!slug || typeof slug !== 'string') return false
  const map = getEditorialPortraitMap()
  const file = map[slug]
  if (!file || typeof file !== 'string') return false
  const abs = join(ROOT, 'public', 'images', 'artists', file.trim())
  return existsSync(abs)
}

/** true → no buscar en internet / no repair por foto */
export function shouldSkipInternetArtistPhotoSearch(slug, imageUrl) {
  const u = String(imageUrl ?? '').trim()
  if (u.startsWith('/images/artists/')) return true
  if (hasEditorialPortraitFile(slug)) return true
  return false
}
