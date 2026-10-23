import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase, fetchAllRows } from '@/lib/supabase-admin'
import { revalidateParkineo } from '@/lib/revalidate-public'
import { parkineoTrackCycle } from '@/lib/parkineo-tracks'
import type { ParkineoTrack } from '@/types/database'

export const dynamic = 'force-dynamic'

const ADMIN_COLUMNS =
  'id, user_id, artist_name, title, duration_seconds, slug, status, reject_reason, published_at, cycle, created_at'

// GET /api/admin/parkineo/tracks — cola de temas y marcas por tema
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('parkineo_tracks')
    .select(ADMIN_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as ParkineoTrack[]
  const votes = await fetchAllRows<{ track_id: string }>((from, to) =>
    svc.from('parkineo_track_votes').select('track_id').order('id', { ascending: true }).range(from, to),
  )
  const counts: Record<string, number> = {}
  for (const vote of votes.data) counts[vote.track_id] = (counts[vote.track_id] || 0) + 1

  const ids = Array.from(new Set(rows.map((r) => r.user_id)))
  const names: Record<string, { display_name: string | null; username: string | null; email: string | null }> = {}
  if (ids.length) {
    const { data: profiles } = await svc.from('profiles').select('id, display_name, username').in('id', ids)
    for (const p of profiles || []) {
      names[p.id] = { display_name: p.display_name, username: p.username, email: null }
    }
    const pendingIds = rows.filter((r) => r.status === 'pending').map((r) => r.user_id)
    await Promise.all(
      Array.from(new Set(pendingIds)).slice(0, 40).map(async (id) => {
        try {
          const { data: userData } = await svc.auth.admin.getUserById(id)
          names[id] = {
            display_name: names[id]?.display_name ?? null,
            username: names[id]?.username ?? null,
            email: userData.user?.email || null,
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

  return NextResponse.json({
    data: ordered.map((row) => ({
      ...row,
      votes: counts[row.id] || 0,
      account_name: names[row.user_id]?.display_name || names[row.user_id]?.username || null,
      account_email: names[row.user_id]?.email || null,
    })),
  })
}

// POST /api/admin/parkineo/tracks — publicar o descartar un tema
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
  if (!id || !action) return NextResponse.json({ error: 'Falta el tema o la decisión' }, { status: 400 })

  const reason = String(body.reason || '').trim().slice(0, 280)
  const svc = createServiceSupabase()
  const { data: existing, error: readError } = await svc
    .from('parkineo_tracks')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'No está' }, { status: 404 })

  const now = new Date().toISOString()
  const patch = action === 'publish'
    ? existing.status === 'published'
      ? {
          status: 'published' as const,
          decided_at: now,
          decided_by: auth.userId,
          reject_reason: null,
        }
      : {
          status: 'published' as const,
          published_at: now,
          decided_at: now,
          decided_by: auth.userId,
          reject_reason: null,
          cycle: parkineoTrackCycle(),
        }
    : {
        status: 'rejected' as const,
        decided_at: now,
        decided_by: auth.userId,
        reject_reason: reason || null,
      }

  const { error } = await svc.from('parkineo_tracks').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (action === 'publish' || existing.status === 'published') revalidateParkineo()
  return NextResponse.json({ ok: true })
}
