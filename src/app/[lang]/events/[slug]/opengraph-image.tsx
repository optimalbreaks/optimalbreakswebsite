// ============================================
// OPTIMAL BREAKS — Open Graph image dinámica por evento
// /:lang/events/:slug/opengraph-image  →  PNG 1200×630
// Sirve directamente el cartel del evento: la imagen se decodifica
// internamente (WebP/AVIF → PNG vía sharp) y se centra con `contain`
// sobre fondo INK, así carteles cuadrados/verticales/horizontales se
// muestran completos sin recortes en Facebook / WhatsApp / LinkedIn / X.
// ============================================

import { ImageResponse } from 'next/og'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createCachedSupabase } from '@/lib/supabase-server'
import { EventOgImage } from '@/lib/EventOgImage'

export const alt = 'Optimal Breaks — Event'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'

type Props = { params: Promise<{ lang: string; slug: string }> }

type EventOgRow = {
  image_url: string | null
  og_image_url: string | null
}

const EXT_MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
}

/** Formatos que Satori (motor de `next/og`) **no** sabe decodificar y hay que
 * convertir a PNG antes de pasarlos al `<img>`. WebP/AVIF revientan el
 * `ImageResponse` con 500. */
const NEEDS_RENCODE = new Set(['image/webp', 'image/avif'])

function mimeFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  const ext = path.extname(clean)
  return EXT_MIME[ext] ?? 'image/jpeg'
}

/** Re-encode WebP/AVIF a PNG con `sharp`. Cualquier otro formato pasa intacto.
 * Aprovechamos para redimensionar al frame del OG (1200×630, fit inside) para
 * que el cartel quepa entero respetando su aspect ratio (centrado por CSS
 * `object-fit: contain` sobre fondo INK) y bajar el peso del data URL que se
 * inyecta en `ImageResponse`. Cualquier error se contiene devolviendo `null`
 * (el OG cae al placeholder "OB" en vez de tirar la ruta con 500). */
async function ensureSatoriCompatible(
  buf: Buffer,
  mime: string,
): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const sharpMod = await import('sharp')
    const sharp = (sharpMod as { default?: typeof import('sharp') }).default ?? (sharpMod as unknown as typeof import('sharp'))
    const needsRencode = NEEDS_RENCODE.has(mime)
    const pipeline = sharp(buf).resize({
      width: 1200,
      height: 630,
      fit: 'inside',
      withoutEnlargement: false,
    })
    if (needsRencode) {
      const png = await pipeline.png({ compressionLevel: 9 }).toBuffer()
      return { buf: png, mime: 'image/png' }
    }
    if (mime === 'image/jpeg') {
      const jpg = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      return { buf: jpg, mime: 'image/jpeg' }
    }
    if (mime === 'image/png') {
      const png = await pipeline.png({ compressionLevel: 9 }).toBuffer()
      return { buf: png, mime: 'image/png' }
    }
    return { buf, mime }
  } catch {
    if (NEEDS_RENCODE.has(mime)) return null
    return { buf, mime }
  }
}

async function loadPosterDataUrl(rawUrl: string | null | undefined): Promise<string | null> {
  const url = rawUrl?.trim()
  if (!url) return null
  try {
    let buf: Buffer | null = null
    let mime: string = mimeFromUrl(url)

    if (url.startsWith('/')) {
      const filePath = path.join(process.cwd(), 'public', url.replace(/^\/+/, ''))
      buf = await fs.readFile(filePath)
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      const res = await fetch(url, { cache: 'force-cache' })
      if (!res.ok) return null
      const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
      if (ct) mime = ct
      const ab = await res.arrayBuffer()
      buf = Buffer.from(ab)
    } else {
      return null
    }

    const safe = await ensureSatoriCompatible(buf, mime)
    if (!safe) return null
    return `data:${safe.mime};base64,${safe.buf.toString('base64')}`
  } catch {
    return null
  }
}

export default async function Image({ params }: Props) {
  const { slug } = await params

  const supabase = createCachedSupabase()
  const { data } = await supabase
    .from('events')
    .select('image_url, og_image_url')
    .eq('slug', slug)
    .single()
  const row = (data as EventOgRow | null) ?? null

  const posterSource = row?.og_image_url || row?.image_url || null
  const posterDataUrl = await loadPosterDataUrl(posterSource)

  return new ImageResponse(
    (
      <EventOgImage posterDataUrl={posterDataUrl} />
    ),
    { ...size },
  )
}
