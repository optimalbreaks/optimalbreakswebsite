/**
 * Audio de un tema de Parkineo.
 *
 * El MP3 está en el bucket privado `parkineo-tracks`. Esta ruta no lo copia:
 * si el tema está publicado y la petición nace en la web, responde 302 a una
 * URL firmada (6 h). Un enlace pegado fuera de la web → 403. Un tema en cola
 * solo lo oye un admin.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { PARKINEO_TRACK_BUCKET } from '@/lib/parkineo-tracks'

export const dynamic = 'force-dynamic'

const TTL_SECONDS = 6 * 60 * 60

function isSameOriginRequest(req: NextRequest): boolean {
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true
  const referer = req.headers.get('referer') || ''
  const host = req.headers.get('host') || ''
  if (!referer || !host) return false
  try {
    return new URL(referer).host === host
  } catch {
    return false
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const svc = createServiceSupabase()
  const { data: track } = await svc
    .from('parkineo_tracks')
    .select('id, status, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (track.status !== 'published') {
    const auth = await requireAdmin(req)
    if (!auth.ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  } else if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data, error } = await svc.storage
    .from(PARKINEO_TRACK_BUCKET)
    .createSignedUrl(track.storage_path, TTL_SECONDS)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const res = NextResponse.redirect(data.signedUrl, 302)
  res.headers.set('Cache-Control', 'private, no-store')
  res.headers.set('X-Robots-Tag', 'noindex')
  return res
}
