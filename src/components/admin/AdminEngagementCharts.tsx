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

/* ------------------------------------------------------------------ */
/*  Modern Palette & Typography                                       */
/* ------------------------------------------------------------------ */

const COLORS = {
  primary: '#4f46e5', // indigo-600
  secondary: '#0ea5e9', // sky-500
  accent: '#f43f5e', // rose-500
  success: '#10b981', // emerald-500
  warning: '#f59e0b', // amber-500
  purple: '#8b5cf6', // violet-500
  textMain: '#111827', // gray-900
  textMuted: '#6b7280', // gray-500
  grid: '#f3f4f6', // gray-100
  bg: '#ffffff',
}

const BAR_PALETTE = [
  COLORS.primary,
  COLORS.secondary,
  COLORS.purple,
  COLORS.accent,
  COLORS.warning,
  COLORS.success,
  '#3b82f6', // blue-500
  '#14b8a6', // teal-500
  '#ec4899', // pink-500
]

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

const tooltipStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  fontSize: '12px',
  fontWeight: 500,
  color: '#111827',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  padding: '8px 12px',
}

/* ------------------------------------------------------------------ */
/*  Empty State Component                                             */
/* ------------------------------------------------------------------ */

export function EmptyState({ message = 'No hay datos suficientes' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] w-full bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
      <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
      <p className="text-sm font-medium text-gray-500">{message}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Chart Frame                                                       */
/* ------------------------------------------------------------------ */

function ChartFrame({ children, height }: { children: React.ReactNode; height: number }) {
  return (
    <div className="w-full relative" style={{ minHeight: height }}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  KPI Strip                                                         */
/* ------------------------------------------------------------------ */

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
    { k: 'Plays totales', v: mixAllTime, sub: 'Mixes reproducidos', icon: '▶' },
    { k: 'Plays 7 días', v: mix7d, sub: 'Esta última semana', icon: '🔥', highlight: true },
    { k: 'Máx. engagement', v: maxEventEngaged, sub: 'Usuarios en un evento', icon: '⚡' },
    { k: 'Máx. favoritos', v: maxArtistFavorites, sub: 'A un mismo artista', icon: '❤️' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {items.map((it) => (
        <div
          key={it.k}
          className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
        >
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-600">{it.k}</h3>
            <span className={`flex items-center justify-center w-8 h-8 rounded-full text-sm
              ${it.highlight ? 'bg-rose-100 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
              {it.icon}
            </span>
          </div>
          <div className="mt-auto">
            <div className={`text-3xl font-bold tracking-tight ${it.highlight ? 'text-rose-600' : 'text-gray-900'}`}>
              {it.v.toLocaleString()}
            </div>
            <p className="text-xs font-medium text-gray-400 mt-1">{it.sub}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Mix Plays Executive (Stacked + summary)                           */
/* ------------------------------------------------------------------ */

export function MixPlaysExecutive({ allTime, last7d }: { allTime: number; last7d: number }) {
  const prev = Math.max(0, allTime - last7d)
  const pct7 = allTime > 0 ? Math.round((last7d / allTime) * 100) : 0
  const barData = [{ name: 'Plays', u7: last7d, prev }]

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Volumen de reproducciones</h3>
          <p className="text-sm text-gray-500 mt-0.5">Últimos 7 días frente al histórico global</p>
        </div>
        <div className="text-right">
          <span className="block text-2xl font-bold text-gray-900">{allTime.toLocaleString()}</span>
          <span className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Total</span>
        </div>
      </div>

      <ChartFrame height={60}>
        <ResponsiveContainer width="100%" height={60}>
          <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              formatter={(v: number, name: string) => [v.toLocaleString(), name === 'u7' ? 'Últimos 7 días' : 'Histórico']}
              contentStyle={tooltipStyle}
              cursor={{ fill: 'transparent' }}
            />
            <Bar dataKey="prev" stackId="a" fill="#e5e7eb" name="prev" radius={[4, 0, 0, 4]} />
            <Bar dataKey="u7" stackId="a" fill={COLORS.primary} name="u7" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-gray-200" />
          <span className="text-xs font-medium text-gray-600">Histórico ({prev.toLocaleString()})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600">7 días ({last7d.toLocaleString()})</span>
          <div className="w-3 h-3 rounded-sm bg-indigo-600" />
        </div>
      </div>
      
      {pct7 > 0 && (
        <div className="mt-4 p-3 bg-indigo-50 rounded-xl">
          <p className="text-sm text-indigo-700 font-medium text-center">
            El <strong>{pct7}%</strong> de las reproducciones ocurrieron en la última semana.
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Horizontal bar ranks                                              */
/* ------------------------------------------------------------------ */

type RankRow = { name: string; value: number }

export function HorizontalRankBars({
  rows,
  valueLabel = 'Valor',
  maxHeight = 360,
  color = COLORS.primary,
}: {
  rows: RankRow[]
  valueLabel?: string
  maxHeight?: number
  color?: string
}) {
  const data = useMemo(() => [...rows].reverse(), [rows])
  const h = Math.min(maxHeight, Math.max(200, data.length * 40 + 40))

  if (data.length === 0) return <EmptyState />

  return (
    <ChartFrame height={h}>
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: COLORS.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickCount={5}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fill: COLORS.textMain, fontSize: 11, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            formatter={(v: number) => [v.toLocaleString(), valueLabel]}
            contentStyle={tooltipStyle}
            cursor={{ fill: '#f9fafb' }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={color} barSize={20}>
            {data.map((_, i) => (
              <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ------------------------------------------------------------------ */
/*  Donut — top 5 concentration                                       */
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
  const { pieData } = useMemo(() => {
    if (!rows.length) return { pieData: [] as { name: string; value: number }[] }
    const n = 5
    const sorted = sortRowsByValueDescThenLabel(rows, valueKey, (r) => str(r[labelKey]))
    const top = sorted.slice(0, n)
    const restRows = sorted.slice(n)
    const restSum = restRows.reduce((s, r) => s + num(r[valueKey]), 0)
    const out = top.map((r) => ({ name: trunc(str(r[labelKey]), 20), value: num(r[valueKey]) }))
    if (restSum > 0) out.push({ name: 'Otros', value: restSum })
    return { pieData: out }
  }, [rows, valueKey, labelKey])

  if (pieData.length === 0) return <EmptyState />

  return (
    <ChartFrame height={300}>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="45%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={3}
            stroke="none"
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={i === pieData.length - 1 && pieData[i].name === 'Otros' ? '#e5e7eb' : BAR_PALETTE[i % BAR_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend
            verticalAlign="bottom"
            height={70}
            iconType="circle"
            wrapperStyle={{ fontSize: 11, color: COLORS.textMain, paddingTop: '10px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ------------------------------------------------------------------ */
/*  Scatter — rating vs volume                                        */
/* ------------------------------------------------------------------ */

export function RatingScatter({
  rows,
}: {
  rows: { name: string; avg_rating: number; rating_count: number }[]
}) {
  const data = useMemo(
    () => rows.map((r) => ({ name: trunc(r.name, 28), avg_rating: r.avg_rating, rating_count: r.rating_count })),
    [rows],
  )

  if (data.length === 0) return <EmptyState message="No hay valoraciones suficientes" />

  return (
    <ChartFrame height={300}>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
          <XAxis
            type="number"
            dataKey="rating_count"
            name="Valoraciones"
            tick={{ fill: COLORS.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Cantidad de valoraciones', position: 'bottom', offset: 0, fill: COLORS.textMuted, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="avg_rating"
            domain={[1, 5]}
            name="Media"
            tick={{ fill: COLORS.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Nota Media ★', angle: -90, position: 'insideLeft', fill: COLORS.textMuted, fontSize: 11 }}
          />
          <ZAxis range={[60, 60]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: '#d1d5db' }}
            contentStyle={tooltipStyle}
            formatter={(v: number, key: string) => {
              if (key === 'avg_rating') return [Number(v).toFixed(2), 'Nota Media']
              if (key === 'rating_count') return [v, 'Votos']
              return [v, key]
            }}
            labelFormatter={(_, p: unknown) => {
              const pl = p as { payload?: { name?: string } }
              return pl?.payload?.name ?? ''
            }}
          />
          <Scatter data={data} fill={COLORS.secondary} opacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ------------------------------------------------------------------ */
/*  Dual mini bars — side by side comparison                          */
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
  const maxV = Math.max(1, ...leftRows.map((r) => r.value), ...rightRows.map((r) => r.value))

  const Mini = ({ rows, title }: { rows: RankRow[]; title: string }) => (
    <div className="flex-1 min-w-0">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">{title}</h4>
      <div className="space-y-3">
        {rows.slice(0, 8).map((r, i) => (
          <div key={i} className="flex items-center gap-3">
            <span
              className="text-xs font-medium truncate w-[90px] sm:w-[120px] shrink-0 text-gray-700"
              title={r.name}
            >
              {trunc(r.name, 18)}
            </span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(r.value / maxV) * 100}%`,
                  background: BAR_PALETTE[i % BAR_PALETTE.length],
                }}
              />
            </div>
            <span className="text-xs font-bold text-gray-900 w-8 text-right">{r.value}</span>
          </div>
        ))}
        {rows.length === 0 && <EmptyState message="Sin datos" />}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col md:flex-row gap-8 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <Mini rows={leftRows} title={leftTitle} />
      <div className="hidden md:block w-px bg-gray-200" />
      <Mini rows={rightRows} title={rightTitle} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Mayor valor numérico primero; en empates, orden alfabético del nombre (es, sin distinguir mayúsculas). */
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
