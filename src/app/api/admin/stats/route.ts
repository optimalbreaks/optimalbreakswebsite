import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

const TABLES = [
  'artists', 'labels', 'events', 'blog_posts', 'scenes', 'mixes', 'history_entries',
] as const

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const sb = createServiceSupabase()
  const counts = await Promise.all([
    ...TABLES.map((t) =>
      sb.from(t).select('*', { count: 'exact', head: true }).then(({ count }) => [t, count ?? 0] as const),
    ),
    sb.from('profiles').select('*', { count: 'exact', head: true }).then(({ count }) => ['users', count ?? 0] as const),
  ])

  const stats = Object.fromEntries(counts)
  return NextResponse.json(stats)
}
