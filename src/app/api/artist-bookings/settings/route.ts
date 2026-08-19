import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// GET /api/artist-bookings/settings — fichas verificadas del usuario + su estado
export async function GET() {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('artists')
    .select('id, name, slug, accepts_bookings, image_url')
    .eq('claimed_by', auth.userId)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// PATCH /api/artist-bookings/settings — el artista abre/cierra la recepción.
// Se escribe con service role tras verificar el vínculo (artists no tiene
// política RLS de UPDATE para usuarios: decisión §2.22).
export async function PATCH(request: NextRequest) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const artistId = String(body.artist_id || '')
  const acceptsBookings = Boolean(body.accepts_bookings)
  if (!artistId) return NextResponse.json({ error: 'Falta el artista.' }, { status: 400 })

  const svc = createServiceSupabase()
  const { data: artist } = await svc
    .from('artists')
    .select('id, claimed_by')
    .eq('id', artistId)
    .maybeSingle()
  const art = artist as { id: string; claimed_by: string | null } | null
  if (!art || art.claimed_by !== auth.userId) {
    return NextResponse.json({ error: 'No tienes esta ficha verificada.' }, { status: 403 })
  }

  const { data, error } = await svc
    .from('artists')
    .update({ accepts_bookings: acceptsBookings } as never)
    .eq('id', artistId)
    .eq('claimed_by', auth.userId)
    .select('id, name, slug, accepts_bookings')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
