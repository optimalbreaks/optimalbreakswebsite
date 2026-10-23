'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import ParkineoPlayer, { type ParkineoPlayable } from '@/components/ParkineoPlayer'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import { parkineoOpenHref } from '@/lib/parkineo'

const PAGE = 24

const VIEW_LABELS = {
  es: { view_large: 'Grande', view_compact: 'Compacto', view_list: 'Lista' },
  en: { view_large: 'Large', view_compact: 'Compact', view_list: 'List' },
} as const

export type ParkineoListItem = ParkineoPlayable & {
  slug: string
  city: string
  duration_minutes: number
  published_at: string | null
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif", fontWeight: 900, textTransform: 'uppercase' } as const
const BTN =
  'inline-block border-[3px] border-[var(--ink)] px-5 py-3 no-underline shadow-[4px_4px_0_var(--ink)] transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_var(--ink)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_var(--ink)]'

const PLATFORMS = [
  { id: 'soundcloud', label: 'SoundCloud', re: /^(www\.|m\.|on\.)?soundcloud\.com$/i, bg: '#ff5500' },
  { id: 'youtube', label: 'YouTube', re: /^((www\.|m\.|music\.)?youtube\.com|youtu\.be)$/i, bg: '#d62828' },
  { id: 'mixcloud', label: 'Mixcloud', re: /^(www\.)?mixcloud\.com$/i, bg: '#5000ff' },
] as const

function detectPlatform(raw: string) {
  const v = raw.trim()
  if (!v) return null
  try {
    const host = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname
    return PLATFORMS.find((p) => p.re.test(host)) ?? 'other'
  } catch {
    return 'other'
  }
}

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
  const [view, setView] = useState<ViewMode>('large')
  const [djName, setDjName] = useState('')
  const [city, setCity] = useState('')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasPending, setHasPending] = useState(false)
  const [justSent, setJustSent] = useState(false)

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
      setJustSent(true)
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
  const loginHref = `/${lang}/login?next=${encodeURIComponent(`/${lang}/parkineo#mandar`)}`
  const artistHref = user ? `/${lang}/mi-cuenta/artista` : `/${lang}/login?next=${encodeURIComponent(`/${lang}/mi-cuenta/artista`)}`
  const platform = detectPlatform(url)
  const ready = djName.trim() && city.trim() && title.trim() && url.trim() && confirm && platform !== 'other'

  const steps = es
    ? [
        { n: '01', t: 'Cuélgala', d: 'En SoundCloud, YouTube o Mixcloud. Puede estar oculta: el archivo no se sube aquí.' },
        { n: '02', t: 'Pega el enlace', d: 'Con tu cuenta, la misma de guardar temas. De 15 minutos a 3 horas: un tema suelto no es una sesión.' },
        { n: '03', t: 'La escuchamos', d: 'Si entra, sale en la lista con tu nombre de DJ. El estado lo ves en tu cuenta.' },
      ]
    : [
        { n: '01', t: 'Upload it', d: 'To SoundCloud, YouTube or Mixcloud. It can be hidden: the file is never uploaded here.' },
        { n: '02', t: 'Paste the link', d: 'With your account, the same one you use to save tracks. 15 minutes to 3 hours: a single track is not a session.' },
        { n: '03', t: 'We listen', d: 'If it goes in, it shows up in the list under your DJ name. You can check its status in your account.' },
      ]

  return (
    <div>
      <section id="mandar" className="scroll-mt-24 px-4 sm:px-6 py-12 sm:py-16 border-b-[5px] border-[var(--ink)] bg-[var(--ink)]">
        <div className="mx-auto max-w-[1280px] grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <h2 className="m-0 text-[var(--yellow)]" style={{ ...DISPLAY, fontSize: 'clamp(26px, 4vw, 44px)', lineHeight: 1, letterSpacing: '-1px' }}>
              {es ? 'Cómo se manda' : 'How to send it'}
            </h2>
            <ol className="mt-8 mb-0 p-0 list-none grid gap-4">
              {steps.map((s) => (
                <li key={s.n} className="flex gap-4 border-[3px] border-[var(--paper)] bg-[var(--ink)] p-4">
                  <span className="shrink-0 text-[var(--red)]" style={{ ...DISPLAY, fontSize: '30px', lineHeight: 1 }}>
                    {s.n}
                  </span>
                  <span>
                    <span className="block text-[var(--paper)]" style={{ ...DISPLAY, fontSize: '17px', lineHeight: 1.2 }}>
                      {s.t}
                    </span>
                    <span className="mt-1 block text-[var(--paper)] opacity-80" style={{ ...MONO, fontSize: '14px', lineHeight: 1.55 }}>
                      {s.d}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <ul className="mt-5 mb-0 p-0 list-none flex flex-wrap gap-2" aria-label={es ? 'Plataformas admitidas' : 'Supported platforms'}>
              {PLATFORMS.map((p) => (
                <li key={p.id} className="border-2 border-[var(--paper)] px-2 py-1 text-white" style={{ ...MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', background: p.bg }}>
                  {p.label}
                </li>
              ))}
            </ul>
          </div>

          <div>
            {loading ? (
              <div className="h-[320px] border-4 border-[var(--paper)] opacity-30" aria-hidden="true" />
            ) : user ? (
              hasPending ? (
                <div className="border-4 border-[var(--ink)] bg-[var(--yellow)] p-5 sm:p-6 shadow-[8px_8px_0_var(--red)]">
                  <p className="m-0" style={{ ...DISPLAY, fontSize: '20px', lineHeight: 1.15 }}>
                    {justSent ? (es ? '¡Recibida!' : 'Got it!') : es ? 'Tienes una en cola' : 'You have one in the queue'}
                  </p>
                  <p className="mt-3 mb-0" style={{ ...MONO, fontSize: '15px', lineHeight: 1.6 }}>
                    {es
                      ? 'Cuando la escuchemos podrás mandar otra. El estado lo ves en tu cuenta.'
                      : 'You can send another once we have listened. You can check its status in your account.'}
                  </p>
                  <Link href={`/${lang}/mi-cuenta/parkineo`} className={`${BTN} mt-5 bg-[var(--ink)] text-[var(--yellow)]`} style={{ ...DISPLAY, fontSize: '13px', letterSpacing: '1px' }}>
                    {es ? 'Ver la mía →' : 'See mine →'}
                  </Link>
                </div>
              ) : (
                <form
                  className="border-4 border-[var(--ink)] bg-[var(--paper)] p-5 sm:p-7 shadow-[8px_8px_0_var(--red)]"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!busy && ready) void submit()
                  }}
                >
                  <h3 className="m-0 mb-5" style={{ ...DISPLAY, fontSize: '22px', lineHeight: 1.1 }}>
                    {es ? 'Manda tu sesión' : 'Send your session'}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={es ? 'Nombre de DJ' : 'DJ name'} value={djName} onChange={setDjName} maxLength={60} placeholder={es ? 'DJ Lechón' : 'DJ Piglet'} autoComplete="nickname" />
                    <Field label={es ? 'Ciudad' : 'City'} value={city} onChange={setCity} maxLength={60} placeholder={es ? 'Murcia' : 'Bristol'} autoComplete="address-level2" />
                  </div>
                  <div className="mt-4">
                    <Field label={es ? 'Título de la sesión' : 'Session title'} value={title} onChange={setTitle} maxLength={120} placeholder={es ? 'Sesión de parking, octubre' : 'Car park session, October'} />
                  </div>
                  <div className="mt-4">
                    <Field
                      label={es ? 'Enlace de SoundCloud, YouTube o Mixcloud' : 'SoundCloud, YouTube or Mixcloud link'}
                      value={url}
                      onChange={setUrl}
                      maxLength={500}
                      placeholder="https://soundcloud.com/…"
                      inputMode="url"
                      hint={
                        platform === null ? null : platform === 'other' ? (
                          <span className="text-[var(--red)]">{es ? 'Ese enlace no es de SoundCloud, YouTube ni Mixcloud.' : 'That link is not SoundCloud, YouTube or Mixcloud.'}</span>
                        ) : (
                          <span>✓ {platform.label}</span>
                        )
                      }
                    />
                  </div>
                  <label className="mt-5 flex items-start gap-3 cursor-pointer" style={{ ...MONO, fontSize: '13px', lineHeight: 1.5 }}>
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                      className="mt-[2px] h-5 w-5 shrink-0 accent-[var(--red)]"
                    />
                    <span>
                      {es
                        ? 'Esta sesión la he pinchado yo. Optimal Breaks puede no publicarla o quitarla.'
                        : 'I mixed this session. Optimal Breaks may choose not to publish it, or take it down.'}
                    </span>
                  </label>
                  {error ? (
                    <p role="alert" className="mt-4 mb-0 p-3 bg-[var(--red)] text-white" style={{ ...MONO, fontSize: '13px' }}>{error}</p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={busy || !ready}
                    className={`${BTN} mt-5 w-full sm:w-auto bg-[var(--red)] text-white cursor-pointer`}
                    style={{ ...DISPLAY, letterSpacing: '1px' }}
                  >
                    {busy ? (es ? 'Leyendo el enlace…' : 'Reading the link…') : es ? 'Mandar sesión' : 'Send session'}
                  </button>
                  {!ready && !busy ? (
                    <p className="mt-3 mb-0 opacity-70" style={{ ...MONO, fontSize: '12px' }}>
                      {es ? 'Rellena los cuatro campos y marca la casilla.' : 'Fill in the four fields and tick the box.'}
                    </p>
                  ) : null}
                </form>
              )
            ) : (
              <div className="border-4 border-[var(--ink)] bg-[var(--yellow)] p-5 sm:p-7 shadow-[8px_8px_0_var(--red)]">
                <p className="m-0" style={{ ...DISPLAY, fontSize: 'clamp(20px, 2.6vw, 26px)', lineHeight: 1.1 }}>
                  {es ? 'Entra y manda la tuya' : 'Sign in and send yours'}
                </p>
                <p className="mt-3 mb-0" style={{ ...MONO, fontSize: '15px', lineHeight: 1.6 }}>
                  {es
                    ? 'Con la misma cuenta de guardar temas. No hace falta ser artista. Para escuchar no necesitas cuenta.'
                    : 'With the same account you use to save tracks. You do not need to be an artist. Listening needs no account.'}
                </p>
                <Link href={loginHref} className={`${BTN} mt-5 bg-[var(--red)] text-white`} style={{ ...DISPLAY, letterSpacing: '1px' }}>
                  {es ? 'Entrar y mandar →' : 'Sign in and send →'}
                </Link>
              </div>
            )}
            <p className="mt-6 mb-0 text-[var(--paper)] opacity-75" style={{ ...MONO, fontSize: '13px', lineHeight: 1.7 }}>
              {es
                ? 'Esto no es una ficha de artista ni abre bookings. Si ya sacas temas y quieres estar en Artistas, eso se pide aparte.'
                : 'This is not an artist profile and it does not open bookings. If you already release tracks and want an Artists page, ask for that separately.'}{' '}
              <Link href={artistHref} className="text-[var(--yellow)]">
                {es ? 'Solicitar ficha →' : 'Request a profile →'}
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section id="sesiones" className="scroll-mt-24 px-4 sm:px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <h2 className="m-0" style={{ ...DISPLAY, fontSize: 'clamp(26px, 4vw, 44px)', lineHeight: 1, letterSpacing: '-1px' }}>
                {es ? 'Las sesiones' : 'The sessions'}
              </h2>
              {sessions.length > 0 ? (
                <span className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-2 py-1" style={{ ...MONO, fontSize: '13px', fontWeight: 700 }}>
                  {sessions.length}
                </span>
              ) : null}
            </div>
            {sessions.length > 0 ? (
              <ViewToggle view={view} setView={setView} labels={es ? VIEW_LABELS.es : VIEW_LABELS.en} />
            ) : null}
          </div>
          {sessions.length === 0 ? (
            <div className="border-4 border-dashed border-[var(--ink)] bg-[var(--paper)] px-5 py-10 sm:px-10 sm:py-14 text-center">
              <p className="m-0" style={{ ...DISPLAY, fontSize: 'clamp(22px, 3.2vw, 34px)', lineHeight: 1.1 }}>
                {es ? 'El parking está vacío' : 'The car park is empty'}
              </p>
              <p className="mx-auto mt-3 mb-0 max-w-[520px]" style={{ ...MONO, fontSize: '15px', lineHeight: 1.6 }}>
                {es ? 'Todavía no hay sesiones publicadas. La primera que suene aquí puede ser la tuya.' : 'No sessions published yet. The first one to play here can be yours.'}
              </p>
              <a href="#mandar" className={`${BTN} mt-6 bg-[var(--red)] text-white`} style={{ ...DISPLAY, fontSize: '14px', letterSpacing: '1px' }}>
                {es ? 'Mandar la primera ↑' : 'Send the first one ↑'}
              </a>
            </div>
          ) : (
            <>
              {view === 'large' ? (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((session) => (
                    <ParkineoCard key={session.id} session={session} lang={lang} />
                  ))}
                </div>
              ) : view === 'compact' ? (
                <ParkineoCompact sessions={shown} lang={lang} />
              ) : (
                <ParkineoList sessions={shown} lang={lang} />
              )}
              {visible < sessions.length ? (
                <div className="mt-10 text-center">
                  <button
                    type="button"
                    onClick={() => setVisible((n) => n + PAGE)}
                    className={`${BTN} bg-[var(--paper)] text-[var(--ink)] cursor-pointer`}
                    style={{ ...MONO, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
                  >
                    {es ? `Ver más (${sessions.length - visible})` : `Show more (${sessions.length - visible})`}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function ParkineoCard({ session, lang }: { session: ParkineoListItem; lang: string }) {
  const es = lang === 'es'
  const href = parkineoOpenHref(session)
  return (
    <article
      id={`parkineo-${session.id}`}
      className="flex flex-col border-4 border-[var(--ink)] bg-[var(--paper)] shadow-[6px_6px_0_var(--ink)] overflow-hidden transition-transform hover:-translate-y-1"
    >
      <ParkineoPlayer session={session} />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="m-0" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '18px', lineHeight: 1.15, textTransform: 'uppercase' }}>
          <Link href={`/${lang}/parkineo/${session.slug}`} className="text-inherit no-underline hover:text-[var(--red)]">
            {session.title}
          </Link>
        </h3>
        <p className="mt-2 mb-0" style={{ ...MONO, fontSize: '14px', fontWeight: 700 }}>
          {session.dj_name} <span className="font-normal opacity-70">· {session.city}</span>
        </p>
        <ParkineoMeta session={session} href={href} openLabel={es ? 'Abrir' : 'Open'} />
      </div>
    </article>
  )
}

function ParkineoCompact({ sessions, lang }: { sessions: ParkineoListItem[]; lang: string }) {
  const es = lang === 'es'
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
      {sessions.map((session) => {
        const href = parkineoOpenHref(session)
        return (
          <article
            key={session.id}
            id={`parkineo-${session.id}`}
            className="flex flex-col border-b-[3px] border-r-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden transition-colors hover:bg-[var(--yellow)]"
          >
            <ParkineoPlayer session={session} />
            <div className="flex flex-1 flex-col p-3 min-h-0">
              <h3 className="m-0" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: 'clamp(11px, 2vw, 14px)', lineHeight: 1.15, textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                <Link href={`/${lang}/parkineo/${session.slug}`} className="text-inherit no-underline hover:text-[var(--red)]">
                  {session.title}
                </Link>
              </h3>
              <p className="mt-1 mb-0 truncate" style={{ ...MONO, fontSize: '12px', fontWeight: 700 }}>
                {session.dj_name}
              </p>
              <p className="mt-0 mb-0 truncate opacity-70" style={{ ...MONO, fontSize: '11px' }}>
                {session.city}
              </p>
              <ParkineoMeta session={session} href={href} openLabel={es ? 'Abrir' : 'Open'} dense />
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ParkineoList({ sessions, lang }: { sessions: ParkineoListItem[]; lang: string }) {
  const es = lang === 'es'
  return (
    <div className="border-4 border-[var(--ink)]">
      {sessions.map((session) => {
        const href = parkineoOpenHref(session)
        return (
          <article
            key={session.id}
            id={`parkineo-${session.id}`}
            className="flex items-stretch border-b-[2px] border-[var(--ink)] bg-[var(--paper)] transition-colors hover:bg-[var(--yellow)]"
          >
            <div className="w-[132px] shrink-0 border-r-[2px] border-[var(--ink)] sm:w-[240px]">
              <ParkineoPlayer session={session} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center p-3 sm:p-4">
              <h3 className="m-0 truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: 'clamp(13px, 2.4vw, 18px)', lineHeight: 1.15, textTransform: 'uppercase' }}>
                <Link href={`/${lang}/parkineo/${session.slug}`} className="text-inherit no-underline hover:text-[var(--red)]">
                  {session.title}
                </Link>
              </h3>
              <p className="mt-1 mb-0 truncate" style={{ ...MONO, fontSize: '13px', fontWeight: 700 }}>
                {session.dj_name} <span className="font-normal opacity-70">· {session.city}</span>
              </p>
              <ParkineoMeta session={session} href={href} openLabel={es ? 'Abrir' : 'Open'} />
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ParkineoMeta({
  session,
  href,
  openLabel,
  dense = false,
}: {
  session: ParkineoListItem
  href: string | null
  openLabel: string
  dense?: boolean
}) {
  return (
    <div className={`mt-auto flex flex-wrap items-center gap-1.5 ${dense ? 'pt-2' : 'pt-4'}`} style={{ ...MONO, fontSize: dense ? '9px' : '11px', fontWeight: 700, letterSpacing: '1px' }}>
      <span className="border-2 border-[var(--ink)] bg-[var(--yellow)] px-1.5 py-[1px]">{session.duration_minutes} MIN</span>
      <span className="border-2 border-[var(--ink)] px-1.5 py-[1px]">{session.platform.toUpperCase()}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="ml-auto text-[var(--red)]">
          {openLabel} ↗
        </a>
      ) : null}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  autoComplete,
  inputMode,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  placeholder?: string
  autoComplete?: string
  inputMode?: 'url' | 'text'
  hint?: ReactNode
}) {
  return (
    <label className="block">
      <span style={{ ...MONO, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      <input
        value={value}
        maxLength={maxLength}
        required
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border-[3px] border-[var(--ink)] bg-white px-3 py-3 outline-none placeholder:text-[#9a9384] focus:border-[var(--red)] focus:shadow-[3px_3px_0_var(--ink)]"
        style={{ ...MONO, fontSize: '16px' }}
      />
      {hint ? (
        <span className="mt-1 block" style={{ ...MONO, fontSize: '12px', fontWeight: 700 }}>
          {hint}
        </span>
      ) : null}
    </label>
  )
}
