import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import {
  parkineoLang,
  parkineoMessage,
  parkineoSlugBase,
  resolveParkineoLink,
  type ParkineoErrorCode,
} from '@/lib/parkineo'
import type { ParkineoSession } from '@/types/database'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MINE_COLUMNS =
  'id, slug, dj_name, city, title, platform, embed_url, video_url, image_url, duration_minutes, status, reject_reason, published_at, created_at'

function fail(lang: ReturnType<typeof parkineoLang>, code: ParkineoErrorCode, status: number) {
  return NextResponse.json({ error: parkineoMessage(code, lang), code }, { status })
}

// GET /api/parkineo — sesiones de la cuenta (cola, publicadas y descartadas)
export async function GET() {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('parkineo_sessions')
    .select(MINE_COLUMNS)
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

// POST /api/parkineo — manda una sesión a la cola. No se publica sola.
export async function POST(request: NextRequest) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const lang = parkineoLang(body.lang)
  const djName = String(body.dj_name || '').trim()
  const city = String(body.city || '').trim()
  const title = String(body.title || '').trim()
  const url = String(body.url || '').trim()

  if (body.confirm !== true) return fail(lang, 'confirm', 400)
  if (djName.length < 2 || djName.length > 60) return fail(lang, 'name', 400)
  if (city.length < 2 || city.length > 60) return fail(lang, 'city', 400)
  if (title.length < 2 || title.length > 120) return fail(lang, 'title', 400)
  if (!url) return fail(lang, 'fields', 400)

  const svc = createServiceSupabase()
  const { data: pending } = await svc
    .from('parkineo_sessions')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('status', 'pending')
    .maybeSingle()
  if (pending) return fail(lang, 'pending_exists', 409)

  const resolved = await resolveParkineoLink(url)
  if (!resolved.ok) return fail(lang, resolved.code, 400)

  const { data: live } = await svc
    .from('parkineo_sessions')
    .select('id')
    .eq('source_key', resolved.link.sourceKey)
    .in('status', ['pending', 'published'])
    .maybeSingle()
  if (live) return fail(lang, 'duplicate', 409)

  const slug = await uniqueSlug(svc, parkineoSlugBase(djName, title))
  const link = resolved.link
  const { data: row, error } = await svc
    .from('parkineo_sessions')
    .insert({
      user_id: auth.userId,
      dj_name: djName,
      city,
      title,
      source_url: link.sourceUrl,
      source_key: link.sourceKey,
      platform: link.platform,
      embed_url: link.embedUrl,
      video_url: link.videoUrl,
      image_url: link.imageUrl,
      duration_minutes: link.durationMinutes,
      slug,
      status: 'pending',
    })
    .select(MINE_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      const pendingHit = /parkineo_one_pending/i.test(error.message)
      return fail(lang, pendingHit ? 'pending_exists' : 'duplicate', 409)
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: row as ParkineoSession })
}

async function uniqueSlug(
  svc: ReturnType<typeof createServiceSupabase>,
  base: string,
): Promise<string> {
  const root = base || 'sesion'
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`
    const { data } = await svc.from('parkineo_sessions').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
  }
  return `${root}-${Date.now().toString(36)}`
}
