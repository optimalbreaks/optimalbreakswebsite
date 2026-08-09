'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  DualHorizontalMini,
  ExecutiveKpiStrip,
  HorizontalRankBars,
  MixPlaysExecutive,
  RatingScatter,
  StatsLegend,
  TopShareDonut,
  rowsToRankByKey,
  sortRowsByValueDescThenLabel,
  EmptyState,
} from '@/components/admin/AdminEngagementCharts'

type Row = Record<string, unknown>

const mono = { fontFamily: "'Courier Prime', monospace" } as const
const display = { fontFamily: "'Unbounded', sans-serif" } as const

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

function Section({
  title,
  hint,
  children,
  accent = 'var(--red)',
}: {
  title: string
  hint?: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <section
      className="flex flex-col h-full border-[3px] border-[var(--ink)] bg-[#fffef6] overflow-hidden"
      style={{ boxShadow: '4px 4px 0 var(--ink)' }}
    >
      <div className="px-4 py-3 border-b-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] relative">
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accent }} />
        <h2 className="text-sm font-black uppercase tracking-wide" style={display}>
          {title}
        </h2>
        {hint && (
          <p className="text-[10px] font-bold opacity-70 mt-1 max-w-2xl leading-relaxed" style={mono}>
            {hint}
          </p>
        )}
      </div>
      <div className="p-4 sm:p-5 flex-1 flex flex-col">{children}</div>
    </section>
  )
}

type Cell = string | number | ReactNode

