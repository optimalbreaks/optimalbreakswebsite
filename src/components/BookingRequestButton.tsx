// ============================================
// OPTIMAL BREAKS — Booking request button + modal
// El vínculo claimed_by nunca llega al cliente (decisión §2.24):
// se pasa `verified` (booleano) + `accepts`. El formulario solo si accepts.
// ============================================

'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { useArtistBookingInbox } from '@/hooks/useUserData'
import { BUDGET_RANGES } from '@/lib/bookings'

interface Props {
  artistId: string
  artistName: string
  accepts: boolean
  /** Claim aprobado. No es el UUID: solo para pintar estado si bookings están cerrados. */
  verified?: boolean
  lang: string
}

const labelStyle = {
  fontFamily: "'Courier Prime', monospace",
  fontWeight: 700 as const,
  fontSize: '11px',
  letterSpacing: '1px',
  textTransform: 'uppercase' as const,
  display: 'block',
  marginBottom: '4px',
}

const inputClass =
  'w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]'
const inputStyle = { fontFamily: "'Special Elite', monospace", fontSize: '14px' }

export default function BookingRequestButton({ artistId, artistName, accepts, verified = false, lang }: Props) {
  const es = lang === 'es'
  const { user } = useAuth()
  const { artists, newCount } = useArtistBookingInbox()
  const isOwnProfile = artists.some((a) => a.id === artistId)
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [guest, setGuest] = useState(false)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    event_date: '',
    city: '',
    venue: '',
    event_type: '',
    budget_range: '',
    message: '',
    contact_email: '',
    contact_phone: '',
  })

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open && !guest) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, guest])

  if (isOwnProfile) {
    return (
      <Link
        href={`/${lang}/mi-cuenta/artista`}
        className="inline-flex items-center gap-2 h-9 px-3.5 border-2 border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] no-underline hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-all duration-200"
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontWeight: 700,
          fontSize: '11px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        {es ? 'MI BANDEJA' : 'MY INBOX'}
        {newCount > 0 ? ` (${newCount})` : ''}
      </Link>
    )
  }

  if (!accepts) {
    if (!verified) return null
    return (
      <span
        className="inline-flex items-center h-9 px-3.5 border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]/70"
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontWeight: 700,
          fontSize: '11px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
        title={es ? 'Ficha verificada. El artista no acepta solicitudes de booking.' : 'Verified profile. This artist is not accepting booking requests.'}
      >
        {es ? 'VERIFICADO' : 'VERIFIED'}
      </span>
    )
  }

  const openModal = () => {
    setError(null)
    setDone(false)
    if (!user) {
      setGuest(true)
      return
    }
    setForm((f) => ({ ...f, contact_email: f.contact_email || user.email || '' }))
    setOpen(true)
  }

  const submit = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: artistId, ...form }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || (es ? 'No se pudo enviar.' : 'Could not send.'))
        return
      }
      setDone(true)
    } catch {
      setError(es ? 'Error de red.' : 'Network error.')
    } finally {
      setSending(false)
    }
  }

  const triggerButton = (
    <button
      type="button"
      onClick={openModal}
      className="inline-flex items-center gap-2 h-9 px-3.5 border-2 border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-all duration-200"
      style={{
        fontFamily: "'Courier Prime', monospace",
        fontWeight: 700,
        fontSize: '11px',
        letterSpacing: '1px',
        textTransform: 'uppercase',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v12H5.2L4 17.2z" />
      </svg>
      {es ? 'SOLICITAR BOOKING' : 'REQUEST BOOKING'}
    </button>
  )

  const guestModal =
    mounted &&
    guest &&
    createPortal(
      <>
        <div className="fixed inset-0 z-[1100] bg-black/50" onClick={() => setGuest(false)} aria-hidden />
        <div className="fixed inset-0 z-[1101] flex items-center justify-center p-4">
          <div
            className="relative w-full max-w-[300px] bg-[var(--red)] text-[var(--yellow)] border-[4px] border-[var(--ink)] p-5 shadow-[6px_6px_0_var(--ink)]"
            style={{ transform: 'rotate(-1deg)' }}
          >
            <p style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', lineHeight: 1.4, margin: 0, textTransform: 'uppercase' }}>
              {es ? 'Inicia sesión para solicitar booking' : 'Sign in to request a booking'}
            </p>
            <Link
              href={`/${lang}/login`}
              className="mt-4 block text-center bg-[var(--yellow)] text-[var(--ink)] no-underline hover:bg-white transition-colors"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '13px', letterSpacing: '2px', padding: '10px 14px' }}
            >
              {es ? 'ENTRAR' : 'SIGN IN'}
            </Link>
          </div>
        </div>
      </>,
      document.body,
    )

  const formModal =
    mounted &&
    open &&
    createPortal(
      <>
        <div className="fixed inset-0 z-[1100] bg-black/60" onClick={() => setOpen(false)} aria-hidden />
        <div className="fixed inset-0 z-[1101] flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="relative w-full max-w-[460px] my-6 bg-[var(--paper)] border-[4px] border-[var(--ink)] p-6 shadow-[8px_8px_0_var(--ink)]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-4 bg-transparent border-0 cursor-pointer"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '20px', lineHeight: 1 }}
              aria-label={es ? 'Cerrar' : 'Close'}
            >
              ✕
            </button>

            {done ? (
              <div className="text-center py-6">
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '10px' }}>
                  {es ? '¡SOLICITUD ENVIADA!' : 'REQUEST SENT!'}
                </div>
                <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.6 }}>
                  {es
                    ? `${artistName} recibirá tu solicitud. Podrás ver su estado en Mi cuenta → Artista.`
                    : `${artistName} will receive your request. Track its status in My account → Artist.`}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="cutout red mt-5"
                  style={{ cursor: 'pointer' }}
                >
                  {es ? 'CERRAR' : 'CLOSE'}
                </button>
              </div>
            ) : (
              <>
                <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '18px', textTransform: 'uppercase', marginBottom: '4px', paddingRight: '24px' }}>
                  {es ? 'SOLICITAR BOOKING' : 'REQUEST BOOKING'}
                </h2>
                <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'var(--dim)', marginBottom: '16px' }}>
                  {artistName}
                </p>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={labelStyle}>{es ? 'Fecha' : 'Date'}</label>
                      <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>{es ? 'Ciudad *' : 'City *'}</label>
                      <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={labelStyle}>{es ? 'Sala / evento' : 'Venue / event'}</label>
                      <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>{es ? 'Tipo' : 'Type'}</label>
                      <input value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} className={inputClass} style={inputStyle} placeholder={es ? 'Club, festival…' : 'Club, festival…'} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>{es ? 'Presupuesto' : 'Budget'}</label>
                    <select value={form.budget_range} onChange={(e) => setForm({ ...form, budget_range: e.target.value })} className={inputClass} style={inputStyle}>
                      {BUDGET_RANGES.map((b) => (
                        <option key={b.value || 'none'} value={b.value}>{es ? b.label_es : b.label_en}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{es ? 'Mensaje *' : 'Message *'}</label>
                    <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} className={inputClass} style={inputStyle} placeholder={es ? 'Cuéntale los detalles del evento…' : 'Tell them about the event…'} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={labelStyle}>{es ? 'Email de contacto *' : 'Contact email *'}</label>
                      <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>{es ? 'Teléfono' : 'Phone'}</label>
                      <input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="mt-3" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'var(--red)' }}>
                    {error}
                  </p>
                )}

                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={submit} disabled={sending} className="cutout red" style={{ cursor: sending ? 'wait' : 'pointer' }}>
                    {sending ? (es ? 'ENVIANDO…' : 'SENDING…') : es ? 'ENVIAR SOLICITUD' : 'SEND REQUEST'}
                  </button>
                  <button type="button" onClick={() => setOpen(false)} className="cutout outline" style={{ cursor: 'pointer' }}>
                    {es ? 'CANCELAR' : 'CANCEL'}
                  </button>
                </div>

                <p className="mt-3" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', color: 'var(--dim)', lineHeight: 1.5 }}>
                  {es
                    ? 'Al enviar, compartes tus datos de contacto con el artista para gestionar esta solicitud. Optimal Breaks facilita el contacto y puede revisar los mensajes para prevenir abusos.'
                    : 'By sending, you share your contact details with the artist to manage this request. Optimal Breaks facilitates contact and may review messages to prevent abuse.'}
                </p>
              </>
            )}
          </div>
        </div>
      </>,
      document.body,
    )

  return (
    <>
      {triggerButton}
      {guestModal}
      {formModal}
    </>
  )
}
