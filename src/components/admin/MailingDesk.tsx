'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  AUDIENCE_LABELS,
  PRESET_ORDER,
  presetSeed,
} from '@/lib/mailing/presets'
import type {
  MailCampaignAudience,
  MailCampaignPreset,
  MailCampaignRecipientRow,
  MailCampaignRow,
  MailCampaignStatus,
} from '@/types/database'

type Counts = { pending: number; sending: number; sent: number; failed: number; total: number }

type Listed = MailCampaignRow & { counts: Counts }

const STATUS_LABEL: Record<MailCampaignStatus, string> = {
  draft: 'Borrador',
  sending: 'Enviando',
  sent: 'Enviada',
  archived: 'Archivada',
}

const btn = 'px-3 py-1.5 border-[3px] border-[var(--ink)] cursor-pointer disabled:opacity-40'
const mono = { fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' as const }

function yearNow() {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric' }).format(new Date()))
}

export default function MailingDesk({ campaignId }: { campaignId?: string }) {
  const { lang } = useParams<{ lang: string }>()
  const router = useRouter()
  const base = `/${lang}/administrator/mailing`

  if (campaignId) return <CampaignEditor id={campaignId} base={base} />
  return <CampaignList base={base} onOpen={(id) => router.push(`${base}/${id}`)} />
}

function CampaignList({ base, onOpen }: { base: string; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Listed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preset, setPreset] = useState<MailCampaignPreset>('top10')
  const [subject, setSubject] = useState('')
  const [briefing, setBriefing] = useState('')
  const [audience, setAudience] = useState<MailCampaignAudience>('confirmed')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/mailing/campaigns')
    const json = await res.json()
    if (!res.ok) setError(json.error || 'No se pudo cargar')
    else setRows(json.campaigns || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const seed = presetSeed(preset, yearNow())
    setSubject(seed.subject)
    setBriefing(seed.briefing)
    setAudience(seed.audience)
  }, [preset])

  async function create() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/admin/mailing/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset, subject, briefing, audience }),
    })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { setError(json.error || 'No se pudo crear'); return }
    onOpen(json.campaign.id)
  }

  return (
    <div className="max-w-4xl">
      <h1 className="admin-page-title">Mailing</h1>
      <p className="admin-muted mb-6 max-w-2xl">
        Campañas a cuentas confirmadas. El HTML lo escribe la IA con los tops reales
        y se manda por el SMTP de contacto@. El registro de avisos sueltos sigue en Mails.
      </p>

      <div className="border-[3px] border-[var(--ink)] p-4 mb-8 bg-[var(--paper)]">
        <p className="mb-3" style={mono}>Nueva campaña</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESET_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={`${btn} ${preset === key ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)]'}`}
              style={mono}
            >
              {presetSeed(key, yearNow()).label}
            </button>
          ))}
        </div>
        <label className="block mb-3">
          <span style={mono}>Asunto</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2"
          />
        </label>
        <label className="block mb-3">
          <span style={mono}>Audiencia</span>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as MailCampaignAudience)}
            className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2"
          >
            {Object.entries(AUDIENCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block mb-4">
          <span style={mono}>Briefing</span>
          <textarea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            rows={8}
            className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2"
            style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}
          />
        </label>
        <button type="button" disabled={busy || !subject.trim()} onClick={create} className={`${btn} bg-[var(--yellow)]`} style={mono}>
          {busy ? 'Creando…' : 'Crear borrador'}
        </button>
      </div>

      {error && <p className="mb-4 text-[var(--red)]">{error}</p>}
      {loading ? <p className="admin-muted">Cargando…</p> : rows.length === 0 ? (
        <p className="admin-muted">Aún no hay campañas.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Link key={row.id} href={`${base}/${row.id}`} className="block border-[3px] border-[var(--ink)] p-4 no-underline text-[var(--ink)] bg-[var(--paper)]">
              <div className="flex items-center justify-between gap-3">
                <strong style={{ fontFamily: "'Unbounded', sans-serif" }}>{row.subject}</strong>
                <span className="px-2 py-0.5 border-2 border-[var(--ink)]" style={mono}>{STATUS_LABEL[row.status]}</span>
              </div>
              <p className="mt-1 admin-muted" style={{ fontSize: '12px' }}>
                {presetSeed(row.preset, yearNow()).label} · {AUDIENCE_LABELS[row.audience]} · {row.counts.sent}/{row.counts.total} enviados
                {row.counts.failed ? ` · ${row.counts.failed} fallidos` : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function CampaignEditor({ id, base }: { id: string; base: string }) {
  const router = useRouter()
  const [campaign, setCampaign] = useState<MailCampaignRow | null>(null)
  const [counts, setCounts] = useState<Counts>({ pending: 0, sending: 0, sent: 0, failed: 0, total: 0 })
  const [recipients, setRecipients] = useState<MailCampaignRecipientRow[]>([])
  const [preview, setPreview] = useState('')
  const [subject, setSubject] = useState('')
  const [briefing, setBriefing] = useState('')
  const [html, setHtml] = useState('')
  const [audience, setAudience] = useState<MailCampaignAudience>('confirmed')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const stopRef = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/mailing/campaigns/${id}`)
    const json = await res.json()
    if (!res.ok) { setError(json.error || 'No se pudo cargar'); return }
    const row = json.campaign as MailCampaignRow
    setCampaign(row)
    setCounts(json.counts)
    setRecipients(json.recipients || [])
    setPreview(json.preview || '')
    setSubject(row.subject)
    setBriefing(row.briefing)
    setHtml(row.html_content)
    setAudience(row.audience)
  }, [id])

  useEffect(() => { load() }, [load])

  async function save() {
    const res = await fetch(`/api/admin/mailing/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, briefing, html_content: html, audience }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
  }

  async function act(action: string) {
    const res = await fetch(`/api/admin/mailing/campaigns/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Error')
    return json as { tick?: { done: boolean; paused: boolean; pending: number; sent: number; failed: number }; total?: number; to?: string }
  }

  async function run(action: string, label: string) {
    setBusy(label)
    setError('')
    setNote('')
    stopRef.current = false
    try {
      if (action === 'generate' || action === 'audience' || action === 'test' || action === 'start') await save()
      const json = await act(action)
      if (action === 'test') setNote(`Borrador enviado a ${json.to}`)
      if (action === 'audience-preview') setPreviewCount(json.total ?? null)
      if (action === 'start' || action === 'resume' || action === 'retry') {
        let tick = json.tick
        for (let i = 0; i < 80 && tick && !tick.done && !tick.paused && !stopRef.current; i++) {
          const next = await act('tick')
          tick = next.tick
          await load()
        }
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy('')
    }
  }

  if (!campaign) return <p className="admin-muted">{error || 'Cargando…'}</p>

  const draft = campaign.status === 'draft'
  const sending = campaign.status === 'sending'

  return (
    <div className="max-w-4xl">
      <Link href={base} className="admin-muted no-underline" style={mono}>← Campañas</Link>
      <div className="flex items-center justify-between gap-3 mt-3 mb-4">
        <h1 className="admin-page-title mb-0">{subject || 'Campaña'}</h1>
        <span className="px-2 py-0.5 border-2 border-[var(--ink)]" style={mono}>
          {STATUS_LABEL[campaign.status]}{campaign.is_paused ? ' · pausa' : ''}
        </span>
      </div>
      <p className="admin-muted mb-4">
        {counts.sent} enviados · {counts.pending} pendientes · {counts.failed} fallidos · {counts.total} en la audiencia
      </p>
      {error && <p className="mb-3 text-[var(--red)]">{error}</p>}
      {note && <p className="mb-3">{note}</p>}

      <label className="block mb-3">
        <span style={mono}>Asunto</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!draft} className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2" />
      </label>
      <label className="block mb-3">
        <span style={mono}>Audiencia</span>
        <select value={audience} onChange={(e) => setAudience(e.target.value as MailCampaignAudience)} disabled={!draft} className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2">
          {Object.entries(AUDIENCE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </label>
      <label className="block mb-3">
        <span style={mono}>Briefing para la IA</span>
        <textarea value={briefing} onChange={(e) => setBriefing(e.target.value)} disabled={!draft} rows={7} className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }} />
      </label>
      <label className="block mb-4">
        <span style={mono}>HTML</span>
        <textarea value={html} onChange={(e) => setHtml(e.target.value)} disabled={!draft} rows={10} className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }} />
      </label>

      <div className="flex flex-wrap gap-2 mb-6">
        {draft && (
          <button
            type="button"
            className={`${btn} bg-[var(--paper)]`}
            style={mono}
            disabled={!!busy}
            onClick={async () => {
              setBusy('guardar')
              setError('')
              try {
                await save()
                setNote('Guardado')
                await load()
              } catch (err) {
                setError(err instanceof Error ? err.message : 'No se pudo guardar')
              } finally {
                setBusy('')
              }
            }}
          >
            {busy === 'guardar' ? 'Guardando…' : 'Guardar'}
          </button>
        )}
        {draft && (
          <button type="button" className={`${btn} bg-[var(--yellow)]`} style={mono} disabled={!!busy} onClick={() => run('generate', 'generate')}>
            {busy === 'generate' ? 'Generando…' : 'Generar HTML'}
          </button>
        )}
        {draft && (
          <button type="button" className={`${btn} bg-[var(--paper)]`} style={mono} disabled={!!busy} onClick={() => run('audience-preview', 'preview')}>
            {busy === 'preview' ? 'Contando…' : 'Ver cuántos'}
          </button>
        )}
        {draft && (
          <button type="button" className={`${btn} bg-[var(--paper)]`} style={mono} disabled={!!busy} onClick={() => run('audience', 'audience')}>
            {busy === 'audience' ? 'Cargando…' : 'Cargar audiencia'}
          </button>
        )}
        <button type="button" className={`${btn} bg-[var(--paper)]`} style={mono} disabled={!!busy || !html.trim()} onClick={() => run('test', 'test')}>
          {busy === 'test' ? 'Enviando prueba…' : 'Prueba a contacto@'}
        </button>
        {draft && (
          <button
            type="button"
            className={`${btn} bg-[var(--red)] text-white`}
            style={mono}
            disabled={!!busy || !html.trim() || counts.pending === 0}
            onClick={() => {
              if (!window.confirm(`Se enviará a ${counts.pending} personas, de una en una, con copia a contacto@. ¿Lanzar?`)) return
              run('start', 'start')
            }}
          >
            {busy === 'start' ? 'Enviando…' : 'Lanzar envío'}
          </button>
        )}
        {sending && !campaign.is_paused && (
          <button
            type="button"
            className={`${btn} bg-[var(--yellow)]`}
            style={mono}
            onClick={async () => {
              stopRef.current = true
              setError('')
              try {
                await act('pause')
                await load()
              } catch (err) {
                setError(err instanceof Error ? err.message : 'No se pudo pausar')
              }
            }}
          >
            Pausar
          </button>
        )}
        {sending && campaign.is_paused && (
          <button type="button" className={`${btn} bg-[var(--red)] text-white`} style={mono} disabled={!!busy} onClick={() => run('resume', 'resume')}>Seguir</button>
        )}
        {counts.failed > 0 && (
          <button type="button" className={`${btn} bg-[var(--paper)]`} style={mono} disabled={!!busy} onClick={() => run('retry', 'retry')}>Reintentar fallidos</button>
        )}
        {campaign.status !== 'archived' && (
          <button type="button" className={`${btn} bg-[var(--paper)]`} style={mono} disabled={!!busy} onClick={() => run('archive', 'archive')}>Archivar</button>
        )}
        {draft && (
          <button
            type="button"
            className={`${btn} bg-[var(--paper)]`}
            style={mono}
            disabled={!!busy}
            onClick={async () => {
              if (!window.confirm('¿Borrar este borrador?')) return
              const res = await fetch(`/api/admin/mailing/campaigns/${id}`, { method: 'DELETE' })
              if (res.ok) router.push(base)
              else setError('No se pudo borrar')
            }}
          >
            Borrar
          </button>
        )}
      </div>
      {previewCount != null && <p className="admin-muted mb-4">Con esta audiencia saldrían {previewCount} correos. Cargar audiencia los deja listos.</p>}
      {sending && <p className="admin-muted mb-4">El envío avanza mientras esta página sigue abierta. Dos correos por tanda, con una pausa corta.</p>}

      {preview && (
        <div className="mb-6">
          <p className="mb-2" style={mono}>Vista previa</p>
          {html.includes('{{TEMAS}}') && (
            <p className="admin-muted mb-2">Al enviar, cada persona ve temas del top que aún no tiene en Mis Tracks. Aquí, si no hay audiencia, sale el top tal cual.</p>
          )}
          <iframe title="Vista previa del correo" sandbox="" srcDoc={preview} className="w-full border-[3px] border-[var(--ink)] bg-[var(--paper)]" style={{ height: 720 }} />
        </div>
      )}

      {recipients.length > 0 && (
        <div>
          <p className="mb-2" style={mono}>Destinatarios</p>
          <div className="space-y-2">
            {recipients.map((person) => (
              <div key={person.id} className="border-[3px] border-[var(--ink)] px-3 py-2" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}>
                <strong>{person.email}</strong>
                {person.display_name ? ` · ${person.display_name}` : ''} · {person.save_count} temas · {person.status}
                {person.error_message ? ` · ${person.error_message}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