function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; label: string; align?: 'right' }[]
  rows: Record<string, Cell>[]
  empty: string
}) {
  if (rows.length === 0) return <EmptyState message={empty} />

  return (
    <div className="overflow-x-auto border-[3px] border-[var(--ink)] mt-4">
      <table className="min-w-full text-left" style={mono}>
        <thead className="bg-[var(--ink)] text-[var(--paper)]">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-[var(--ink)]/10">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-[var(--yellow)]/25">
              {columns.map((c) => {
                const v = row[c.key]
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-2 text-[11px] font-bold text-[var(--ink)] ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                  >
                    {v == null || typeof v === 'boolean' ? null : v}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetailToggle({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="mt-4 group">
      <summary
        className="cursor-pointer list-none inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[2px] text-[var(--ink)] hover:text-[var(--red)] transition-colors"
        style={mono}
      >
        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
        {label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

const TABS = [
  { id: 'overview', label: 'General' },
  { id: 'audio', label: 'Audio' },
  { id: 'community', label: 'Comunidad' },
  { id: 'events', label: 'Eventos' },
  { id: 'ratings', label: 'Notas' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function AdminEngagementStatsPage() {
  const { lang } = useParams<{ lang: string }>()
  const base = `/${lang}/administrator`
  const site = `/${lang}`
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('overview')

  useEffect(() => {
    fetch('/api/admin/engagement-stats')
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error((j as { error?: string }).error || r.statusText)
        }
        return r.json()
      })
      .then(setPayload)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const summary = (payload?.mix_plays_summary || {}) as Row
  const trackSummary = (payload?.track_plays_summary || {}) as Row
  const mixTop = Array.isArray(payload?.mix_plays_top) ? (payload!.mix_plays_top as Row[]) : []
  const trackTop = Array.isArray(payload?.track_plays_top) ? (payload!.track_plays_top as Row[]) : []
  const favArt = Array.isArray(payload?.favorite_artists) ? (payload!.favorite_artists as Row[]) : []
  const favLab = Array.isArray(payload?.favorite_labels) ? (payload!.favorite_labels as Row[]) : []
  const favEv = Array.isArray(payload?.favorite_events) ? (payload!.favorite_events as Row[]) : []
  const evEng = Array.isArray(payload?.events_engaged) ? (payload!.events_engaged as Row[]) : []
  const evAtt = Array.isArray(payload?.event_attendance_attending) ? (payload!.event_attendance_attending as Row[]) : []
  const evDone = Array.isArray(payload?.event_attendance_attended) ? (payload!.event_attendance_attended as Row[]) : []
  const savedMx = Array.isArray(payload?.saved_mixes) ? (payload!.saved_mixes as Row[]) : []
  const evRate = Array.isArray(payload?.event_ratings_top) ? (payload!.event_ratings_top as Row[]) : []
  const sightN = Array.isArray(payload?.artist_sightings_count) ? (payload!.artist_sightings_count as Row[]) : []
  const sightR = Array.isArray(payload?.artist_sightings_rated) ? (payload!.artist_sightings_rated as Row[]) : []

  const maxEventEngaged = evEng.length ? num(evEng[0].engaged_users) : 0
  const maxArtistFav = favArt.length ? num(favArt[0].cnt) : 0

  const mixRankRows = useMemo(() => rowsToRankByKey(mixTop, (r) => `${str(r.title)} — ${str(r.artist_name)}`, 'play_count', 12), [mixTop])
  const trackRankRows = useMemo(
    () => rowsToRankByKey(trackTop, (r) => str(r.title) || str(r.canonical_key), 'play_count', 12),
    [trackTop],
  )
  const mixTopSorted = useMemo(
    () => sortRowsByValueDescThenLabel(mixTop, 'play_count', (r) => `${str(r.title)} — ${str(r.artist_name)}`),
    [mixTop],
  )
  const trackTopSorted = useMemo(
    () => sortRowsByValueDescThenLabel(trackTop, 'play_count', (r) => str(r.title) || str(r.canonical_key)),
    [trackTop],
  )
  const favArtSorted = useMemo(() => sortRowsByValueDescThenLabel(favArt, 'cnt', (r) => str(r.name)), [favArt])
  const favLabSorted = useMemo(() => sortRowsByValueDescThenLabel(favLab, 'cnt', (r) => str(r.name)), [favLab])
  const favEvSorted = useMemo(() => sortRowsByValueDescThenLabel(favEv, 'cnt', (r) => str(r.name)), [favEv])
  const sightNSorted = useMemo(
    () => sortRowsByValueDescThenLabel(sightN, 'sightings_count', (r) => str(r.name)),
    [sightN],
  )
  const evAttSorted = useMemo(() => sortRowsByValueDescThenLabel(evAtt, 'cnt', (r) => str(r.name)), [evAtt])
  const evDoneSorted = useMemo(() => sortRowsByValueDescThenLabel(evDone, 'cnt', (r) => str(r.name)), [evDone])
  const eventRatingsScatter = useMemo(
    () =>
      sortRowsByValueDescThenLabel(evRate, 'rating_count', (r) => str(r.name)).map((r) => ({
        name: str(r.name),
        avg_rating: num(r.avg_rating),
        rating_count: num(r.rating_count),
      })),
    [evRate],
  )
  const artistRatedScatter = useMemo(
    () =>
      sortRowsByValueDescThenLabel(sightR, 'rating_count', (r) => str(r.name)).map((r) => ({
        name: str(r.name),
        avg_rating: num(r.avg_rating),
        rating_count: num(r.rating_count),
      })),
    [sightR],
  )

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <Link
            href={base}
            className="inline-block text-[10px] font-black uppercase tracking-[2px] text-[var(--ink)]/50 hover:text-[var(--red)] no-underline mb-3"
            style={mono}
          >
            ← Dashboard
          </Link>
          <span
            className="inline-block px-2.5 py-1 text-[10px] font-black tracking-[4px] uppercase bg-[var(--red)] text-white border-2 border-[var(--ink)] mb-3 ml-2"
            style={mono}
          >
            Analytics
          </span>
          <h1 className="text-3xl sm:text-4xl font-black leading-[0.95] text-[var(--ink)]" style={display}>
            Estadísticas
          </h1>
          <p className="text-sm text-[var(--ink)]/50 mt-2 max-w-xl" style={mono}>
            Plays, favoritos, asistencia a eventos y valoraciones de la comunidad.
          </p>
          {!loading && payload && typeof payload.generated_at === 'string' && (
            <p className="text-[10px] font-bold text-[var(--ink)]/35 mt-2 uppercase tracking-wider" style={mono}>
              Actualizado {new Date(payload.generated_at).toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB')}
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
          <span className="text-2xl animate-pulse">▶</span>
          <span className="text-[11px] font-black uppercase tracking-wider text-[var(--ink)]/50" style={mono}>
            Cargando datos…
          </span>
        </div>
      )}

      {err && (
        <div className="border-[3px] border-[var(--red)] bg-[var(--red)]/10 p-5 mb-8" style={mono}>
          <h3 className="text-sm font-black uppercase text-[var(--red)]">Error al cargar</h3>
          <p className="text-xs font-bold mt-1 text-[var(--ink)]/70">{err}</p>
        </div>
      )}

      {!loading && !err && payload && (
        <div className="space-y-6">
          <ExecutiveKpiStrip
            mixAllTime={num(summary.all_time)}
            mix7d={num(summary.last_7d)}
            trackAllTime={num(trackSummary.all_time)}
            track7d={num(trackSummary.last_7d)}
            maxEventEngaged={maxEventEngaged}
            maxArtistFavorites={maxArtistFav}
          />

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`admin-btn min-h-10 !text-[10px] !px-4 ${tab === t.id ? 'admin-btn--yellow' : 'admin-btn--ghost'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-5">
              <StatsLegend />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <MixPlaysExecutive
                  allTime={num(trackSummary.all_time)}
                  last7d={num(trackSummary.last_7d)}
                  title="Pistas"
                  subtitle="/charts · Mis Tracks · previews Beatport"
                />
                <MixPlaysExecutive
                  allTime={num(summary.all_time)}
                  last7d={num(summary.last_7d)}
                  title="Mixes"
                  subtitle="/mixes · YouTube · SoundCloud"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Artistas favoritos" hint="Corazones en fichas de artista" accent="var(--pink)">
                  <HorizontalRankBars rows={rowsToRankByKey(favArt, (r) => str(r.name), 'cnt', 8)} valueLabel="♥" color="var(--pink)" />
                </Section>
                <Section title="Eventos con más gente" hint="Favoritos + «Voy» + «Asistí»" accent="var(--cyan)">
                  <HorizontalRankBars
                    rows={rowsToRankByKey(evEng, (r) => str(r.name), 'engaged_users', 8)}
                    valueLabel="users"
                    color="var(--cyan)"
                  />
                </Section>
              </div>
            </div>
          )}

          {tab === 'audio' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Top pistas" hint="Lo más reproducido en charts y dashboard" accent="var(--cyan)">
                  <HorizontalRankBars rows={trackRankRows} valueLabel="plays" color="var(--cyan)" />
                  <DetailToggle label="Tabla completa">
                    <DataTable
                      columns={[
                        { key: 'title', label: 'Pista' },
                        { key: 'play_count', label: 'Plays', align: 'right' },
                      ]}
                      rows={trackTopSorted.map((r) => ({
                        title: str(r.title) || str(r.canonical_key),
                        play_count: String(num(r.play_count)),
                      }))}
                      empty="Sin plays de pistas."
                    />
                  </DetailToggle>
                </Section>
                <Section title="¿Quién manda?" hint="Si pocos temas concentran casi todo el listening" accent="var(--yellow)">
                  <TopShareDonut rows={trackTop} valueKey="play_count" labelKey="title" />
                </Section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Top mixes" hint="Reproducciones en /mixes" accent="var(--red)">
                  {mixRankRows.length > 0 ? (
                    <>
                      <HorizontalRankBars rows={mixRankRows} valueLabel="plays" color="var(--red)" />
                      <DetailToggle label="Tabla completa">
                        <DataTable
                          columns={[
                            { key: 'title', label: 'Mix' },
                            { key: 'artist_name', label: 'Artista' },
                            { key: 'play_count', label: 'Plays', align: 'right' },
                          ]}
                          rows={mixTopSorted.map((r) => ({
                            title: (
                              <Link href={`${base}/mixes/${str(r.mix_id)}`} className="text-[var(--red)] hover:underline">
                                {str(r.title)}
                              </Link>
                            ),
                            artist_name: str(r.artist_name),
                            play_count: String(num(r.play_count)),
                          }))}
                          empty="Sin plays de mixes."
                        />
                      </DetailToggle>
                    </>
                  ) : (
                    <EmptyState message="Aún no hay plays de mixes registrados" />
                  )}
                </Section>
                <Section title="Mixes guardados" hint="Añadidos al perfil del usuario" accent="var(--pink)">
                  <HorizontalRankBars
                    rows={rowsToRankByKey(savedMx, (r) => `${str(r.title)}`, 'saves', 8)}
                    valueLabel="guardados"
                    color="var(--pink)"
                  />
                </Section>
              </div>
            </div>
          )}

          {tab === 'community' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Artistas ♥" accent="var(--pink)">
                  <HorizontalRankBars rows={rowsToRankByKey(favArt, (r) => str(r.name), 'cnt', 10)} valueLabel="♥" color="var(--pink)" />
                  <DetailToggle label="Tabla">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Artista' },
                        { key: 'cnt', label: '♥', align: 'right' },
                      ]}
                      rows={favArtSorted.map((r) => ({
                        name: <Link href={`${site}/artists/${str(r.slug)}`} className="text-[var(--red)] hover:underline">{str(r.name)}</Link>,
                        cnt: String(num(r.cnt)),
                      }))}
                      empty="Sin datos."
                    />
                  </DetailToggle>
                </Section>
                <Section title="Sellos ♥" accent="var(--uv)">
                  <HorizontalRankBars rows={rowsToRankByKey(favLab, (r) => str(r.name), 'cnt', 10)} valueLabel="♥" color="var(--uv)" />
                  <DetailToggle label="Tabla">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Sello' },
                        { key: 'cnt', label: '♥', align: 'right' },
                      ]}
                      rows={favLabSorted.map((r) => ({
                        name: <Link href={`${site}/labels/${str(r.slug)}`} className="text-[var(--red)] hover:underline">{str(r.name)}</Link>,
                        cnt: String(num(r.cnt)),
                      }))}
                      empty="Sin datos."
                    />
                  </DetailToggle>
                </Section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Visto en vivo" hint="Avistamientos en ficha de artista" accent="var(--orange)">
                  <HorizontalRankBars rows={rowsToRankByKey(sightN, (r) => str(r.name), 'sightings_count', 10)} valueLabel="veces" color="var(--orange)" />
                  <DetailToggle label="Tabla">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Artista' },
                        { key: 'cnt', label: 'Avist.', align: 'right' },
                      ]}
                      rows={sightNSorted.map((r) => ({
                        name: <Link href={`${site}/artists/${str(r.slug)}`} className="text-[var(--red)] hover:underline">{str(r.name)}</Link>,
                        cnt: String(num(r.sightings_count)),
                      }))}
                      empty="Sin datos."
                    />
                  </DetailToggle>
                </Section>
                <Section title="Eventos ♥" accent="var(--acid)">
                  <HorizontalRankBars rows={rowsToRankByKey(favEv, (r) => str(r.name), 'cnt', 10)} valueLabel="♥" color="var(--acid)" />
                  <DetailToggle label="Tabla">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Evento' },
                        { key: 'cnt', label: '♥', align: 'right' },
                      ]}
                      rows={favEvSorted.map((r) => ({
                        name: <Link href={`${site}/events/${str(r.slug)}`} className="text-[var(--red)] hover:underline">{str(r.name)}</Link>,
                        cnt: String(num(r.cnt)),
                      }))}
                      empty="Sin datos."
                    />
                  </DetailToggle>
                </Section>
              </div>
            </div>
          )}

          {tab === 'events' && (
            <div className="space-y-5">
              <Section title="Eventos con más usuarios implicados" hint="Corazones + asistencia" accent="var(--cyan)">
                <HorizontalRankBars rows={rowsToRankByKey(evEng, (r) => str(r.name), 'engaged_users', 12)} valueLabel="users" color="var(--cyan)" />
              </Section>

              <DualHorizontalMini
                leftTitle="Voy (intención)"
                leftRows={rowsToRankByKey(evAtt, (r) => str(r.name), 'cnt', 8)}
                rightTitle="Asistí (confirmado)"
                rightRows={rowsToRankByKey(evDone, (r) => str(r.name), 'cnt', 8)}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DetailToggle label="Tabla · Voy">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Evento' },
                      { key: 'cnt', label: 'Users', align: 'right' },
                    ]}
                    rows={evAttSorted.map((r) => ({
                      name: <Link href={`${site}/events/${str(r.slug)}`} className="text-[var(--red)] hover:underline">{str(r.name)}</Link>,
                      cnt: String(num(r.cnt)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
                <DetailToggle label="Tabla · Asistí">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Evento' },
                      { key: 'cnt', label: 'Users', align: 'right' },
                    ]}
                    rows={evDoneSorted.map((r) => ({
                      name: <Link href={`${site}/events/${str(r.slug)}`} className="text-[var(--red)] hover:underline">{str(r.name)}</Link>,
                      cnt: String(num(r.cnt)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
              </div>
            </div>
          )}

          {tab === 'ratings' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Eventos valorados" hint="Nota media y número de votos" accent="var(--yellow)">
                  <RatingScatter rows={eventRatingsScatter} />
                  <DetailToggle label="Tabla eventos">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Evento' },
                        { key: 'avg_rating', label: 'Nota' },
                        { key: 'rating_count', label: 'Votos', align: 'right' },
                      ]}
                      rows={sortRowsByValueDescThenLabel(evRate, 'rating_count', (r) => str(r.name)).map((r) => ({
                        name: <Link href={`${site}/events/${str(r.slug)}`} className="text-[var(--red)] hover:underline">{str(r.name)}</Link>,
                        avg_rating: Number(num(r.avg_rating)).toFixed(1) + '★',
                        rating_count: String(num(r.rating_count)),
                      }))}
                      empty="Sin valoraciones."
                    />
                  </DetailToggle>
                </Section>
                <Section title="Artistas en vivo" hint="Valoración tras avistamiento" accent="var(--uv)">
                  <RatingScatter rows={artistRatedScatter} />
                  <DetailToggle label="Tabla artistas">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Artista' },
                        { key: 'avg_rating', label: 'Nota' },
                        { key: 'rating_count', label: 'Votos', align: 'right' },
                      ]}
                      rows={sortRowsByValueDescThenLabel(sightR, 'rating_count', (r) => str(r.name)).map((r) => ({
                        name: <Link href={`${site}/artists/${str(r.slug)}`} className="text-[var(--red)] hover:underline">{str(r.name)}</Link>,
                        avg_rating: Number(num(r.avg_rating)).toFixed(1) + '★',
                        rating_count: String(num(r.rating_count)),
                      }))}
                      empty="Sin valoraciones."
                    />
                  </DetailToggle>
                </Section>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
