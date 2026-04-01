'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts'

/** Paleta alineada con globals.css (fanzine / OB) */
const C = {
  ink: '#1a1a1a',
  red: '#d62828',
  orange: '#e85d04',
  cyan: '#0891b2',
  uv: '#7b2ff7',
  acid: '#8db600',
  pink: '#e91e8c',
  yellow: '#f7e733',
  paper: '#e8dcc8',
  dim: '#888888',
}

const BAR_PALETTE = [C.red, C.orange, C.cyan, C.uv, C.acid, C.pink, '#1d4ed8', C.yellow]

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

const tooltipStyle = {
  backgroundColor: C.paper,
  border: `3px solid ${C.ink}`,
  borderRadius: 0,
  fontFamily: "'Courier Prime', monospace",
  fontSize: 11,
  fontWeight: 700,
  color: C.ink,
  boxShadow: '4px 4px 0 #1a1a1a',
}

function ChartFrame({ children, height, className = '' }: { children: React.ReactNode; height: number; className?: string }) {
  return (
    <div
      className={`w-full border-[3px] border-[var(--ink)] bg-[#fffef6] p-2 sm:p-3 ${className}`}
      style={{ minHeight: height }}
    >
      {children}
    </div>
  )
}

/** KPI reproducciones + proporción últimos 7 días vs histórico anterior */
export function MixPlaysExecutive({
  allTime,
  last7d,
}: {
  allTime: number
  last7d: number
}) {
  const prev = Math.max(0, allTime - last7d)
  const pct7 = allTime > 0 ? Math.round((last7d / allTime) * 100) : 0
  const barData = [{ name: 'mix', u7: last7d, prev }]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      <div className="lg:col-span-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--dim)] mb-2">
          Peso reciente: últimos 7 días frente al histórico anterior (misma fuente de datos)
        </p>
        <ChartFrame height={120}>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={4} hide />
              <Tooltip
                formatter={(v: number, name: string) => [v, name === 'u7' ? 'Últimos 7 días' : 'Antes (histórico − 7d)']}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="prev" stackId="a" fill={C.paper} stroke={C.ink} strokeWidth={2} name="prev" />
              <Bar dataKey="u7" stackId="a" fill={C.red} stroke={C.ink} strokeWidth={2} name="u7" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <p className="text-[10px] mt-1 font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>
          ≈ {pct7}% de todas las reproducciones registradas ocurrieron en la última semana.
        </p>
      </div>
      <div className="flex flex-col justify-center gap-3 border-[3px] border-[var(--ink)] bg-[var(--yellow)]/40 p-4">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-80">Histórico completo</div>
          <div className="text-4xl font-black leading-none" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            {allTime}
          </div>
        </div>
        <div className="border-t-2 border-[var(--ink)]/20 pt-3">
          <div className="text-[9px] font-black uppercase tracking-widest opacity-80">Últimos 7 días</div>
          <div className="text-3xl font-black leading-none text-[var(--red)]" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            {last7d}
          </div>
        </div>
      </div>
    </div>
  )
}

type RankRow = { name: string; value: number }

/** Barras horizontales: rankings (tipo Power BI “top N”) */
export function HorizontalRankBars({
  title,
  rows,
  valueLabel = 'Valor',
  maxHeight = 420,
}: {
  title?: string
  rows: RankRow[]
  valueLabel?: string
  maxHeight?: number
}) {
  const data = useMemo(() => [...rows].reverse(), [rows])
  const h = Math.min(maxHeight, Math.max(220, data.length * 36 + 72))

  if (data.length === 0) {
    return <p className="admin-muted text-sm !mb-0">Sin datos para graficar.</p>
  }

  return (
    <div className="mb-4">
      {title && (
        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--dim)] mb-2">{title}</p>
      )}
      <ChartFrame height={h}>
        <ResponsiveContainer width="100%" height={h - 24}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="4 4" stroke={`${C.ink}18`} horizontal={false} />
            <XAxis type="number" tick={{ fill: C.ink, fontSize: 10, fontFamily: 'Courier Prime' }} stroke={C.ink} />
            <YAxis
              type="category"
              dataKey="name"
              width={148}
              tick={{ fill: C.ink, fontSize: 9, fontFamily: 'Courier Prime' }}
              stroke={C.ink}
              interval={0}
            />
            <Tooltip
              formatter={(v: number) => [v, valueLabel]}
              contentStyle={tooltipStyle}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} stroke={C.ink} strokeWidth={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  )
}

/** Donut: concentración del top‑5 frente al resto del ranking devuelto */
export function TopShareDonut({
  rows,
  valueKey,
  labelKey,
  title,
}: {
  rows: Record<string, unknown>[]
  valueKey: string
  labelKey: string
  title?: string
}) {
  const { pieData } = useMemo(() => {
    if (!rows.length) return { pieData: [] as { name: string; value: number }[] }
    const n = 5
    const top = rows.slice(0, n)
    const restRows = rows.slice(n)
    const restSum = restRows.reduce((s, r) => s + num(r[valueKey]), 0)
    const out = top.map((r) => ({ name: trunc(str(r[labelKey]), 22), value: num(r[valueKey]) }))
    if (restSum > 0) out.push({ name: 'Resto (ranking)', value: restSum })
    return { pieData: out }
  }, [rows, valueKey, labelKey])

  if (pieData.length === 0) {
    return null
  }

  return (
    <div className="mb-4">
      {title && (
        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--dim)] mb-2">{title}</p>
      )}
      <ChartFrame height={300}>
        <ResponsiveContainer width="100%" height={276}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={2}
              stroke={C.ink}
              strokeWidth={2}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend
              wrapperStyle={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, fontWeight: 700 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  )
}

