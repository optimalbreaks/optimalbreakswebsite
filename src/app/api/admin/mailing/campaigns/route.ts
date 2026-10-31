import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { octoberWindow } from '@/lib/mailing/campaigns'
import { isAudience, isPreset, presetSeed } from '@/lib/mailing/presets'
import type { MailCampaignRecipientRow, MailCampaignRow } from '@/types/database'

export const dynamic = 'force-dynamic'

async function withCounts(rows: MailCampaignRow[]) {
  if (rows.length === 0) return []
  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('mail_campaign_recipients')
    .select('campaign_id, status')
    .in('campaign_id', rows.map((r) => r.id))
  if (error) throw new Error(error.message)
  const byId = new Map<string, Record<string, number>>()
  for (const row of (data || []) as Pick<MailCampaignRecipientRow, 'campaign_id' | 'status'>[]) {
    const bag = byId.get(row.campaign_id) || { pending: 0, sending: 0, sent: 0, failed: 0, total: 0 }
    bag[row.status] = (bag[row.status] || 0) + 1
    bag.total++
    byId.set(row.campaign_id, bag)
  }
  return rows.map((row) => ({ ...row, counts: byId.get(row.id) || { pending: 0, sending: 0, sent: 0, failed: 0, total: 0 } }))
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const svc = createServiceSupabase()
  const { data, error } = await svc.from('mail_campaigns').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try {
    const campaigns = await withCounts((data || []) as MailCampaignRow[])
    return NextResponse.json({ campaigns })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({})) as { preset?: string; subject?: string; briefing?: string; audience?: string }
  const rawPreset = body.preset || ''
  const preset = isPreset(rawPreset) ? rawPreset : 'libre'
  const year = Number(octoberWindow().since.slice(0, 4))
  const seed = presetSeed(preset, year)
  const subject = (body.subject || seed.subject || 'Campaña Optimal Breaks').trim()
  const briefing = body.briefing != null ? String(body.briefing) : seed.briefing
  const rawAudience = body.audience || ''
  const audience = isAudience(rawAudience) ? rawAudience : seed.audience
  const svc = createServiceSupabase()
  const { data, error } = await svc.from('mail_campaigns').insert({
    preset,
    subject,
    briefing,
    audience,
    created_by: auth.userId,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}
