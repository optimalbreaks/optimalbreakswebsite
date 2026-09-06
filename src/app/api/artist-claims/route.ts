import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { CLAIM_SUPERSEDED_NOTE, supersedeCompetingClaims } from '@/lib/artist-claims'
import { isClaimableCategory, isValidEmail } from '@/lib/bookings'
import type { ArtistClaimRow } from '@/types/database'

export const dynamic = 'force-dynamic'

// GET /api/artist-claims — solicitudes del usuario actual
export async function GET() {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('artist_claims')
    .select('*')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let claims = (data as ArtistClaimRow[]) || []
  const artistIds = Array.from(
    new Set(claims.map((c) => c.artist_id).filter((v): v is string => !!v)),
  )
  const nameById: Record<string, { name: string; slug: string }> = {}
  if (artistIds.length) {
    const svc = createServiceSupabase()
    const { data: arts } = await svc
      .from('artists')
      .select('id, name, slug, claimed_by')
      .in('id', artistIds)
    const claimedBy: Record<string, string | null> = {}
    ;(arts as { id: string; name: string; slug: string; claimed_by: string | null }[] | null)?.forEach((a) => {
      nameById[a.id] = { name: a.name, slug: a.slug }
      claimedBy[a.id] = a.claimed_by
    })
    const stale = claims.filter(
      (c) =>
        c.status === 'pending' &&
        c.artist_id &&
        claimedBy[c.artist_id] &&
        claimedBy[c.artist_id] !== auth.userId,
    )
    if (stale.length) {
      await Promise.all(
        Array.from(new Set(stale.map((c) => c.artist_id as string))).map((artistId) =>
          supersedeCompetingClaims(svc, { artistId, exceptUserId: claimedBy[artistId] ?? undefined }),
        ),
      )
      claims = claims.map((c) =>
        stale.some((s) => s.id === c.id)
          ? { ...c, status: 'superseded', admin_notes: CLAIM_SUPERSEDED_NOTE }
          : c,
      )
    }
  }

  return NextResponse.json({
    data: claims.map((c) => ({
      ...c,
      artist_name: c.artist_id ? nameById[c.artist_id]?.name ?? null : null,
      artist_slug: c.artist_id ? nameById[c.artist_id]?.slug ?? null : null,
    })),
  })
}

// POST /api/artist-claims — crea una solicitud (claim_existing | request_new)
export async function POST(request: NextRequest) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const kind = String(body.kind || '')
  const relationship = ['artist', 'manager', 'agency'].includes(String(body.relationship))
    ? (String(body.relationship) as 'artist' | 'manager' | 'agency')
    : 'artist'
  const message = String(body.message || '').slice(0, 2000)
  const contactPhone = String(body.contact_phone || '').trim().slice(0, 60)
  const contactEmail = String(body.contact_email || '').trim().slice(0, 200)

  // Teléfono obligatorio: admin verifica la identidad por llamada.
  if (!contactPhone) {
    return NextResponse.json(
      { error: 'Indica un teléfono de contacto para poder verificarte.' },
      { status: 400 },
    )
  }
  if (contactEmail && !isValidEmail(contactEmail)) {
    return NextResponse.json({ error: 'Email de contacto no válido.' }, { status: 400 })
  }

  const svc = createServiceSupabase()

  // El usuario no puede tener ya una ficha aprobada (MVP: 1 ficha por cuenta, §9.2)
  const { count: approvedCount } = await svc
    .from('artist_claims')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .eq('status', 'approved')
  if ((approvedCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Ya tienes una ficha de artista verificada.' },
      { status: 409 },
    )
  }

  const insert: Record<string, unknown> = {
    user_id: auth.userId,
    kind,
    relationship,
    message,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    status: 'pending',
  }

  if (kind === 'claim_existing') {
    const artistId = String(body.artist_id || '')
    if (!artistId) {
      return NextResponse.json({ error: 'Falta el artista a reclamar.' }, { status: 400 })
    }
    const { data: artist } = await svc
      .from('artists')
      .select('id, category, claimed_by')
      .eq('id', artistId)
      .maybeSingle()
    const art = artist as { id: string; category: string | null; claimed_by: string | null } | null
    if (!art) {
      return NextResponse.json({ error: 'Artista no encontrado.' }, { status: 404 })
    }
    if (!isClaimableCategory(art.category)) {
      return NextResponse.json(
        { error: 'Esta ficha no se puede reclamar.' },
        { status: 403 },
      )
    }
    if (art.claimed_by) {
      return NextResponse.json(
        { error: 'Esta ficha ya está verificada por otra cuenta.' },
        { status: 409 },
      )
    }
    insert.artist_id = artistId
  } else if (kind === 'request_new') {
    const proposedName = String(body.proposed_name || '').trim().slice(0, 200)
    const urls = {
      beatport_url: String(body.beatport_url || '').trim().slice(0, 500),
      youtube_url: String(body.youtube_url || '').trim().slice(0, 500),
      soundcloud_url: String(body.soundcloud_url || '').trim().slice(0, 500),
      instagram_url: String(body.instagram_url || '').trim().slice(0, 500),
    }
    if (!proposedName) {
      return NextResponse.json({ error: 'Indica el nombre artístico.' }, { status: 400 })
    }
    if (!Object.values(urls).some((u) => u.length > 0)) {
      return NextResponse.json(
        { error: 'Aporta al menos un enlace (Beatport, YouTube, SoundCloud o Instagram).' },
        { status: 400 },
      )
    }
    insert.proposed_name = proposedName
    Object.assign(insert, urls)
  } else {
    return NextResponse.json({ error: 'Tipo de solicitud inválido.' }, { status: 400 })
  }

  // Insert con el JWT del usuario → RLS garantiza user_id = uid y status pending.
  const { data, error } = await auth.supabase
    .from('artist_claims')
    .insert(insert as never)
    .select('*')
    .single()

  if (error) {
    // 23505 = unique_violation (índice uniq_pending_claim_per_user)
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'Ya tienes una solicitud pendiente. Espera a que la revisemos.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
