// ============================================
// OPTIMAL BREAKS — Open Graph dinámica: lista compartida de tracks
// /:lang/u/:handle/tracks/opengraph-image → PNG 1200×630
// Nombre + avatar + collage de carátulas de los saves del usuario.
// ============================================

import { ImageResponse } from 'next/og'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { i18n, type Locale } from '@/lib/i18n-config'
import { UserTracksOgImage } from '@/lib/UserTracksOgImage'
import { upscaleTrackArtworkForOg } from '@/lib/share-track'

export const alt = 'Optimal Breaks — Shared track list'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const runtime = 'nodejs'
/** Cache corta: la lista cambia al guardar/quitar tracks. */
export const revalidate = 600

type Props = { params: Promise<{ lang: string; handle: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_COVERS = 6

const EXT_MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
}

const NEEDS_RENCODE = new Set(['image/webp', 'image/avif'])

type ProfileMini = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type SavedRow = {
  track_source: string
  track_id: string
  snapshot: Record<string, unknown> | null
}

function mimeFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  const ext = path.extname(clean)
  return EXT_MIME[ext] ?? 'image/jpeg'
}

async function ensureSatoriCompatible(
  buf: Buffer,
  mime: string,
  maxEdge = 320,
): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const sharpMod = await import('sharp')
    const sharp =
      (sharpMod as { default?: typeof import('sharp') }).default ??
      (sharpMod as unknown as typeof import('sharp'))
    const needsRencode = NEEDS_RENCODE.has(mime)
    const pipeline = sharp(buf).resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'cover',
      withoutEnlargement: false,
    })
    if (needsRencode || mime === 'image/png') {
      const png = await pipeline.png({ compressionLevel: 9 }).toBuffer()
      return { buf: png, mime: 'image/png' }
    }
    if (mime === 'image/jpeg') {
      const jpg = await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer()
      return { buf: jpg, mime: 'image/jpeg' }
    }
    const png = await pipeline.png({ compressionLevel: 9 }).toBuffer()
    return { buf: png, mime: 'image/png' }
  } catch {
    if (NEEDS_RENCODE.has(mime)) return null
    return { buf, mime }
  }
}

async function loadImageDataUrl(
  rawUrl: string | null | undefined,
  maxEdge = 320,
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
      const res = await fetch(url, {
        cache: 'force-cache',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/jpeg,image/png,image/webp,*/*',
        },
      })
      if (!res.ok) return null
      const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
      if (ct && /^image\//i.test(ct)) mime = ct
      buf = Buffer.from(await res.arrayBuffer())
    } else {
      return null
    }

    const safe = await ensureSatoriCompatible(buf, mime, maxEdge)
    if (!safe) return null
    return `data:${safe.mime};base64,${safe.buf.toString('base64')}`
  } catch {
    return null
  }
}

async function collectCoverUrls(
  handle: string,
): Promise<{ name: string; count: number; avatar: string | null; covers: string[] }> {
  const empty = { name: 'Breaker', count: 0, avatar: null as string | null, covers: [] as string[] }
  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return empty
  }

  const profileQuery = UUID_RE.test(handle)
    ? sb.from('profiles').select('id, username, display_name, avatar_url').eq('id', handle).maybeSingle()
    : sb.from('profiles').select('id, username, display_name, avatar_url').ilike('username', handle).maybeSingle()

  const { data: profileData } = await profileQuery
  const owner = profileData as ProfileMini | null
  if (!owner) return empty

  const name = owner.display_name || owner.username || 'Breaker'

  const { data: savedData } = await sb
    .from('saved_chart_tracks')
    .select('track_source, track_id, snapshot')
    .eq('user_id', owner.id)
    .order('created_at', { ascending: false })

  const saved = ((savedData as unknown) as SavedRow[]) || []
  const count = saved.length

  const chartIds = Array.from(
    new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)),
  )
  const featIds = Array.from(
    new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)),
  )
  const vinylIds = Array.from(
    new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)),
  )

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? sb.from('chart_tracks').select('id, artwork_url').in('id', chartIds)
      : Promise.resolve({ data: [] as { id: string; artwork_url: string | null }[] }),
    featIds.length
      ? sb.from('chart_featured_tracks').select('id, artwork_url').in('id', featIds)
      : Promise.resolve({ data: [] as { id: string; artwork_url: string | null }[] }),
    vinylIds.length
      ? sb.from('chart_vinyl_tracks').select('id, artwork_url').in('id', vinylIds)
      : Promise.resolve({ data: [] as { id: string; artwork_url: string | null }[] }),
  ])

  const artByKey = new Map<string, string>()
  for (const r of (chartRes.data || []) as { id: string; artwork_url: string | null }[]) {
    if (r.artwork_url) artByKey.set(`chart:${r.id}`, r.artwork_url)
  }
  for (const r of (featRes.data || []) as { id: string; artwork_url: string | null }[]) {
    if (r.artwork_url) artByKey.set(`featured:${r.id}`, r.artwork_url)
  }
  for (const r of (vinylRes.data || []) as { id: string; artwork_url: string | null }[]) {
    if (r.artwork_url) artByKey.set(`vinyl:${r.id}`, r.artwork_url)
  }

  const covers: string[] = []
  const seen = new Set<string>()
  for (const s of saved) {
    if (covers.length >= MAX_COVERS) break
    const raw =
      artByKey.get(`${s.track_source}:${s.track_id}`) ||
      (typeof s.snapshot?.artwork_url === 'string' ? s.snapshot.artwork_url : null)
    const up = upscaleTrackArtworkForOg(raw)
    if (!up || seen.has(up)) continue
    seen.add(up)
    covers.push(up)
  }

  return { name, count, avatar: owner.avatar_url, covers }
}

export default async function Image({ params }: Props) {
  const { lang: raw, handle } = await params
  const lang: Locale = i18n.locales.includes(raw as Locale) ? (raw as Locale) : i18n.defaultLocale

  const { name, count, avatar, covers } = await collectCoverUrls(handle)

  const [avatarDataUrl, ...coverDataUrls] = await Promise.all([
    loadImageDataUrl(avatar, 192),
    ...covers.map((u) => loadImageDataUrl(u, 320)),
  ])

  return new ImageResponse(
    (
      <UserTracksOgImage
        lang={lang}
        displayName={name}
        trackCount={count}
        coverDataUrls={coverDataUrls.filter((x): x is string => Boolean(x))}
        avatarDataUrl={avatarDataUrl}
      />
    ),
    { ...size },
  )
}
