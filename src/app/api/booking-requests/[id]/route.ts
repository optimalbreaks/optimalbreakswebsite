import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser, requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { ARTIST_SETTABLE_BOOKING_STATUSES } from '@/lib/bookings'
import type { BookingRequestStatus } from '@/types/database'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH /api/booking-requests/[id]
//   { status }                       → artista vinculado cambia el estado
//   { action: 'hide'|'unhide' }      → admin oculta/reactiva (moderación)
//   { admin_notes }                  → admin anota
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const action = body.action ? String(body.action) : ''

  // ---- Acciones de admin (moderación) ----
  if (action === 'hide' || action === 'unhide' || 'admin_notes' in body) {
    const admin = await requireAdmin(request)
    if (!admin.ok) return admin.response
    const svc = createServiceSupabase()
    const update: Record<string, unknown> = {}
    if (action === 'hide') update.hidden_by_admin = true
    if (action === 'unhide') update.hidden_by_admin = false
    if ('admin_notes' in body) update.admin_notes = String(body.admin_notes || '').slice(0, 2000)
    const { data, error } = await svc
      .from('booking_requests')
      .update(update as never)
      .eq('id', id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // ---- Acción del artista vinculado: cambiar estado ----
  const status = String(body.status || '') as BookingRequestStatus
  if (!ARTIST_SETTABLE_BOOKING_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Estado no permitido.' }, { status: 400 })
  }

  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  // RLS: solo actualiza si la solicitud pertenece a una ficha del usuario.
  const { data, error } = await auth.supabase
    .from('booking_requests')
    .update({ status } as never)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json({ error: 'Solicitud no encontrada o sin permiso.' }, { status: 404 })
  }
  return NextResponse.json({ data })
}

// DELETE /api/booking-requests/[id] — el remitente cancela mientras sigue 'new'
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('booking_requests')
    .delete()
    .eq('id', id)
    .eq('sender_id', auth.userId)
    .eq('status', 'new')
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json(
      { error: 'No se puede cancelar (no existe o el artista ya la leyó).' },
      { status: 409 },
    )
  }
  return NextResponse.json({ ok: true })
}
