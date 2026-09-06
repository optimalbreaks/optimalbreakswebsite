import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { requireArtistNetworkAccess, shapeThread, membersPublicForThreads } from '@/lib/artist-network'
import type { ArtistNetworkMemberRow, ArtistNetworkThreadRow } from '@/types/database'

export const dynamic = 'force-dynamic'

// GET /api/artist-network/unread — punto rojo del FAB.
export async function GET() {
  const auth = await getRouteUser()
  if (!auth.ok) {
    return NextResponse.json({ claimed: false, unread: 0 })
  }

  const gate = await requireArtistNetworkAccess(auth.userId)
  if (!gate.ok) {
    return NextResponse.json({ claimed: false, unread: 0 })
  }

  const { data: mine, error: memErr } = await gate.svc
    .from('artist_network_members')
    .select('thread_id, last_read_at')
    .eq('user_id', auth.userId)
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  const memberRows = (mine ?? []) as Pick<ArtistNetworkMemberRow, 'thread_id' | 'last_read_at'>[]
  if (!memberRows.length) return NextResponse.json({ claimed: true, unread: 0 })

  const ids = memberRows.map((m) => m.thread_id)
  const { data: threads, error: thErr } = await gate.svc
    .from('artist_network_threads')
    .select('id, kind, title, dm_key, created_by, last_message_at, last_message_preview, last_sender_id, created_at, updated_at')
    .in('id', ids)
  if (thErr) return NextResponse.json({ error: thErr.message }, { status: 500 })

  const { byThread } = await membersPublicForThreads(gate.svc, ids)
  const lastRead = new Map(memberRows.map((m) => [m.thread_id, m.last_read_at]))
  let unread = 0
  for (const row of (threads ?? []) as ArtistNetworkThreadRow[]) {
    const item = shapeThread(row, byThread.get(row.id) ?? [], lastRead.get(row.id) ?? null, auth.userId)
    if (item.unread) unread += 1
  }

  return NextResponse.json({ claimed: true, unread })
}
