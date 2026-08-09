import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

const DEFAULT_LIMIT = 30

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const raw = request.nextUrl.searchParams.get('limit')
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_LIMIT
  const pLimit = Number.isFinite(parsed) ? Math.min(100, Math.max(5, parsed)) : DEFAULT_LIMIT

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  const { data, error } = await sb.rpc('admin_engagement_stats', { p_limit: pLimit })

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Error al cargar estadísticas' },
      { status: 500 },
    )
  }

  const payload =
    typeof data === 'object' && data !== null ? ({ ...data } as Record<string, unknown>) : {}

  // Compat: si la migración 063 aún no está aplicada, rellenar track plays desde la tabla.
  if (!payload.track_plays_summary) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [allRes, weekRes, keysRes] = await Promise.all([
      sb.from('track_play_events').select('*', { count: 'exact', head: true }),
      sb
        .from('track_play_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo),
      sb.from('track_play_events').select('canonical_key'),
    ])

    const counts = new Map<string, number>()
    for (const row of keysRes.data ?? []) {
      counts.set(row.canonical_key, (counts.get(row.canonical_key) ?? 0) + 1)
    }
    const topRows = [...counts.entries()]
      .map(([canonical_key, play_count]) => ({ canonical_key, play_count }))
      .sort((a, b) => b.play_count - a.play_count)

    payload.track_plays_summary = {
      all_time: allRes.count ?? 0,
      last_7d: weekRes.count ?? 0,
    }
    payload.track_plays_top = topRows.slice(0, pLimit).map((r) => ({
      canonical_key: r.canonical_key,
      title: labelFromCanonicalKey(r.canonical_key),
      play_count: r.play_count,
    }))
  }

  return NextResponse.json({
    ...payload,
    generated_at: new Date().toISOString(),
  })
}

function labelFromCanonicalKey(key: string): string {
  if (key.startsWith('yt:')) return `YouTube · ${key.slice(3)}`
  const m = key.match(/\/track\/([^/]+)\//)
  if (m) return m[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return key
}
