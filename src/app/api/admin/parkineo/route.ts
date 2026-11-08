import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase, fetchAllRows } from '@/lib/supabase-admin'
import { parkineoMessage, resolveParkineoLink } from '@/lib/parkineo'
import { notifyParkineoPublished } from '@/lib/transactional-mail'
import { revalidateParkineo } from '@/lib/revalidate-public'
import type { ParkineoSession } from '@/types/database'

export const dynamic = 'force-dynamic'

const ADMIN_COLUMNS =
  'id, user_id, dj_name, city, title, contact_phone, source_url, platform, embed_url, video_url, image_url, duration_minutes, slug, status, reject_reason, published_at, created_at'

type PlayRow = {
  kind: string
  session_id: string | null
  track_id: string | null
  user_id: string | null
  created_at: string
}

type ListenBucket = {
  plays: number
  plays7d: number
  accounts: Set<string>
  anonymous: number
  lastAt: string | null
}

function emptyListen(): ListenBucket {
  return { plays: 0, plays7d: 0, accounts: new Set(), anonymous: 0, lastAt: null }
}

function addListen(bucket: ListenBucket, row: PlayRow, weekMs: number) {
  bucket.plays += 1
  if (new Date(row.created_at).getTime() >= weekMs) bucket.plays7d += 1
  if (row.user_id) bucket.accounts.add(row.user_id)
  else bucket.anonymous += 1
  if (!bucket.lastAt || row.created_at > bucket.lastAt) bucket.lastAt = row.created_at
}

function packListen(bucket: ListenBucket, hearts?: number) {
  return {
    plays: bucket.plays,
    plays7d: bucket.plays7d,
    accounts: bucket.accounts.size,
    anonymous: bucket.anonymous,
    lastAt: bucket.lastAt,
    ...(hearts != null ? { hearts } : {}),
  }
}

