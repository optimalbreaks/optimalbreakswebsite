import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { parkineoLang } from '@/lib/parkineo'
import {
  PARKINEO_TRACK_BUCKET,
  PARKINEO_TRACK_MAX_BYTES,
  durationVerdict,
  mp3DurationSeconds,
  parkineoTrackMessage,
  parkineoTrackPath,
  parkineoTrackPathOwned,
  parkineoTrackSlug,
  type ParkineoTrackErrorCode,
  type ParkineoTrackLang,
} from '@/lib/parkineo-tracks'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MINE_COLUMNS =
  'id, slug, artist_name, title, duration_seconds, status, reject_reason, published_at, cycle, created_at'

function fail(lang: ParkineoTrackLang, code: ParkineoTrackErrorCode, status: number) {
  return NextResponse.json({ error: parkineoTrackMessage(code, lang), code }, { status })
}

function normalizeOwnedPath(userId: string, raw: string): string | null {
  const clean = raw.trim().replace(/^\/+/, '')
  const marker = `${userId}/`
  const idx = clean.toLowerCase().lastIndexOf(marker.toLowerCase())
  if (idx < 0) return null
  const path = clean.slice(idx)
  return parkineoTrackPathOwned(userId, path) ? path : null
}

// GET /api/parkineo/tracks — temas de la cuenta y las marcas que ha puesto
export async function GET() {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  const svc = createServiceSupabase()
  const [{ data, error }, { data: votes, error: voteError }] = await Promise.all([
    svc
      .from('parkineo_tracks')
      .select(MINE_COLUMNS)
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(50),
    svc.from('parkineo_track_votes').select('track_id').eq('user_id', auth.userId),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (voteError) return NextResponse.json({ error: voteError.message }, { status: 500 })
  return NextResponse.json({
    data: data || [],
    votes: (votes || []).map((row) => row.track_id),
  })
}

// POST /api/parkineo/tracks — preparar subida, confirmar el MP3 o marcar un tema
export async function POST(request: NextRequest) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const action = body.action === 'commit' ? 'commit' : body.action === 'vote' ? 'vote' : 'prepare'
  if (action === 'vote') return toggleVote(auth.userId, body)
  if (action === 'commit') return commitTrack(auth.userId, body)
  return prepareUpload(auth.userId, body)
}

async function prepareUpload(userId: string, body: Record<string, unknown>) {
  const lang = parkineoLang(body.lang)
  const artistName = String(body.artist_name || '').trim()
  const title = String(body.title || '').trim()
  const bytes = Number(body.bytes)
  if (body.confirm !== true) return fail(lang, 'confirm', 400)
  if (artistName.length < 2 || artistName.length > 60) return fail(lang, 'name', 400)
  if (title.length < 2 || title.length > 120) return fail(lang, 'title', 400)
  if (!Number.isFinite(bytes) || bytes <= 0) return fail(lang, 'file', 400)
  if (bytes > PARKINEO_TRACK_MAX_BYTES) return fail(lang, 'too_big', 400)

  const svc = createServiceSupabase()
  const { data: pending } = await svc
    .from('parkineo_tracks')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle()
  if (pending) return fail(lang, 'pending_exists', 409)

  const id = crypto.randomUUID()
  const path = parkineoTrackPath(userId, id)
  const { data, error } = await svc.storage.from(PARKINEO_TRACK_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.signedUrl || !data.token) {
    return NextResponse.json({ error: error?.message || 'No se ha podido abrir la subida' }, { status: 502 })
  }
  const signedUrl = data.signedUrl.startsWith('http')
    ? data.signedUrl
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')}/storage/v1${data.signedUrl}`
  return NextResponse.json({ path: data.path || path, token: data.token, signedUrl })
}

async function commitTrack(userId: string, body: Record<string, unknown>) {
  const lang = parkineoLang(body.lang)
  const artistName = String(body.artist_name || '').trim()
  const title = String(body.title || '').trim()
  const path = normalizeOwnedPath(userId, String(body.path || ''))
  if (body.confirm !== true) return fail(lang, 'confirm', 400)
  if (artistName.length < 2 || artistName.length > 60) return fail(lang, 'name', 400)
  if (title.length < 2 || title.length > 120) return fail(lang, 'title', 400)
  if (!path) return fail(lang, 'file', 400)

  const svc = createServiceSupabase()
  const { data: pending } = await svc
    .from('parkineo_tracks')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle()
  if (pending) return fail(lang, 'pending_exists', 409)

  const { data: file, error: downError } = await svc.storage.from(PARKINEO_TRACK_BUCKET).download(path)
  if (downError || !file) {
    return fail(lang, 'unreachable', 400)
  }
  if (file.size > PARKINEO_TRACK_MAX_BYTES) {
    await svc.storage.from(PARKINEO_TRACK_BUCKET).remove([path])
    return fail(lang, 'too_big', 400)
  }
  const buf = new Uint8Array(await file.arrayBuffer())
  const seconds = mp3DurationSeconds(buf)
  const verdict = durationVerdict(seconds)
  if (verdict) {
    await svc.storage.from(PARKINEO_TRACK_BUCKET).remove([path])
    return fail(lang, verdict, 400)
  }

  const id = path.split('/')[1]?.replace(/\.mp3$/i, '') || crypto.randomUUID()
  const slug = await uniqueSlug(svc, parkineoTrackSlug(artistName, title))
  const { data: row, error } = await svc
    .from('parkineo_tracks')
    .insert({
      id,
      user_id: userId,
      artist_name: artistName,
      title,
      storage_path: path,
      duration_seconds: seconds as number,
      slug,
      status: 'pending',
    })
    .select(MINE_COLUMNS)
    .single()

  if (error) {
    await svc.storage.from(PARKINEO_TRACK_BUCKET).remove([path])
    if (error.code === '23505') {
      const pendingHit = /parkineo_tracks_one_pending/i.test(error.message)
      return fail(lang, pendingHit ? 'pending_exists' : 'file', 409)
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data: row })
}

async function toggleVote(userId: string, body: Record<string, unknown>) {
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Falta el tema' }, { status: 400 })
  const svc = createServiceSupabase()
  const { data: track } = await svc
    .from('parkineo_tracks')
    .select('id')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'No está publicado' }, { status: 404 })

  const { data: existing } = await svc
    .from('parkineo_track_votes')
    .select('id')
    .eq('user_id', userId)
    .eq('track_id', id)
    .maybeSingle()
  if (existing) {
    const { error } = await svc.from('parkineo_track_votes').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ marked: false })
  }
  const { error } = await svc.from('parkineo_track_votes').insert({ user_id: userId, track_id: id })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ marked: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ marked: true })
}

async function uniqueSlug(
  svc: ReturnType<typeof createServiceSupabase>,
  base: string,
): Promise<string> {
  const root = base || 'tema'
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`
    const { data } = await svc.from('parkineo_tracks').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
  }
  return `${root}-${Date.now().toString(36)}`
}
