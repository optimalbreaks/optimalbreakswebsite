/**
 * Descarga imagen HTTPS y sube al bucket público `media`.
 * Ruta: events/<slug>/poster.<ext>
 */

import { createClient } from '@supabase/supabase-js'

const MAX_BYTES = 12 * 1024 * 1024

function extFromSourceUrl(sourceUrl) {
  try {
    const path = new URL(sourceUrl).pathname.toLowerCase()
    if (path.endsWith('.png')) return '.png'
    if (path.endsWith('.webp')) return '.webp'
    if (path.endsWith('.gif')) return '.gif'
    if (path.endsWith('.jpeg')) return '.jpeg'
    if (path.endsWith('.jpg')) return '.jpg'
  } catch {
    /* ignore */
  }
  return '.jpg'
}

function mimeForExt(ext) {
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.jpeg' || ext === '.jpg') return 'image/jpeg'
  return 'image/jpeg'
}

/**
 * @param {{ slug: string, sourceUrl: string, quiet?: boolean }} opts
 * @returns {Promise<string>} URL pública del objeto en Storage
 */
export async function uploadEventPosterFromUrl(opts) {
  const { slug, sourceUrl, quiet = false } = opts
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ''
  if (!base || !key) {
    throw new Error(
      'Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY) para subir al bucket media',
    )
  }

  const res = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'OptimalBreaksEventPoster/1.0',
    },
  })
  if (!res.ok) {
    throw new Error(`Descarga de la imagen: HTTP ${res.status} ${res.statusText}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) {
    throw new Error(`Imagen demasiado grande (${buf.length} bytes; máx ${MAX_BYTES})`)
  }

  const ext = extFromSourceUrl(sourceUrl)
  const objectPath = `events/${slug}/poster${ext}`

  let contentType = mimeForExt(ext)
  const ct = res.headers.get('content-type')
  if (ct && ct.startsWith('image/')) {
    contentType = ct.split(';')[0].trim()
  }

  const sb = createClient(base, key, { auth: { persistSession: false } })
  const { error } = await sb.storage.from('media').upload(objectPath, buf, {
    contentType,
    upsert: true,
  })
  if (error) {
    throw new Error(`Storage: ${error.message}`)
  }

  const publicUrl = `${base.replace(/\/$/, '')}/storage/v1/object/public/media/${objectPath}`
  if (!quiet) {
    console.log(`[event-poster] ${slug}: bucket media → ${publicUrl}`)
  }
  return publicUrl
}

export function hasStorageCredentials() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ''
  return Boolean(base && key)
}
