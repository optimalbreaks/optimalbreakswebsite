import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import {
  GIFT_DOWNLOAD_NAME,
  GIFT_FILE,
  GIFT_MASTER_BUCKET,
  GIFT_SLUG,
  GIFT_WAV_DOWNLOAD_NAME,
  GIFT_WAV_PARTS,
} from '@/lib/gift-download'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const AUDIO_DIR = path.join(process.cwd(), 'private', 'music')

/** MP3 y WAV solo salen con la cookie de quien está aprobado. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (slug !== GIFT_SLUG) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const format = new URL(req.url).searchParams.get('format')
  if (format && format !== 'mp3' && format !== 'wav') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

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

  if (format === 'wav') {
    const chunks: Buffer[] = []
    for (const part of GIFT_WAV_PARTS) {
      const { data: file, error: downErr } = await svc.storage.from(GIFT_MASTER_BUCKET).download(part)
      if (downErr || !file) return NextResponse.json({ error: 'not found' }, { status: 404 })
      chunks.push(Buffer.from(await file.arrayBuffer()))
    }
    const wav = Buffer.concat(chunks)
    return new NextResponse(new Uint8Array(wav), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wav.length),
        'Content-Disposition': `attachment; filename="${GIFT_WAV_DOWNLOAD_NAME}"`,
        'Cache-Control': 'private, no-store',
      },
    })
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
