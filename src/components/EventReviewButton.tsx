// ============================================
// OPTIMAL BREAKS — Event review (1–5 + fecha / sitio / reseña)
// Misma UX que SeenLiveButton en fichas de artista
// ============================================

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { createBrowserSupabase } from '@/lib/supabase'
import { useEventRatings } from '@/hooks/useUserData'
import { i18n } from '@/lib/i18n-config'

interface Props {
  eventId: string
  eventName: string
  lang?: string
  defaultDate?: string | null
  defaultVenue?: string | null
  defaultCity?: string | null
  defaultCountry?: string | null
}

function getLang(pathname: string) {
  const seg = pathname.split('/')[1]
  return i18n.locales.includes(seg as any) ? seg : i18n.defaultLocale
}

type FormState = {
  attended_at: string
  venue: string
  city: string
  country: string
  review: string
  rating: number
}

const emptyForm = (): FormState => ({
  attended_at: '',
  venue: '',
  city: '',
  country: '',
  review: '',
  rating: 0,
})

export default function EventReviewButton({
  eventId,
  eventName,
  lang,
  defaultDate,
  defaultVenue,
  defaultCity,
  defaultCountry,
}: Props) {
  const { user } = useAuth()
  const { rate, refetch } = useEventRatings()
  const pathname = usePathname()
  const resolvedLang = lang || getLang(pathname)
  const es = resolvedLang === 'es'

  const [row, setRow] = useState<{
    rating: number
    review: string
    attended_at: string | null
    venue: string
    city: string
    country: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTooltip, setShowTooltip] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saveError, setSaveError] = useState<string | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadRow = useCallback(async () => {
    if (!user) {
      setRow(null)
      setLoading(false)
      return
    }
    const supabase: any = createBrowserSupabase()
    const { data } = await supabase
      .from('event_ratings')
      .select('rating, review, attended_at, venue, city, country')
      .eq('user_id', user.id)
      .eq('event_id', eventId)
      .maybeSingle()
    if (data) {
      setRow({
        rating: data.rating,
        review: data.review || '',
        attended_at: data.attended_at ?? null,
        venue: data.venue || '',
        city: data.city || '',
        country: data.country || '',
      })
    } else {
      setRow(null)
    }
    setLoading(false)
  }, [user, eventId])

  useEffect(() => {
    loadRow()
  }, [loadRow])

  useEffect(() => {
    if (!showTooltip) return
    const handle = (e: MouseEvent | TouchEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) setShowTooltip(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [showTooltip])

  useEffect(() => {
    if (!showForm) return
    const handle = (e: MouseEvent | TouchEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) setShowForm(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [showForm])

  useEffect(() => {
    if (showTooltip) {
      const t = setTimeout(() => setShowTooltip(false), 4000)
      return () => clearTimeout(t)
    }
  }, [showTooltip])

  const openForm = () => {
    if (!user) {
      setShowTooltip(true)
      return
    }
    setSaveError(null)
    if (row) {
      setForm({
        attended_at: row.attended_at ? String(row.attended_at).slice(0, 10) : '',
        venue: row.venue,
        city: row.city,
        country: row.country,
        review: row.review,
        rating: row.rating,
      })
    } else {
      const d = defaultDate ? String(defaultDate).slice(0, 10) : ''
      setForm({
        attended_at: d,
        venue: (defaultVenue || '').trim(),
        city: (defaultCity || '').trim(),
        country: (defaultCountry || '').trim(),
        review: '',
        rating: 0,
      })
    }
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!user || form.rating < 1) return
    setSaveError(null)
    const { error } = await rate(eventId, {
      rating: form.rating,
      review: form.review.trim(),
      attended_at: form.attended_at.trim() || null,
      venue: form.venue.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
    })
    if (error) {
      setSaveError(
        es
          ? 'No se pudo guardar. Si acabas de desplegar, aplica la migración 032 en Supabase (columnas attended_at, venue, city, country).'
          : 'Could not save. Apply migration 032 on Supabase if new columns are missing.',
      )
      return
    }
    await refetch()
    await loadRow()
    setShowForm(false)
  }

  const hasRating = row !== null && row.rating >= 1

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={openForm}
        disabled={loading}
        className={`inline-flex items-center gap-[6px] px-3 py-[5px] border-2 transition-all duration-200 cursor-pointer disabled:opacity-50 ${
          hasRating
            ? 'border-[var(--yellow)] bg-[var(--yellow)] text-[var(--ink)]'
            : 'border-[var(--yellow)] bg-transparent text-[var(--yellow)] hover:bg-[var(--yellow)] hover:text-[var(--ink)]'
        }`}
        aria-label={hasRating ? (es ? 'Editar valoración del evento' : 'Edit event rating') : (es ? 'Valorar evento' : 'Rate event')}
      >
        <span style={{ fontSize: '14px' }}>★</span>
        <span
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '9px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          {hasRating
            ? es
              ? `VALORADO ×${row.rating}`
              : `RATED ×${row.rating}`
            : es
              ? 'VALORAR'
              : 'RATE'}
        </span>
      </button>

      {mounted &&
        showTooltip &&
        !user &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[1100] bg-black/50" onClick={() => setShowTooltip(false)} aria-hidden />
            <div
              className="fixed inset-0 z-[1101] flex items-center justify-center p-4 pointer-events-none"
              role="dialog"
              aria-modal="true"
            >
              <div
                ref={tooltipRef}
                className="pointer-events-auto relative w-full max-w-[280px] bg-[var(--red)] text-[var(--yellow)] border-[4px] border-[var(--ink)] p-5 shadow-[6px_6px_0_var(--ink)]"
                style={{ animation: 'fadeIn 0.15s ease-out', transform: 'rotate(-1deg)' }}
              >
                <button
                  type="button"
                  onClick={() => setShowTooltip(false)}
                  className="absolute top-2 right-3 text-[var(--yellow)] hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '18px', lineHeight: 1 }}
                  aria-label="Close"
                >
                  ✕
                </button>
                <p
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontWeight: 900,
                    fontSize: '14px',
                    lineHeight: 1.4,
                    margin: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '-0.3px',
                  }}
                >
                  {es ? '¡Entra para valorar el evento!' : 'Sign in to rate this event!'}
                </p>
                <p
                  style={{
                    fontFamily: "'Courier Prime', monospace",
                    fontSize: '11px',
                    lineHeight: 1.5,
                    margin: '8px 0 0',
                    color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  {es ? 'Guarda estrellas, fecha y tu experiencia.' : 'Save stars, date, and your experience.'}
                </p>
                <Link
                  href={`/${resolvedLang}/login`}
                  className="mt-4 block text-center bg-[var(--yellow)] text-[var(--ink)] no-underline hover:bg-white transition-colors"
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontWeight: 900,
                    fontSize: '13px',
                    letterSpacing: '2px',
                    padding: '10px 14px',
                  }}
                >
                  {es ? '¡ENTRA YA!' : 'JOIN NOW!'}
                </Link>
              </div>
            </div>
          </>,
          document.body,
        )}

      {showForm && user && (
        <>
          <div className="fixed inset-0 z-[998] bg-black/50 md:hidden" onClick={() => setShowForm(false)} />
          <div
            ref={formRef}
            className="fixed z-[999] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-w-[320px] md:absolute md:left-0 md:top-full md:right-auto md:translate-x-0 md:translate-y-0 md:mt-2 md:w-[320px] bg-[var(--paper)] border-[4px] border-[var(--ink)] shadow-[6px_6px_0_var(--ink)]"
            style={{ animation: 'fadeIn 0.15s ease-out' }}
          >
            <div className="bg-[var(--ink)] text-[var(--yellow)] px-4 py-2">
              <span
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontWeight: 900,
                  fontSize: '11px',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                }}
              >
                {es ? `FUI A ${eventName.toUpperCase()}` : `I WENT TO ${eventName.toUpperCase()}`}
              </span>
            </div>
            <div className="p-4 space-y-2">
              <input
                type="date"
                value={form.attended_at}
                onChange={(e) => setForm({ ...form, attended_at: e.target.value })}
                className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]"
                style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px' }}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder={es ? 'Venue / Sala' : 'Venue'}
                  value={form.venue}
                  onChange={(e) => setForm({ ...form, venue: e.target.value })}
                  className="px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]"
                  style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px' }}
                />
                <input
                  placeholder={es ? 'Ciudad' : 'City'}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]"
                  style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px' }}
                />
              </div>
              <input
                placeholder={es ? 'País' : 'Country'}
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]"
                style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px' }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span
                  style={{
                    fontFamily: "'Courier Prime', monospace",
                    fontSize: '10px',
                    color: form.rating < 1 ? 'var(--red)' : 'var(--dim)',
                    letterSpacing: '1px',
                    fontWeight: 700,
                  }}
                >
                  RATING *
                </span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm({ ...form, rating: form.rating === n ? 0 : n })}
                    className={`text-lg cursor-pointer border-0 bg-transparent transition-transform hover:scale-125 ${form.rating >= n ? 'text-[var(--yellow)]' : 'text-[var(--ink)]/20'}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                placeholder={es ? 'Reseña / notas (opcional)' : 'Review / notes (optional)'}
                value={form.review}
                onChange={(e) => setForm({ ...form, review: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)] resize-y min-h-[72px]"
                style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px' }}
              />
              {saveError && (
                <p className="text-[var(--red)]" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', lineHeight: 1.4, margin: 0 }}>
                  {saveError}
                </p>
              )}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={form.rating < 1}
                  className="w-full cutout red cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {es ? 'GUARDAR' : 'SAVE'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
