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
import { isEventCancelled } from '@/types/database'

export const alt = 'Optimal Breaks — Event'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'

type Props = { params: Promise<{ lang: string; slug: string }> }

/**
 * Versiona la URL del og:image con `events.updated_at` (trigger 065): la meta
 * emitida pasa a ser `…/opengraph-image/<epoch>?<hash>`, así Facebook/WhatsApp
 * (que cachean la tarjeta POR URL) bajan el cartel nuevo en cuanto se edita el
 * evento. Nota: el og:image explícito en `generateMetadata` NO sirve aquí — la
 * convención de archivo del mismo segmento pisa `openGraph.images`.
 */
export async function generateImageMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = createCachedSupabase()
  const { data } = await supabase
    .from('events')
    .select('updated_at, tags')
    .eq('slug', slug)
    .single()
  const row = (data as { updated_at: string | null; tags?: string[] | null } | null) ?? null
  const t = row?.updated_at ? Date.parse(row.updated_at) : NaN
  const epoch = Number.isFinite(t) ? String(t) : '0'
  // `-cxl` cambia la URL de og:image aunque updated_at no se toque (caché de WhatsApp/FB).
  const id = isEventCancelled(row) ? `${epoch}-cxl` : epoch
  return [{ id, alt, size, contentType }]
}

type EventOgRow = {
  image_url: string | null
  og_image_url: string | null
  updated_at: string | null
  tags?: string[] | null
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

async function loadPosterDataUrl(
  rawUrl: string | null | undefined,
  version: string | null,
): Promise<string | null> {
  const url = rawUrl?.trim()
  if (!url) return null
  try {
    let buf: Buffer | null = null
    let mime: string = mimeFromUrl(url)

    if (url.startsWith('/')) {
      const filePath = path.join(process.cwd(), 'public', url.replace(/^\/+/, ''))
      buf = await fs.readFile(filePath)
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // El cartel vive en una ruta fija de Storage (media/events/<slug>/poster.*),
      // así que `?v=<updated_at>` es lo único que invalida Data Cache y CDN de
      // Supabase al reemplazarlo. Con versión la respuesta es inmutable
      // (force-cache); sin ella, revalidamos cada 5 min — nunca caché indefinida.
      const fetchUrl = version ? `${url}${url.includes('?') ? '&' : '?'}v=${version}` : url
      const res = await fetch(
        fetchUrl,
        version ? { cache: 'force-cache' } : { next: { revalidate: 300 } },
      )
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

export default async function Image({ params, id }: Props & { id: string }) {
  const { lang, slug } = await params

  const supabase = createCachedSupabase()
  const { data } = await supabase
    .from('events')
    .select('image_url, og_image_url, updated_at, tags')
    .eq('slug', slug)
    .single()
  const row = (data as EventOgRow | null) ?? null

  // Versión de caché del cartel: el id de `generateImageMetadata` (epoch de
  // updated_at) o, si no llegara, el updated_at de la propia fila.
  const parsedVersion = row?.updated_at ? Date.parse(row.updated_at) : NaN
  const fallbackVersion = Number.isFinite(parsedVersion) ? String(parsedVersion) : null
  const version = id && id !== '0' ? id.replace(/-cxl$/, '') : fallbackVersion
  const posterSource = row?.og_image_url || row?.image_url || null
  const posterDataUrl = await loadPosterDataUrl(posterSource, version)
  const cancelled = isEventCancelled(row)

  return new ImageResponse(
    (
      <EventOgImage
        posterDataUrl={posterDataUrl}
        cancelled={cancelled}
        cancelledLabel={lang === 'en' ? 'CANCELLED' : 'CANCELADO'}
      />
    ),
    { ...size },
  )
}