/** Dispersión: volumen de valoraciones vs nota media (eventos o artistas en vivo) */
export function RatingScatter({
  rows,
  title,
}: {
  rows: { name: string; avg_rating: number; rating_count: number }[]
  title?: string
}) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        name: trunc(r.name, 28),
        avg_rating: r.avg_rating,
        rating_count: r.rating_count,
      })),
    [rows],
  )

  if (data.length === 0) {
    return null
  }

  return (
    <div className="mb-4">
      {title && (
        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--dim)] mb-2">{title}</p>
      )}
      <ChartFrame height={320}>
        <ResponsiveContainer width="100%" height={296}>
          <ScatterChart margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke={`${C.ink}20`} />
            <XAxis
              type="number"
              dataKey="rating_count"
              name="Valoraciones"
              tick={{ fill: C.ink, fontSize: 10, fontFamily: 'Courier Prime' }}
              label={{ value: 'Nº valoraciones', position: 'bottom', offset: 0, fill: C.ink, fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey="avg_rating"
              domain={[1, 5]}
              name="Media"
              tick={{ fill: C.ink, fontSize: 10, fontFamily: 'Courier Prime' }}
              label={{ value: 'Media ★', angle: -90, position: 'insideLeft', fill: C.ink, fontSize: 10 }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={tooltipStyle}
              formatter={(v: number, key: string) => {
                if (key === 'avg_rating') return [Number(v).toFixed(2), 'Media']
                if (key === 'rating_count') return [v, 'Valoraciones']
                return [v, key]
              }}
              labelFormatter={(_, p: unknown) => {
                const pl = p as { payload?: { name?: string } }
                return pl?.payload?.name ?? ''
              }}
            />
            <Scatter data={data} fill={C.uv} stroke={C.ink} strokeWidth={1} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  )
}

/** Comparativa lado a lado: dos rankings con misma escala visual reducida */
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
  const maxV = Math.max(
    1,
    ...leftRows.map((r) => r.value),
    ...rightRows.map((r) => r.value),
  )

  const Mini = ({ rows, title }: { rows: RankRow[]; title: string }) => (
    <div>
      <p className="text-[9px] font-black uppercase tracking-wider mb-2 text-[var(--ink)]">{title}</p>
      <div className="space-y-2">
        {rows.slice(0, 8).map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="text-[9px] font-bold truncate w-[100px] sm:w-[130px] shrink-0"
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={r.name}
            >
              {trunc(r.name, 18)}
            </span>
            <div className="flex-1 h-3 border-2 border-[var(--ink)] bg-[var(--paper-dark)] relative">
              <div
                className="h-full absolute left-0 top-0"
                style={{
                  width: `${(r.value / maxV) * 100}%`,
                  background: BAR_PALETTE[i % BAR_PALETTE.length],
                }}
              />
            </div>
            <span className="text-[9px] font-black tabular-nums w-6 text-right">{r.value}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-[var(--dim)]">—</p>}
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4 border-[3px] border-[var(--ink)] bg-[#fffef6] p-4">
      <Mini rows={leftRows} title={leftTitle} />
      <Mini rows={rightRows} title={rightTitle} />
    </div>
  )
}

/** Fila ejecutiva: 4 KPIs derivados de los arrays (sin nuevas queries) */
export function ExecutiveKpiStrip({
  mixAllTime,
  mix7d,
  maxEventEngaged,
  maxArtistFavorites,
}: {
  mixAllTime: number
  mix7d: number
  maxEventEngaged: number
  maxArtistFavorites: number
}) {
  const items = [
    { k: 'Plays mixes (total)', v: mixAllTime, bg: C.yellow },
    { k: 'Plays mixes (7 días)', v: mix7d, bg: C.red, fg: '#fff' },
    { k: 'Máx. usuarios en un evento', v: maxEventEngaged, bg: C.cyan, fg: '#fff' },
    { k: 'Máx. favoritos a un artista', v: maxArtistFavorites, bg: C.uv, fg: '#fff' },
  ]

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
      {items.map((it) => (
        <div
          key={it.k}
          className="border-[3px] border-[var(--ink)] px-3 py-3 shadow-[4px_4px_0_var(--ink)]"
          style={{ background: it.bg, color: it.fg ?? C.ink }}
        >
          <div className="text-[9px] font-black uppercase tracking-wider opacity-90 leading-tight">{it.k}</div>
          <div className="text-2xl sm:text-3xl font-black mt-1" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            {it.v}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Helpers para transformar filas crudas del RPC */
export function rowsToRankByKey(
  rows: Record<string, unknown>[],
  labelFrom: (r: Record<string, unknown>) => string,
  valueKey: string,
  limit = 14,
): RankRow[] {
  return rows.slice(0, limit).map((r) => ({
    name: trunc(labelFrom(r), 36),
    value: num(r[valueKey]),
  }))
}
