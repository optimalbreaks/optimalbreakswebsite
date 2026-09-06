import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { isUuid, loadClaimedByArtistIds, membersPublicForThreads, requireArtistNetworkAccess, shapeThread } from '@/lib/artist-network'
import type { ArtistNetworkMemberRow, ArtistNetworkThreadRow } from '@/types/database'

export const dynamic = 'force-dynamic'

// PATCH /api/artist-network/threads/[id] — añadir miembro a un grupo { artist_id }
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response
  const gate = await requireArtistNetworkAccess(auth.userId)
  if (!gate.ok) return gate.response

  const { id } = await context.params
  if (!isUuid(id)) return NextResponse.json({ error: 'Hilo no válido.' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const artistId = String(body.artist_id || '')
  if (!isUuid(artistId)) return NextResponse.json({ error: 'Falta el artista.' }, { status: 400 })

  const { data: membership } = await gate.svc
    .from('artist_network_members')
    .select('thread_id')
    .eq('thread_id', id)
    .eq('user_id', auth.userId)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No estás en este hilo.' }, { status: 403 })

  const { data: thread, error: thErr } = await gate.svc
    .from('artist_network_threads')
    .select('id, kind, title, dm_key, created_by, last_message_at, last_message_preview, last_sender_id, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (thErr) return NextResponse.json({ error: thErr.message }, { status: 500 })
  const row = thread as ArtistNetworkThreadRow | null
  if (!row) return NextResponse.json({ error: 'Hilo no encontrado.' }, { status: 404 })
  if (row.kind !== 'group') return NextResponse.json({ error: 'Solo se puede ampliar un grupo.' }, { status: 400 })

  const map = await loadClaimedByArtistIds(gate.svc, [artistId])
  const other = map.get(artistId)
  if (!other) return NextResponse.json({ error: 'Esa ficha no está reclamada.' }, { status: 404 })
  if (other.userId === auth.userId) {
    return NextResponse.json({ error: 'Ya estás en el grupo.' }, { status: 400 })
  }

  const { error: insErr } = await gate.svc.from('artist_network_members').insert({
    thread_id: id,
    user_id: other.userId,
    artist_id: other.artist.id,
  })
  if (insErr) {
    if (insErr.code === '23505') {
      return NextResponse.json({ error: 'Esa persona ya está en el grupo.' }, { status: 409 })
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  await gate.svc
    .from('artist_network_threads')
    .update({ updated_at: new Date().toISOString() } as never)
    .eq('id', id)

  const { byThread, memberRows } = await membersPublicForThreads(gate.svc, [id])
  const mine = (memberRows as ArtistNetworkMemberRow[]).find((m) => m.user_id === auth.userId)
  return NextResponse.json({
    data: shapeThread(row, byThread.get(id) ?? [], mine?.last_read_at ?? null, auth.userId),
  })
}
