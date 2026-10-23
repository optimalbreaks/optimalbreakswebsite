'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import {
  formatTrackLength,
  PARKINEO_TRACK_MAX_BYTES,
  parkineoTrackCycleLabel,
  type ParkineoTrackPublic,
} from '@/lib/parkineo-tracks'
import {
  registerYouTubeEmbed,
  releaseYouTubePlay,
  requestYouTubePlay,
  subscribeYouTubePlay,
} from '@/lib/youtube-play-coordinator'

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif", fontWeight: 900, textTransform: 'uppercase' } as const
const BTN =
  'inline-block border-[3px] border-[var(--ink)] px-5 py-3 no-underline shadow-[4px_4px_0_var(--ink)] transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_var(--ink)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_var(--ink)]'

let sharedAudio: HTMLAudioElement | null = null
let sharedId: string | null = null
const playListeners = new Set<(id: string | null) => void>()

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio()
    sharedAudio.preload = 'none'
  }
  return sharedAudio
}

function setSharedId(id: string | null) {
  sharedId = id
  playListeners.forEach((listener) => listener(id))
}

export function ParkineoTrackPlayButton({
  trackId,
  label,
}: {
  trackId: string
  label: string
}) {
  const [playing, setPlaying] = useState(false)
  const [clock, setClock] = useState('0:00')
  const slot = `parkineo-track-${trackId}`

  useEffect(() => {
    const onId = (id: string | null) => setPlaying(id === trackId)
    playListeners.add(onId)
    onId(sharedId)
    const audio = getSharedAudio()
    const onTime = () => {
      if (sharedId === trackId) setClock(formatTrackLength(audio.currentTime))
    }
    const onEnd = () => {
      if (sharedId !== trackId) return
      releaseYouTubePlay(slot)
      setSharedId(null)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    const unsub = subscribeYouTubePlay((active) => {
      if (active !== slot && sharedId === trackId) setSharedId(null)
    })
    return () => {
      playListeners.delete(onId)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
      unsub()
    }
  }, [slot, trackId])

  const toggle = () => {
    const audio = getSharedAudio()
    const src = `/api/parkineo-audio/${trackId}`
    if (sharedId === trackId && !audio.paused) {
      audio.pause()
      releaseYouTubePlay(slot)
      setSharedId(null)
      return
    }
    requestYouTubePlay(slot)
    registerYouTubeEmbed(slot, () => {
      audio.pause()
      if (sharedId === trackId) setSharedId(null)
    })
    if (audio.getAttribute('src') !== src) audio.src = src
    setSharedId(trackId)
    void audio.play().catch(() => setSharedId(null))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="border-[3px] border-[var(--ink)] bg-[var(--red)] text-white px-3 py-2 cursor-pointer"
      style={{ ...DISPLAY, fontSize: '13px', letterSpacing: '0.5px' }}
    >
      {playing ? `❚❚ ${clock}` : '▶'}
    </button>
  )
}

export default function ParkineoTracks({
  lang,
  tracks,
}: {
  lang: string
  tracks: ParkineoTrackPublic[]
}) {
  const es = lang === 'es'
  const { user, loading } = useAuth()
  const [artistName, setArtistName] = useState('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasPending, setHasPending] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const [marked, setMarked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) {
      setHasPending(false)
      setMarked(new Set())
      return
    }
    let cancelled = false
    void fetch('/api/parkineo/tracks')
      .then((r) => r.json())
      .then((json: { data?: { status?: string }[]; votes?: string[] }) => {
        if (cancelled) return
        setHasPending((json.data || []).some((row) => row.status === 'pending'))
        setMarked(new Set(json.votes || []))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user])

  const submit = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const prepRes = await fetch('/api/parkineo/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare',
          lang: es ? 'es' : 'en',
          artist_name: artistName,
          title,
          confirm,
          bytes: file.size,
        }),
      })
      const prep = await prepRes.json()
      if (!prepRes.ok) {
        setError(prep.error || (es ? 'No se ha podido enviar.' : 'Could not send it.'))
        if (prep.code === 'pending_exists') setHasPending(true)
        return
      }
      const put = await fetch(prep.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'audio/mpeg' },
        body: file,
      })
      if (!put.ok) {
        setError(es ? 'No se ha podido subir el MP3.' : 'The MP3 could not be uploaded.')
        return
      }
      const commitRes = await fetch('/api/parkineo/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          lang: es ? 'es' : 'en',
          artist_name: artistName,
          title,
          confirm,
          path: prep.path,
        }),
      })
      const committed = await commitRes.json()
      if (!commitRes.ok) {
        setError(committed.error || (es ? 'No se ha podido enviar.' : 'Could not send it.'))
        if (committed.code === 'pending_exists') setHasPending(true)
        return
      }
      setHasPending(true)
      setJustSent(true)
      setTitle('')
      setFile(null)
      setConfirm(false)
    } catch {
      setError(es ? 'No se ha podido enviar.' : 'Could not send it.')
    } finally {
      setBusy(false)
    }
  }

  const toggleMark = async (id: string) => {
    if (!user) return
    const was = marked.has(id)
    setMarked((prev) => {
      const next = new Set(prev)
      if (was) next.delete(id)
      else next.add(id)
      return next
    })
    const res = await fetch('/api/parkineo/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vote', id }),
    })
    if (!res.ok) {
      setMarked((prev) => {
        const next = new Set(prev)
        if (was) next.add(id)
        else next.delete(id)
        return next
      })
    }
  }

  const loginHref = `/${lang}/login?next=${encodeURIComponent(`/${lang}/parkineo#tema`)}`
  const ready = artistName.trim() && title.trim() && file && confirm && file.size <= PARKINEO_TRACK_MAX_BYTES
  const fileHint = !file
    ? null
    : file.size > PARKINEO_TRACK_MAX_BYTES
      ? es ? 'Pesa más de 25 MB.' : 'It is over 25 MB.'
      : !file.name.toLowerCase().endsWith('.mp3')
        ? es ? 'Tiene que ser un .mp3.' : 'It has to be a .mp3.'
        : file.name

  return (
    <div>
      <section id="tema" className="scroll-mt-24 px-4 sm:px-6 py-12 sm:py-16 border-b-[5px] border-[var(--ink)] bg-[var(--yellow)]">
        <div className="mx-auto max-w-[1280px] grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <h2 className="m-0" style={{ ...DISPLAY, fontSize: 'clamp(26px, 4vw, 44px)', lineHeight: 0.95, letterSpacing: '-1px' }}>
              {es ? '¿Quieres salir de aquí?' : 'Want to move on from here?'}
            </h2>
            <p className="mt-4 mb-0 max-w-[560px]" style={{ ...MONO, fontSize: '16px', lineHeight: 1.6 }}>
              {es
                ? 'Si ya produces y quieres aspirar a ser artista de la web, mándanos un tema. Lo escuchamos. Si entra, suena aquí y la gente puede marcarlo. Cada semestre destacamos el premio de temas nuevos de Optimal Breaks.'
                : 'If you already produce and you want to aim for an artist page, send us a track. We listen. If it goes in, it plays here and people can mark it. Each half-year we highlight the Optimal Breaks new-tracks prize.'}
            </p>
            <p className="mt-3 mb-0 max-w-[560px]" style={{ ...MONO, fontSize: '14px', lineHeight: 1.6 }}>
              {es
                ? 'Estamos montando sellos colaboradores para publicar el ganador. Todavía no hay uno, y mandar el archivo no lo garantiza. Cuenta para el semestre en el que lo publiquemos. No es una ficha de artista ni abre bookings.'
                : 'We are lining up collaborator labels to release the winner. There is not one yet, and sending the file does not guarantee it. It counts in the half-year we publish it. This is not an artist profile and it does not open bookings.'}
            </p>
          </div>
          <div>
            {loading ? (
              <p className="m-0" style={MONO}>{es ? 'Cargando…' : 'Loading…'}</p>
            ) : !user ? (
              <div className="border-4 border-[var(--ink)] bg-[var(--paper)] p-5 sm:p-7 shadow-[8px_8px_0_var(--ink)]">
                <p className="m-0" style={{ ...DISPLAY, fontSize: 'clamp(20px, 2.6vw, 26px)', lineHeight: 1.1 }}>
                  {es ? 'Entra y manda el tema' : 'Sign in and send the track'}
                </p>
                <p className="mt-3 mb-0" style={{ ...MONO, fontSize: '15px', lineHeight: 1.6 }}>
                  {es
                    ? 'Con la misma cuenta de guardar temas. Un MP3, de un minuto a 15.'
                    : 'With the same account you use to save tracks. One MP3, from a minute to 15.'}
                </p>
                <Link href={loginHref} className={`${BTN} mt-5 bg-[var(--red)] text-white`} style={{ ...DISPLAY, letterSpacing: '1px' }}>
                  {es ? 'Entrar y mandar →' : 'Sign in and send →'}
                </Link>
              </div>
            ) : hasPending ? (
              <div className="border-4 border-[var(--ink)] bg-[var(--paper)] p-5 sm:p-7 shadow-[8px_8px_0_var(--ink)]">
                <p className="m-0" style={{ ...DISPLAY, fontSize: 'clamp(20px, 2.6vw, 26px)', lineHeight: 1.1 }}>
                  {justSent ? (es ? 'Tema en cola' : 'Track in the queue') : es ? 'Ya tienes uno en cola' : 'You already have one in the queue'}
                </p>
                <p className="mt-3 mb-0" style={{ ...MONO, fontSize: '15px', lineHeight: 1.6 }}>
                  {es
                    ? 'Lo escuchamos antes de publicarlo. El estado está en tu cuenta. Cuando salga de la cola podrás mandar otro.'
                    : 'We listen before it goes public. The status is in your account. You can send another once it leaves the queue.'}
                </p>
                <Link href={`/${lang}/mi-cuenta/parkineo`} className="mt-4 inline-block text-[var(--red)]" style={{ ...MONO, fontWeight: 700 }}>
                  {es ? 'Ver mi cuenta →' : 'See my account →'}
                </Link>
              </div>
            ) : (
              <form
                className="border-4 border-[var(--ink)] bg-[var(--paper)] p-5 sm:p-7 shadow-[8px_8px_0_var(--ink)]"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!busy && ready && file?.name.toLowerCase().endsWith('.mp3')) void submit()
                }}
              >
                <h3 className="m-0" style={{ ...DISPLAY, fontSize: '22px', lineHeight: 1.1 }}>
                  {es ? 'Manda tu tema' : 'Send your track'}
                </h3>
                <label className="mt-4 block" style={{ ...MONO, fontSize: '12px', fontWeight: 700 }}>
                  {es ? 'Tu nombre' : 'Your name'}
                  <input
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                    maxLength={60}
                    required
                    className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2"
                    style={{ ...MONO, fontSize: '15px', fontWeight: 400 }}
                  />
                </label>
                <label className="mt-4 block" style={{ ...MONO, fontSize: '12px', fontWeight: 700 }}>
                  {es ? 'Título del tema' : 'Track title'}
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    required
                    className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2"
                    style={{ ...MONO, fontSize: '15px', fontWeight: 400 }}
                  />
                </label>
                <label className="mt-4 block" style={{ ...MONO, fontSize: '12px', fontWeight: 700 }}>
                  MP3
                  <input
                    type="file"
                    accept=".mp3,audio/mpeg"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="mt-1 block w-full"
                    style={{ ...MONO, fontSize: '14px', fontWeight: 400 }}
                  />
                  {fileHint ? <span className="mt-1 block font-normal">{fileHint}</span> : null}
                </label>
                <label className="mt-5 flex items-start gap-3 cursor-pointer" style={{ ...MONO, fontSize: '13px', lineHeight: 1.5 }}>
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                    className="mt-[2px] h-5 w-5 shrink-0 accent-[var(--red)]"
                  />
                  <span>
                    {es
                      ? 'Este tema lo he producido yo y es breakbeat. Optimal Breaks puede escucharlo y, si entra, publicarlo aquí para que se vote. Puede no publicarlo o quitarlo.'
                      : 'I produced this track and it is breakbeat. Optimal Breaks may listen to it and, if it goes in, publish it here so people can mark it. They may choose not to publish it, or take it down.'}
                  </span>
                </label>
                {error ? (
                  <p role="alert" className="mt-4 mb-0 p-3 bg-[var(--red)] text-white" style={{ ...MONO, fontSize: '13px' }}>{error}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={busy || !ready || !file?.name.toLowerCase().endsWith('.mp3')}
                  className={`${BTN} mt-5 w-full sm:w-auto bg-[var(--red)] text-white cursor-pointer`}
                  style={{ ...DISPLAY, letterSpacing: '1px' }}
                >
                  {busy ? (es ? 'Subiendo el tema…' : 'Uploading the track…') : es ? 'Mandar tema' : 'Send track'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section id="temas" className="scroll-mt-24 px-4 sm:px-6 py-12 sm:py-16 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1280px]">
          <h2 className="m-0" style={{ ...DISPLAY, fontSize: 'clamp(26px, 4vw, 44px)', lineHeight: 1, letterSpacing: '-1px' }}>
            {es ? 'Los temas' : 'The tracks'}
            {tracks.length > 0 ? (
              <span className="ml-3 border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-2 py-1 align-middle" style={{ ...MONO, fontSize: '13px', fontWeight: 700 }}>
                {tracks.length}
              </span>
            ) : null}
          </h2>
          {tracks.length === 0 ? (
            <p className="mt-4 mb-0 max-w-[560px]" style={{ ...MONO, fontSize: '15px', lineHeight: 1.6 }}>
              {es ? 'Todavía no hay temas publicados. El primero puede ser el tuyo.' : 'No tracks published yet. The first one can be yours.'}
            </p>
          ) : (
            <ul className="mt-8 mb-0 p-0 list-none grid gap-4">
              {tracks.map((track) => {
                const cycle = parkineoTrackCycleLabel(track.cycle, es)
                const on = marked.has(track.id)
                return (
                  <li key={track.id} id={`tema-${track.slug}`} className="border-4 border-[var(--ink)] bg-[var(--paper)] p-4 shadow-[4px_4px_0_var(--ink)]">
                    <div className="flex flex-wrap items-center gap-3">
                      <ParkineoTrackPlayButton trackId={track.id} label={track.title} />
                      <div className="min-w-0 flex-1">
                        <p className="m-0" style={{ ...DISPLAY, fontSize: '18px', lineHeight: 1.15 }}>
                          {track.title}
                        </p>
                        <p className="mt-1 mb-0" style={{ ...MONO, fontSize: '13px' }}>
                          {track.artist_name}
                          {' · '}
                          {formatTrackLength(track.duration_seconds)}
                          {cycle ? ` · ${cycle}` : ''}
                        </p>
                      </div>
                      {user ? (
                        <button
                          type="button"
                          onClick={() => void toggleMark(track.id)}
                          aria-pressed={on}
                          className={`border-[3px] border-[var(--ink)] px-3 py-2 cursor-pointer ${on ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)]'}`}
                          style={{ ...MONO, fontWeight: 700, fontSize: '13px' }}
                        >
                          {on ? (es ? '♥ Marcado' : '♥ Marked') : es ? '♡ Marcar' : '♡ Mark'}
                        </button>
                      ) : (
                        <Link href={loginHref} className="border-[3px] border-[var(--ink)] px-3 py-2 text-[var(--ink)] no-underline" style={{ ...MONO, fontWeight: 700, fontSize: '13px' }}>
                          {es ? '♡ Marcar' : '♡ Mark'}
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
