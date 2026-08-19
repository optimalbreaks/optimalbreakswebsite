import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser, requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import type { ArtistClaimRow } from '@/types/database'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH /api/artist-claims/[id]
//   { action: 'cancel' }                              → usuario cancela su pendiente
//   { action: 'approve', artist_id?, admin_notes? }   → admin aprueba (vincula ficha)
//   { action: 'reject',  admin_notes? }               → admin rechaza
//   { action: 'revoke',  admin_notes? }               → admin revoca claim aprobado
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
  const action = String(body.action || '')

  // ---- Acción de usuario: cancelar su propia solicitud pendiente ----
  if (action === 'cancel') {
    const auth = await getRouteUser()
    if (!auth.ok) return auth.response
    const { data, error } = await auth.supabase
      .from('artist_claims')
      .update({ status: 'cancelled' } as never)
      .eq('id', id)
      .eq('user_id', auth.userId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) {
      return NextResponse.json(
        { error: 'No se puede cancelar (no existe o ya resuelta).' },
        { status: 409 },
      )
    }
    return NextResponse.json({ data })
  }

  // ---- Acciones de admin ----
  const admin = await requireAdmin(request)
  if (!admin.ok) return admin.response
  const svc = createServiceSupabase()
  const adminNotes = String(body.admin_notes || '').slice(0, 2000)

  const { data: claimRow } = await svc
    .from('artist_claims')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  const claim = claimRow as ArtistClaimRow | null
  if (!claim) return NextResponse.json({ error: 'Solicitud no encontrada.' }, { status: 404 })

  if (action === 'approve') {
    if (claim.status !== 'pending') {
      return NextResponse.json({ error: 'La solicitud no está pendiente.' }, { status: 409 })
    }
    // Ficha a vincular: la reclamada (claim_existing) o la que indique el admin
    // tras crear la ficha para un request_new.
    const targetArtistId =
      claim.kind === 'claim_existing'
        ? claim.artist_id
        : (String(body.artist_id || '') || null)
    if (!targetArtistId) {
      return NextResponse.json(
        { error: 'Indica la ficha de artista a vincular (crea la ficha primero si es una alta nueva).' },
        { status: 400 },
      )
    }
    const { data: artist } = await svc
      .from('artists')
      .select('id, claimed_by')
      .eq('id', targetArtistId)
      .maybeSingle()
    const art = artist as { id: string; claimed_by: string | null } | null
    if (!art) return NextResponse.json({ error: 'Ficha no encontrada.' }, { status: 404 })
    if (art.claimed_by && art.claimed_by !== claim.user_id) {
      return NextResponse.json(
        { error: 'Esa ficha ya está verificada por otra cuenta.' },
        { status: 409 },
      )
    }

    const { error: artErr } = await svc
      .from('artists')
      .update({ claimed_by: claim.user_id } as never)
      .eq('id', targetArtistId)
    if (artErr) return NextResponse.json({ error: artErr.message }, { status: 500 })

    const { data, error } = await svc
      .from('artist_claims')
      .update({
        status: 'approved',
        artist_id: targetArtistId,
        admin_notes: adminNotes,
        resolved_at: new Date().toISOString(),
        resolved_by: admin.userId,
      } as never)
      .eq('id', id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === 'reject') {
    const { data, error } = await svc
      .from('artist_claims')
      .update({
        status: 'rejected',
        admin_notes: adminNotes,
        resolved_at: new Date().toISOString(),
        resolved_by: admin.userId,
      } as never)
      .eq('id', id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (action === 'revoke') {
    if (claim.artist_id) {
      // Desvincular la ficha y cerrar la recepción de bookings.
      await svc
        .from('artists')
        .update({ claimed_by: null, accepts_bookings: false } as never)
        .eq('id', claim.artist_id)
        .eq('claimed_by', claim.user_id)
    }
    const { data, error } = await svc
      .from('artist_claims')
      .update({
        status: 'revoked',
        admin_notes: adminNotes,
        resolved_at: new Date().toISOString(),
        resolved_by: admin.userId,
      } as never)
      .eq('id', id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })
}
