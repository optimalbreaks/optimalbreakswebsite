'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ParkineoPlayer, { type ParkineoPlayable } from '@/components/ParkineoPlayer'
import { ParkineoTrackPlayButton } from '@/components/ParkineoTracks'
import { formatTrackLength, parkineoTrackCycleLabel } from '@/lib/parkineo-tracks'
import { parkineoWhatsAppHref } from '@/lib/parkineo'

type Row = ParkineoPlayable & {
  user_id: string
  city: string
  contact_phone: string | null
  source_url: string
  duration_minutes: number | null
  slug: string
  status: 'pending' | 'published' | 'rejected'
  reject_reason: string | null
  created_at: string
  account_name: string | null
  account_email: string | null
}

type Listen = {
  plays: number
  plays7d: number
  accounts: number
  anonymous: number
  lastAt: string | null
  hearts?: number
}

type ParkineoStats = {
  playsReady: boolean
  sessions: Listen
  tracks: Listen
  bySession: Record<string, Listen>
  byTrack: Record<string, Listen>
}

type TrackRow = {
  id: string
  user_id: string
  artist_name: string
  title: string
  duration_seconds: number
  status: 'pending' | 'published' | 'rejected'
  reject_reason: string | null
  cycle: string | null
  votes: number
  account_name: string | null
  account_email: string | null
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const

function madridStamp(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(d)
}

function shortListen(row: Listen | undefined, extra: 'hearts' | 'marks', marks?: number): string {
  const plays = row?.plays ?? 0
  const bits = [`${plays} ${plays === 1 ? 'escucha' : 'escuchas'}`]
  if (extra === 'hearts') {
    const hearts = row?.hearts ?? 0
    bits.push(`${hearts} ${hearts === 1 ? 'corazón' : 'corazones'}`)
  } else {
    const n = marks ?? 0
    bits.push(`${n} ${n === 1 ? 'marca' : 'marcas'}`)
  }
  return bits.join(' · ')
}

function listenBits(row: Listen | undefined, marks?: number): string {
  const plays = row?.plays ?? 0
  const accounts = row?.accounts ?? 0
  const parts = [
    `${plays} ${plays === 1 ? 'escucha' : 'escuchas'}`,
    `${accounts} ${accounts === 1 ? 'cuenta' : 'cuentas'}`,
  ]
  if ((row?.anonymous ?? 0) > 0) parts.push(`${row?.anonymous} anónimas`)
  if (row?.hearts != null) parts.push(`${row.hearts} ${row.hearts === 1 ? 'corazón' : 'corazones'}`)
  if (marks != null) parts.push(`${marks} ${marks === 1 ? 'marca' : 'marcas'}`)
  const last = madridStamp(row?.lastAt)
  if (last) parts.push(`última ${last}`)
  return parts.join(' · ')
}

function sessionWhatsApp(row: Pick<Row, 'contact_phone' | 'status' | 'dj_name' | 'title' | 'slug'>): string | null {
  if (!row.contact_phone) return null
  const text =
    row.status === 'published'
      ? `Hola ${row.dj_name}, hemos publicado tu sesión «${row.title}» en Parkineo: https://www.optimalbreaks.com/es/parkineo/${row.slug}`
      : `Hola ${row.dj_name}, te escribimos de Optimal Breaks por tu sesión «${row.title}».`
  return parkineoWhatsAppHref(row.contact_phone, text)
}

export default function ParkineoAdminPage() {
  const params = useParams<{ lang: string }>()
  const lang = params.lang || 'es'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [stats, setStats] = useState<ParkineoStats | null>(null)
  const [tracks, setTracks] = useState<TrackRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [trackReasons, setTrackReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/admin/parkineo')
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'No se ha podido cargar la cola')
      setRows([])
      return
    }
    setRows(json.data || [])
    setStats(json.stats || null)
    const tracksRes = await fetch('/api/admin/parkineo/tracks')
    const tracksJson = await tracksRes.json()
    if (!tracksRes.ok) {
      setError(tracksJson.error || 'No se ha podido cargar la cola de temas')
      setTracks([])
      return
    }
    setTracks(tracksJson.data || [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (id: string, action: 'publish' | 'reject') => {
    setBusy(id)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/parkineo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, reason: reasons[id] || '' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'No se ha guardado')
        return
      }
      if (action === 'publish') {
        setNotice(
          json.mail === 'sent'
            ? 'Publicada. Le ha llegado un correo a su cuenta.'
            : json.mail === 'skipped_no_email'
              ? 'Publicada. Su cuenta no tiene el correo confirmado, así que el aviso no ha salido.'
              : 'Publicada. El correo no ha salido: míralo en Correos.',
        )
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  const decideTrack = async (id: string, action: 'publish' | 'reject') => {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch('/api/admin/parkineo/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, reason: trackReasons[id] || '' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'No se ha guardado')
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  const pending = (rows || []).filter((r) => r.status === 'pending').length
  const pendingTracks = (tracks || []).filter((r) => r.status === 'pending').length
  const rankedSessions = [...(rows || [])]
    .filter((row) => row.status === 'published' || (stats?.bySession[row.id]?.plays || 0) > 0)
    .sort((a, b) => {
      const pa = stats?.bySession[a.id]?.plays || 0
      const pb = stats?.bySession[b.id]?.plays || 0
      if (pb !== pa) return pb - pa
      const ha = stats?.bySession[a.id]?.hearts || 0
      const hb = stats?.bySession[b.id]?.hearts || 0
      return hb - ha
    })
  const rankedTracks = [...(tracks || [])]
    .filter((row) => row.status === 'published' || (stats?.byTrack[row.id]?.plays || 0) > 0)
    .sort((a, b) => {
      const pa = stats?.byTrack[a.id]?.plays || 0
      const pb = stats?.byTrack[b.id]?.plays || 0
      if (pb !== pa) return pb - pa
      return b.votes - a.votes
    })

  return (
    <div>
      <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '32px', textTransform: 'uppercase', marginTop: 0 }}>
        Parkineo
      </h1>
      <p style={{ ...MONO, fontSize: '13px', lineHeight: 1.6 }}>
        {pending} sesiones en cola. {pendingTracks} temas en cola. Publicar los saca en <Link href={`/${lang}/parkineo`}>/{lang}/parkineo</Link>.
        El tema no crea ficha de artista, no entra en Mixes y su marca no cuenta en el Top 100. El premio del semestre se mira aquí, no se otorga solo.
      </p>
      {stats ? (
        <section className="mb-8 border-4 border-[var(--ink)] bg-[var(--paper)] p-4">
          <h2 className="mt-0 mb-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
            Escuchas
          </h2>
          <p className="mt-0 mb-3" style={{ ...MONO, fontSize: '13px', lineHeight: 1.6 }}>
            {stats.playsReady
              ? 'Cada play en la web pública cuenta una vez por pestaña. Este panel no cuenta. El número empieza ahora: lo anterior no se guardaba. El corazón y las marcas sí.'
              : 'El corazón y las marcas sí se leen. El recuento de escuchas aún no está en la base.'}
            {' '}No se enseña en la página pública.
          </p>
          <p className="mt-0 mb-4" style={{ ...MONO, fontSize: '13px', lineHeight: 1.6 }}>
            Sesiones: {listenBits(stats.sessions)}.
            {stats.sessions.plays7d ? ` ${stats.sessions.plays7d} en 7 días.` : ''}
            <br />
            Temas: {listenBits(stats.tracks, (tracks || []).reduce((sum, track) => sum + track.votes, 0))}.
            {stats.tracks.plays7d ? ` ${stats.tracks.plays7d} en 7 días.` : ''}
          </p>
          <h3 className="mt-0 mb-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '14px', textTransform: 'uppercase' }}>
            Sesiones
          </h3>
          {rankedSessions.length === 0 ? (
            <p style={{ ...MONO, fontSize: '13px' }}>Todavía no hay sesiones publicadas.</p>
          ) : (
            <ol className="m-0 mb-4 p-0 list-none grid gap-2">
              {rankedSessions.map((row, index) => (
                <li key={row.id} className="border-[3px] border-[var(--ink)] px-3 py-2" style={{ ...MONO, fontSize: '13px', lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 700 }}>{index + 1}. {row.title}</span>
                  {' · '}
                  {row.dj_name}
                  {' · '}
                  {row.status === 'published' ? 'publicada' : row.status === 'pending' ? 'en cola' : 'descartada'}
                  <br />
                  {listenBits(stats.bySession[row.id] || { plays: 0, plays7d: 0, accounts: 0, anonymous: 0, lastAt: null, hearts: 0 })}
                </li>
              ))}
            </ol>
          )}
          <h3 className="mt-0 mb-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '14px', textTransform: 'uppercase' }}>
            Temas
          </h3>
          {rankedTracks.length === 0 ? (
            <p className="mb-0" style={{ ...MONO, fontSize: '13px' }}>Todavía no hay temas publicados.</p>
          ) : (
            <ol className="m-0 p-0 list-none grid gap-2">
              {rankedTracks.map((track, index) => (
                <li key={track.id} className="border-[3px] border-[var(--ink)] px-3 py-2" style={{ ...MONO, fontSize: '13px', lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 700 }}>{index + 1}. {track.title}</span>
                  {' · '}
                  {track.artist_name}
                  {' · '}
                  {track.status === 'published' ? 'publicado' : track.status === 'pending' ? 'en cola' : 'descartado'}
                  <br />
                  {listenBits(stats.byTrack[track.id], track.votes)}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
      {notice ? <p className="p-3 bg-[var(--yellow)] border-[3px] border-[var(--ink)]" style={MONO}>{notice}</p> : null}
      {error ? <p className="p-3 bg-[var(--red)] text-white" style={MONO}>{error}</p> : null}
      {rows === null ? <p style={MONO}>Cargando…</p> : null}
      <div className="grid gap-6">
        {(rows || []).map((row) => (
          <article key={row.id} className="border-4 border-[var(--ink)] bg-[var(--paper)] overflow-hidden">
            <div className="grid lg:grid-cols-[minmax(0,420px)_1fr]">
              <ParkineoPlayer session={row} />
              <div className="p-4">
                <p className="m-0" style={{ ...MONO, fontSize: '11px', letterSpacing: '1px' }}>
                  {row.status === 'pending' ? 'EN COLA' : row.status === 'published' ? 'PUBLICADA' : 'DESCARTADA'}
                  {' · '}
                  {row.platform.toUpperCase()}
                  {' · '}
                  {row.duration_minutes != null ? `${row.duration_minutes} min` : 'SIN DURACIÓN'}
                  {stats ? ` · ${shortListen(stats.bySession[row.id], 'hearts')}` : ''}
                </p>
                <h2 className="mt-1 mb-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '20px', textTransform: 'uppercase' }}>
                  {row.title}
                </h2>
                <p className="m-0" style={{ ...MONO, fontSize: '13px', lineHeight: 1.5 }}>
                  {row.dj_name} · {row.city}
                  <br />
                  {row.account_name || 'Sin nombre'}{row.account_email ? ` · ${row.account_email}` : ''}
                  {' · '}
                  <Link href={`/${lang}/administrator/users/${row.user_id}`}>Cuenta</Link>
                  {row.contact_phone ? (
                    <>
                      {' · '}
                      <a href={`tel:${row.contact_phone.replace(/[^\d+]/g, '')}`}>{row.contact_phone}</a>
                      {sessionWhatsApp(row) ? (
                        <>
                          {' · '}
                          <a href={sessionWhatsApp(row) || '#'} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {' · '}
                      Sin móvil
                    </>
                  )}
                  {' · '}
                  <a href={row.source_url} target="_blank" rel="noopener noreferrer">Enlace</a>
                  {row.status === 'published' ? (
                    <>
                      {' · '}
                      <Link href={`/${lang}/parkineo/${row.slug}`}>Ficha</Link>
                    </>
                  ) : null}
                </p>
                {row.reject_reason ? (
                  <p className="mt-2 mb-0" style={{ ...MONO, fontSize: '13px' }}>{row.reject_reason}</p>
                ) : null}
                <label className="block mt-3" style={{ ...MONO, fontSize: '11px' }}>
                  Nota al descartar (la ve en su cuenta)
                  <input
                    value={reasons[row.id] ?? row.reject_reason ?? ''}
                    onChange={(e) => setReasons((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    maxLength={280}
                    className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-2 py-2"
                    style={{ ...MONO, fontSize: '13px' }}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.status !== 'published' ? (
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void decide(row.id, 'publish')}
                      className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-3 py-2 cursor-pointer"
                      style={{ ...MONO, fontWeight: 700 }}
                    >
                      Publicar
                    </button>
                  ) : null}
                  {row.status !== 'rejected' ? (
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void decide(row.id, 'reject')}
                      className="border-[3px] border-[var(--ink)] bg-[var(--red)] px-3 py-2 text-white cursor-pointer"
                      style={{ ...MONO, fontWeight: 700 }}
                    >
                      Descartar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <h2 className="mt-12" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '24px', textTransform: 'uppercase' }}>
        Temas
      </h2>
      <p style={{ ...MONO, fontSize: '13px', lineHeight: 1.6 }}>
        MP3 de un minuto a 15. La marca es el voto del semestre. No se enseña el número en la web.
      </p>
      {tracks === null ? <p style={MONO}>Cargando temas…</p> : null}
      <div className="grid gap-4">
        {(tracks || []).map((track) => (
          <article key={track.id} className="border-4 border-[var(--ink)] bg-[var(--paper)] p-4">
            <p className="m-0" style={{ ...MONO, fontSize: '11px', letterSpacing: '1px' }}>
              {track.status === 'pending' ? 'EN COLA' : track.status === 'published' ? 'PUBLICADO' : 'DESCARTADO'}
              {' · '}
              {formatTrackLength(track.duration_seconds)}
              {' · '}
              {stats ? shortListen(stats.byTrack[track.id], 'marks', track.votes) : `${track.votes} ${track.votes === 1 ? 'marca' : 'marcas'}`}
              {parkineoTrackCycleLabel(track.cycle, true) ? ` · ${parkineoTrackCycleLabel(track.cycle, true)}` : ''}
            </p>
            <h3 className="mt-1 mb-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '18px', textTransform: 'uppercase' }}>
              {track.title}
            </h3>
            <p className="m-0" style={{ ...MONO, fontSize: '13px', lineHeight: 1.5 }}>
              {track.artist_name}
              <br />
              {track.account_name || 'Sin nombre'}{track.account_email ? ` · ${track.account_email}` : ''}
              {' · '}
              <Link href={`/${lang}/administrator/users/${track.user_id}`}>Cuenta</Link>
            </p>
            <div className="mt-3">
              <ParkineoTrackPlayButton trackId={track.id} title={track.title} artist={track.artist_name} />
            </div>
            {track.reject_reason ? (
              <p className="mt-2 mb-0" style={{ ...MONO, fontSize: '13px' }}>{track.reject_reason}</p>
            ) : null}
            <label className="block mt-3" style={{ ...MONO, fontSize: '11px' }}>
              Nota al descartar (la ve en su cuenta)
              <input
                value={trackReasons[track.id] ?? track.reject_reason ?? ''}
                onChange={(e) => setTrackReasons((prev) => ({ ...prev, [track.id]: e.target.value }))}
                maxLength={280}
                className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-2 py-2"
                style={{ ...MONO, fontSize: '13px' }}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {track.status !== 'published' ? (
                <button
                  type="button"
                  disabled={busy === track.id}
                  onClick={() => void decideTrack(track.id, 'publish')}
                  className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-3 py-2 cursor-pointer"
                  style={{ ...MONO, fontWeight: 700 }}
                >
                  Publicar
                </button>
              ) : null}
              {track.status !== 'rejected' ? (
                <button
                  type="button"
                  disabled={busy === track.id}
                  onClick={() => void decideTrack(track.id, 'reject')}
                  className="border-[3px] border-[var(--ink)] bg-[var(--red)] px-3 py-2 text-white cursor-pointer"
                  style={{ ...MONO, fontWeight: 700 }}
                >
                  Descartar
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
