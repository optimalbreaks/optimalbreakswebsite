'use client'

import { useMemo } from 'react'

/* ------------------------------------------------------------------ */
/*  Brutalist palette (Optimal Breaks admin)                          */
/* ------------------------------------------------------------------ */

const BAR_COLORS = [
  'var(--red)',
  'var(--yellow)',
  'var(--uv)',
  'var(--cyan)',
  'var(--pink)',
  'var(--orange)',
  'var(--acid)',
  'var(--ink)',
]

const mono = { fontFamily: "'Courier Prime', monospace" } as const
const display = { fontFamily: "'Unbounded', sans-serif" } as const

export function num(v: unknown): number {
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

function trunc(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function panelClass(extra = '') {
  return `admin-panel !p-0 overflow-hidden flex flex-col h-full border-[3px] border-[var(--ink)] bg-[#fffef6] ${extra}`.trim()
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                       */
/* ------------------------------------------------------------------ */

export function EmptyState({ message = 'Sin datos todavía' }: { message?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[140px] w-full border-[3px] border-dashed border-[var(--ink)]/30 bg-[var(--paper)] p-6"
      style={mono}
    >
      <span className="text-2xl mb-2 opacity-40">∅</span>
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink)]/50">{message}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  KPI strip                                                         */
/* ------------------------------------------------------------------ */

export function ExecutiveKpiStrip({
  mixAllTime,
  mix7d,
  trackAllTime,
  track7d,
  maxEventEngaged,
  maxArtistFavorites,
}: {
  mixAllTime: number
  mix7d: number
  trackAllTime: number
  track7d: number
  maxEventEngaged: number
  maxArtistFavorites: number
}) {
  const totalAll = mixAllTime + trackAllTime
  const total7d = mix7d + track7d
  const items = [
    {
      k: 'Plays totales',
      v: totalAll,
      sub: `${trackAllTime.toLocaleString()} pistas + ${mixAllTime.toLocaleString()} mixes`,
      accent: 'var(--red)',
    },
    {
      k: 'Plays · 7 días',
      v: total7d,
      sub: `${track7d.toLocaleString()} pistas + ${mix7d.toLocaleString()} mixes`,
      accent: 'var(--yellow)',
    },
    {
      k: 'Evento top',
      v: maxEventEngaged,
      sub: 'Usuarios implicados (fav + asistencia)',
      accent: 'var(--cyan)',
    },
    {
      k: 'Artista top',
      v: maxArtistFavorites,
      sub: 'Corazones en favoritos',
      accent: 'var(--pink)',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
      {items.map((it) => (
        <div
          key={it.k}
          className="relative flex flex-col justify-between p-4 sm:p-5 border-[3px] border-[var(--ink)] bg-[#fffef6]"
          style={{ boxShadow: '4px 4px 0 var(--ink)' }}
        >
          <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: it.accent }} />
          <div className="text-[10px] font-black uppercase tracking-[2px] text-[var(--ink)]/55 mb-3" style={mono}>
            {it.k}
          </div>
          <div className="text-3xl sm:text-4xl font-black leading-none text-[var(--ink)]" style={display}>
            {it.v.toLocaleString()}
          </div>
          <p className="text-[10px] font-bold text-[var(--ink)]/45 mt-2 leading-snug" style={mono}>
            {it.sub}
          </p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Volume block — números claros + barra de proporción               */
/* ------------------------------------------------------------------ */

export function MixPlaysExecutive({
  allTime,
  last7d,
  title = 'Reproducciones',
  subtitle = 'Cuántas veces se ha pulsado play',
}: {
  allTime: number
  last7d: number
  title?: string
  subtitle?: string
}) {
  const older = Math.max(0, allTime - last7d)
  const pct7 = allTime > 0 ? Math.round((last7d / allTime) * 100) : 0
  const pctOlder = allTime > 0 ? 100 - pct7 : 0

  return (
    <div className={panelClass()}>
      <div className="px-4 py-3 border-b-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
        <h3 className="text-sm font-black uppercase tracking-wide" style={display}>
          {title}
        </h3>
        <p className="text-[10px] font-bold opacity-70 mt-1" style={mono}>
          {subtitle}
        </p>
      </div>
      <div className="p-4 sm:p-5 flex-1">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-[var(--ink)]/50 mb-1" style={mono}>
              Total histórico
            </div>
            <div className="text-4xl font-black text-[var(--ink)]" style={display}>
              {allTime.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-wider text-[var(--ink)]/50 mb-1" style={mono}>
              Últimos 7 días
            </div>
            <div className="text-2xl font-black text-[var(--red)]" style={display}>
              {last7d.toLocaleString()}
            </div>
          </div>
        </div>

        {allTime > 0 ? (
          <>
            <div className="h-5 border-[3px] border-[var(--ink)] flex overflow-hidden bg-[var(--paper-dark)]">
              <div
                className="h-full bg-[var(--yellow)] border-r-[3px] border-[var(--ink)]"
                style={{ width: `${pct7}%`, minWidth: last7d > 0 ? '4px' : 0 }}
                title={`Últimos 7 días: ${last7d}`}
              />
              <div
                className="h-full bg-[var(--ink)]/15 flex-1"
                style={{ width: `${pctOlder}%` }}
                title={`Antes: ${older}`}
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--ink)]/55" style={mono}>
              <span>■ Esta semana ({pct7}%)</span>
              <span>■ Antes ({older.toLocaleString()})</span>
            </div>
          </>
        ) : (
          <EmptyState message="Nadie ha dado play todavía" />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Ranking — lista numerada con barras (sin librerías de gráficos)   */
/* ------------------------------------------------------------------ */

export type RankRow = { name: string; value: number }

export function HorizontalRankBars({
  rows,
  valueLabel = 'Total',
  maxHeight: _maxHeight = 360,
  color = 'var(--red)',
}: {
  rows: RankRow[]
  valueLabel?: string
  maxHeight?: number
  color?: string
}) {
  const data = useMemo(() => [...rows], [rows])
  const maxV = Math.max(1, ...data.map((r) => r.value))

  if (data.length === 0) return <EmptyState />

  return (
    <div className="space-y-2" role="list" aria-label={`Ranking por ${valueLabel}`}>
      {data.map((r, i) => {
        const pct = Math.round((r.value / maxV) * 100)
        const barColor = i === 0 ? color : BAR_COLORS[i % BAR_COLORS.length]
        return (
          <div key={`${r.name}-${i}`} role="listitem" className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_auto] gap-2 items-center">
            <span
              className="text-sm font-black text-[var(--ink)]/40 tabular-nums"
              style={display}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <div
                className="text-[11px] sm:text-xs font-bold text-[var(--ink)] truncate mb-1"
                style={mono}
                title={r.name}
              >
                {trunc(r.name, 42)}
              </div>
              <div className="h-3 border-2 border-[var(--ink)] bg-[var(--paper)] overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${pct}%`, background: barColor, minWidth: r.value > 0 ? '3px' : 0 }}
                />
              </div>
            </div>
            <div className="text-right pl-1">
              <span className="block text-sm font-black text-[var(--ink)] tabular-nums" style={display}>
                {r.value.toLocaleString()}
              </span>
              <span className="block text-[9px] font-bold uppercase text-[var(--ink)]/40" style={mono}>
                {valueLabel}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Concentración — top 5 en lista legible (sustituye el donut)        */
/* ------------------------------------------------------------------ */

export function TopShareDonut({
  rows,
  valueKey,
  labelKey,
}: {
  rows: Record<string, unknown>[]
  valueKey: string
  labelKey: string
}) {
  const { items, total, topPct } = useMemo(() => {
    if (!rows.length) return { items: [] as { name: string; value: number; pct: number }[], total: 0, topPct: 0 }
    const sorted = sortRowsByValueDescThenLabel(rows, valueKey, (r) => str(r[labelKey]))
    const total = sorted.reduce((s, r) => s + num(r[valueKey]), 0)
    const top = sorted.slice(0, 5)
    const topSum = top.reduce((s, r) => s + num(r[valueKey]), 0)
    const restSum = Math.max(0, total - topSum)
    const items = top.map((r) => ({
      name: trunc(str(r[labelKey]), 28),
      value: num(r[valueKey]),
      pct: total > 0 ? Math.round((num(r[valueKey]) / total) * 100) : 0,
    }))
    if (restSum > 0) {
      items.push({
        name: 'Resto del catálogo',
        value: restSum,
        pct: total > 0 ? Math.round((restSum / total) * 100) : 0,
      })
    }
    return {
      items,
      total,
      topPct: total > 0 ? Math.round((topSum / total) * 100) : 0,
    }
  }, [rows, valueKey, labelKey])

  if (items.length === 0) return <EmptyState />

  return (
    <div>
      <div
        className="mb-4 px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)]"
        style={mono}
      >
        <p className="text-[11px] font-black uppercase tracking-wide">
          El top 5 acapara el <span style={display}>{topPct}%</span> del total ({total.toLocaleString()} plays)
        </p>
      </div>
      <ol className="space-y-2 list-none m-0 p-0">
        {items.map((it, i) => (
          <li
            key={`${it.name}-${i}`}
            className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--ink)]/15 last:border-0"
          >
            <span className="text-[11px] font-bold text-[var(--ink)] truncate flex-1" style={mono} title={it.name}>
              {i < 5 ? `${i + 1}. ` : '· '}
              {it.name}
            </span>
            <span className="text-xs font-black tabular-nums shrink-0" style={display}>
              {it.pct}%
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Valoraciones — tabla clara (sustituye scatter)                    */
/* ------------------------------------------------------------------ */

export function RatingScatter({
  rows,
}: {
  rows: { name: string; avg_rating: number; rating_count: number }[]
}) {
  const data = useMemo(() => [...rows], [rows])
  const maxVotes = Math.max(1, ...data.map((r) => r.rating_count))

  if (data.length === 0) return <EmptyState message="Sin valoraciones" />

  return (
    <div className="overflow-x-auto border-[3px] border-[var(--ink)]">
      <table className="min-w-full text-left" style={mono}>
        <thead className="bg-[var(--ink)] text-[var(--paper)]">
          <tr>
            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider">Nombre</th>
            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-center w-20">Nota</th>
            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-right w-16">Votos</th>
            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider w-28 hidden sm:table-cell">Volumen</th>
          </tr>
        </thead>
        <tbody className="bg-[#fffef6] divide-y-2 divide-[var(--ink)]/10">
          {data.map((r) => (
            <tr key={r.name} className="hover:bg-[var(--yellow)]/20">
              <td className="px-3 py-2 text-[11px] font-bold text-[var(--ink)] max-w-[180px] truncate" title={r.name}>
                {trunc(r.name, 32)}
              </td>
              <td className="px-3 py-2 text-center font-black text-[var(--red)]" style={display}>
                {r.avg_rating.toFixed(1)}★
              </td>
              <td className="px-3 py-2 text-right font-bold tabular-nums">{r.rating_count}</td>
              <td className="px-3 py-2 hidden sm:table-cell">
                <div className="h-2 border border-[var(--ink)] bg-[var(--paper)]">
                  <div
                    className="h-full bg-[var(--uv)]"
                    style={{ width: `${Math.round((r.rating_count / maxVotes) * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[9px] font-bold uppercase text-[var(--ink)]/45 border-t-2 border-[var(--ink)] bg-[var(--paper)]" style={mono}>
        Nota media ★ · votos = cuánta gente ha puntuado
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Comparativa doble (Voy vs Asistí)                                 */
/* ------------------------------------------------------------------ */

export function DualHorizontalMini({
  leftTitle,
  rightTitle,
  leftRows,
  rightRows,
}: {
  leftTitle: string
  rightTitle: string
  leftRows: RankRow[]
  rightRows: RankRow[]
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
      <div className="p-4 sm:p-5 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]">
        <h4 className="text-xs font-black uppercase mb-4 pb-2 border-b-2 border-[var(--ink)]" style={display}>
          {leftTitle}
        </h4>
        <HorizontalRankBars rows={leftRows} valueLabel="users" color="var(--cyan)" />
      </div>
      <div className="p-4 sm:p-5">
        <h4 className="text-xs font-black uppercase mb-4 pb-2 border-b-2 border-[var(--ink)]" style={display}>
          {rightTitle}
        </h4>
        <HorizontalRankBars rows={rightRows} valueLabel="users" color="var(--orange)" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Leyenda rápida (para la pestaña General)                          */
/* ------------------------------------------------------------------ */

export function StatsLegend() {
  const items = [
    { k: 'Play', d: 'Alguien pulsó ▶ en una pista o mix (cuenta 1 vez por sesión de pestaña).' },
    { k: 'Favorito ♥', d: 'Usuario registrado guardó artista, sello o evento en su perfil.' },
    { k: 'Engagement evento', d: 'Suma de «Voy», «Asistí» y corazones en ese evento.' },
    { k: 'Avistamiento', d: 'Marcó «Visto en vivo» en la ficha de un artista.' },
  ]
  return (
    <div className="admin-panel !p-4 sm:!p-5 border-[3px] border-[var(--ink)] bg-[var(--paper-dark)]/30">
      <h3 className="text-xs font-black uppercase mb-3" style={display}>
        ¿Qué miden estos números?
      </h3>
      <ul className="space-y-2 m-0 p-0 list-none">
        {items.map((it) => (
          <li key={it.k} className="text-[11px] leading-relaxed text-[var(--ink)]/75" style={mono}>
            <strong className="text-[var(--ink)]">{it.k}:</strong> {it.d}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

export function sortRowsByValueDescThenLabel(
  rows: Record<string, unknown>[],
  valueKey: string,
  labelFrom: (r: Record<string, unknown>) => string,
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const va = num(a[valueKey])
    const vb = num(b[valueKey])
    if (vb !== va) return vb - va
    return labelFrom(a).localeCompare(labelFrom(b), 'es', { sensitivity: 'base' })
  })
}

export function rowsToRankByKey(
  rows: Record<string, unknown>[],
  labelFrom: (r: Record<string, unknown>) => string,
  valueKey: string,
  limit = 10,
): RankRow[] {
  return sortRowsByValueDescThenLabel(rows, valueKey, labelFrom)
    .slice(0, limit)
    .map((r) => ({
      name: labelFrom(r),
      value: num(r[valueKey]),
    }))
}
