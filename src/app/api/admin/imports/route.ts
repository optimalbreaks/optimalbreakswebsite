import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { BEATPORT_IMPORT_FROM, decideImport, runBeatportGenreImport } from '@/lib/beatport-genre-import'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { buildFullArtistSlugMap, buildFullLabelSlugMap, filterArtistSlugMapForNames } from '@/lib/artist-slug-map'
import { extractRemixerNames } from '@/lib/remixer-credits'
import { fetchAllPages } from '@/lib/supabase-paginate'

export const maxDuration = 300

type SlugRow = { slug: string; name: string | null; name_display: string | null }
type PendingRow = { mix_name: string | null; artists: Array<{ name?: string }> | null; label: string | null }

/**
 * Los nombres de artista y sello de la cola enlazan a su ficha igual que en
 * /charts. Solo viajan las claves de los nombres que están en la lista.
 */
async function slugMapsFor(sb: ReturnType<typeof createServiceSupabase>, rows: PendingRow[]) {
  const artistNames = new Set<string>()
  const labelNames = new Set<string>()
  for (const r of rows) {
    for (const a of r.artists || []) if (a?.name) artistNames.add(a.name)
    for (const n of extractRemixerNames(r.mix_name)) artistNames.add(n)
    if (r.label) labelNames.add(r.label)
  }
  if (!artistNames.size && !labelNames.size) return { artists: {}, labels: {} }
  const [artistRows, labelRows] = await Promise.all([
    fetchAllPages<SlugRow>((from, to) =>
      sb.from('artists').select('slug, name, name_display').order('slug', { ascending: true }).range(from, to),
    ).catch(() => [] as SlugRow[]),
    fetchAllPages<{ slug: string; name: string | null }>((from, to) =>
      sb.from('labels').select('slug, name').order('slug', { ascending: true }).range(from, to),
    ).catch(() => [] as Array<{ slug: string; name: string | null }>),
  ])
  return {
    artists: filterArtistSlugMapForNames(buildFullArtistSlugMap(artistRows), artistNames),
    labels: filterArtistSlugMapForNames(
      buildFullLabelSlugMap(labelRows.map((r) => ({ slug: r.slug, name: r.name, name_display: null }))),
      labelNames,
      { labelSuffixes: true },
    ),
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const sb = createServiceSupabase()
  const [pendingRes, countRes, runRes] = await Promise.all([
    sb
      .from('chart_import_queue')
      .select('id, beatport_track_id, link_url, title, mix_name, artists, label, artwork_url, sample_url, bpm, music_key, release_date, release_year, created_at')
      .eq('status', 'pending')
      .order('release_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    sb.from('chart_import_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb
      .from('chart_import_runs')
      .select('started_at, finished_at, trigger, ok, seen, queued, auto_approved, skipped_known, error')
      .not('finished_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const err = pendingRes.error || countRes.error || runRes.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const pending = (pendingRes.data ?? []) as unknown as PendingRow[]
  const slugMaps = await slugMapsFor(sb, pending)

  return NextResponse.json({
    import_from: BEATPORT_IMPORT_FROM,
    pending_count: countRes.count ?? 0,
    pending: pendingRes.data ?? [],
    artist_slug_map: slugMaps.artists,
    label_slug_map: slugMaps.labels,
    last_run: runRes.data,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: { action?: string; id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.action === 'run') {
    // «Traer ahora» en Vercel: 300 s de tope. El pase completo es el de GitHub Actions.
    const result = await runBeatportGenreImport({ trigger: 'manual', userId: auth.userId, budgetMs: 230_000 })
    return NextResponse.json(result)
  }

  if (body.action !== 'approve' && body.action !== 'discard' && body.action !== 'restore') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'Falta el tema' }, { status: 400 })

  const result = await decideImport(body.id, body.action, auth.userId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
