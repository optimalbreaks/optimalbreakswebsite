/**
 * Sube un archivo local al bucket público `media` (Supabase Storage).
 *
 * Uso:
 *   node scripts/upload-storage-media.mjs <archivo-local> <ruta-en-bucket>
 *
 * Ejemplo (tras descargar o exportar una portada):
 *   node scripts/upload-storage-media.mjs ./cover.jpg events/raveart-summer-festival-2025/cover.webp
 *
 * Credenciales (.env.local): NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEY
 *
 * Las fotos de la galería de terceros (p. ej. Raveart) pueden estar sujetas a derechos de autor;
 * usa material con permiso o fotos propias antes de subir.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnvLocal() {
  const p = join(ROOT, '.env.local')
  if (!existsSync(p)) return
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

function mimeForPath(p) {
  const lower = p.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.avif')) return 'image/avif'
  return 'application/octet-stream'
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || ''

const [, localPath, objectPath] = process.argv
if (!localPath || !objectPath) {
  console.error('Uso: node scripts/upload-storage-media.mjs <archivo-local> <ruta-en-bucket>')
  process.exit(1)
}
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY) en .env.local')
  process.exit(1)
}

const abs = resolve(process.cwd(), localPath)
if (!existsSync(abs)) {
  console.error('No existe el archivo:', abs)
  process.exit(1)
}

const normalized = objectPath.replace(/^\/+/, '')
const buf = readFileSync(abs)
const client = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await client.storage.from('media').upload(normalized, buf, {
  contentType: mimeForPath(abs),
  upsert: true,
})

if (error) {
  console.error('Error al subir:', error.message)
  process.exit(1)
}

const publicUrl = `${url.replace(/\/$/, '')}/storage/v1/object/public/media/${normalized}`
console.log('OK:', data?.path || normalized)
console.log('URL pública:', publicUrl)
console.log('SQL ejemplo: UPDATE public.events SET image_url = ' + JSON.stringify(publicUrl) + " WHERE slug = '…';")
