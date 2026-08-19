// ============================================
// OPTIMAL BREAKS — My account → Artist
// Reclamar ficha, estado de verificación, fichas verificadas (toggle de
// recepción de bookings), bandeja de solicitudes recibidas y enviadas.
// ============================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabase } from '@/lib/supabase'
import { isClaimableCategory, budgetLabel, BOOKING_STATUS_LABELS, CLAIM_STATUS_LABELS, ARTIST_SETTABLE_BOOKING_STATUSES } from '@/lib/bookings'
import type { ArtistClaimRow, BookingRequestRow, BookingRequestStatus } from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = createBrowserSupabase()

type ClaimWithArtist = ArtistClaimRow & { artist_name?: string | null; artist_slug?: string | null }
type BookingWithArtist = BookingRequestRow & { artist_name?: string | null; artist_slug?: string | null }
type VerifiedArtist = { id: string; name: string; slug: string; accepts_bookings: boolean; image_url: string | null }
type SearchHit = { id: string; name: string; slug: string; category: string | null; claimed_by: string | null }

const H2 = { fontFamily: "'Unbounded', sans-serif", fontWeight: 900 as const, fontSize: '20px', textTransform: 'uppercase' as const, marginBottom: '16px' }
const H3 = { fontFamily: "'Unbounded', sans-serif", fontWeight: 900 as const, fontSize: '14px', textTransform: 'uppercase' as const, marginBottom: '10px' }
const MONO = { fontFamily: "'Courier Prime', monospace" as const }

export default function ArtistSection({ lang }: { lang: string }) {
  const es = lang === 'es'
  const [loading, setLoading] = useState(true)
  const [claims, setClaims] = useState<ClaimWithArtist[]>([])
  const [verified, setVerified] = useState<VerifiedArtist[]>([])
  const [inbox, setInbox] = useState<BookingWithArtist[]>([])
  const [sent, setSent] = useState<BookingWithArtist[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [c, s, ib, sb] = await Promise.all([
        fetch('/api/artist-claims').then((r) => r.json()),
        fetch('/api/artist-bookings/settings').then((r) => r.json()),
        fetch('/api/booking-requests?role=artist').then((r) => r.json()),
        fetch('/api/booking-requests?role=sender').then((r) => r.json()),
      ])
      setClaims(c.data || [])
      setVerified(s.data || [])
      setInbox(ib.data || [])
      setSent(sb.data || [])
    } catch {
      setError(es ? 'No se pudieron cargar tus datos.' : 'Could not load your data.')
    } finally {
      setLoading(false)
    }
  }, [es])

  useEffect(() => { reload() }, [reload])

  const pendingClaim = claims.find((c) => c.status === 'pending')
  const approvedClaims = claims.filter((c) => c.status === 'approved')
  const canStartClaim = !pendingClaim && approvedClaims.length === 0

  if (loading) {
    return (
      <div className="min-h-[30vh] flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-[var(--ink)] border-t-[var(--red)]" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div>
      <h2 style={H2}>{es ? 'ÁREA DE ARTISTA' : 'ARTIST AREA'}</h2>

      {error && (
        <div className="mb-4 p-3 bg-[var(--red)] text-white" style={{ ...MONO, fontSize: '12px' }}>{error}</div>
      )}

      {verified.length > 0 && (
        <VerifiedArtists lang={lang} verified={verified} onChange={reload} />
      )}

      {verified.length > 0 && (
        <BookingInbox lang={lang} inbox={inbox} onChange={reload} />
      )}

      {pendingClaim && (
        <PendingClaim lang={lang} claim={pendingClaim} onChange={reload} />
      )}

      {claims.some((c) => ['rejected', 'revoked', 'cancelled'].includes(c.status)) && (
        <ResolvedClaims lang={lang} claims={claims.filter((c) => ['rejected', 'revoked', 'cancelled'].includes(c.status))} />
      )}

      {canStartClaim && verified.length === 0 && (
        <ClaimOnboarding lang={lang} onChange={reload} />
      )}

      <SentRequests lang={lang} sent={sent} onChange={reload} />
    </div>
  )
}

