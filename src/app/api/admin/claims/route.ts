import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import type { ArtistClaimRow, ArtistClaimStatus } from '@/types/database'

export const dynamic = 'force-dynamic'

// GET /api/admin/claims?status=pending — lista todas las solicitudes de claim
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const status = new URL(request.url).searchParams.get('status')
  const svc = createServiceSupabase()

  let query = svc.from('artist_claims').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status as ArtistClaimStatus)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const claims = (data as ArtistClaimRow[]) || []
  const artistIds = Array.from(new Set(claims.map((c) => c.artist_id).filter((v): v is string => !!v)))
  const userIds = Array.from(new Set(claims.map((c) => c.user_id)))

  const artistById: Record<string, { name: string; slug: string }> = {}
  if (artistIds.length) {
    const { data: arts } = await svc.from('artists').select('id, name, slug').in('id', artistIds)
    ;(arts as { id: string; name: string; slug: string }[] | null)?.forEach((a) => {
      artistById[a.id] = { name: a.name, slug: a.slug }
    })
  }

  const profileById: Record<string, { display_name: string | null; username: string | null }> = {}
  if (userIds.length) {
    const { data: profs } = await svc.from('profiles').select('id, display_name, username').in('id', userIds)
    ;(profs as { id: string; display_name: string | null; username: string | null }[] | null)?.forEach((p) => {
      profileById[p.id] = { display_name: p.display_name, username: p.username }
    })
  }

  const emailById: Record<string, string | null> = {}
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await svc.auth.admin.getUserById(id)
      emailById[id] = data?.user?.email ?? null
    }),
  )

  return NextResponse.json({
    data: claims.map((c) => ({
      ...c,
      artist_name: c.artist_id ? artistById[c.artist_id]?.name ?? null : null,
      artist_slug: c.artist_id ? artistById[c.artist_id]?.slug ?? null : null,
      user_display_name: profileById[c.user_id]?.display_name ?? null,
      user_username: profileById[c.user_id]?.username ?? null,
      user_email: emailById[c.user_id] ?? null,
    })),
  })
}
