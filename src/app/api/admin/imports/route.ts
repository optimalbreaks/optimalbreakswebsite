import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import {
  BEATPORT_IMPORT_FROM,
  breaksListingUrlForEditor,
  decideImport,
  ingestBeatportPage,
  runBeatportGenreImport,
  top100ArtistTrackPageUrls,
  stopOpenImportRuns,
  type GenreImportResult,
} from '@/lib/beatport-genre-import'
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

/**
 * La ventana de la pantalla lee el pase mientras corre: una línea JSON por
 * paso (`{ type: 'log' }`) y una última con el resultado (`{ type: 'done' }`).
 */
function streamJob(work: (log: (line: string) => void) => Promise<GenreImportResult>) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`))
        } catch {
          /* la ventana se cerró; el pase sigue y guarda */
        }
      }
      try {
        const result = await work((line) => send({ type: 'log', line, at: new Date().toISOString() }))
        send({ type: 'done', result })
      } catch (e) {
        send({ type: 'done', result: { ok: false, error: e instanceof Error ? e.message : String(e) } })
      }
      try {
        controller.close()
      } catch {
        /* ya cerrado */
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
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
    breaks_listing_url: await breaksListingUrlForEditor().catch(() => null),
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

  let body: { action?: string; id?: string; url?: string; nextData?: unknown; published_id?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.action === 'artist-urls') {
    // Una vez por favorito, al acabar el listado. No en cada visita de la pantalla.
    try {
      return NextResponse.json({ artist_track_urls: await top100ArtistTrackPageUrls() })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  if (body.action === 'ingest') {
    // La página que el editor manda desde su Chrome con el botón de favoritos.
    if (!body.url || !body.nextData) return NextResponse.json({ error: 'Falta la página de Beatport' }, { status: 400 })
    const { url, nextData } = body
    return streamJob((log) => ingestBeatportPage({ url, nextData, userId: auth.userId, log }))
  }

  if (body.action === 'run') {
    // «Traer ahora» en Vercel: 300 s de tope. El pase completo es el de GitHub Actions.
    return streamJob((log) =>
      runBeatportGenreImport({ trigger: 'manual', userId: auth.userId, budgetMs: 230_000, log }),
    )
  }

  if (body.action === 'stop') {
    try {
      return NextResponse.json({ ok: true, stopped: await stopOpenImportRuns() })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  if (body.action !== 'approve' && body.action !== 'discard' && body.action !== 'restore') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'Falta el tema' }, { status: 400 })

  const publishedRaw = typeof body.published_id === 'string' ? body.published_id.trim() : ''
  const publishedId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publishedRaw)
    ? publishedRaw
    : null
  if (body.action === 'restore' && publishedRaw && !publishedId) {
    return NextResponse.json({ error: 'El tema publicado no es válido' }, { status: 400 })
  }

  const action = body.action as 'approve' | 'discard' | 'restore'
  const result = await decideImport(body.id, action, auth.userId, publishedId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, published_id: result.published_id })
}
