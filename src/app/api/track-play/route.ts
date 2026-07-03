import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import { createServiceSupabase } from '@/lib/supabase-admin'

const KEY_RE = /^[a-z0-9:._/-]{1,512}$/i
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120
const ipHits = new Map<string, number[]>()

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

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!allowRate(ip)) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 })
  }

  let body: { canonicalKey?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const canonicalKey = typeof body.canonicalKey === 'string' ? body.canonicalKey.trim() : ''
  if (!canonicalKey || !KEY_RE.test(canonicalKey)) {
    return NextResponse.json({ error: 'canonicalKey inválido' }, { status: 400 })
  }

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  const userId = await optionalAuthUserId()

  const { error: insErr } = await sb.from('track_play_events').insert({
    canonical_key: canonicalKey,
    user_id: userId,
  })

  if (insErr) {
    return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
