import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { revalidateParkineo } from '@/lib/revalidate-public'
import type { ParkineoSession } from '@/types/database'

export const dynamic = 'force-dynamic'

const ADMIN_COLUMNS =
  'id, user_id, dj_name, city, title, source_url, platform, embed_url, video_url, image_url, duration_minutes, slug, status, reject_reason, published_at, created_at'

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
    const pendingIds = rows.filter((r) => r.status === 'pending').map((r) => r.user_id)
    await Promise.all(
      Array.from(new Set(pendingIds)).slice(0, 40).map(async (id) => {
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

  return NextResponse.json({
    data: ordered.map((row) => ({
      ...row,
      account_name: names[row.user_id]?.display_name || names[row.user_id]?.username || null,
      account_email: names[row.user_id]?.email || null,
    })),
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
    .select('id, slug, status, source_key')
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
  const patch =
    action === 'publish'
      ? {
          status: 'published' as const,
          published_at: now,
          decided_at: now,
          decided_by: auth.userId,
          reject_reason: null,
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

  if (action === 'publish' || existing.status === 'published') {
    revalidateParkineo(existing.slug)
  }

  return NextResponse.json({ ok: true })
}
