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
  TopShareDonut,
  rowsToRankByKey,
  sortRowsByValueDescThenLabel,
  EmptyState,
} from '@/components/admin/AdminEngagementCharts'

type Row = Record<string, unknown>

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

/* ------------------------------------------------------------------ */
/*  Section wrapper — clean modern card                                */
/* ------------------------------------------------------------------ */

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-base font-semibold text-gray-900 leading-tight">
          {title}
        </h2>
        {hint && (
          <p className="text-xs text-gray-500 mt-1 max-w-2xl leading-relaxed">
            {hint}
          </p>
        )}
      </div>
      <div className="p-6 flex-1 flex flex-col">{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Data table with clean design                                      */
/* ------------------------------------------------------------------ */

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
  if (rows.length === 0) {
    return <EmptyState message={empty} />
  }
  return (
    <div className="overflow-x-auto ring-1 ring-gray-200 rounded-xl mt-6">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50/50 transition-colors">
              {columns.map((c) => {
                const v = row[c.key]
                return (
                  <td
                    key={c.key}
                    className={`px-4 py-3 whitespace-nowrap text-gray-700 ${c.align === 'right' ? 'text-right tabular-nums font-medium' : ''}`}
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
    <details className="mt-6 group">
      <summary
        className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider
          text-gray-500 hover:text-indigo-600 transition-colors"
      >
        <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {label}
      </summary>
      <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">{children}</div>
    </details>
  )
}

/* ------------------------------------------------------------------ */
/*  Tabs for switching views                                          */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'overview', label: 'General', icon: '📊' },
  { id: 'audio', label: 'Mixes & Audio', icon: '🎧' },
  { id: 'community', label: 'Comunidad & Favoritos', icon: '❤️' },
  { id: 'events', label: 'Eventos & Asistencia', icon: '⚡' },
  { id: 'ratings', label: 'Valoraciones', icon: '⭐' },
] as const

type TabId = (typeof TABS)[number]['id']

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */

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
  const mixTop = Array.isArray(payload?.mix_plays_top) ? (payload!.mix_plays_top as Row[]) : []
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

  const mixRankRows = useMemo(() => rowsToRankByKey(mixTop, (r) => `${str(r.title)} — ${str(r.artist_name)}`, 'play_count', 16), [mixTop])
  const mixTopSorted = useMemo(
    () => sortRowsByValueDescThenLabel(mixTop, 'play_count', (r) => `${str(r.title)} — ${str(r.artist_name)}`),
    [mixTop],
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
    <div className="max-w-[1400px] mx-auto pb-20 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10 pt-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Link href={base} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <span className="text-xs font-bold tracking-widest uppercase text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
              Panel de Control
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            Estadísticas & Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl">
            Métricas de participación, reproducciones de audio y comportamiento de los usuarios en la plataforma Optimal Breaks.
          </p>
        </div>
      </div>

      {/* Loading / Error states */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-gray-500">Recopilando datos…</span>
        </div>
      )}
      
      {err && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 mb-8 flex items-start gap-4">
          <div className="p-2 bg-rose-100 rounded-full text-rose-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-rose-800">No se pudieron cargar las estadísticas</h3>
            <p className="text-sm text-rose-600 mt-1">{err}</p>
          </div>
        </div>
      )}

      {!loading && !err && payload && (
        <div className="space-y-8">
          {/* KPI strip at the top */}
          <ExecutiveKpiStrip
            mixAllTime={num(summary.all_time)}
            mix7d={num(summary.last_7d)}
            maxEventEngaged={maxEventEngaged}
            maxArtistFavorites={maxArtistFav}
          />

          {/* Modern Tabs */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-1 inline-flex flex-wrap gap-1 w-full sm:w-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex-1 sm:flex-none justify-center
                  ${tab === t.id
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100/50'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* ============================================================ */}
          {/*  TAB: Overview                                                */}
          {/* ============================================================ */}
          {tab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <MixPlaysExecutive allTime={num(summary.all_time)} last7d={num(summary.last_7d)} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Top Artistas Favoritos" hint="Los más seguidos por la comunidad.">
                  <HorizontalRankBars rows={rowsToRankByKey(favArt, (r) => str(r.name), 'cnt', 8)} valueLabel="Corazones" />
                </Section>
                <Section title="Eventos Destacados" hint="Top eventos por engagement de usuarios (asistencia + favoritos).">
                  <HorizontalRankBars rows={rowsToRankByKey(evEng, (r) => str(r.name), 'engaged_users', 8)} valueLabel="Usuarios" color="#0ea5e9" />
                </Section>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: Audio                                                   */}
          {/* ============================================================ */}
          {tab === 'audio' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <MixPlaysExecutive allTime={num(summary.all_time)} last7d={num(summary.last_7d)} />
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <Section title="Ranking Completo de Mixes" hint="El top 15 de los más escuchados históricamente.">
                    <HorizontalRankBars rows={mixRankRows} valueLabel="Plays" maxHeight={500} />
                    <DetailToggle label="Ver tabla completa de reproducciones">
                      <DataTable
                        columns={[
                          { key: 'title', label: 'Mix' },
                          { key: 'artist_name', label: 'Artista' },
                          { key: 'play_count', label: 'Reproducciones', align: 'right' },
                        ]}
                        rows={mixTopSorted.map((r) => ({
                          title: (
                            <Link href={`${base}/mixes/${str(r.mix_id)}`} className="text-indigo-600 hover:underline font-medium">
                              {str(r.title)}
                            </Link>
                          ),
                          artist_name: str(r.artist_name),
                          play_count: String(num(r.play_count)),
                        }))}
                        empty="Aún no hay reproducciones registradas."
                      />
                    </DetailToggle>
                  </Section>
                </div>
                <div className="lg:col-span-1 space-y-6">
                  <Section title="Concentración de escuchas" hint="Comparativa del Top 5 frente al resto de los registrados.">
                    <TopShareDonut rows={mixTop} valueKey="play_count" labelKey="title" />
                  </Section>
                  <Section title="Mixes Guardados" hint="Añadidos a favoritos en el dashboard del usuario.">
                    <HorizontalRankBars rows={rowsToRankByKey(savedMx, (r) => `${str(r.title)}`, 'saves', 5)} valueLabel="Guardados" color="#f43f5e" maxHeight={250} />
                  </Section>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: Community                                               */}
          {/* ============================================================ */}
          {tab === 'community' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Artistas Favoritos">
                  <HorizontalRankBars rows={rowsToRankByKey(favArt, (r) => str(r.name), 'cnt', 10)} valueLabel="Corazones" />
                  <DetailToggle label="Tabla detallada">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Artista' },
                        { key: 'cnt', label: 'Favoritos', align: 'right' },
                      ]}
                      rows={favArtSorted.map((r) => ({
                        name: <Link href={`${site}/artists/${str(r.slug)}`} className="text-indigo-600 hover:underline font-medium">{str(r.name)}</Link>,
                        cnt: String(num(r.cnt)),
                      }))}
                      empty="Sin datos."
                    />
                  </DetailToggle>
                </Section>
                
                <Section title="Sellos Discográficos Favoritos">
                  <HorizontalRankBars rows={rowsToRankByKey(favLab, (r) => str(r.name), 'cnt', 10)} valueLabel="Corazones" color="#8b5cf6" />
                  <DetailToggle label="Tabla detallada">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Sello' },
                        { key: 'cnt', label: 'Favoritos', align: 'right' },
                      ]}
                      rows={favLabSorted.map((r) => ({
                        name: <Link href={`${site}/labels/${str(r.slug)}`} className="text-indigo-600 hover:underline font-medium">{str(r.name)}</Link>,
                        cnt: String(num(r.cnt)),
                      }))}
                      empty="Sin datos."
                    />
                  </DetailToggle>
                </Section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Avistamientos en vivo" hint="Usuarios que marcan 'Visto en vivo' en la ficha de un artista.">
                  <HorizontalRankBars rows={rowsToRankByKey(sightN, (r) => str(r.name), 'sightings_count', 10)} valueLabel="Registros" color="#f59e0b" />
                  <DetailToggle label="Tabla detallada">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Artista' },
                        { key: 'cnt', label: 'Avistamientos', align: 'right' },
                      ]}
                      rows={sightNSorted.map((r) => ({
                        name: <Link href={`${site}/artists/${str(r.slug)}`} className="text-indigo-600 hover:underline font-medium">{str(r.name)}</Link>,
                        cnt: String(num(r.sightings_count)),
                      }))}
                      empty="Sin datos."
                    />
                  </DetailToggle>
                </Section>
                
                <Section title="Eventos Favoritos" hint="Corazones en eventos del calendario o crónicas.">
                  <HorizontalRankBars rows={rowsToRankByKey(favEv, (r) => str(r.name), 'cnt', 10)} valueLabel="Corazones" color="#ec4899" />
                  <DetailToggle label="Tabla detallada">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Evento' },
                        { key: 'cnt', label: 'Favoritos', align: 'right' },
                      ]}
                      rows={favEvSorted.map((r) => ({
                        name: <Link href={`${site}/events/${str(r.slug)}`} className="text-indigo-600 hover:underline font-medium">{str(r.name)}</Link>,
                        cnt: String(num(r.cnt)),
                      }))}
                      empty="Sin datos."
                    />
                  </DetailToggle>
                </Section>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: Events                                                  */}
          {/* ============================================================ */}
          {tab === 'events' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <Section title="Eventos con más usuarios implicados" hint="Unifica asistentes confirmados ('Voy', 'Asistí') y Favoritos.">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <HorizontalRankBars rows={rowsToRankByKey(evEng, (r) => str(r.name), 'engaged_users', 10)} valueLabel="Usuarios" />
                  </div>
                  <div className="lg:col-span-1 flex flex-col justify-center">
                    <TopShareDonut rows={evEng} valueKey="engaged_users" labelKey="name" />
                  </div>
                </div>
              </Section>

              <DualHorizontalMini
                leftTitle="Intención de asistencia (Voy)"
                leftRows={rowsToRankByKey(evAtt, (r) => str(r.name), 'cnt', 8)}
                rightTitle="Asistencia confirmada (Asistí)"
                rightRows={rowsToRankByKey(evDone, (r) => str(r.name), 'cnt', 8)}
              />
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <DetailToggle label="Ver tabla: Marcados como VOY">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Evento' },
                      { key: 'cnt', label: 'Usuarios', align: 'right' },
                    ]}
                    rows={evAttSorted.map((r) => ({
                      name: <Link href={`${site}/events/${str(r.slug)}`} className="text-indigo-600 hover:underline font-medium">{str(r.name)}</Link>,
                      cnt: String(num(r.cnt)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
                <DetailToggle label="Ver tabla: Marcados como ASISTÍ">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Evento' },
                      { key: 'cnt', label: 'Usuarios', align: 'right' },
                    ]}
                    rows={evDoneSorted.map((r) => ({
                      name: <Link href={`${site}/events/${str(r.slug)}`} className="text-indigo-600 hover:underline font-medium">{str(r.name)}</Link>,
                      cnt: String(num(r.cnt)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: Ratings                                                 */}
          {/* ============================================================ */}
          {tab === 'ratings' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Eventos: Relación Nota vs. Volumen" hint="Permite ver si los mejor valorados son los más multitudinarios.">
                  <RatingScatter rows={eventRatingsScatter} />
                </Section>
                <Section title="Artistas en vivo: Nota vs. Volumen">
                  <RatingScatter rows={artistRatedScatter} />
                </Section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Eventos mejor valorados">
                  <HorizontalRankBars
                    rows={rowsToRankByKey(evRate, (r) => str(r.name), 'avg_rating', 10)}
                    valueLabel="Media ★"
                    color="#f59e0b"
                  />
                  <DetailToggle label="Tabla de valoraciones (Eventos)">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Evento' },
                        { key: 'avg_rating', label: 'Nota Media' },
                        { key: 'rating_count', label: 'Votos', align: 'right' },
                      ]}
                      rows={sortRowsByValueDescThenLabel(evRate, 'rating_count', (r) => str(r.name)).map((r) => ({
                        name: <Link href={`${site}/events/${str(r.slug)}`} className="text-indigo-600 hover:underline font-medium">{str(r.name)}</Link>,
                        avg_rating: Number(num(r.avg_rating)).toFixed(2),
                        rating_count: String(num(r.rating_count)),
                      }))}
                      empty="No hay valoraciones de eventos."
                    />
                  </DetailToggle>
                </Section>

                <Section title="Artistas mejor valorados (en vivo)">
                  <HorizontalRankBars
                    rows={rowsToRankByKey(sightR, (r) => str(r.name), 'avg_rating', 10)}
                    valueLabel="Media ★"
                    color="#10b981"
                  />
                  <DetailToggle label="Tabla de valoraciones (Artistas)">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Artista' },
                        { key: 'avg_rating', label: 'Nota Media' },
                        { key: 'rating_count', label: 'Votos', align: 'right' },
                      ]}
                      rows={sortRowsByValueDescThenLabel(sightR, 'rating_count', (r) => str(r.name)).map((r) => ({
                        name: <Link href={`${site}/artists/${str(r.slug)}`} className="text-indigo-600 hover:underline font-medium">{str(r.name)}</Link>,
                        avg_rating: Number(num(r.avg_rating)).toFixed(2),
                        rating_count: String(num(r.rating_count)),
                      }))}
                      empty="No hay valoraciones de avistamientos."
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
