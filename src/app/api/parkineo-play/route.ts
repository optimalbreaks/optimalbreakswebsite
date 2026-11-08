import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import { createServiceSupabase } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ipHits = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 80

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

async function optionalAuthUserId(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim()
  if (!url || !key) return null

  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(c: { name: string; value: string; options: CookieOptions }[]) {
        try {
          c.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          /* ignore */
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

// POST /api/parkineo-play — una escucha pública (sesión o tema). No la ve /parkineo.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!allowRate(ip)) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 })
  }

  let body: { kind?: string; id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const kind = body.kind === 'session' || body.kind === 'track' ? body.kind : null
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!kind || !id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Falta la sesión o el tema' }, { status: 400 })
  }

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  if (kind === 'session') {
    const { data, error } = await sb
      .from('parkineo_sessions')
      .select('id')
      .eq('id', id)
      .eq('status', 'published')
      .maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'No está' }, { status: 404 })
  } else {
    const { data, error } = await sb
      .from('parkineo_tracks')
      .select('id')
      .eq('id', id)
      .eq('status', 'published')
      .maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'No está' }, { status: 404 })
  }

  const userId = await optionalAuthUserId()
  const { error: insErr } = await sb.from('parkineo_play_events').insert(
    kind === 'session'
      ? { kind, session_id: id, track_id: null, user_id: userId }
      : { kind, session_id: null, track_id: id, user_id: userId },
  )

  if (insErr) return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
