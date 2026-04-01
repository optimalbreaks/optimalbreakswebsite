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

function StatBlock({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="admin-panel mb-6">
      <h2
        className="text-base font-black uppercase mb-1 pb-2 border-b-[3px] border-[var(--ink)]"
        style={{ fontFamily: "'Unbounded', sans-serif" }}
      >
        {title}
      </h2>
      {hint && <p className="admin-muted text-xs !mt-0 !mb-3 normal-case">{hint}</p>}
      {children}
    </div>
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
  if (rows.length === 0) {
    return <p className="admin-muted !mb-0 text-sm">{empty}</p>
  }
  return (
    <div className="overflow-x-auto border-[3px] border-[var(--ink)]">
      <table className="w-full text-left text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
        <thead>
          <tr className="bg-[var(--paper-dark)] border-b-[3px] border-[var(--ink)]">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 font-black uppercase text-[10px] tracking-wider ${c.align === 'right' ? 'text-right' : ''}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--ink)]/20 odd:bg-[var(--paper)] even:bg-[#fffef6]">
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

function DetailTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="mt-4 group">
      <summary
        className="cursor-pointer list-none font-black uppercase text-[10px] tracking-wider border-[3px] border-[var(--ink)] px-3 py-2 inline-block bg-[var(--paper-dark)] hover:bg-[var(--yellow)] transition-colors"
        style={{ fontFamily: "'Courier Prime', monospace" }}
      >
        <span className="inline group-open:hidden">▸ {label}</span>
        <span className="hidden group-open:inline">▾ {label}</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

export default function AdminEngagementStatsPage() {
  const { lang } = useParams<{ lang: string }>()
  const base = `/${lang}/administrator`
  const site = `/${lang}`
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
    () =>
      rowsToRankByKey(
        mixTop,
        (r) => `${str(r.title)} — ${str(r.artist_name)}`,
        'play_count',
        16,
      ),
    [mixTop],
  )

  const eventRatingsScatter = useMemo(
    () =>
      evRate.map((r) => ({
        name: str(r.name),
        avg_rating: num(r.avg_rating),
        rating_count: num(r.rating_count),
      })),
    [evRate],
  )

  const artistRatedScatter = useMemo(
    () =>
      sightR.map((r) => ({
        name: str(r.name),
        avg_rating: num(r.avg_rating),
        rating_count: num(r.rating_count),
      })),
    [sightR],
  )

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <span className="sec-tag">Backstage</span>
          <h1 className="sec-title !mb-0">Estadísticas de uso</h1>
          <p className="admin-muted !mt-2 !mb-0 max-w-3xl normal-case text-sm">
            Vista tipo panel analítico: KPIs, barras horizontales para rankings, donuts de concentración del top‑5,
            dispersión volumen vs nota media, y tablas detalladas plegables. Las vistas de página siguen en Analytics;
            los previews del chart (Beatport) no se registran aquí.
          </p>
        </div>
        <Link href={base} className="admin-btn no-underline shrink-0">
          ← Dashboard
        </Link>
      </div>

      {loading && <p className="admin-muted">Cargando…</p>}
      {err && (
        <div className="admin-panel border-[var(--red)] bg-[#fff0f0]">
          <p className="!mb-0 font-bold text-[var(--red)]">{err}</p>
          <p className="admin-muted !mt-2 !mb-0 text-xs normal-case">
            Si acabas de desplegar la migración <code className="text-xs">038_mix_play_events_admin_engagement.sql</code>,
            ejecútala en Supabase (o <code className="text-xs">npm run db:migrate</code> con <code className="text-xs">DATABASE_URL</code>).
          </p>
        </div>
      )}

      {!loading && !err && payload && (
        <>
          <ExecutiveKpiStrip
            mixAllTime={num(summary.all_time)}
            mix7d={num(summary.last_7d)}
            maxEventEngaged={maxEventEngaged}
            maxArtistFavorites={maxArtistFav}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <div className="admin-panel !mb-0">
              <h3
                className="text-xs font-black uppercase mb-3 border-b-2 border-[var(--ink)] pb-2"
                style={{ fontFamily: "'Unbounded', sans-serif" }}
              >
                Rankings · comunidad
              </h3>
              <HorizontalRankBars
                title="Artistas favoritos (top 12)"
                rows={rowsToRankByKey(favArt, (r) => str(r.name), 'cnt', 12)}
                valueLabel="Favoritos"
                maxHeight={340}
              />
              <HorizontalRankBars
                title="Eventos con más usuarios implicados"
                rows={rowsToRankByKey(favEv, (r) => str(r.name), 'cnt', 10)}
                valueLabel="Corazones"
                maxHeight={300}
              />
            </div>
            <div className="admin-panel !mb-0">
              <h3
                className="text-xs font-black uppercase mb-3 border-b-2 border-[var(--ink)] pb-2"
                style={{ fontFamily: "'Unbounded', sans-serif" }}
              >
                Rankings · audio y guardados
              </h3>
              <HorizontalRankBars
                title="Reproducciones de mixes (top 12)"
                rows={mixRankRows}
                valueLabel="Plays"
                maxHeight={340}
              />
              <HorizontalRankBars
                title="Mixes más guardados"
                rows={rowsToRankByKey(savedMx, (r) => `${str(r.title)} — ${str(r.artist_name)}`, 'saves', 10)}
                valueLabel="Guardados"
                maxHeight={300}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <RatingScatter
              title="Eventos: nota media vs volumen de valoraciones (cada punto es un evento)"
              rows={eventRatingsScatter}
            />
            <RatingScatter
              title="Artistas (en vivo): nota media vs nº valoraciones"
              rows={artistRatedScatter}
            />
          </div>

          <StatBlock
            title="Reproducciones de mixes (reproductor OB)"
            hint="Un evento por cada vez que el audio del mix arranca de verdad (MP3 o SoundCloud embebido). No incluye enlaces externos ni previews del chart."
          >
            <MixPlaysExecutive allTime={num(summary.all_time)} last7d={num(summary.last_7d)} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <HorizontalRankBars title="Ranking completo (barras)" rows={mixRankRows} valueLabel="Plays" />
              <TopShareDonut
                title="Concentración: top‑5 vs resto del ranking devuelto"
                rows={mixTop}
                valueKey="play_count"
                labelKey="title"
              />
            </div>
            <DetailTable label="Tabla detallada · reproducciones">
            <DataTable
              columns={[
                { key: 'title', label: 'Mix' },
                { key: 'artist_name', label: 'Artista' },
                { key: 'play_count', label: 'Plays', align: 'right' },
              ]}
              rows={mixTop.map((r) => ({
                title: (
                  <Link
                    href={`${base}/mixes/${str(r.mix_id)}`}
                    className="underline font-bold text-[var(--ink)]"
                  >
                    {str(r.title)}
                  </Link>
                ),
                artist_name: str(r.artist_name),
                play_count: String(num(r.play_count)),
              }))}
              empty="Aún no hay reproducciones registradas."
            />
            </DetailTable>
            <p className="admin-muted text-xs !mt-3 !mb-0">
              Editar mixes en{' '}
              <Link href={`${base}/mixes`} className="underline">
                administrador → Mixes
              </Link>
              .
            </p>
          </StatBlock>

          <StatBlock title="Artistas favoritos (corazón)" hint="Cuántos usuarios distintos guardaron cada artista.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <HorizontalRankBars
                rows={rowsToRankByKey(favArt, (r) => str(r.name), 'cnt', 14)}
                valueLabel="Favoritos"
              />
              <TopShareDonut rows={favArt} valueKey="cnt" labelKey="name" title="Cuota del top‑5 sobre el ranking" />
            </div>
            <DetailTable label="Tabla detallada · artistas">
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
            </DetailTable>
          </StatBlock>

          <StatBlock title="Sellos favoritos">
            <HorizontalRankBars
              title="Top sellos por corazones"
              rows={rowsToRankByKey(favLab, (r) => str(r.name), 'cnt', 14)}
              valueLabel="Favoritos"
            />
            <DetailTable label="Tabla detallada · sellos">
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
            </DetailTable>
          </StatBlock>

          <StatBlock title="Eventos favoritos (corazón)">
            <HorizontalRankBars
              title="Top eventos por corazones"
              rows={rowsToRankByKey(favEv, (r) => str(r.name), 'cnt', 14)}
              valueLabel="Corazones"
            />
            <DetailTable label="Tabla detallada · eventos favoritos">
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
            </DetailTable>
          </StatBlock>

          <StatBlock
            title="Eventos con usuarios implicados"
            hint="Usuarios únicos con favorito o algún estado en asistencia (sin duplicar a la misma persona)."
          >
            <HorizontalRankBars
              title="Barras horizontales"
              rows={rowsToRankByKey(evEng, (r) => str(r.name), 'engaged_users', 14)}
              valueLabel="Usuarios"
            />
            <TopShareDonut
              title="Participación del top‑5"
              rows={evEng}
              valueKey="engaged_users"
              labelKey="name"
            />
            <DetailTable label="Tabla detallada · implicación">
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
            </DetailTable>
          </StatBlock>

          <StatBlock
            title="Comparativa «voy» vs «asistí»"
            hint="Misma escala de barra en ambas columnas para comparar de un vistazo (top 8 de cada lista)."
          >
            <DualHorizontalMini
              leftTitle="Voy (attending)"
              rightTitle="Asistí (attended)"
              leftRows={rowsToRankByKey(evAtt, (r) => str(r.name), 'cnt', 8)}
              rightRows={rowsToRankByKey(evDone, (r) => str(r.name), 'cnt', 8)}
            />
          </StatBlock>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StatBlock title='Marcados como "voy" (attending)'>
              <DetailTable label="Tabla · voy">
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
              </DetailTable>
            </StatBlock>
            <StatBlock title='Marcados como "asistí" (attended)'>
              <DetailTable label="Tabla · asistí">
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
              </DetailTable>
            </StatBlock>
          </div>

          <StatBlock title="Mixes guardados (dashboard)">
            <HorizontalRankBars
              title="Ranking visual"
              rows={rowsToRankByKey(savedMx, (r) => `${str(r.title)} — ${str(r.artist_name)}`, 'saves', 14)}
              valueLabel="Guardados"
            />
            <DetailTable label="Tabla detallada · guardados">
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
            </DetailTable>
          </StatBlock>

          <StatBlock
            title="Eventos mejor valorados"
            hint="Media de estrellas solo si hay al menos 2 valoraciones (evita ruido estadístico). El gráfico de dispersión global está arriba en la página."
          >
            <HorizontalRankBars
              title="Por nota media (top 12 del ranking filtrado)"
              rows={evRate.slice(0, 12).map((r) => ({
                name: str(r.name).length > 32 ? `${str(r.name).slice(0, 31)}…` : str(r.name),
                value: num(r.avg_rating),
              }))}
              valueLabel="Media ★"
              maxHeight={380}
            />
            <DetailTable label="Tabla detallada · valoraciones eventos">
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
              empty="Sin suficientes valoraciones agrupadas."
            />
            </DetailTable>
          </StatBlock>

          <StatBlock
            title="Artistas con más registros «visto en vivo»"
            hint="Cada fila en avistamientos cuenta como una experiencia registrada."
          >
            <HorizontalRankBars
              title="Más registros «en vivo»"
              rows={rowsToRankByKey(sightN, (r) => str(r.name), 'sightings_count', 14)}
              valueLabel="Registros"
            />
            <DetailTable label="Tabla detallada · avistamientos">
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
            </DetailTable>
          </StatBlock>

          <StatBlock
            title="Artistas mejor valorados (en vivo)"
            hint="Media de estrellas en avistamientos, mínimo 2 valoraciones. Dispersión global arriba."
          >
            <HorizontalRankBars
              title="Por nota media en vivo (top 12)"
              rows={sightR.slice(0, 12).map((r) => ({
                name: str(r.name).length > 32 ? `${str(r.name).slice(0, 31)}…` : str(r.name),
                value: num(r.avg_rating),
              }))}
              valueLabel="Media ★"
              maxHeight={380}
            />
            <DetailTable label="Tabla detallada · valoraciones en vivo">
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
              empty="Sin suficientes valoraciones agrupadas."
            />
            </DetailTable>
          </StatBlock>
        </>
      )}
    </div>
  )
}
