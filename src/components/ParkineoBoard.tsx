'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import ParkineoPlayer, { type ParkineoPlayable } from '@/components/ParkineoPlayer'
import { parkineoOpenHref } from '@/lib/parkineo'

const PAGE = 24

export type ParkineoListItem = ParkineoPlayable & {
  slug: string
  city: string
  duration_minutes: number
  published_at: string | null
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const

export default function ParkineoBoard({
  lang,
  sessions,
}: {
  lang: string
  sessions: ParkineoListItem[]
}) {
  const es = lang === 'es'
  const { user, loading } = useAuth()
  const [visible, setVisible] = useState(PAGE)
  const [djName, setDjName] = useState('')
  const [city, setCity] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasPending, setHasPending] = useState(false)

  useEffect(() => {
    if (!user) {
      setHasPending(false)
      return
    }
    let cancelled = false
    void fetch('/api/parkineo')
      .then((r) => r.json())
      .then((json: { data?: { status?: string }[] }) => {
        if (cancelled) return
        setHasPending((json.data || []).some((row) => row.status === 'pending'))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/parkineo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: es ? 'es' : 'en',
          dj_name: djName,
          city,
          title,
          url,
          confirm,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || (es ? 'No se ha podido enviar.' : 'Could not send it.'))
        if (json.code === 'pending_exists') setHasPending(true)
        return
      }
      setHasPending(true)
      setTitle('')
      setUrl('')
      setConfirm(false)
    } catch {
      setError(es ? 'No se ha podido enviar.' : 'Could not send it.')
    } finally {
      setBusy(false)
    }
  }

  const shown = sessions.slice(0, visible)
  const loginHref = `/${lang}/login?next=${encodeURIComponent(`/${lang}/parkineo`)}`
  const artistHref = user ? `/${lang}/mi-cuenta/artista` : `/${lang}/login?next=${encodeURIComponent(`/${lang}/mi-cuenta/artista`)}`

  return (
    <div>
      <section id="mandar" className="px-4 sm:px-6 py-10 sm:py-12 border-b-[5px] border-[var(--ink)]">
        <div className="max-w-[760px]">
          {loading ? null : user ? (
            hasPending ? (
              <p className="m-0 border-4 border-[var(--ink)] bg-[var(--yellow)] p-4" style={{ ...MONO, fontSize: '14px', lineHeight: 1.6 }}>
                {es
                  ? 'Tienes una sesión en cola. Cuando la escuchemos podrás mandar otra.'
                  : 'You have a session in the queue. You can send another once we have listened.'}{' '}
                <Link href={`/${lang}/mi-cuenta/parkineo`} className="text-[var(--red)]">
                  {es ? 'Ver la tuya' : 'See yours'}
                </Link>
              </p>
            ) : (
              <form
                className="border-4 border-[var(--ink)] bg-[var(--paper)] p-4 sm:p-6 shadow-[6px_6px_0_var(--ink)]"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!busy) void submit()
                }}
              >
                <h2 className="m-0 mb-4" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '22px', textTransform: 'uppercase' }}>
                  {es ? 'Manda tu sesión' : 'Send your session'}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={es ? 'Nombre de DJ' : 'DJ name'} value={djName} onChange={setDjName} maxLength={60} />
                  <Field label={es ? 'Ciudad' : 'City'} value={city} onChange={setCity} maxLength={60} />
                </div>
                <div className="mt-3">
                  <Field label={es ? 'Título de la sesión' : 'Session title'} value={title} onChange={setTitle} maxLength={120} />
                </div>
                <div className="mt-3">
                  <Field label={es ? 'Enlace de SoundCloud, YouTube o Mixcloud' : 'SoundCloud, YouTube or Mixcloud link'} value={url} onChange={setUrl} maxLength={500} />
                </div>
                <label className="mt-4 flex items-start gap-3 cursor-pointer" style={{ ...MONO, fontSize: '13px', lineHeight: 1.5 }}>
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-[var(--red)]"
                  />
                  <span>
                    {es
                      ? 'Esta sesión la he pinchado yo. Optimal Breaks puede no publicarla o quitarla.'
                      : 'I mixed this session. Optimal Breaks may choose not to publish it, or take it down.'}
                  </span>
                </label>
                {error ? (
                  <p className="mt-3 mb-0 p-3 bg-[var(--red)] text-white" style={{ ...MONO, fontSize: '13px' }}>{error}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-4 border-[3px] border-[var(--ink)] bg-[var(--red)] px-4 py-3 text-white cursor-pointer disabled:opacity-60"
                  style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase' }}
                >
                  {busy ? (es ? 'Leyendo el enlace…' : 'Reading the link…') : es ? 'Mandar sesión' : 'Send session'}
                </button>
              </form>
            )
          ) : (
            <div className="border-4 border-[var(--ink)] bg-[var(--yellow)] p-5 shadow-[6px_6px_0_var(--ink)]">
              <p className="m-0" style={{ ...MONO, fontSize: '15px', lineHeight: 1.6 }}>
                {es
                  ? 'Para mandarla tienes que entrar. La lista se ve igual sin cuenta. No hace falta ser artista.'
                  : 'Sending one means signing in. The list is there either way. You do not need to be an artist on the site.'}
              </p>
              <Link
                href={loginHref}
                className="mt-4 inline-block border-[3px] border-[var(--ink)] bg-[var(--red)] px-4 py-3 text-white no-underline"
                style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase' }}
              >
                {es ? 'Entrar y mandar' : 'Sign in and send'}
              </Link>
            </div>
          )}
          <p className="mt-6 mb-0" style={{ ...MONO, fontSize: '13px', lineHeight: 1.7, color: 'var(--dim)' }}>
            {es
              ? 'Esto no es una ficha de artista ni abre bookings. Si ya sacas temas y quieres estar en Artistas, eso se pide aparte desde tu cuenta.'
              : 'This is not an artist profile and it does not open bookings. If you already release tracks and want an Artists page, ask for that separately from your account.'}{' '}
            <Link href={artistHref} className="text-[var(--red)]">
              {es ? 'Solicitar ficha' : 'Request a profile'}
            </Link>
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-6 py-10 sm:py-12">
        {sessions.length === 0 ? (
          <p className="m-0 max-w-[640px]" style={{ ...MONO, fontSize: '16px', lineHeight: 1.7 }}>
            {es ? 'Aún no hay sesiones. La primera puede ser la tuya.' : 'No sessions yet. The first one can be yours.'}
          </p>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((session) => (
                <ParkineoCard key={session.id} session={session} lang={lang} />
              ))}
            </div>
            {visible < sessions.length ? (
              <button
                type="button"
                onClick={() => setVisible((n) => n + PAGE)}
                className="mt-8 border-[3px] border-[var(--ink)] bg-[var(--paper)] px-4 py-3 cursor-pointer"
                style={{ ...MONO, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
              >
                {es ? 'Ver más' : 'Show more'}
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}

function ParkineoCard({ session, lang }: { session: ParkineoListItem; lang: string }) {
  const es = lang === 'es'
  const href = parkineoOpenHref(session)
  const platform = session.platform.toUpperCase()
  return (
    <article id={`parkineo-${session.id}`} className="border-4 border-[var(--ink)] bg-[var(--paper)] shadow-[6px_6px_0_var(--ink)] overflow-hidden">
      <ParkineoPlayer session={session} />
      <div className="p-3 sm:p-4">
        <h3 className="m-0" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '18px', lineHeight: 1.15, textTransform: 'uppercase' }}>
          <Link href={`/${lang}/parkineo/${session.slug}`} className="text-inherit no-underline hover:text-[var(--red)]">
            {session.title}
          </Link>
        </h3>
        <p className="mt-2 mb-0" style={{ ...MONO, fontSize: '12px', letterSpacing: '0.5px', lineHeight: 1.5 }}>
          {session.dj_name} · {session.city} · {session.duration_minutes} min · {platform}
          {href ? (
            <>
              {' · '}
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--red)]">
                {es ? 'Abrir' : 'Open'} ↗
              </a>
            </>
          ) : null}
        </p>
      </div>
    </article>
  )
}

function Field({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength: number
}) {
  return (
    <label className="block">
      <span style={{ ...MONO, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2 outline-none focus:border-[var(--red)]"
        style={{ ...MONO, fontSize: '14px' }}
      />
    </label>
  )
}
