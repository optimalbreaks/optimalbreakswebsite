import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import {
  generateCampaignHtml,
  isAudience,
  isPreset,
  listAudience,
  personalize,
  recipientCounts,
  sendTest,
  temasHtmlForUser,
  tickCampaign,
} from '@/lib/mailing/campaigns'
import type { MailCampaignRecipientRow, MailCampaignRow } from '@/types/database'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadCampaign(id: string): Promise<MailCampaignRow | null> {
  const svc = createServiceSupabase()
  const { data, error } = await svc.from('mail_campaigns').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as MailCampaignRow | null) || null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const campaign = await loadCampaign(id)
    if (!campaign) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    const svc = createServiceSupabase()
    const [{ data: people, error }, counts] = await Promise.all([
      svc.from('mail_campaign_recipients').select('*').eq('campaign_id', id).order('email').limit(80),
      recipientCounts(id),
    ])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const sample = (people || [])[0] as MailCampaignRecipientRow | undefined
    const temas = campaign.html_content.includes('{{TEMAS}}')
      ? await temasHtmlForUser(sample?.user_id || null)
      : undefined
    const preview = campaign.html_content
      ? personalize(campaign.html_content, {
          name: sample?.display_name || 'Narciso',
          email: sample?.email || 'contacto@optimalbreaks.com',
          saves: sample?.save_count ?? 0,
          temas,
        })
      : ''
    return NextResponse.json({ campaign, counts, recipients: people || [], preview })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.subject === 'string') patch.subject = body.subject.trim()
  if (typeof body.briefing === 'string') patch.briefing = body.briefing
  if (typeof body.html_content === 'string') patch.html_content = body.html_content
  if (typeof body.audience === 'string' && isAudience(body.audience)) patch.audience = body.audience
  if (typeof body.preset === 'string' && isPreset(body.preset)) patch.preset = body.preset
  const svc = createServiceSupabase()
  const { data, error } = await svc.from('mail_campaigns').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const svc = createServiceSupabase()
  const { error } = await svc.from('mail_campaigns').delete().eq('id', id).eq('status', 'draft')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const body = await request.json().catch(() => ({})) as { action?: string }
  const action = body.action || ''

  try {
    const campaign = await loadCampaign(id)
    if (!campaign) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    const svc = createServiceSupabase()

    if (action === 'generate') {
      if (campaign.status !== 'draft') return NextResponse.json({ error: 'Solo se genera en borrador' }, { status: 400 })
      const html = await generateCampaignHtml(campaign.briefing, campaign.preset)
      const { error } = await svc.from('mail_campaigns').update({
        html_content: html,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'audience-preview') {
      const people = await listAudience(campaign.audience)
      return NextResponse.json({
        total: people.length,
        sample: people.slice(0, 8).map((p) => ({ email: p.email, display_name: p.display_name, save_count: p.save_count })),
      })
    }

    if (action === 'audience') {
      if (campaign.status !== 'draft') return NextResponse.json({ error: 'La audiencia se carga en borrador' }, { status: 400 })
      const people = await listAudience(campaign.audience)
      const { error: delErr } = await svc.from('mail_campaign_recipients').delete().eq('campaign_id', id)
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
      if (people.length) {
        const { error: insErr } = await svc.from('mail_campaign_recipients').insert(
          people.map((p) => ({
            campaign_id: id,
            user_id: p.user_id,
            email: p.email,
            display_name: p.display_name,
            save_count: p.save_count,
            status: 'pending' as const,
          })),
        )
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
      return NextResponse.json({ total: people.length })
    }

    if (action === 'test') {
      await sendTest(campaign)
      return NextResponse.json({ ok: true, to: process.env.SMTP_USER || 'contacto@optimalbreaks.com' })
    }

    if (action === 'start') {
      if (!campaign.html_content.trim() || !campaign.subject.trim()) {
        return NextResponse.json({ error: 'Hacen falta asunto y HTML' }, { status: 400 })
      }
      const counts = await recipientCounts(id)
      if (!counts.pending) return NextResponse.json({ error: 'Carga la audiencia antes de lanzar' }, { status: 400 })
      const { error } = await svc.from('mail_campaigns').update({
        status: 'sending',
        is_paused: false,
        started_at: campaign.started_at || new Date().toISOString(),
        completed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const tick = await tickCampaign(id)
      return NextResponse.json({ ok: true, tick })
    }

    if (action === 'pause') {
      const { error } = await svc.from('mail_campaigns').update({
        is_paused: true,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'resume') {
      const { error } = await svc.from('mail_campaigns').update({
        status: 'sending',
        is_paused: false,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const tick = await tickCampaign(id)
      return NextResponse.json({ ok: true, tick })
    }

    if (action === 'tick') {
      const tick = await tickCampaign(id)
      return NextResponse.json({ ok: true, tick })
    }

    if (action === 'retry') {
      const { error } = await svc.from('mail_campaign_recipients').update({
        status: 'pending',
        error_message: null,
      }).eq('campaign_id', id).in('status', ['failed', 'sending'])
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await svc.from('mail_campaigns').update({
        status: 'sending',
        is_paused: false,
        completed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      const tick = await tickCampaign(id)
      return NextResponse.json({ ok: true, tick })
    }

    if (action === 'archive') {
      const { error } = await svc.from('mail_campaigns').update({
        status: 'archived',
        is_paused: true,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
