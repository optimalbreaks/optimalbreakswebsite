// ============================================
// OPTIMAL BREAKS — Carátulas para los vídeos R/F de página (solo admins)
//
// POST { urls: string[] } → { images: (string | null)[] } en el mismo orden.
// Cada carátula se descarga en el servidor y vuelve como data URL, para que
// el canvas del navegador pueda dibujarla sin CORS. `mode: 'cover'` recorta
// a cuadrado (500 px). `mode: 'poster'` conserva la proporción del cartel
// (cabe en 900×1400) para que se lea el lineup del flyer.
// Ver `src/lib/page-reel.ts`.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { SITE_URL } from '@/lib/seo'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_URLS = 16
const MAX_BYTES = 8 * 1024 * 1024
const SIZE = 500

/** Solo https y nombres de host públicos (nada de IPs ni localhost). */
function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v) return null
  const abs = v.startsWith('/') && !v.startsWith('//') ? `${SITE_URL}${v}` : v
  try {
    const u = new URL(abs)
    if (u.protocol !== 'https:') return null
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null
    if (/^[\d.]+$/.test(host) || host.includes(':')) return null
    return u.toString()
  } catch {
    return null
  }
}

async function toDataUrl(url: string, mode: 'cover' | 'poster'): Promise<string | null> {
  try {
    const res = await fetch(url, {
      cache: 'force-cache',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/jpeg,image/png,image/webp,image/avif,*/*',
      },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || ''
    if (!/^image\//i.test(mime)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_BYTES) return null
    const sharpMod = await import('sharp')
    const sharp =
      (sharpMod as { default?: typeof import('sharp') }).default ??
      (sharpMod as unknown as typeof import('sharp'))
    const pipeline = sharp(buf).rotate()
    const jpg = await (mode === 'poster'
      ? pipeline.resize({ width: 900, height: 1400, fit: 'inside', withoutEnlargement: true })
      : pipeline.resize({ width: SIZE, height: SIZE, fit: 'cover' })
    )
      .jpeg({ quality: mode === 'poster' ? 82 : 84, mozjpeg: true })
      .toBuffer()
    return `data:image/jpeg;base64,${jpg.toString('base64')}`
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  let body: { urls?: unknown; mode?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const urls = Array.isArray(body.urls) ? body.urls.slice(0, MAX_URLS) : []
  const mode = body.mode === 'poster' ? 'poster' : 'cover'
  const images = await Promise.all(urls.map((u) => {
    const safe = safeUrl(u)
    return safe ? toDataUrl(safe, mode) : Promise.resolve(null)
  }))
  return NextResponse.json({ images }, { headers: { 'Cache-Control': 'no-store' } })
}
