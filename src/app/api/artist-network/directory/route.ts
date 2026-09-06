import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { fichaPublic, requireArtistNetworkAccess } from '@/lib/artist-network'

export const dynamic = 'force-dynamic'

// GET /api/artist-network/directory?q= — agenda de reclamados (sin claimed_by).
export async function GET(request: NextRequest) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response
  const gate = await requireArtistNetworkAccess(auth.userId)
  if (!gate.ok) return gate.response

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  let query = gate.svc
    .from('artists')
    .select('id, name, slug, image_url')
    .not('claimed_by', 'is', null)
    .neq('claimed_by', auth.userId)
    .order('name')

  if (q.length >= 1) {
    query = query.ilike('name', `%${q.replace(/[%_]/g, '')}%`)
  }

  const { data, error } = await query.limit(80)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: (data ?? []).map((row) => fichaPublic(row)),
    me: gate.fichas.map(fichaPublic),
  })
}
