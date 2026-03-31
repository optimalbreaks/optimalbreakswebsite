// ============================================
// OPTIMAL BREAKS — Seen Live Button
// "I've seen this artist live" toggle for artist detail pages
// ============================================

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { createBrowserSupabase } from '@/lib/supabase'
import { i18n } from '@/lib/i18n-config'

interface Props {
  artistId: string
  artistName: string
  lang?: string
}

function getLang(pathname: string) {
  const seg = pathname.split('/')[1]
  return i18n.locales.includes(seg as any) ? seg : i18n.defaultLocale
}

export default function SeenLiveButton({ artistId, artistName, lang }: Props) {
  const { user } = useAuth()
  const pathname = usePathname()
  const resolvedLang = lang || getLang(pathname)
  const es = resolvedLang === 'es'

  const [hasSeen, setHasSeen] = useState(false)
  const [sightingCount, setSightingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showTooltip, setShowTooltip] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [mounted, setMounted] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const [form, setForm] = useState({ seen_at: '', venue: '', city: '', country: '', event_name: '', notes: '', rating: 0 })

  const checkSightings = useCallback(async () => {
    if (!user) { setHasSeen(false); setSightingCount(0); setLoading(false); return }
    const supabase: any = createBrowserSupabase()
    const { count } = await supabase
      .from('artist_sightings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('artist_id', artistId)
    const n = count ?? 0
    setHasSeen(n > 0)
    setSightingCount(n)
    setLoading(false)
  }, [user, artistId])

  useEffect(() => { checkSightings() }, [checkSightings])

  useEffect(() => {
    if (!showTooltip) return
    const handle = (e: MouseEvent | TouchEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) setShowTooltip(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('touchstart', handle) }
  }, [showTooltip])

  useEffect(() => {
    if (!showForm) return
    const handle = (e: MouseEvent | TouchEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) setShowForm(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('touchstart', handle) }
  }, [showForm])

  useEffect(() => {
    if (showTooltip) {
      const t = setTimeout(() => setShowTooltip(false), 4000)
      return () => clearTimeout(t)
    }
  }, [showTooltip])

  const handleClick = () => {
    if (!user) { setShowTooltip(true); return }
    setShowForm((v) => !v)
  }

  const handleSubmit = async () => {
    if (!user || form.rating < 1) return
    const supabase: any = createBrowserSupabase()
    await supabase.from('artist_sightings').insert({
      user_id: user.id,
      artist_id: artistId,
      seen_at: form.seen_at || null,
      venue: form.venue || null,
      city: form.city || null,
      country: form.country || null,
      event_name: form.event_name || null,
      notes: form.notes || null,
      rating: form.rating,
    })
    setForm({ seen_at: '', venue: '', city: '', country: '', event_name: '', notes: '', rating: 0 })
    setShowForm(false)
    await checkSightings()
  }

  return (
    <div className="relative inline-flex">
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-[6px] px-3 py-[5px] border-2 transition-all duration-200 cursor-pointer ${
          hasSeen
            ? 'border-[var(--acid)] bg-[var(--acid)] text-[var(--ink)]'
            : 'border-[var(--acid)] bg-transparent text-[var(--acid)] hover:bg-[var(--acid)] hover:text-[var(--ink)]'
        }`}
        aria-label={hasSeen ? (es ? 'Visto en vivo' : 'Seen live') : (es ? 'Marcar como visto en vivo' : 'Mark as seen live')}
      >
        <span style={{ fontSize: '14px' }}>♫</span>
        <span
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '9px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          {hasSeen
            ? (es ? `VISTO ×${sightingCount}` : `SEEN ×${sightingCount}`)
            : (es ? 'VISTO EN VIVO' : 'SEEN LIVE')}
        </span>
      </button>

      {/* Guest modal — portal al body para centrar en viewport (evita transform del layout) */}
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
                <p style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', lineHeight: 1.4, margin: 0, textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                  {es ? '¡Regístrate para registrar tus directos!' : 'Sign up to log your live shows!'}
                </p>
                <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', lineHeight: 1.5, margin: '8px 0 0', color: 'rgba(255,255,255,0.8)' }}>
                  {es ? 'Lleva la cuenta de todos los artistas que has visto actuar.' : 'Keep track of every artist you\'ve seen perform.'}
                </p>
                <Link
                  href={`/${resolvedLang}/login`}
                  className="mt-4 block text-center bg-[var(--yellow)] text-[var(--ink)] no-underline hover:bg-white transition-colors"
                  style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '13px', letterSpacing: '2px', padding: '10px 14px' }}
                >
                  {es ? '¡ENTRA YA!' : 'JOIN NOW!'}
                </Link>
              </div>
            </div>
          </>,
          document.body
        )}

      {/* Sighting form */}
      {showForm && user && (
        <>
        <div className="fixed inset-0 z-[998] bg-black/50 md:hidden" onClick={() => setShowForm(false)} />
        <div
          ref={formRef}
          className="fixed z-[999] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-w-[320px] md:absolute md:left-0 md:top-full md:right-auto md:translate-x-0 md:translate-y-0 md:mt-2 md:w-[320px] bg-[var(--paper)] border-[4px] border-[var(--ink)] shadow-[6px_6px_0_var(--ink)]"
          style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
          <div className="bg-[var(--ink)] text-[var(--yellow)] px-4 py-2">
            <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {es ? `HE VISTO A ${artistName.toUpperCase()}` : `I SAW ${artistName.toUpperCase()}`}
            </span>
          </div>
          <div className="p-4 space-y-2">
            <input
              type="date"
              value={form.seen_at}
              onChange={(e) => setForm({ ...form, seen_at: e.target.value })}
              className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]"
              style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px' }}
              placeholder={es ? 'Fecha' : 'Date'}
            />
            <input
              placeholder={es ? 'Evento / Festival' : 'Event / Festival'}
              value={form.event_name}
              onChange={(e) => setForm({ ...form, event_name: e.target.value })}
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
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', color: form.rating < 1 ? 'var(--red)' : 'var(--dim)', letterSpacing: '1px', fontWeight: 700 }}>
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
