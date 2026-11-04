import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import {
  GIFT_PROOF_BUCKET,
  GIFT_SHOT_MAX_BYTES,
  GIFT_SLUG,
} from '@/lib/gift-download'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' }
  }
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

async function readShot(file: FormDataEntryValue | null): Promise<{ buf: Buffer; mime: string; ext: string } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) return { error: 'Faltan las dos capturas' }
  if (file.size > GIFT_SHOT_MAX_BYTES) return { error: 'Cada captura puede pesar hasta 8 MB' }
  const buf = Buffer.from(await file.arrayBuffer())
  const kind = sniffImage(buf)
  if (!kind) return { error: 'La captura tiene que ser JPG, PNG o WebP' }
  return { buf, ...kind }
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (slug !== GIFT_SLUG) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const auth = await getRouteUser()
  if (!auth.ok) return NextResponse.json({ loggedIn: false, status: 'none', note: null })

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('gift_download_requests')
    .select('status, note')
    .eq('gift_slug', slug)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    loggedIn: true,
    status: data?.status ?? 'none',
    note: data?.status === 'rejected' ? data.note : null,
  })
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (slug !== GIFT_SLUG) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'No se ha podido leer el formulario' }, { status: 400 })
  }

  const site = await readShot(form.get('site'))
  if ('error' in site) return NextResponse.json({ error: site.error }, { status: 400 })
  const artist = await readShot(form.get('artist'))
  if ('error' in artist) return NextResponse.json({ error: artist.error }, { status: 400 })

  const svc = createServiceSupabase()
  const { data: prev, error: prevErr } = await svc
    .from('gift_download_requests')
    .select('id, status, shot_site_path, shot_artist_path')
    .eq('gift_slug', slug)
    .eq('user_id', auth.userId)
    .maybeSingle()
  if (prevErr) return NextResponse.json({ error: prevErr.message }, { status: 500 })
  if (prev?.status === 'approved') {
    return NextResponse.json({ error: 'Ya está aprobada' }, { status: 409 })
  }

  const stamp = Date.now()
  const sitePath = `${auth.userId}/${slug}-site-${stamp}.${site.ext}`
  const artistPath = `${auth.userId}/${slug}-artist-${stamp}.${artist.ext}`
  const siteUp = await svc.storage.from(GIFT_PROOF_BUCKET).upload(sitePath, site.buf, {
    contentType: site.mime,
    upsert: false,
  })
  if (siteUp.error) return NextResponse.json({ error: siteUp.error.message }, { status: 500 })
  const artistUp = await svc.storage.from(GIFT_PROOF_BUCKET).upload(artistPath, artist.buf, {
    contentType: artist.mime,
    upsert: false,
  })
  if (artistUp.error) {
    await svc.storage.from(GIFT_PROOF_BUCKET).remove([sitePath])
    return NextResponse.json({ error: artistUp.error.message }, { status: 500 })
  }

  const row = {
    gift_slug: slug,
    user_id: auth.userId,
    status: 'pending' as const,
    shot_site_path: sitePath,
    shot_artist_path: artistPath,
    note: null,
    decided_at: null,
    decided_by: null,
    updated_at: new Date().toISOString(),
  }
  const write = prev
    ? await svc.from('gift_download_requests').update(row).eq('id', prev.id)
    : await svc.from('gift_download_requests').insert(row)
  if (write.error) {
    await svc.storage.from(GIFT_PROOF_BUCKET).remove([sitePath, artistPath])
    return NextResponse.json({ error: write.error.message }, { status: 500 })
  }

  const oldPaths = [prev?.shot_site_path, prev?.shot_artist_path].filter((p): p is string => Boolean(p))
  if (oldPaths.length) await svc.storage.from(GIFT_PROOF_BUCKET).remove(oldPaths)

  return NextResponse.json({ ok: true, status: 'pending' })
}
