/**
 * Descarga una imagen (URL HTTPS) y la sube al bucket público `media` de Supabase.
 * Ruta: artists/<slug>/portrait.<ext>
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

/** Supabase Storage rechaza subtipos en mayúsculas (p. ej. image/JPEG de CDNs). */
function normalizeImageContentType(headerVal) {
  if (!headerVal) return null
  const base = headerVal.split(';')[0].trim().toLowerCase()
  if (!base.startsWith('image/')) return null
  if (base === 'image/jpg') return 'image/jpeg'
  return base
}

/** Alinea extensión y Content-Type con los bytes (evita .jpg + WebP real → 500 o imagen rota en Storage). */
function sniffImageFormat(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: '.jpg', contentType: 'image/jpeg' }
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: '.png', contentType: 'image/png' }
  }
  if (buf.toString('utf8', 0, 4) === 'RIFF' && buf.toString('utf8', 8, 12) === 'WEBP') {
    return { ext: '.webp', contentType: 'image/webp' }
  }
  if (buf.length >= 6) {
    const h = buf.toString('ascii', 0, 6)
    if (h === 'GIF87a' || h === 'GIF89a') return { ext: '.gif', contentType: 'image/gif' }
  }
  return null
}

/**
 * @param {{ slug: string, sourceUrl: string, quiet?: boolean }} opts
 * @returns {Promise<string>} URL pública del objeto en Storage
 */
export async function uploadArtistPortraitFromUrl(opts) {
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
      'User-Agent': 'OptimalBreaksArtistPhoto/1.0',
    },
  })
  if (!res.ok) {
    throw new Error(`Descarga de la imagen: HTTP ${res.status} ${res.statusText}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) {
    throw new Error(`Imagen demasiado grande (${buf.length} bytes; máx ${MAX_BYTES})`)
  }
  if (buf.length < 32) {
    throw new Error('Descarga demasiado pequeña o vacía; no es una imagen usable')
  }

  const headAscii = buf.toString('utf8', 0, Math.min(64, buf.length)).toLowerCase()
  if (headAscii.includes('<!doctype') || headAscii.includes('<html')) {
    throw new Error(
      'La URL devolvió HTML (p. ej. login o crawler bloqueado), no bytes de imagen. Elige otro candidato o usa --vision.',
    )
  }

  const sniffed = sniffImageFormat(buf)
  if (!sniffed) {
    throw new Error(
      'Los bytes descargados no son JPEG/PNG/WebP/GIF reconocibles; no se sube a Storage para evitar objetos rotos.',
    )
  }

  const ext = sniffed.ext
  const contentType = sniffed.contentType
  const objectPath = `artists/${slug}/portrait${ext}`

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
    console.log(`[foto] ${slug}: copiado a bucket media → ${publicUrl}`)
  }
  return publicUrl
}

/**
 * Sube logo de sello a media/labels/<slug>/logo.<ext> (misma ruta que la API admin label-logo).
 * @param {{ slug: string, sourceUrl: string, quiet?: boolean }} opts
 * @returns {Promise<string>} URL pública del objeto en Storage
 */
export async function uploadLabelLogoFromUrl(opts) {
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
      'User-Agent': 'OptimalBreaksLabelLogo/1.0',
    },
  })
  if (!res.ok) {
    throw new Error(`Descarga de la imagen: HTTP ${res.status} ${res.statusText}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_BYTES) {
    throw new Error(`Imagen demasiado grande (${buf.length} bytes; máx ${MAX_BYTES})`)
  }
  if (buf.length >= 16) {
    const headAscii = buf.toString('utf8', 0, Math.min(64, buf.length)).toLowerCase()
    if (headAscii.includes('<!doctype') || headAscii.includes('<html')) {
      throw new Error('La URL devolvió HTML, no una imagen de logo.')
    }
  }

  const sniffed = sniffImageFormat(buf)
  let ext = extFromSourceUrl(sourceUrl)
  let contentType = mimeForExt(ext)
  const ctNorm = normalizeImageContentType(res.headers.get('content-type'))
  if (ctNorm) contentType = ctNorm
  if (sniffed) {
    ext = sniffed.ext
    contentType = sniffed.contentType
  }

  const objectPath = `labels/${slug}/logo${ext}`

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
    console.log(`[logo-sello] ${slug}: bucket media → ${publicUrl}`)
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