async function loadParkineoStats(svc: ReturnType<typeof createServiceSupabase>) {
  const weekMs = Date.now() - 7 * 24 * 60 * 60 * 1000
  const [playsRes, heartsRes] = await Promise.all([
    fetchAllRows<PlayRow>((from, to) =>
      svc
        .from('parkineo_play_events')
        .select('kind, session_id, track_id, user_id, created_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<{ session_id: string }>((from, to) =>
      svc
        .from('favorite_parkineo')
        .select('session_id')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  const heartsBySession: Record<string, number> = {}
  for (const row of heartsRes.data) {
    heartsBySession[row.session_id] = (heartsBySession[row.session_id] || 0) + 1
  }

  const sessions = emptyListen()
  const tracks = emptyListen()
  const bySession = new Map<string, ListenBucket>()
  const byTrack = new Map<string, ListenBucket>()
  if (!playsRes.error) {
    for (const row of playsRes.data) {
      if (row.kind === 'session' && row.session_id) {
        addListen(sessions, row, weekMs)
        let bucket = bySession.get(row.session_id)
        if (!bucket) {
          bucket = emptyListen()
          bySession.set(row.session_id, bucket)
        }
        addListen(bucket, row, weekMs)
      } else if (row.kind === 'track' && row.track_id) {
        addListen(tracks, row, weekMs)
        let bucket = byTrack.get(row.track_id)
        if (!bucket) {
          bucket = emptyListen()
          byTrack.set(row.track_id, bucket)
        }
        addListen(bucket, row, weekMs)
      }
    }
  }

  const sessionStats: Record<string, ReturnType<typeof packListen>> = {}
  const ids = new Set<string>([...bySession.keys(), ...Object.keys(heartsBySession)])
  for (const id of ids) {
    sessionStats[id] = packListen(bySession.get(id) || emptyListen(), heartsBySession[id] || 0)
  }
  const trackStats: Record<string, ReturnType<typeof packListen>> = {}
  for (const [id, bucket] of byTrack) trackStats[id] = packListen(bucket)

  return {
    playsReady: !playsRes.error,
    sessions: { ...packListen(sessions), hearts: heartsRes.data.length },
    tracks: packListen(tracks),
    bySession: sessionStats,
    byTrack: trackStats,
  }
}

// GET /api/admin/parkineo — cola y decisiones recientes
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('parkineo_sessions')
    .select(ADMIN_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data || []) as ParkineoSession[]
  const ids = Array.from(new Set(rows.map((r) => r.user_id)))
  const names: Record<string, { display_name: string | null; username: string | null; email: string | null }> = {}
  if (ids.length) {
    const { data: profiles } = await svc
      .from('profiles')
      .select('id, display_name, username')
      .in('id', ids)
    for (const p of profiles || []) {
      names[p.id] = { display_name: p.display_name, username: p.username, email: null }
    }
    await Promise.all(
      ids.slice(0, 40).map(async (id) => {
        try {
          const { data: userData } = await svc.auth.admin.getUserById(id)
          const email = userData.user?.email || null
          names[id] = {
            display_name: names[id]?.display_name ?? null,
            username: names[id]?.username ?? null,
            email,
          }
        } catch {
          /* la bandeja sigue sin el email */
        }
      }),
    )
  }

  const ordered = [...rows].sort((a, b) => {
    const rank = (s: string) => (s === 'pending' ? 0 : s === 'published' ? 1 : 2)
    return rank(a.status) - rank(b.status) || b.created_at.localeCompare(a.created_at)
  })

  const stats = await loadParkineoStats(svc)

  return NextResponse.json({
    data: ordered.map((row) => ({
      ...row,
      account_name: names[row.user_id]?.display_name || names[row.user_id]?.username || null,
      account_email: names[row.user_id]?.email || null,
    })),
    stats,
  })
}

// POST /api/admin/parkineo — publicar o descartar
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: { id?: string; action?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const id = String(body.id || '').trim()
  const action = body.action === 'publish' ? 'publish' : body.action === 'reject' ? 'reject' : null
  if (!id || !action) return NextResponse.json({ error: 'Falta la sesión o la decisión' }, { status: 400 })

  const reason = String(body.reason || '').trim().slice(0, 280)
  const svc = createServiceSupabase()
  const { data: existing, error: readError } = await svc
    .from('parkineo_sessions')
    .select('id, user_id, dj_name, title, slug, status, source_key, source_url, duration_minutes')
    .eq('id', id)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'No está' }, { status: 404 })

  if (action === 'publish' && existing.status !== 'published') {
    const { data: clash } = await svc
      .from('parkineo_sessions')
      .select('id')
      .eq('source_key', existing.source_key)
      .eq('status', 'published')
      .neq('id', id)
      .maybeSingle()
    if (clash) {
      return NextResponse.json({ error: 'Ese enlace ya está publicado en otra fila.' }, { status: 409 })
    }
  }

  const now = new Date().toISOString()
  let durationMinutes: number | null = null
  if (action === 'publish' && existing.duration_minutes == null && existing.source_url) {
    const resolved = await resolveParkineoLink(existing.source_url)
    if (!resolved.ok && (resolved.code === 'too_short' || resolved.code === 'too_long')) {
      return NextResponse.json({ error: parkineoMessage(resolved.code, 'es') }, { status: 400 })
    }
    if (resolved.ok) durationMinutes = resolved.link.durationMinutes
  }
  const patch =
    action === 'publish'
      ? {
          status: 'published' as const,
          published_at: now,
          decided_at: now,
          decided_by: auth.userId,
          reject_reason: null,
          ...(durationMinutes != null ? { duration_minutes: durationMinutes } : {}),
        }
      : {
          status: 'rejected' as const,
          decided_at: now,
          decided_by: auth.userId,
          reject_reason: reason || null,
        }

  const { error } = await svc.from('parkineo_sessions').update(patch).eq('id', id)
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ese enlace ya está en la cola o publicado.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let mail: string | null = null
  if (action === 'publish' && existing.status !== 'published') {
    try {
      mail = await notifyParkineoPublished({
        userId: existing.user_id,
        djName: existing.dj_name,
        title: existing.title,
        slug: existing.slug,
        sessionId: existing.id,
      })
    } catch (err) {
      console.warn('[parkineo] aviso no enviado', err)
      mail = 'failed'
    }
  }

  if (action === 'publish' || existing.status === 'published') {
    revalidateParkineo(existing.slug)
  }

  return NextResponse.json({ ok: true, mail })
}
