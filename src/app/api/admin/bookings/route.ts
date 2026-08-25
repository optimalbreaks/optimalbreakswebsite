import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase, fetchAllRows, selectByIds } from '@/lib/supabase-admin'
import type { BookingRequestRow, BookingRequestStatus } from '@/types/database'

export const dynamic = 'force-dynamic'

// GET /api/admin/bookings?status=new — lista todas las solicitudes de booking
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const status = new URL(request.url).searchParams.get('status')
  const svc = createServiceSupabase()

  const { data, error } = await fetchAllRows<BookingRequestRow>((from, to) => {
    let query = svc.from('booking_requests').select('*').order('created_at', { ascending: false }).order('id', { ascending: true })
    if (status) query = query.eq('status', status as BookingRequestStatus)
    return query.range(from, to)
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data
  const artistIds = Array.from(new Set(rows.map((r) => r.artist_id)))
  const senderIds = Array.from(new Set(rows.map((r) => r.sender_id)))

  const artistById: Record<string, { name: string; slug: string }> = {}
  if (artistIds.length) {
    const { data: arts } = await selectByIds<{ id: string; name: string; slug: string }>(artistIds, (chunk) =>
      svc.from('artists').select('id, name, slug').in('id', chunk),
    )
    arts.forEach((a) => {
      artistById[a.id] = { name: a.name, slug: a.slug }
    })
  }

  const emailById: Record<string, string | null> = {}
  await Promise.all(
    senderIds.map(async (id) => {
      const { data } = await svc.auth.admin.getUserById(id)
      emailById[id] = data?.user?.email ?? null
    }),
  )

  // Marca de baneados
  const bannedSet = new Set<string>()
  if (senderIds.length) {
    const { data: bans } = await selectByIds<{ user_id: string }>(senderIds, (chunk) =>
      svc.from('booking_sender_bans').select('user_id').in('user_id', chunk),
    )
    bans.forEach((b) => bannedSet.add(b.user_id))
  }

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      artist_name: artistById[r.artist_id]?.name ?? null,
      artist_slug: artistById[r.artist_id]?.slug ?? null,
      sender_email: emailById[r.sender_id] ?? null,
      sender_banned: bannedSet.has(r.sender_id),
    })),
  })
}

// POST /api/admin/bookings — moderación de remitentes: { user_id, action:'ban'|'unban', reason? }
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const userId = String(body.user_id || '')
  const action = String(body.action || '')
  if (!userId) return NextResponse.json({ error: 'Falta user_id' }, { status: 400 })

  const svc = createServiceSupabase()
  if (action === 'ban') {
    const { error } = await svc.from('booking_sender_bans').upsert(
      { user_id: userId, reason: String(body.reason || '').slice(0, 500), created_by: auth.userId } as never,
      { onConflict: 'user_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, banned: true })
  }
  if (action === 'unban') {
    const { error } = await svc.from('booking_sender_bans').delete().eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, banned: false })
  }
  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
