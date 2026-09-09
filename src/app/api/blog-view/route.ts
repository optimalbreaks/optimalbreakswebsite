import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { sanitizeSlug } from '@/lib/security'

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 40
const ipHits = new Map<string, number[]>()

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discordbot|preview|embedly|quora|pinterest|redditbot|linkedinbot|twitterbot|applebot|bingpreview|yandex|duckduck|semrush|ahrefs|mj12|dotbot|gptbot|claudebot|anthropic|perplexity|bytespider|ia_archiver/i

function getClientIp(request: NextRequest): string {
  const xf = request.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') || 'unknown'
}

function allowRate(ip: string): boolean {
  const now = Date.now()
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  if (arr.length >= MAX_PER_WINDOW) {
    ipHits.set(ip, arr)
    return false
  }
  arr.push(now)
  ipHits.set(ip, arr)
  return true
}

export async function POST(request: NextRequest) {
  const ua = request.headers.get('user-agent') || ''
  if (!ua || BOT_UA.test(ua)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const ip = getClientIp(request)
  if (!allowRate(ip)) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 })
  }

  let body: { slug?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const slug = sanitizeSlug(typeof body.slug === 'string' ? body.slug : '')
  if (!slug) {
    return NextResponse.json({ error: 'slug inválido' }, { status: 400 })
  }

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  const { error } = await sb.rpc('increment_blog_post_view', { p_slug: slug })
  if (error) {
    console.error('[blog-view]', error.message)
    return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
