'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatTrackLength, parkineoTrackCycleLabel } from '@/lib/parkineo-tracks'

type Mine = {
  id: string
  slug: string
  dj_name: string
  city: string
  title: string
  platform: string
  duration_minutes: number
  status: 'pending' | 'published' | 'rejected'
  reject_reason: string | null
  created_at: string
}

type MineTrack = {
  id: string
  slug: string
  artist_name: string
  title: string
  duration_seconds: number
  status: 'pending' | 'published' | 'rejected'
  reject_reason: string | null
  cycle: string | null
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const

export default function ParkineoMine({ lang }: { lang: string }) {
  const es = lang === 'es'
  const [rows, setRows] = useState<Mine[] | null>(null)
  const [tracks, setTracks] = useState<MineTrack[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/parkineo')
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || 'error')
        return json.data as Mine[]
      })
      .then((data) => {
        if (!cancelled) setRows(data || [])
      })
      .catch(() => {
        if (!cancelled) setError(es ? 'No se han podido cargar tus sesiones.' : 'Your sessions could not be loaded.')
      })
    void fetch('/api/parkineo/tracks')
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || 'error')
        return (json.data || []) as MineTrack[]
      })
      .then((data) => {
        if (!cancelled) setTracks(data)
      })
      .catch(() => {
        if (!cancelled) setTracks([])
      })
    return () => {
      cancelled = true
    }
  }, [es])

  const pending = (rows || []).some((r) => r.status === 'pending')
  const pendingTrack = (tracks || []).some((r) => r.status === 'pending')

  return (
    <div>
      <h2 className="m-0" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '28px', textTransform: 'uppercase' }}>
        Parkineo
      </h2>
      <p style={{ ...MONO, fontSize: '14px', lineHeight: 1.7, maxWidth: '640px' }}>
        {es
          ? 'Las sesiones que has mandado. La lista pública solo enseña las que ya están publicadas.'
          : 'The sessions you sent. The public list only shows the ones that are published.'}
      </p>
      {pending ? null : (
        <Link
          href={`/${lang}/parkineo#mandar`}
          className="inline-block mb-6 border-[3px] border-[var(--ink)] bg-[var(--red)] px-4 py-2 text-white no-underline"
          style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}
        >
          {es ? 'Mandar una sesión' : 'Send a session'}
        </Link>
      )}
      {error ? <p style={{ ...MONO, color: 'var(--red)' }}>{error}</p> : null}
      {rows === null && !error ? <p style={MONO}>{es ? 'Cargando…' : 'Loading…'}</p> : null}
      {rows && rows.length === 0 ? (
        <p style={{ ...MONO, fontSize: '14px' }}>{es ? 'Todavía no has mandado ninguna.' : 'You have not sent one yet.'}</p>
      ) : null}
      <ul className="list-none p-0 m-0 grid gap-3">
        {(rows || []).map((row) => (
          <li key={row.id} className="border-4 border-[var(--ink)] p-4 bg-[var(--paper)]">
            <p className="m-0" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, textTransform: 'uppercase' }}>
              {row.status === 'published' ? (
                <Link href={`/${lang}/parkineo/${row.slug}`} className="text-inherit no-underline hover:text-[var(--red)]">
                  {row.title}
                </Link>
              ) : (
                row.title
              )}
            </p>
            <p className="mt-1 mb-0" style={{ ...MONO, fontSize: '12px' }}>
              {row.dj_name} · {row.city} · {row.duration_minutes} min · {statusLabel(row.status, es)}
            </p>
            {row.status === 'rejected' && row.reject_reason ? (
              <p className="mt-2 mb-0" style={{ ...MONO, fontSize: '13px' }}>{row.reject_reason}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <h3 className="mt-10 mb-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '22px', textTransform: 'uppercase' }}>
        {es ? 'Temas' : 'Tracks'}
      </h3>
      <p style={{ ...MONO, fontSize: '14px', lineHeight: 1.7, maxWidth: '640px' }}>
        {es
          ? 'Los MP3 que has mandado. Si entra, suena en Parkineo y se puede marcar. El premio del semestre no se otorga solo.'
          : 'The MP3s you sent. If one goes in, it plays on Parkineo and people can mark it. The half-year prize is not awarded automatically.'}
      </p>
      {pendingTrack ? null : (
        <Link
          href={`/${lang}/parkineo#tema`}
          className="inline-block mb-6 border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-4 py-2 text-[var(--ink)] no-underline"
          style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}
        >
          {es ? 'Mandar un tema' : 'Send a track'}
        </Link>
      )}
      {tracks && tracks.length === 0 ? (
        <p style={{ ...MONO, fontSize: '14px' }}>{es ? 'Todavía no has mandado ningún tema.' : 'You have not sent a track yet.'}</p>
      ) : null}
      <ul className="list-none p-0 m-0 grid gap-3">
        {(tracks || []).map((track) => {
          const cycle = parkineoTrackCycleLabel(track.cycle, es)
          return (
            <li key={track.id} className="border-4 border-[var(--ink)] p-4 bg-[var(--paper)]">
              <p className="m-0" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, textTransform: 'uppercase' }}>
                {track.status === 'published' ? (
                  <Link href={`/${lang}/parkineo#tema-${track.slug}`} className="text-inherit no-underline hover:text-[var(--red)]">
                    {track.title}
                  </Link>
                ) : (
                  track.title
                )}
              </p>
              <p className="mt-1 mb-0" style={{ ...MONO, fontSize: '12px' }}>
                {track.artist_name} · {formatTrackLength(track.duration_seconds)}
                {cycle ? ` · ${cycle}` : ''} · {statusLabel(track.status, es)}
              </p>
              {track.status === 'rejected' && track.reject_reason ? (
                <p className="mt-2 mb-0" style={{ ...MONO, fontSize: '13px' }}>{track.reject_reason}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function statusLabel(status: Mine['status'], es: boolean): string {
  if (status === 'pending') return es ? 'EN COLA' : 'IN THE QUEUE'
  if (status === 'published') return es ? 'PUBLICADA' : 'PUBLISHED'
  return es ? 'NO PUBLICADA' : 'NOT PUBLISHED'
}
