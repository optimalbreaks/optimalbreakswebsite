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
/*  Section wrapper — clean card with optional subtitle                */
/* ------------------------------------------------------------------ */

function Section({
  title,
  hint,
  accent,
  children,
}: {
  title: string
  hint?: string
  accent?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-[3px] border-[var(--ink)] bg-[#fffef6] overflow-hidden">
      <div className="relative px-4 sm:px-5 pt-4 pb-3 border-b-[3px] border-[var(--ink)]/15">
        {accent && (
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accent }} />
        )}
        <h2
          className="text-sm sm:text-base font-black uppercase leading-tight"
          style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
        >
          {title}
        </h2>
        {hint && (
          <p
            className="text-[11px] text-[var(--ink)]/45 mt-1 leading-relaxed max-w-2xl"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {hint}
          </p>
        )}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Data table with clean design                                       */
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
    return (
      <p
        className="text-sm text-[var(--ink)]/40 py-4 text-center"
        style={{ fontFamily: "'Courier Prime', monospace" }}
      >
        {empty}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto border-2 border-[var(--ink)]/20 rounded-sm">
      <table className="w-full text-left text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
        <thead>
          <tr className="bg-[var(--ink)]/5 border-b-2 border-[var(--ink)]/15">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2.5 font-black uppercase text-[9px] tracking-wider text-[var(--ink)]/60
                  ${c.align === 'right' ? 'text-right' : ''}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[var(--ink)]/8 hover:bg-[var(--yellow)]/10 transition-colors"
            >
              {columns.map((c) => {
                const v = row[c.key]
                return (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${c.align === 'right' ? 'text-right tabular-nums font-bold' : ''}`}
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
        className="cursor-pointer list-none inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider
          text-[var(--ink)]/50 hover:text-[var(--ink)] transition-colors"
        style={{ fontFamily: "'Courier Prime', monospace" }}
      >
        <span className="inline group-open:hidden">▸</span>
        <span className="hidden group-open:inline">▾</span>
        {label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

/* ------------------------------------------------------------------ */
/*  Tabs for switching views                                           */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'overview', label: 'Resumen', icon: '◉' },
  { id: 'community', label: 'Comunidad', icon: '♡' },
  { id: 'audio', label: 'Audio', icon: '▶' },
  { id: 'events', label: 'Eventos', icon: '⚡' },
  { id: 'ratings', label: 'Valoraciones', icon: '★' },
] as const

type TabId = (typeof TABS)[number]['id']

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
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
  const evAtt = Array.isArray(payload?.event_attendance_attending)
    ? (payload!.event_attendance_attending as Row[])
    : []
  const evDone = Array.isArray(payload?.event_attendance_attended)
    ? (payload!.event_attendance_attended as Row[])
    : []
  const savedMx = Array.isArray(payload?.saved_mixes) ? (payload!.saved_mixes as Row[]) : []
  const evRate = Array.isArray(payload?.event_ratings_top) ? (payload!.event_ratings_top as Row[]) : []
  const sightN = Array.isArray(payload?.artist_sightings_count)
    ? (payload!.artist_sightings_count as Row[])
    : []
  const sightR = Array.isArray(payload?.artist_sightings_rated)
    ? (payload!.artist_sightings_rated as Row[])
    : []

  const maxEventEngaged = evEng.length ? num(evEng[0].engaged_users) : 0
  const maxArtistFav = favArt.length ? num(favArt[0].cnt) : 0

  const mixRankRows = useMemo(
    () => rowsToRankByKey(mixTop, (r) => `${str(r.title)} — ${str(r.artist_name)}`, 'play_count', 16),
    [mixTop],
  )

  const eventRatingsScatter = useMemo(
    () => evRate.map((r) => ({ name: str(r.name), avg_rating: num(r.avg_rating), rating_count: num(r.rating_count) })),
    [evRate],
  )

  const artistRatedScatter = useMemo(
    () => sightR.map((r) => ({ name: str(r.name), avg_rating: num(r.avg_rating), rating_count: num(r.rating_count) })),
    [sightR],
  )

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <span
            className="inline-block px-2.5 py-1 text-[10px] font-black tracking-[4px] uppercase bg-[var(--uv)] text-white border-2 border-[var(--ink)] mb-3"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Analytics
          </span>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[0.95]"
            style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
          >
            Estadísticas
          </h1>
          <p
            className="text-xs sm:text-sm text-[var(--ink)]/45 mt-2 max-w-2xl leading-relaxed"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Engagement, reproducciones, favoritos, valoraciones y asistencia de la comunidad OB.
          </p>
        </div>
        <Link href={base} className="admin-btn no-underline shrink-0">
          ← Dashboard
        </Link>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-3">
          <div className="w-5 h-5 border-[3px] border-[var(--ink)] border-t-transparent rounded-full animate-spin" />
          <span
            className="text-sm font-bold text-[var(--ink)]/50"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Cargando estadísticas…
          </span>
        </div>
      )}
      {err && (
        <div className="border-[3px] border-[var(--red)] bg-[var(--red)]/5 p-5">
          <p className="!mb-1 font-black text-[var(--red)] text-sm" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            Error
          </p>
          <p className="!mb-0 text-sm text-[var(--ink)]/70" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {err}
          </p>
        </div>
      )}

      {!loading && !err && payload && (
        <>
          {/* KPI strip */}
          <ExecutiveKpiStrip
            mixAllTime={num(summary.all_time)}
            mix7d={num(summary.last_7d)}
            maxEventEngaged={maxEventEngaged}
            maxArtistFavorites={maxArtistFav}
          />

          {/* Tab navigation */}
          <nav
            className="flex flex-wrap gap-1 mb-8 border-b-[3px] border-[var(--ink)]/10 pb-0"
            role="tablist"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 sm:px-4 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider border-[3px] border-b-0
                  transition-all cursor-pointer -mb-[3px]
                  ${tab === t.id
                    ? 'bg-[#fffef6] border-[var(--ink)]/10 border-b-[#fffef6] text-[var(--ink)]'
                    : 'bg-transparent border-transparent text-[var(--ink)]/40 hover:text-[var(--ink)]/70'
                  }`}
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                <span className="mr-1.5">{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </nav>

          {/* ============================================================ */}
          {/*  TAB: Overview                                                */}
          {/* ============================================================ */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <Section title="Reproducciones de mixes" accent="var(--red)"
                hint="Cada play registrado cuando el audio del mix arranca (MP3 o SoundCloud embebido). No incluye previews del chart."
              >
                <MixPlaysExecutive allTime={num(summary.all_time)} last7d={num(summary.last_7d)} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
                  <HorizontalRankBars title="Ranking de plays (top 12)" rows={mixRankRows.slice(0, 12)} valueLabel="Plays" />
                  <TopShareDonut title="Concentración: top 5 vs resto" rows={mixTop} valueKey="play_count" labelKey="title" />
                </div>
              </Section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Top artistas favoritos" accent="var(--pink)">
                  <HorizontalRankBars
                    rows={rowsToRankByKey(favArt, (r) => str(r.name), 'cnt', 10)}
                    valueLabel="Favoritos"
                    maxHeight={320}
                  />
                </Section>
                <Section title="Top eventos favoritos" accent="var(--orange)">
                  <HorizontalRankBars
                    rows={rowsToRankByKey(favEv, (r) => str(r.name), 'cnt', 10)}
                    valueLabel="Corazones"
                    maxHeight={320}
                  />
                </Section>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RatingScatter
                  title="Eventos: nota media vs volumen de valoraciones"
                  rows={eventRatingsScatter}
                />
                <RatingScatter
                  title="Artistas (en vivo): nota media vs valoraciones"
                  rows={artistRatedScatter}
                />
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: Community                                               */}
          {/* ============================================================ */}
          {tab === 'community' && (
            <div className="space-y-6">
              <Section title="Artistas favoritos (corazón)" accent="var(--pink)"
                hint="Cuántos usuarios distintos guardaron cada artista."
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <HorizontalRankBars
                    rows={rowsToRankByKey(favArt, (r) => str(r.name), 'cnt', 14)}
                    valueLabel="Favoritos"
                  />
                  <TopShareDonut rows={favArt} valueKey="cnt" labelKey="name" title="Cuota del top 5" />
                </div>
                <DetailToggle label="Tabla detallada">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Artista' },
                      { key: 'cnt', label: 'Favoritos', align: 'right' },
                    ]}
                    rows={favArt.map((r) => ({
                      name: (
                        <Link href={`${site}/artists/${str(r.slug)}`} className="underline font-bold text-[var(--ink)]">
                          {str(r.name)}
                        </Link>
                      ),
                      cnt: String(num(r.cnt)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
              </Section>

              <Section title="Sellos favoritos" accent="var(--uv)">
                <HorizontalRankBars
                  rows={rowsToRankByKey(favLab, (r) => str(r.name), 'cnt', 14)}
                  valueLabel="Favoritos"
                />
                <DetailToggle label="Tabla detallada">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Sello' },
                      { key: 'cnt', label: 'Favoritos', align: 'right' },
                    ]}
                    rows={favLab.map((r) => ({
                      name: (
                        <Link href={`${site}/labels/${str(r.slug)}`} className="underline font-bold text-[var(--ink)]">
                          {str(r.name)}
                        </Link>
                      ),
                      cnt: String(num(r.cnt)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
              </Section>

              <Section title="Eventos favoritos (corazón)" accent="var(--orange)">
                <HorizontalRankBars
                  rows={rowsToRankByKey(favEv, (r) => str(r.name), 'cnt', 14)}
                  valueLabel="Corazones"
                />
                <DetailToggle label="Tabla detallada">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Evento' },
                      { key: 'cnt', label: 'Corazones', align: 'right' },
                    ]}
                    rows={favEv.map((r) => ({
                      name: (
                        <Link href={`${site}/events/${str(r.slug)}`} className="underline font-bold text-[var(--ink)]">
                          {str(r.name)}
                        </Link>
                      ),
                      cnt: String(num(r.cnt)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
              </Section>

              <Section title="Avistamientos (visto en vivo)" accent="var(--cyan)"
                hint="Cada fila de avistamientos cuenta como una experiencia registrada."
              >
                <HorizontalRankBars
                  rows={rowsToRankByKey(sightN, (r) => str(r.name), 'sightings_count', 14)}
                  valueLabel="Registros"
                />
                <DetailToggle label="Tabla detallada">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Artista' },
                      { key: 'sightings_count', label: 'Registros', align: 'right' },
                    ]}
                    rows={sightN.map((r) => ({
                      name: (
                        <Link href={`${site}/artists/${str(r.slug)}`} className="underline font-bold text-[var(--ink)]">
                          {str(r.name)}
                        </Link>
                      ),
                      sightings_count: String(num(r.sightings_count)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
              </Section>
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: Audio                                                   */}
          {/* ============================================================ */}
          {tab === 'audio' && (
            <div className="space-y-6">
              <Section title="Reproducciones de mixes" accent="var(--red)"
                hint="Un evento por cada vez que el audio del mix arranca de verdad."
              >
                <MixPlaysExecutive allTime={num(summary.all_time)} last7d={num(summary.last_7d)} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
                  <HorizontalRankBars title="Ranking completo" rows={mixRankRows} valueLabel="Plays" />
                  <TopShareDonut title="Concentración top 5 vs resto" rows={mixTop} valueKey="play_count" labelKey="title" />
                </div>
                <DetailToggle label="Tabla detallada de reproducciones">
                  <DataTable
                    columns={[
                      { key: 'title', label: 'Mix' },
                      { key: 'artist_name', label: 'Artista' },
                      { key: 'play_count', label: 'Plays', align: 'right' },
                    ]}
                    rows={mixTop.map((r) => ({
                      title: (
                        <Link href={`${base}/mixes/${str(r.mix_id)}`} className="underline font-bold text-[var(--ink)]">
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

              <Section title="Mixes guardados (dashboard)" accent="var(--pink)">
                <HorizontalRankBars
                  rows={rowsToRankByKey(savedMx, (r) => `${str(r.title)} — ${str(r.artist_name)}`, 'saves', 14)}
                  valueLabel="Guardados"
                />
                <DetailToggle label="Tabla detallada de guardados">
                  <DataTable
                    columns={[
                      { key: 'title', label: 'Mix' },
                      { key: 'artist_name', label: 'Artista' },
                      { key: 'saves', label: 'Guardados', align: 'right' },
                    ]}
                    rows={savedMx.map((r) => ({
                      title: (
                        <Link href={`${base}/mixes/${str(r.mix_id)}`} className="underline font-bold text-[var(--ink)]">
                          {str(r.title)}
                        </Link>
                      ),
                      artist_name: str(r.artist_name),
                      saves: String(num(r.saves)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
              </Section>
            </div>
          )}

          {/* ============================================================ */}
          {/*  TAB: Events                                                  */}
          {/* ============================================================ */}
          {tab === 'events' && (
            <div className="space-y-6">
              <Section title="Eventos con usuarios implicados" accent="var(--orange)"
                hint="Usuarios únicos con favorito o algún estado de asistencia (sin duplicar)."
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <HorizontalRankBars
                    rows={rowsToRankByKey(evEng, (r) => str(r.name), 'engaged_users', 14)}
                    valueLabel="Usuarios"
                  />
                  <TopShareDonut title="Participación del top 5" rows={evEng} valueKey="engaged_users" labelKey="name" />
                </div>
                <DetailToggle label="Tabla detallada de implicación">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Evento' },
                      { key: 'engaged_users', label: 'Usuarios', align: 'right' },
                    ]}
                    rows={evEng.map((r) => ({
                      name: (
                        <Link href={`${site}/events/${str(r.slug)}`} className="underline font-bold text-[var(--ink)]">
                          {str(r.name)}
                        </Link>
                      ),
                      engaged_users: String(num(r.engaged_users)),
                    }))}
                    empty="Sin datos."
                  />
                </DetailToggle>
              </Section>

              <Section title="Comparativa «voy» vs «asistí»" accent="var(--acid)"
                hint="Misma escala en ambas columnas para comparar de un vistazo (top 8 de cada lista)."
              >
                <DualHorizontalMini
                  leftTitle="Voy (attending)"
                  rightTitle="Asistí (attended)"
                  leftRows={rowsToRankByKey(evAtt, (r) => str(r.name), 'cnt', 8)}
                  rightRows={rowsToRankByKey(evDone, (r) => str(r.name), 'cnt', 8)}
                />
              </Section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Marcados «voy»">
                  <DetailToggle label="Tabla">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Evento' },
                        { key: 'cnt', label: 'Usuarios', align: 'right' },
                      ]}
                      rows={evAtt.map((r) => ({
                        name: (
                          <Link href={`${site}/events/${str(r.slug)}`} className="underline font-bold text-[var(--ink)]">
                            {str(r.name)}
                          </Link>
                        ),
                        cnt: String(num(r.cnt)),
                      }))}
                      empty="Sin datos."
                    />
                  </DetailToggle>
                </Section>
                <Section title="Marcados «asistí»">
                  <DetailToggle label="Tabla">
                    <DataTable
                      columns={[
                        { key: 'name', label: 'Evento' },
                        { key: 'cnt', label: 'Usuarios', align: 'right' },
                      ]}
                      rows={evDone.map((r) => ({
                        name: (
                          <Link href={`${site}/events/${str(r.slug)}`} className="underline font-bold text-[var(--ink)]">
                            {str(r.name)}
                          </Link>
                        ),
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
          {/*  TAB: Ratings                                                 */}
          {/* ============================================================ */}
          {tab === 'ratings' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RatingScatter
                  title="Eventos: nota media vs volumen"
                  rows={eventRatingsScatter}
                />
                <RatingScatter
                  title="Artistas en vivo: nota vs volumen"
                  rows={artistRatedScatter}
                />
              </div>

              <Section title="Eventos mejor valorados" accent="var(--orange)"
                hint="Media de estrellas con al menos 2 valoraciones."
              >
                <HorizontalRankBars
                  title="Por nota media (top 12)"
                  rows={evRate.slice(0, 12).map((r) => ({
                    name: str(r.name).length > 32 ? `${str(r.name).slice(0, 31)}…` : str(r.name),
                    value: num(r.avg_rating),
                  }))}
                  valueLabel="Media ★"
                  maxHeight={380}
                />
                <DetailToggle label="Tabla detallada">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Evento' },
                      { key: 'avg_rating', label: 'Media' },
                      { key: 'rating_count', label: 'Nº notas', align: 'right' },
                    ]}
                    rows={evRate.map((r) => ({
                      name: (
                        <Link href={`${site}/events/${str(r.slug)}`} className="underline font-bold text-[var(--ink)]">
                          {str(r.name)}
                        </Link>
                      ),
                      avg_rating: str(r.avg_rating),
                      rating_count: String(num(r.rating_count)),
                    }))}
                    empty="Sin suficientes valoraciones."
                  />
                </DetailToggle>
              </Section>

              <Section title="Artistas mejor valorados (en vivo)" accent="var(--cyan)"
                hint="Media de estrellas en avistamientos, mínimo 2 valoraciones."
              >
                <HorizontalRankBars
                  title="Por nota media (top 12)"
                  rows={sightR.slice(0, 12).map((r) => ({
                    name: str(r.name).length > 32 ? `${str(r.name).slice(0, 31)}…` : str(r.name),
                    value: num(r.avg_rating),
                  }))}
                  valueLabel="Media ★"
                  maxHeight={380}
                />
                <DetailToggle label="Tabla detallada">
                  <DataTable
                    columns={[
                      { key: 'name', label: 'Artista' },
                      { key: 'avg_rating', label: 'Media' },
                      { key: 'rating_count', label: 'Nº notas', align: 'right' },
                    ]}
                    rows={sightR.map((r) => ({
                      name: (
                        <Link href={`${site}/artists/${str(r.slug)}`} className="underline font-bold text-[var(--ink)]">
                          {str(r.name)}
                        </Link>
                      ),
                      avg_rating: str(r.avg_rating),
                      rating_count: String(num(r.rating_count)),
                    }))}
                    empty="Sin suficientes valoraciones."
                  />
                </DetailToggle>
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  )
}
