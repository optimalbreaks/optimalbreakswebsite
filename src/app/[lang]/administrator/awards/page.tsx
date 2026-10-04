'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { EmptyState, HorizontalRankBars } from '@/components/admin/AdminEngagementCharts'
import { LazyYouTubeEmbed } from '@/components/YouTubeEmbed'
import type { PreviewTrack } from '@/components/DeckAudioProvider'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import { releaseYouTubePlay, requestYouTubePlay, subscribeYouTubePlay } from '@/lib/youtube-play-coordinator'
import type { AwardCategory, AwardEntry, AwardPlayback, AwardsAxis, AwardsBoard, AwardsMode } from '@/lib/awards-board'

const mono = { fontFamily: "'Courier Prime', monospace" } as const
const display = { fontFamily: "'Unbounded', sans-serif" } as const

function num(n: number): string {
  return n.toLocaleString('es-ES')
}

export default function AdminAwardsPage() {
  const { lang } = useParams<{ lang: string }>()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [axis, setAxis] = useState<AwardsAxis>('release')
  const [mode, setMode] = useState<AwardsMode>('public')
  const [board, setBoard] = useState<AwardsBoard | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openYt, setOpenYt] = useState<string | null>(null)
  const [embedSlot, setEmbedSlot] = useState<string | null>(null)
  const preview = usePreviewAudioGated()
  const groupKey = `awards-${year}-${axis}-${mode}`

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setErr(null)
    const q = new URLSearchParams({ year, axis, mode })
    fetch(`/api/admin/awards?${q}`, { signal: ac.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error((j as { error?: string }).error || r.statusText)
        return j as AwardsBoard
      })
      .then((data) => {
        if (!ac.signal.aborted) setBoard(data)
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return
        if (!ac.signal.aborted) setErr(e.message)
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
    return () => ac.abort()
  }, [year, axis, mode])

  useEffect(() => {
    setOpenYt(null)
    setEmbedSlot(null)
  }, [year, axis, mode])

  useEffect(() => {
    return subscribeYouTubePlay((activeId) => {
      setOpenYt((prev) => (prev && activeId !== prev ? null : prev))
    })
  }, [])

  useEffect(() => {
    if (!openYt) setEmbedSlot(null)
  }, [openYt])

  const audioQueue = useMemo(() => collectAudioQueue(board, lang), [board, lang])

  const playingKey = useMemo(() => {
    if (preview.previewGroupKey !== groupKey || !preview.previewPlaying) return null
    const rowKey = preview.previewQueue[preview.previewIndex]?.rowKey || ''
    return rowKey.startsWith('awards:') ? rowKey.slice('awards:'.length) : null
  }, [preview.previewGroupKey, preview.previewPlaying, preview.previewQueue, preview.previewIndex, groupKey])

  const onPlay = useCallback((play: AwardPlayback, slot: string) => {
    if (play.src) {
      setEmbedSlot(null)
      setOpenYt((prev) => {
        if (prev) releaseYouTubePlay(prev)
        return null
      })
      const rowKey = `awards:${play.key}`
      if (
        preview.previewGroupKey === groupKey &&
        preview.previewQueue[preview.previewIndex]?.rowKey === rowKey
      ) {
        preview.togglePreview()
        return
      }
      const idx = audioQueue.findIndex((t) => t.rowKey === rowKey)
      preview.playPreviewQueue(audioQueue, idx >= 0 ? idx : 0, groupKey)
      return
    }
    if (!play.youtube_id) return
    if (openYt === slot) {
      releaseYouTubePlay(slot)
      setEmbedSlot(null)
      setOpenYt(null)
      return
    }
    setEmbedSlot(slot)
    setOpenYt(slot)
    requestYouTubePlay(slot)
  }, [audioQueue, groupKey, openYt, preview])

  const years = board?.years?.length ? board.years : [Number(year) || new Date().getFullYear()]
  const edition = board?.edition
  const coverage = board?.coverage
  const countryPct =
    coverage && coverage.credit_events > 0
      ? Math.round((coverage.credit_events_with_country / coverage.credit_events) * 100)
      : 0

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-5 pb-16">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--red)]" style={mono}>
            BreaksPoll · solo admin
          </p>
          <h1 className="mt-1 text-3xl font-black leading-none sm:text-4xl" style={display}>
            Awards
          </h1>
          <p className="mt-2 max-w-xl text-[11px] font-bold leading-relaxed text-[var(--ink)]/55" style={mono}>
            Cada «+» de Mis Tracks es un voto. Las canciones siguen el Top 100. Artistas, sellos y países
            usan el tablero: sin auto-voto y sin el volcado de un sello fichado.
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 xl:w-auto xl:flex-row xl:flex-wrap xl:items-center xl:justify-end">
          <label className="flex w-full items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] xl:w-auto" style={mono}>
            <span className="shrink-0">Edición</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="min-h-11 w-full border-[3px] border-[var(--ink)] bg-[#fffef6] px-2 text-[13px] font-bold xl:w-auto"
              style={mono}
            >
              <option value="all">Todos los años</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <Toggle
            value={axis}
            onChange={setAxis}
            options={[
              { id: 'release', label: 'Lanzamiento' },
              { id: 'save', label: 'Año del voto' },
            ]}
          />
          <Toggle
            value={mode}
            onChange={setMode}
            options={[
              { id: 'public', label: 'Como en público' },
              { id: 'raw', label: 'Crudo' },
            ]}
          />
        </div>
      </header>

      {mode === 'raw' && (
        <p className="text-[11px] font-bold border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-3 py-2" style={mono}>
          Crudo: entran las listas privadas y el auto-voto. Sirve para auditar, no para nominar.
        </p>
      )}

      {err && (
        <p className="text-[12px] font-bold border-[3px] border-[var(--ink)] bg-[var(--red)] text-white px-3 py-2" style={mono}>
          {err}
        </p>
      )}

      {loading && !board && (
        <p className="text-[12px] font-bold" style={mono}>
          Calculando nominados…
        </p>
      )}

      {board && edition && coverage && (
        <div className={`min-w-0 space-y-5 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Votos" value={num(edition.saves)} sub="«+» de este corte" accent="var(--red)" />
            <Kpi label="Temas" value={num(edition.tracks)} sub="Una canción, una vez" accent="var(--yellow)" />
            <Kpi label="Quién vota" value={num(edition.users)} sub="Cuentas con un «+»" accent="var(--uv)" />
            <Kpi label="Con país" value={`${countryPct}%`} sub="Sin país no hay premio ES" accent="var(--cyan)" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {edition.categories.map((cat) => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                lang={lang}
                playingKey={playingKey}
                openYt={openYt}
                embedSlot={embedSlot}
                onPlay={onPlay}
              />
            ))}
          </div>

          <section className="min-w-0 border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
            <Head title="Por país" hint="Nacionalidad de la ficha en esta edición. Un país compuesto suma en los dos." />
            <div className="p-3 sm:p-4">
              {edition.countries.length === 0 ? (
                <EmptyState message="Sin países en este corte" />
              ) : (
                <>
                  <ul className="divide-y-2 divide-[var(--ink)]/10 sm:hidden">
                    {edition.countries.map((c) => (
                      <li key={c.iso} className="flex items-baseline justify-between gap-3 py-2.5">
                        <span className="min-w-0 break-words text-[13px] font-black" style={display}>{c.name}</span>
                        <span className="shrink-0 text-right text-[10px] font-bold leading-snug" style={mono}>
                          {num(c.save_count)} +
                          <br />
                          {num(c.artist_count)} art. · {num(c.unique_users)} fans
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="min-w-full text-left" style={mono}>
                      <thead className="bg-[var(--ink)] text-[var(--paper)]">
                        <tr>
                          {['País', 'Créditos', 'Artistas', 'Fans'].map((h, i) => (
                            <th key={h} className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider ${i ? 'text-right' : ''}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-[var(--ink)]/10">
                        {edition.countries.map((c) => (
                          <tr key={c.iso} className="hover:bg-[var(--yellow)]/25">
                            <td className="px-3 py-2 text-[12px] font-black">{c.name}</td>
                            <td className="px-3 py-2 text-right text-[12px] font-bold tabular-nums">{num(c.save_count)}</td>
                            <td className="px-3 py-2 text-right text-[12px] font-bold tabular-nums">{num(c.artist_count)}</td>
                            <td className="px-3 py-2 text-right text-[12px] font-bold tabular-nums">{num(c.unique_users)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="min-w-0 border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
            <Head title="Por año de lanzamiento" hint={board.release_years_hint} />
            <div className="grid grid-cols-1 gap-4 p-3 sm:p-4 xl:grid-cols-2">
              <div className="hidden xl:block">
                <HorizontalRankBars
                  rows={board.release_years.slice(0, 12).map((r) => ({ name: r.label, value: r.save_count }))}
                  valueLabel="+"
                  color="var(--red)"
                />
              </div>
              <div className="min-w-0">
                <ul className="divide-y-2 divide-[var(--ink)]/10 xl:hidden">
                  {board.release_years.map((r) => {
                    const slot = `year:${r.label}`
                    const on = !!r.play && (playingKey === r.play.key || openYt === slot)
                    return (
                      <li key={r.label} className="py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[13px] font-black" style={display}>{r.label}</span>
                          <span className="shrink-0 text-[10px] font-bold" style={mono}>
                            {num(r.save_count)} + · {num(r.unique_tracks)} temas
                          </span>
                        </div>
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          {r.play && <PlayButton play={r.play} slot={slot} on={on} onPlay={onPlay} />}
                          <p className="min-w-0 break-words text-[12px] font-bold leading-snug" style={mono}>
                            {r.top_title || '—'}
                          </p>
                        </div>
                        {embedSlot === slot && r.play && <VideoFrame play={r.play} slot={slot} />}
                      </li>
                    )
                  })}
                </ul>
                <div className="hidden overflow-x-auto xl:block">
                  <table className="min-w-full text-left" style={mono}>
                    <thead className="bg-[var(--ink)] text-[var(--paper)]">
                      <tr>
                        {['Año', '+', 'Temas', 'El más votado'].map((h, i) => (
                          <th key={h} className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider ${i === 1 || i === 2 ? 'text-right' : ''}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-[var(--ink)]/10">
                      {board.release_years.map((r) => {
                        const slot = `year:${r.label}`
                        const on = !!r.play && (playingKey === r.play.key || openYt === slot)
                        return (
                          <tr key={r.label}>
                            <td className="whitespace-nowrap px-3 py-2 text-[12px] font-black">{r.label}</td>
                            <td className="px-3 py-2 text-right text-[12px] font-bold tabular-nums">{num(r.save_count)}</td>
                            <td className="px-3 py-2 text-right text-[12px] font-bold tabular-nums">{num(r.unique_tracks)}</td>
                            <td className="max-w-[18rem] px-3 py-2 text-[11px] font-bold">
                              <span className="flex min-w-0 items-center gap-2">
                                {r.play && <PlayButton play={r.play} slot={slot} on={on} onPlay={onPlay} />}
                                <span className="min-w-0 break-words">{r.top_title || '—'}</span>
                              </span>
                              {embedSlot === slot && r.play && <VideoFrame play={r.play} slot={slot} />}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section className="min-w-0 border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
            <Head title="Cobertura" hint="El premio español solo ve fichas con país. Lo de abajo es lo que falta." />
            <div className="grid grid-cols-3 gap-2 p-3 sm:p-4">
              <MiniStat label="Sin año" value={num(coverage.tracks_without_year)} />
              <MiniStat label="Sin ficha" value={num(coverage.orphan_saves)} />
              <MiniStat label="Agregador" value={num(coverage.aggregator_saves)} />
            </div>
            <div className="grid grid-cols-1 gap-4 px-3 pb-4 sm:px-4 lg:grid-cols-2">
              <GapList title="Artistas sin país" rows={coverage.missing_country} empty="Todos los créditos que cuentan tienen país." />
              <GapList title="Sellos sin ficha" rows={coverage.unmatched_labels} empty="Todos los sellos votados tienen ficha." />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string }[]
}) {
  return (
    <div className="flex w-full border-[3px] border-[var(--ink)] xl:w-auto" style={mono}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`min-h-11 flex-1 px-1.5 text-center text-[11px] font-black uppercase leading-tight xl:flex-none xl:px-3 ${
            value === o.id ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[#fffef6] text-[var(--ink)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="relative min-w-0 border-[3px] border-[var(--ink)] bg-[#fffef6] p-3 sm:p-4" style={{ boxShadow: '3px 3px 0 var(--ink)' }}>
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: accent }} />
      <div className="mb-2 text-[10px] font-black uppercase leading-tight tracking-wide text-[var(--ink)]/55" style={mono}>
        {label}
      </div>
      <div className="text-2xl font-black leading-none sm:text-3xl" style={display}>
        {value}
      </div>
      <p className="mt-2 text-[10px] font-bold leading-snug text-[var(--ink)]/45" style={mono}>
        {sub}
      </p>
    </div>
  )
}

function Head({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="border-b-[3px] border-[var(--ink)] bg-[var(--ink)] px-3 py-3 text-[var(--paper)] sm:px-4">
      <h2 className="text-sm font-black uppercase" style={display}>
        {title}
      </h2>
      <p className="text-[10px] font-bold opacity-70 mt-1 leading-relaxed" style={mono}>
        {hint}
      </p>
    </div>
  )
}

function CategoryCard({
  cat,
  lang,
  playingKey,
  openYt,
  embedSlot,
  onPlay,
}: {
  cat: AwardCategory
  lang: string
  playingKey: string | null
  openYt: string | null
  embedSlot: string | null
  onPlay: (play: AwardPlayback, slot: string) => void
}) {
  const winner = cat.entries[0]
  const rest = cat.entries.slice(1)
  return (
    <section className="flex min-w-0 flex-col border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
      <div className="border-b-[3px] border-[var(--ink)] px-3 py-3 sm:px-4">
        <h2 className="text-sm font-black uppercase leading-tight" style={display}>
          {cat.title}
        </h2>
        <p className="mt-1 text-[10px] font-bold leading-relaxed text-[var(--ink)]/50" style={mono}>
          {cat.hint}
        </p>
      </div>
      <div className="flex-1 p-3 sm:p-4">
        {!winner ? (
          <EmptyState message="Nadie entra en este corte" />
        ) : (
          <>
            <div className="border-[3px] border-[var(--ink)] bg-[var(--yellow)]/35 p-3">
              <NomineeRow
                entry={winner}
                lang={lang}
                lead
                slot={`cat:${cat.id}:${winner.rank}`}
                playingKey={playingKey}
                openYt={openYt}
                onPlay={onPlay}
                showVideo={embedSlot === `cat:${cat.id}:${winner.rank}`}
              />
            </div>
            {rest.length > 0 && (
              <ol className="mt-3 space-y-3 border-t-2 border-[var(--ink)]/10 pt-3">
                {rest.map((e) => (
                  <li key={`${cat.id}-${e.rank}`}>
                    <NomineeRow
                      entry={e}
                      lang={lang}
                      slot={`cat:${cat.id}:${e.rank}`}
                      playingKey={playingKey}
                      openYt={openYt}
                      onPlay={onPlay}
                      showVideo={embedSlot === `cat:${cat.id}:${e.rank}`}
                    />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function NomineeRow({
  entry,
  lang,
  lead = false,
  slot,
  playingKey,
  openYt,
  onPlay,
  showVideo = false,
}: {
  entry: AwardEntry
  lang: string
  lead?: boolean
  slot: string
  playingKey: string | null
  openYt: string | null
  onPlay: (play: AwardPlayback, slot: string) => void
  showVideo?: boolean
}) {
  const href =
    entry.slug && entry.kind === 'artist'
      ? `/${lang}/artists/${entry.slug}`
      : entry.slug && entry.kind === 'label'
        ? `/${lang}/labels/${entry.slug}`
        : null
  const title = href ? (
    <Link href={href} className="underline decoration-[var(--ink)]/30 underline-offset-2 hover:text-[var(--red)]">
      {entry.title}
    </Link>
  ) : (
    entry.title
  )
  const on = !!entry.play && (playingKey === entry.play.key || openYt === slot)
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-2.5">
        {entry.play && <PlayButton play={entry.play} slot={slot} on={on} onPlay={onPlay} />}
        {entry.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.image_url} alt="" className={`shrink-0 border-[3px] border-[var(--ink)] object-cover ${lead ? 'h-12 w-12 sm:h-14 sm:w-14' : 'h-10 w-10'}`} />
        ) : (
          <span
            className={`flex shrink-0 items-center justify-center border-[3px] border-[var(--ink)] bg-[var(--yellow)] font-black ${lead ? 'h-12 w-12 text-base sm:h-14 sm:w-14' : 'h-10 w-10 text-xs'}`}
            style={display}
          >
            {entry.rank}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className={`break-words font-black leading-tight ${lead ? 'text-lg sm:text-xl' : 'text-[13px]'}`} style={display}>
            {title}
          </div>
          {entry.detail && (
            <p className="mt-0.5 break-words text-[10px] font-bold leading-snug text-[var(--ink)]/55" style={mono}>
              {entry.detail}
            </p>
          )}
          <p className="mt-1 text-[10px] font-black uppercase leading-snug tracking-wide" style={mono}>
            {num(entry.save_count)} +
            {' · '}
            {num(entry.unique_users)} {entry.unique_users === 1 ? 'fan' : 'fans'}
            {entry.unique_tracks != null ? ` · ${num(entry.unique_tracks)} temas` : ''}
          </p>
        </div>
      </div>
      {showVideo && entry.play && <VideoFrame play={entry.play} slot={slot} />}
    </div>
  )
}

function PlayButton({
  play,
  slot,
  on,
  onPlay,
}: {
  play: AwardPlayback
  slot: string
  on: boolean
  onPlay: (play: AwardPlayback, slot: string) => void
}) {
  if (!play.src && !play.youtube_id) return null
  return (
    <button
      type="button"
      onClick={() => onPlay(play, slot)}
      className={`h-11 w-11 shrink-0 border-[3px] border-[var(--ink)] text-sm font-black leading-none ${
        on ? 'bg-[var(--red)] text-white' : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)]'
      }`}
      style={mono}
      aria-label={on ? `Pausar ${play.title}` : `Reproducir ${play.title}`}
    >
      {on ? '❚❚' : '▶'}
    </button>
  )
}

function VideoFrame({ play, slot }: { play: AwardPlayback; slot: string }) {
  if (!play.youtube_id) return null
  return (
    <div className="mt-3 w-full max-w-xl">
      <LazyYouTubeEmbed
        key={slot}
        videoId={play.youtube_id}
        title={`${play.title} — ${play.artist}`}
        className="border-[3px] border-[var(--ink)]"
        autoplay
        playSlotId={slot}
        nowPlaying={{
          title: play.title,
          artist: play.artist,
          mixName: play.mix_name,
          album: play.label,
          artworkUrl: play.artwork_url,
        }}
      />
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-[3px] border-[var(--ink)] px-2 py-2 text-center">
      <div className="text-lg font-black leading-none sm:text-xl" style={display}>{value}</div>
      <div className="mt-1 text-[9px] font-black uppercase leading-tight tracking-wide text-[var(--ink)]/55" style={mono}>{label}</div>
    </div>
  )
}

function collectAudioQueue(board: AwardsBoard | null, lang: string): PreviewTrack[] {
  if (!board) return []
  const seen = new Set<string>()
  const out: PreviewTrack[] = []
  const push = (play: AwardPlayback | null) => {
    if (!play?.src || seen.has(play.key)) return
    seen.add(play.key)
    out.push({
      rowKey: `awards:${play.key}`,
      src: play.src,
      title: play.title,
      artist: play.artist,
      artworkUrl: play.artwork_url,
      mixName: play.mix_name,
      album: play.label,
      originPath: `/${lang}/administrator/awards`,
    })
  }
  for (const cat of board.edition.categories) {
    for (const entry of cat.entries) push(entry.play)
  }
  for (const row of board.release_years) push(row.play)
  return out
}

function GapList({ title, rows, empty }: { title: string; rows: { name: string; save_count: number; note: string }[]; empty: string }) {
  return (
    <div>
      <h3 className="text-[11px] font-black uppercase tracking-wider mb-2" style={display}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-[11px] font-bold text-[var(--ink)]/50" style={mono}>
          {empty}
        </p>
      ) : (
        <ul className="space-y-1.5" style={mono}>
          {rows.map((r) => (
            <li key={`${r.note}-${r.name}`} className="flex items-baseline justify-between gap-3 text-[11px] font-bold">
              <span className="min-w-0 break-words">
                {r.name}
                <span className="text-[var(--ink)]/45"> · {r.note}</span>
              </span>
              <span className="tabular-nums shrink-0">{num(r.save_count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
