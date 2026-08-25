import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { buildLastActivityAtByUserId } from '@/lib/admin-user-last-activity'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { normalizeArtistKey } from '@/lib/artist-slug-map'
import type { EditorialArtistMarkRow } from '@/types/database'

type ServiceClient = ReturnType<typeof createServiceSupabase>

async function loadArtistLevel(sb: ServiceClient, userId: string) {
  const [{ data: marks }, { data: claimed }] = await Promise.all([
    sb
      .from('editorial_artist_marks')
      .select('id, created_at, user_id, artist_key, artist_name, artist_id, created_by')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    sb
      .from('artists')
      .select('id, name, slug, accepts_bookings')
      .eq('claimed_by', userId)
      .order('name'),
  ])
  const editorial_marks = (marks || []) as EditorialArtistMarkRow[]
  const claimed_artists = (claimed || []) as {
    id: string
    name: string
    slug: string
    accepts_bookings: boolean
  }[]
  const artist_level: 'user' | 'marked' | 'claimed' =
    claimed_artists.length > 0 ? 'claimed' : editorial_marks.length > 0 ? 'marked' : 'user'
  return { editorial_marks, claimed_artists, artist_level }
}

async function resolveCatalogArtist(sb: ServiceClient, rawName: string) {
  const key = normalizeArtistKey(rawName)
  if (!key) return null
  const slugGuess = key.replace(/\s+/g, '-')
  const { data: bySlug } = await sb
    .from('artists')
    .select('id, name, name_display, slug')
    .eq('slug', slugGuess)
    .maybeSingle()
  if (bySlug) return bySlug as { id: string; name: string | null; name_display: string | null; slug: string }
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  const sb = createServiceSupabase()
  const [{ data: udata, error: uerr }, { data: profile, error: perr }] = await Promise.all([
    sb.auth.admin.getUserById(id),
    sb.from('profiles').select('*').eq('id', id).maybeSingle(),
  ])

  if (uerr || !udata?.user) {
    return NextResponse.json({ error: uerr?.message || 'Usuario no encontrado' }, { status: 404 })
  }
  if (perr) {
    return NextResponse.json({ error: perr.message }, { status: 500 })
  }

  const u = udata.user
  const lastActivity = await buildLastActivityAtByUserId(sb, [id], {
    [id]: u.last_sign_in_at ?? null,
  })
  const level = await loadArtistLevel(sb, id)
  return NextResponse.json({
    id: u.id,
    email: u.email ?? '',
    last_sign_in_at: u.last_sign_in_at ?? null,
    last_activity_at: lastActivity[id] ?? null,
    created_at: u.created_at,
    profile: profile,
    ...level,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  let body: {
    role?: string
    editorial_artist_name?: string | null
    remove_editorial_artist_key?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const wantsMark =
    Object.prototype.hasOwnProperty.call(body, 'editorial_artist_name') ||
    typeof body.remove_editorial_artist_key === 'string'
  const role = body.role
  if (role !== undefined && role !== 'user' && role !== 'admin') {
    return NextResponse.json({ error: 'role debe ser user o admin' }, { status: 400 })
  }
  if (!wantsMark && role === undefined) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const sb = createServiceSupabase()

  if (role === 'user' && auth.userId === id) {
    const { count, error: cErr } = await sb
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 })
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'No puedes quitarte el rol admin si eres el único administrador.' },
        { status: 400 },
      )
    }
  }

  if (role === 'user' || role === 'admin') {
    const { error } = await sb.from('profiles').update({ role }).eq('id', id).select('id').single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (typeof body.remove_editorial_artist_key === 'string' && body.remove_editorial_artist_key.trim()) {
    const { error } = await sb
      .from('editorial_artist_marks')
      .delete()
      .eq('user_id', id)
      .eq('artist_key', normalizeArtistKey(body.remove_editorial_artist_key))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (body.editorial_artist_name === null) {
    const { error } = await sb.from('editorial_artist_marks').delete().eq('user_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (typeof body.editorial_artist_name === 'string') {
    const artistName = body.editorial_artist_name.trim().slice(0, 120)
    const artistKey = normalizeArtistKey(artistName)
    if (!artistKey) {
      return NextResponse.json({ error: 'Indica el nombre del artista (crédito).' }, { status: 400 })
    }
    const catalog = await resolveCatalogArtist(sb, artistName)
    const { error } = await sb.from('editorial_artist_marks').upsert(
      {
        user_id: id,
        artist_key: artistKey,
        artist_name: artistName,
        artist_id: catalog?.id ?? null,
        created_by: auth.userId,
      },
      { onConflict: 'user_id,artist_key' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const level = await loadArtistLevel(sb, id)
  return NextResponse.json({ ok: true, ...level })
}
