import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { GIFT_PROOF_BUCKET } from '@/lib/gift-download'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('gift_download_requests')
    .select('id, created_at, updated_at, gift_slug, user_id, status, shot_site_path, shot_artist_path, note, decided_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []
  const ids = Array.from(new Set(rows.map((r) => r.user_id)))
  const names: Record<string, { display_name: string | null; username: string | null; email: string | null }> = {}
  if (ids.length) {
    const { data: profiles } = await svc.from('profiles').select('id, display_name, username').in('id', ids)
    for (const p of profiles || []) {
      names[p.id] = { display_name: p.display_name, username: p.username, email: null }
    }
    await Promise.all(
      ids.slice(0, 40).map(async (id) => {
        try {
          const { data: userData } = await svc.auth.admin.getUserById(id)
          if (names[id]) names[id].email = userData.user?.email ?? null
          else names[id] = { display_name: null, username: null, email: userData.user?.email ?? null }
        } catch {
          /* el nombre de perfil basta */
        }
      }),
    )
  }

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      has_site: Boolean(r.shot_site_path),
      has_artist: Boolean(r.shot_artist_path),
      account_name: names[r.user_id]?.display_name || names[r.user_id]?.username || null,
      account_email: names[r.user_id]?.email || null,
      shot_site_path: undefined,
      shot_artist_path: undefined,
    })),
  })
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: { id?: string; action?: string; note?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const id = (body.id || '').trim()
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'id' }, { status: 400 })
  const action = body.action
  if (action !== 'approve' && action !== 'reject' && action !== 'purge') {
    return NextResponse.json({ error: 'acción' }, { status: 400 })
  }

  const svc = createServiceSupabase()
  const { data: row, error: readErr } = await svc
    .from('gift_download_requests')
    .select('id, status, shot_site_path, shot_artist_path')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'No está' }, { status: 404 })

  if (action === 'purge') {
    if (row.status === 'pending') {
      return NextResponse.json({ error: 'Primero aprueba o rechaza' }, { status: 400 })
    }
    const paths = [row.shot_site_path, row.shot_artist_path].filter(Boolean)
    if (paths.length) await svc.storage.from(GIFT_PROOF_BUCKET).remove(paths)
    const { error } = await svc
      .from('gift_download_requests')
      .update({ shot_site_path: '', shot_artist_path: '', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const note = (body.note || '').trim().slice(0, 400)
  if (action === 'reject' && !note) {
    return NextResponse.json({ error: 'Escribe por qué se rechaza' }, { status: 400 })
  }
  if (!row.shot_site_path || !row.shot_artist_path) {
    return NextResponse.json({ error: 'No hay capturas' }, { status: 400 })
  }

  const { error } = await svc
    .from('gift_download_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      note: action === 'reject' ? note : null,
      decided_at: new Date().toISOString(),
      decided_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