// ---------------------------------------------------------------------------
function VerifiedArtists({ lang, verified, onChange }: { lang: string; verified: VerifiedArtist[]; onChange: () => void }) {
  const es = lang === 'es'
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (artistId: string, value: boolean) => {
    setBusy(artistId)
    try {
      await fetch('/api/artist-bookings/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: artistId, accepts_bookings: value }),
      })
      onChange()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-8 border-4 border-[var(--ink)] p-6">
      <h3 style={H3}>{es ? 'MIS FICHAS VERIFICADAS' : 'MY VERIFIED PROFILES'}</h3>
      <div className="space-y-3">
        {verified.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-4 border-b-2 border-[var(--ink)]/15 pb-3 last:border-0 last:pb-0">
            <div className="min-w-0">
              <Link href={`/${lang}/artists/${a.slug}`} className="font-black no-underline text-[var(--ink)] hover:text-[var(--red)]" style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '15px' }}>
                {a.name}
              </Link>
              <div style={{ ...MONO, fontSize: '11px', color: 'var(--dim)' }}>
                {a.accepts_bookings ? (es ? 'Recibiendo solicitudes' : 'Receiving requests') : (es ? 'Cerrado a solicitudes' : 'Closed to requests')}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={a.accepts_bookings}
                disabled={busy === a.id}
                onChange={(e) => toggle(a.id, e.target.checked)}
                className="w-5 h-5 accent-[var(--red)] cursor-pointer"
              />
              <span style={{ ...MONO, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                {es ? 'Abierto' : 'Open'}
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function BookingInbox({ lang, inbox, onChange }: { lang: string; inbox: BookingWithArtist[]; onChange: () => void }) {
  const es = lang === 'es'
  const [busy, setBusy] = useState<string | null>(null)

  const setStatus = async (id: string, status: BookingRequestStatus) => {
    setBusy(id)
    try {
      await fetch(`/api/booking-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      onChange()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-8 border-4 border-[var(--ink)] p-6">
      <h3 style={H3}>{es ? 'BANDEJA DE BOOKINGS' : 'BOOKING INBOX'}</h3>
      {inbox.length === 0 ? (
        <p style={{ ...MONO, fontSize: '13px', color: 'var(--dim)' }}>
          {es ? 'Aún no has recibido solicitudes.' : 'No requests yet.'}
        </p>
      ) : (
        <div className="space-y-4">
          {inbox.map((b) => (
            <div key={b.id} className="border-2 border-[var(--ink)]/25 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="cutout fill" style={{ fontSize: '10px' }}>{b.artist_name}</span>
                <span className="cutout red" style={{ fontSize: '10px' }}>
                  {es ? BOOKING_STATUS_LABELS[b.status].es : BOOKING_STATUS_LABELS[b.status].en}
                </span>
              </div>
              <div style={{ ...MONO, fontSize: '12px', lineHeight: 1.7 }}>
                {b.event_date && <div><strong>{es ? 'Fecha:' : 'Date:'}</strong> {b.event_date}</div>}
                <div><strong>{es ? 'Ciudad:' : 'City:'}</strong> {b.city}{b.venue ? ` · ${b.venue}` : ''}</div>
                {b.event_type && <div><strong>{es ? 'Tipo:' : 'Type:'}</strong> {b.event_type}</div>}
                {b.budget_range && <div><strong>{es ? 'Presupuesto:' : 'Budget:'}</strong> {budgetLabel(b.budget_range, es)}</div>}
                <div><strong>{es ? 'Contacto:' : 'Contact:'}</strong> {b.contact_email}{b.contact_phone ? ` · ${b.contact_phone}` : ''}</div>
              </div>
              <p className="mt-2" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.6 }}>{b.message}</p>
              <div className="mt-3 flex items-center gap-2">
                <span style={{ ...MONO, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{es ? 'Marcar:' : 'Set:'}</span>
                <select
                  value={b.status}
                  disabled={busy === b.id}
                  onChange={(e) => setStatus(b.id, e.target.value as BookingRequestStatus)}
                  className="px-2 py-1 border-[3px] border-[var(--ink)] bg-[var(--paper)]"
                  style={{ ...MONO, fontSize: '12px' }}
                >
                  {(['new', ...ARTIST_SETTABLE_BOOKING_STATUSES] as BookingRequestStatus[]).map((s) => (
                    <option key={s} value={s} disabled={s === 'new'}>
                      {es ? BOOKING_STATUS_LABELS[s].es : BOOKING_STATUS_LABELS[s].en}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function PendingClaim({ lang, claim, onChange }: { lang: string; claim: ClaimWithArtist; onChange: () => void }) {
  const es = lang === 'es'
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    setBusy(true)
    try {
      await fetch(`/api/artist-claims/${claim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const target = claim.kind === 'claim_existing' ? claim.artist_name : claim.proposed_name

  return (
    <div className="mb-8 border-4 border-[var(--ink)] bg-[var(--yellow)]/40 p-6">
      <h3 style={H3}>{es ? 'SOLICITUD EN REVISIÓN' : 'CLAIM UNDER REVIEW'}</h3>
      <p style={{ ...MONO, fontSize: '13px', lineHeight: 1.7 }}>
        {es
          ? `Estamos verificando tu solicitud para ${target || 'tu ficha'}. Te contactaremos para confirmar tu identidad. Puede tardar unos días.`
          : `We're verifying your claim for ${target || 'your profile'}. We'll reach out to confirm your identity. This can take a few days.`}
      </p>
      <button onClick={cancel} disabled={busy} className="cutout outline mt-4" style={{ cursor: 'pointer' }}>
        {es ? 'CANCELAR SOLICITUD' : 'CANCEL CLAIM'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
function ResolvedClaims({ lang, claims }: { lang: string; claims: ClaimWithArtist[] }) {
  const es = lang === 'es'
  return (
    <div className="mb-8">
      {claims.map((c) => (
        <p key={c.id} className="mb-1" style={{ ...MONO, fontSize: '12px', color: 'var(--dim)' }}>
          {c.kind === 'claim_existing' ? c.artist_name : c.proposed_name} — {es ? CLAIM_STATUS_LABELS[c.status].es : CLAIM_STATUS_LABELS[c.status].en}
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
function ClaimOnboarding({ lang, onChange }: { lang: string; onChange: () => void }) {
  const es = lang === 'es'
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ proposed_name: '', beatport_url: '', youtube_url: '', soundcloud_url: '', instagram_url: '', message: '' })

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setHits([]); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('artists')
        .select('id, name, slug, category, claimed_by')
        .ilike('name', `%${q}%`)
        .limit(15)
      if (cancelled) return
      const rows = ((data as SearchHit[]) || []).filter((a) => isClaimableCategory(a.category) && !a.claimed_by)
      setHits(rows)
      setSearching(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  const claimExisting = async (artistId: string) => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/artist-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'claim_existing', artist_id: artistId }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error); return }
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const requestNew = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/artist-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'request_new', ...newForm }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error); return }
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]'
  const inputStyle = { fontFamily: "'Special Elite', monospace" as const, fontSize: '14px' }

  return (
    <div className="mb-8 border-4 border-[var(--ink)] p-6">
      <h3 style={H3}>{es ? 'RECLAMA TU FICHA' : 'CLAIM YOUR PROFILE'}</h3>
      <p style={{ ...MONO, fontSize: '13px', lineHeight: 1.7, marginBottom: '14px' }}>
        {es
          ? 'Verificaremos que eres el artista (o su representante). No editas la ficha: obtienes la capacidad de recibir solicitudes de booking.'
          : 'We’ll verify you are the artist (or their rep). You don’t edit the profile: you get the ability to receive booking requests.'}
      </p>

      {err && <div className="mb-3 p-3 bg-[var(--red)] text-white" style={{ ...MONO, fontSize: '12px' }}>{err}</div>}

      {!showNew ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={es ? 'Busca tu nombre artístico…' : 'Search your artist name…'}
            className={inputClass}
            style={inputStyle}
          />
          {searching && <p className="mt-2" style={{ ...MONO, fontSize: '11px', color: 'var(--dim)' }}>{es ? 'Buscando…' : 'Searching…'}</p>}
          {hits.length > 0 && (
            <div className="mt-3 space-y-2">
              {hits.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 border-2 border-[var(--ink)]/20 p-2">
                  <span className="font-black" style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '14px' }}>{a.name}</span>
                  <button onClick={() => claimExisting(a.id)} disabled={busy} className="cutout red" style={{ cursor: 'pointer', fontSize: '10px' }}>
                    {es ? 'RECLAMAR' : 'CLAIM'}
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => { setShowNew(true); setErr(null) }} className="cutout outline mt-4" style={{ cursor: 'pointer' }}>
            {es ? 'NO ENCUENTRO MI FICHA' : "I CAN'T FIND MY PROFILE"}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <p style={{ ...MONO, fontSize: '12px', color: 'var(--dim)' }}>
            {es ? 'Solicita una ficha nueva. Aporta al menos un enlace.' : 'Request a new profile. Provide at least one link.'}
          </p>
          <input value={newForm.proposed_name} onChange={(e) => setNewForm({ ...newForm, proposed_name: e.target.value })} placeholder={es ? 'Nombre artístico *' : 'Artist name *'} className={inputClass} style={inputStyle} />
          <input value={newForm.beatport_url} onChange={(e) => setNewForm({ ...newForm, beatport_url: e.target.value })} placeholder="Beatport URL" className={inputClass} style={inputStyle} />
          <input value={newForm.youtube_url} onChange={(e) => setNewForm({ ...newForm, youtube_url: e.target.value })} placeholder="YouTube URL" className={inputClass} style={inputStyle} />
          <input value={newForm.soundcloud_url} onChange={(e) => setNewForm({ ...newForm, soundcloud_url: e.target.value })} placeholder="SoundCloud URL" className={inputClass} style={inputStyle} />
          <input value={newForm.instagram_url} onChange={(e) => setNewForm({ ...newForm, instagram_url: e.target.value })} placeholder="Instagram URL" className={inputClass} style={inputStyle} />
          <textarea value={newForm.message} onChange={(e) => setNewForm({ ...newForm, message: e.target.value })} rows={3} placeholder={es ? 'Cuéntanos sobre ti' : 'Tell us about yourself'} className={inputClass} style={inputStyle} />
          <div className="flex gap-2">
            <button onClick={requestNew} disabled={busy} className="cutout red" style={{ cursor: 'pointer' }}>{es ? 'ENVIAR SOLICITUD' : 'SEND REQUEST'}</button>
            <button onClick={() => setShowNew(false)} className="cutout outline" style={{ cursor: 'pointer' }}>{es ? 'VOLVER' : 'BACK'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function SentRequests({ lang, sent, onChange }: { lang: string; sent: BookingWithArtist[]; onChange: () => void }) {
  const es = lang === 'es'
  const [busy, setBusy] = useState<string | null>(null)

  if (sent.length === 0) return null

  const cancel = async (id: string) => {
    setBusy(id)
    try {
      await fetch(`/api/booking-requests/${id}`, { method: 'DELETE' })
      onChange()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-8 border-4 border-[var(--ink)] p-6">
      <h3 style={H3}>{es ? 'SOLICITUDES ENVIADAS' : 'SENT REQUESTS'}</h3>
      <div className="space-y-3">
        {sent.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 border-b-2 border-[var(--ink)]/15 pb-3 last:border-0 last:pb-0">
            <div className="min-w-0">
              <Link href={b.artist_slug ? `/${lang}/artists/${b.artist_slug}` : '#'} className="font-black no-underline text-[var(--ink)] hover:text-[var(--red)]" style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '14px' }}>
                {b.artist_name}
              </Link>
              <div style={{ ...MONO, fontSize: '11px', color: 'var(--dim)' }}>
                {b.city}{b.event_date ? ` · ${b.event_date}` : ''} — {es ? BOOKING_STATUS_LABELS[b.status].es : BOOKING_STATUS_LABELS[b.status].en}
              </div>
            </div>
            {b.status === 'new' && (
              <button onClick={() => cancel(b.id)} disabled={busy === b.id} className="cutout outline shrink-0" style={{ cursor: 'pointer', fontSize: '10px' }}>
                {es ? 'CANCELAR' : 'CANCEL'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
