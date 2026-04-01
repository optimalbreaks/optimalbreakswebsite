/**
 * Convierte imágenes en public/ a WebP, borra el original y deja solo el .webp.
 *
 *   node scripts/convert-public-image-to-webp.mjs public/images/artists/foo.jpg
 *   node scripts/convert-public-image-to-webp.mjs public/images/artists/a.jpg public/images/events/b.png
 *
 * No convierte si ya es .webp. Extensiones de entrada: jpg, jpeg, png, gif, tiff, bmp.
 */

import { existsSync, unlinkSync } from 'fs'
import { basename, dirname, extname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const INPUT_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.tif', '.bmp'])

async function convertOne(relFromRoot) {
  const rel = relFromRoot.replace(/\\/g, '/').replace(/^\//, '')
  if (!rel.toLowerCase().startsWith('public/')) {
    throw new Error(`La ruta debe estar bajo public/: ${rel}`)
  }
  const inputAbs = resolve(ROOT, rel)
  if (!existsSync(inputAbs)) {
    throw new Error(`No existe: ${rel}`)
  }
  const ext = extname(inputAbs).toLowerCase()
  if (ext === '.webp') {
    console.log('[skip] Ya es WebP:', rel)
    return { rel, skipped: true }
  }
  if (!INPUT_EXT.has(ext)) {
    throw new Error(`Extensión no soportada (${ext}): ${rel}`)
  }
  const base = basename(inputAbs, extname(inputAbs))
  const outAbs = join(dirname(inputAbs), `${base}.webp`)

  await sharp(inputAbs)
    .webp({ quality: 88, effort: 4 })
    .toFile(outAbs)

  unlinkSync(inputAbs)
  const outRel = rel.slice(0, -ext.length) + '.webp'
  console.log('[ok]', rel, '→', outRel)
  return { rel, outRel, skipped: false }
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean)
  if (args.length === 0) {
    console.error(`Uso:
  node scripts/convert-public-image-to-webp.mjs <ruta-desde-raíz-repo> [...]

Ejemplos:
  node scripts/convert-public-image-to-webp.mjs public/images/artists/foo.jpg
  node scripts/convert-public-image-to-webp.mjs public/images/events/cartel.png`)
    process.exit(1)
  }
  for (const a of args) {
    try {
      await convertOne(a)
    } catch (e) {
      console.error('[error]', e.message || e)
      process.exit(1)
    }
  }
}

main()
