// ============================================
// OPTIMAL BREAKS — Open Graph image dinámica por evento
// /:lang/events/:slug/opengraph-image  →  PNG 1200×630
// El cartel se compone con `sharp` (contain sobre INK). No pasa por
// Satori/`ImageResponse`: un JPEG de iPhone (P3 + ICC) o un WebP como
// data URL tira la ruta con 500 y WhatsApp/Facebook se quedan sin tarjeta.
// ============================================

import { ImageResponse } from 'next/og'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createCachedSupabase } from '@/lib/supabase-server'
import { EventOgImage } from '@/lib/EventOgImage'
import { eventNoticeKind } from '@/types/database'

export const alt = 'Optimal Breaks — Event'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'

const INK = { r: 26, g: 26, b: 26 }
const MAX_POSTER_BYTES = 8 * 1024 * 1024

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
  // Sufijo de aviso: cambia la URL aunque updated_at no se toque.
  const notice = eventNoticeKind(row)
  const base = notice === 'cancelled' ? `${epoch}-cxl` : notice === 'postponed' ? `${epoch}-pstd` : epoch
  // `-v2`: cambia el path de og:image (WhatsApp/FB cachean por URL).
  const id = `${base}-v2`
  return [{ id, alt, size, contentType }]
}

type EventOgRow = {
  image_url: string | null
  og_image_url: string | null
  updated_at: string | null
  tags?: string[] | null
}

async function loadPosterBuffer(
  rawUrl: string | null | undefined,
  version: string | null,
): Promise<Buffer | null> {
  const url = rawUrl?.trim()
  if (!url) return null
  try {
    if (url.startsWith('/')) {
      const filePath = path.join(process.cwd(), 'public', url.replace(/^\/+/, ''))
      return await fs.readFile(filePath)
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) return null

    const fetchUrl = version ? `${url}${url.includes('?') ? '&' : '?'}v=${version}` : url
    const res = await fetch(
      fetchUrl,
      version ? { cache: 'force-cache' } : { next: { revalidate: 300 } },
    )
    if (!res.ok) return null
    const len = Number(res.headers.get('content-length') || 0)
    if (Number.isFinite(len) && len > MAX_POSTER_BYTES) return null
    const ab = await res.arrayBuffer()
    if (ab.byteLength > MAX_POSTER_BYTES) return null
    return Buffer.from(ab)
  } catch {
    return null
  }
}

function stampSvg(label: string, tone: 'cancel' | 'postpone'): Buffer {
  const bg = tone === 'postpone' ? '#f7e733' : '#d62828'
  const fg = tone === 'postpone' ? '#1a1a1a' : '#f4efe6'
  const escaped = label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return Buffer.from(
    `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="rgba(26,26,26,0.32)"/>
      <g transform="translate(600 315) rotate(-13)">
        <rect x="-750" y="-70" width="1500" height="140" fill="${bg}" stroke="#1a1a1a" stroke-width="8"/>
        <text x="0" y="32" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="900" letter-spacing="10" fill="${fg}">${escaped}</text>
      </g>
    </svg>`,
  )
}

function placeholderSvg(): Buffer {
  return Buffer.from(
    `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#1a1a1a"/>
      <text x="600" y="400" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="240" font-weight="900" letter-spacing="-8" fill="#d62828">OB</text>
    </svg>`,
  )
}

async function renderEventOgPng(
  poster: Buffer | null,
  notice: ReturnType<typeof eventNoticeKind>,
  lang: string,
): Promise<Buffer> {
  const sharpMod = await import('sharp')
  const sharp = sharpMod.default ?? (sharpMod as unknown as typeof import('sharp'))

  const layers: { input: Buffer; gravity: 'centre' }[] = []

  if (poster) {
    const fitted = await sharp(poster)
      .rotate()
      .resize(1200, 630, { fit: 'inside', withoutEnlargement: false })
      .toColorspace('srgb')
      .png({ compressionLevel: 8 })
      .toBuffer()
    layers.push({ input: fitted, gravity: 'centre' })
  } else {
    layers.push({ input: placeholderSvg(), gravity: 'centre' })
  }

  if (notice) {
    const label =
      notice === 'postponed'
        ? lang === 'en'
          ? 'POSTPONED'
          : 'APLAZADO'
        : lang === 'en'
          ? 'CANCELLED'
          : 'CANCELADO'
    layers.push({
      input: stampSvg(label, notice === 'postponed' ? 'postpone' : 'cancel'),
      gravity: 'centre',
    })
  }

  return sharp({
    create: { width: 1200, height: 630, channels: 3, background: INK },
  })
    .composite(layers)
    .png({ compressionLevel: 8 })
    .toBuffer()
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

  const parsedVersion = row?.updated_at ? Date.parse(row.updated_at) : NaN
  const fallbackVersion = Number.isFinite(parsedVersion) ? String(parsedVersion) : null
  const version =
    id && id !== '0'
      ? id.replace(/-v2$/, '').replace(/-cxl$/, '').replace(/-pstd$/, '')
      : fallbackVersion
  const posterSource = row?.og_image_url || row?.image_url || null
  const poster = await loadPosterBuffer(posterSource, version)
  const notice = eventNoticeKind(row)

  try {
    const png = await renderEventOgPng(poster, notice, lang)
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error('[event-og]', err instanceof Error ? err.message : err)
    // Último recurso: tarjeta Satori sin cartel (la ruta /opengraph-image de marca sí vive).
    return new ImageResponse(<EventOgImage posterDataUrl={null} />, { ...size })
  }
}
