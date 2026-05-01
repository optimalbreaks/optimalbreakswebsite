// ============================================
// OPTIMAL BREAKS — Open Graph image dinámica por evento
// /:lang/events/:slug/opengraph-image  →  PNG 1200×630
// Compone una tarjeta con el cartel del evento (decodificando WebP/AVIF
// internamente) + nombre, fecha y ubicación, y emite PNG estándar válido
// para Facebook / WhatsApp / LinkedIn (donde WebP suele fallar).
// ============================================

import { ImageResponse } from 'next/og'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Locale } from '@/lib/i18n-config'
import { i18n } from '@/lib/i18n-config'
import { createServerSupabase } from '@/lib/supabase-server'
import { EventOgImage } from '@/lib/EventOgImage'

export const alt = 'Optimal Breaks — Event'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'

type Props = { params: Promise<{ lang: string; slug: string }> }

type EventOgRow = {
  name: string | null
  date_start: string | null
  date_end: string | null
  city: string | null
  country: string | null
  venue: string | null
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

function mimeFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  const ext = path.extname(clean)
  return EXT_MIME[ext] ?? 'image/jpeg'
}

async function loadPosterDataUrl(rawUrl: string | null | undefined): Promise<string | null> {
  const url = rawUrl?.trim()
  if (!url) return null
  try {
    if (url.startsWith('/')) {
      const filePath = path.join(process.cwd(), 'public', url.replace(/^\/+/, ''))
      const buf = await fs.readFile(filePath)
      return `data:${mimeFromUrl(url)};base64,${buf.toString('base64')}`
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const res = await fetch(url, { cache: 'force-cache' })
      if (!res.ok) return null
      const ct = res.headers.get('content-type')?.split(';')[0]?.trim() || mimeFromUrl(url)
      const ab = await res.arrayBuffer()
      return `data:${ct};base64,${Buffer.from(ab).toString('base64')}`
    }
    return null
  } catch {
    return null
  }
}

function formatDateLabel(start: string | null, end: string | null, lang: Locale): string | null {
  const s = start?.trim() || null
  const e = end?.trim() || null
  if (!s) return null
  const locale = lang === 'es' ? 'es-ES' : 'en-US'
  try {
    const dStart = new Date(s)
    if (Number.isNaN(dStart.getTime())) return null
    const fmt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' })
    const startLabel = fmt.format(dStart).toUpperCase()
    if (e) {
      const dEnd = new Date(e)
      if (!Number.isNaN(dEnd.getTime()) && dEnd.getTime() !== dStart.getTime()) {
        const sameYear = dEnd.getFullYear() === dStart.getFullYear()
        const sameMonth = sameYear && dEnd.getMonth() === dStart.getMonth()
        if (sameMonth) {
          const dayFmt = new Intl.DateTimeFormat(locale, { day: '2-digit' })
          return `${dayFmt.format(dStart)}–${fmt.format(dEnd).toUpperCase()}`
        }
        return `${startLabel} → ${fmt.format(dEnd).toUpperCase()}`
      }
    }
    return startLabel
  } catch {
    return null
  }
}

function buildLocationLabel(row: EventOgRow): string {
  const bits = [row.venue, row.city, row.country].map((v) => v?.trim() || '').filter(Boolean)
  const seen = new Set<string>()
  const dedup = bits.filter((b) => {
    const k = b.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return dedup.join(' · ')
}

export default async function Image({ params }: Props) {
  const { lang: rawLang, slug } = await params
  const lang: Locale = i18n.locales.includes(rawLang as Locale) ? (rawLang as Locale) : i18n.defaultLocale

  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('events')
    .select('name, date_start, date_end, city, country, venue, image_url, og_image_url')
    .eq('slug', slug)
    .single()
  const row = (data as EventOgRow | null) ?? null

  const name = row?.name?.trim() || slug.replace(/-/g, ' ').toUpperCase()
  const posterSource = row?.og_image_url || row?.image_url || null
  const posterDataUrl = await loadPosterDataUrl(posterSource)
  const dateLabel = formatDateLabel(row?.date_start ?? null, row?.date_end ?? null, lang)
  const locationLabel = row ? buildLocationLabel(row) : ''

  return new ImageResponse(
    (
      <EventOgImage
        lang={lang}
        name={name}
        posterDataUrl={posterDataUrl}
        dateLabel={dateLabel}
        locationLabel={locationLabel}
      />
    ),
    { ...size },
  )
}
