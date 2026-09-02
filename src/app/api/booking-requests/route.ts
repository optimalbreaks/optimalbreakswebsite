import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { getRouteUser } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { BOOKING_DAILY_LIMIT, isValidEmail } from '@/lib/bookings'
import { notifyArtistOfNewBooking } from '@/lib/transactional-mail'
import type { BookingRequestRow } from '@/types/database'

export const dynamic = 'force-dynamic'

type ArtistLite = { id: string; name: string; slug: string }

async function attachArtistNames(rows: BookingRequestRow[]) {
  const ids = Array.from(new Set(rows.map((r) => r.artist_id).filter(Boolean)))
  const nameById: Record<string, ArtistLite> = {}
  if (ids.length) {
    const svc = createServiceSupabase()
    const { data } = await svc.from('artists').select('id, name, slug').in('id', ids)
    ;(data as ArtistLite[] | null)?.forEach((a) => {
      nameById[a.id] = a
    })
  }
  return rows.map((r) => ({
    ...r,
    artist_name: nameById[r.artist_id]?.name ?? null,
    artist_slug: nameById[r.artist_id]?.slug ?? null,
  }))
}

// GET /api/booking-requests?role=sender|artist
export async function GET(request: NextRequest) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  const role = new URL(request.url).searchParams.get('role') === 'artist' ? 'artist' : 'sender'
  const svc = createServiceSupabase()

  if (role === 'sender') {
    const { data, error } = await svc
      .from('booking_requests')
      .select('*')
      .eq('sender_id', auth.userId)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = await attachArtistNames((data as BookingRequestRow[]) || [])
    return NextResponse.json({ data: rows })
  }

  // role = artist → solicitudes recibidas en las fichas verificadas del usuario
  const { data: mine } = await svc.from('artists').select('id').eq('claimed_by', auth.userId)
  const artistIds = ((mine as { id: string }[]) || []).map((a) => a.id)
  if (!artistIds.length) return NextResponse.json({ data: [] })

  const { data, error } = await svc
    .from('booking_requests')
    .select('*')
    .in('artist_id', artistIds)
    .eq('hidden_by_admin', false)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = await attachArtistNames((data as BookingRequestRow[]) || [])
  return NextResponse.json({ data: rows })
}

// POST /api/booking-requests — un usuario logueado solicita booking a un artista
export async function POST(request: NextRequest) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const artistId = String(body.artist_id || '')
  const city = String(body.city || '').trim().slice(0, 200)
  const message = String(body.message || '').trim().slice(0, 4000)
  const contactEmail = String(body.contact_email || '').trim().slice(0, 200)

  if (!artistId) return NextResponse.json({ error: 'Falta el artista.' }, { status: 400 })
  if (!city) return NextResponse.json({ error: 'Indica la ciudad del evento.' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Escribe un mensaje.' }, { status: 400 })
  if (!isValidEmail(contactEmail)) {
    return NextResponse.json({ error: 'Email de contacto no válido.' }, { status: 400 })
  }

  const svc = createServiceSupabase()

  // Artista abierto a bookings
  const { data: artist } = await svc
    .from('artists')
    .select('id, name, accepts_bookings, claimed_by')
    .eq('id', artistId)
    .maybeSingle()
  const art = artist as { id: string; name: string; accepts_bookings: boolean; claimed_by: string | null } | null
  if (!art || !art.accepts_bookings) {
    return NextResponse.json(
      { error: 'Este artista no está recibiendo solicitudes ahora mismo.' },
      { status: 409 },
    )
  }
  if (art.claimed_by === auth.userId) {
    return NextResponse.json({ error: 'No puedes solicitarte booking a ti mismo.' }, { status: 400 })
  }

  // Remitente no baneado
  const { data: ban } = await svc
    .from('booking_sender_bans')
    .select('user_id')
    .eq('user_id', auth.userId)
    .maybeSingle()
  if (ban) {
    return NextResponse.json(
      { error: 'Tu cuenta no puede enviar solicitudes de booking.' },
      { status: 403 },
    )
  }

  // Límite diario anti-abuso
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recent } = await svc
    .from('booking_requests')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', auth.userId)
    .gte('created_at', since)
  if ((recent ?? 0) >= BOOKING_DAILY_LIMIT) {
    return NextResponse.json(
      { error: 'Has alcanzado el límite de solicitudes de las últimas 24 h.' },
      { status: 429 },
    )
  }

  const insert = {
    artist_id: artistId,
    sender_id: auth.userId,
    event_date: (String(body.event_date || '').trim() || null) as string | null,
    city,
    venue: String(body.venue || '').trim().slice(0, 200),
    event_type: String(body.event_type || '').trim().slice(0, 120),
    budget_range: String(body.budget_range || '').trim().slice(0, 40),
    message,
    contact_email: contactEmail,
    contact_phone: String(body.contact_phone || '').trim().slice(0, 60),
    status: 'new' as const,
  }

  // Insert con el JWT del usuario → RLS revalida sender_id y accepts_bookings.
  const { data, error } = await auth.supabase
    .from('booking_requests')
    .insert(insert as never)
    .select('*')
    .single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'Ya tienes una solicitud abierta con este artista.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (art.claimed_by) {
    waitUntil(
      notifyArtistOfNewBooking({
        claimedByUserId: art.claimed_by,
        artistName: art.name,
        city,
        eventDate: insert.event_date,
      }).catch((err) => {
        console.warn('[mail] aviso de booking falló', err)
      }),
    )
  }

  return NextResponse.json({ data }, { status: 201 })
}
