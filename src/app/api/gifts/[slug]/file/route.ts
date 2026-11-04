import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { GIFT_DOWNLOAD_NAME, GIFT_FILE, GIFT_SLUG } from '@/lib/gift-download'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AUDIO_DIR = path.join(process.cwd(), 'private', 'music')

/** El MP3 solo sale con la cookie de quien está aprobado. No hay URL firmada. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (slug !== GIFT_SLUG) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const auth = await getRouteUser()
  if (!auth.ok) return auth.response

  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('gift_download_requests')
    .select('status')
    .eq('gift_slug', slug)
    .eq('user_id', auth.userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (data?.status !== 'approved') {
    return NextResponse.json({ error: 'Aún no está aprobada' }, { status: 403 })
  }

  const filePath = path.join(AUDIO_DIR, GIFT_FILE)
  let buf: Buffer
  try {
    buf = await fs.readFile(filePath)
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buf.length),
      'Content-Disposition': `attachment; filename="${GIFT_DOWNLOAD_NAME}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
