import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-admin'
import type { PlayerDiagnosticRow } from '@/types/database'

// Diagnóstico permanente del reproductor (migración 096, retención 30 días). Anónimo: no se guarda
// IP ni usuario; la IP solo se usa en memoria para el límite de peticiones.

const MAX_BODY = 32_000
const MAX_EVENTS = 40
const MAX_DATA_KEYS = 24
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 60
const ipHits = new Map<string, number[]>()

const PLATFORMS = new Set(['ios', 'android', 'desktop', 'other'])
const SESSION_RE = /^[a-z0-9-]{8,64}$/i
const EVENT_RE = /^[a-z0-9_]{1,40}$/i
const KEY_RE = /^[a-z0-9_]{1,30}$/i

function allowRate(ip: string): boolean {
  const now = Date.now()
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  if (arr.length >= MAX_PER_WINDOW) {
    ipHits.set(ip, arr)
    return false
  }
  arr.push(now)
  ipHits.set(ip, arr)
  if (ipHits.size > 5000) ipHits.clear()
  return true
}

function cleanData(raw: unknown): PlayerDiagnosticRow['data'] {
  const out: PlayerDiagnosticRow['data'] = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  let n = 0
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_DATA_KEYS || !KEY_RE.test(k)) continue
    if (typeof v === 'string') out[k] = v.slice(0, 200)
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 1000) / 1000
    else if (typeof v === 'boolean' || v === null) out[k] = v
    else continue
    n += 1
  }
  return out
}

export async function POST(request: NextRequest) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  if (!allowRate(ip)) return new NextResponse(null, { status: 429 })

  const text = await request.text()
  if (!text || text.length > MAX_BODY) return new NextResponse(null, { status: 413 })

  let body: {
    sid?: unknown
    platform?: unknown
    standalone?: unknown
    ua?: unknown
    events?: unknown
  }
  try {
    body = JSON.parse(text)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const sid = typeof body.sid === 'string' ? body.sid : ''
  const platform = typeof body.platform === 'string' && PLATFORMS.has(body.platform) ? body.platform : 'other'
  if (!SESSION_RE.test(sid) || !Array.isArray(body.events)) return new NextResponse(null, { status: 400 })

  const ua = typeof body.ua === 'string' ? body.ua.slice(0, 300) : null
  const standalone = body.standalone === true
  const now = Date.now()

  const rows: Omit<PlayerDiagnosticRow, 'id' | 'received_at'>[] = []
  for (const raw of body.events.slice(0, MAX_EVENTS)) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as { seq?: unknown; ts?: unknown; ev?: unknown; hidden?: unknown; d?: unknown }
    if (typeof e.ev !== 'string' || !EVENT_RE.test(e.ev)) continue
    const ts = typeof e.ts === 'number' && Math.abs(now - e.ts) < 7 * 86_400_000 ? e.ts : now
    rows.push({
      session_id: sid,
      seq: typeof e.seq === 'number' ? Math.trunc(e.seq) : 0,
      client_ts: new Date(ts).toISOString(),
      event: e.ev,
      platform: platform as PlayerDiagnosticRow['platform'],
      standalone,
      hidden: e.hidden === true,
      ua,
      data: cleanData(e.d),
    })
  }
  if (rows.length === 0) return new NextResponse(null, { status: 204 })

  try {
    const sb = createServiceSupabase()
    await sb.from('player_diagnostics').insert(rows)
  } catch {
    /* el diagnóstico nunca rompe nada */
  }
  return new NextResponse(null, { status: 204 })
}
