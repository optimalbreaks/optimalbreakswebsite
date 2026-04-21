'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type PlaybackKind = 'beatport' | 'bandcamp' | 'youtube'
type ChartTrackSource = 'chart' | 'featured' | 'vinyl'

interface TopTrack {
  canonical_key: string
  title: string
  mix_name: string | null
  artists: string
  label: string | null
  year: number | null
  artwork_url: string | null
  external_url: string | null
  playback_kind: PlaybackKind
  save_count: number
  unique_users: number
  first_saved_at: string | null
  last_saved_at: string | null
  sources: ChartTrackSource[]
  primary: { source: ChartTrackSource; id: string }
}

interface Payload {
  totals: {
    saves: number
    unique_tracks: number
    unique_users: number
    by_kind: { beatport: number; bandcamp: number; youtube: number }
  }
  top_tracks: TopTrack[]
  top_labels: { name: string; save_count: number }[]
  top_artists: { name: string; save_count: number }[]
}

const KIND_STYLE: Record<PlaybackKind, { label: string; bg: string; fg: string }> = {
  beatport: { label: 'BEATPORT', bg: 'var(--red)', fg: 'white' },
  bandcamp: { label: 'BANDCAMP', bg: 'var(--cyan)', fg: 'white' },
  youtube:  { label: 'YOUTUBE',  bg: 'var(--uv)',  fg: 'white' },
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export default function AdminTracksPage() {
  const { lang } = useParams<{ lang: string }>()
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | PlaybackKind>('all')

  useEffect(() => {
    fetch('/api/admin/tracks?limit=100')
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error((j as { error?: string }).error || r.statusText)
        }
        return r.json() as Promise<Payload>
      })
      .then(setPayload)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!payload) return []
    const q = search.trim().toLowerCase()
    return payload.top_tracks.filter((t) => {
      if (kindFilter !== 'all' && t.playback_kind !== kindFilter) return false
      if (!q) return true
      return (
        t.title.toLowerCase().includes(q) ||
        (t.artists || '').toLowerCase().includes(q) ||
        (t.label || '').toLowerCase().includes(q)
      )
    })
  }, [payload, search, kindFilter])

  const maxSave = useMemo(() => filtered.reduce((m, t) => Math.max(m, t.save_count), 0), [filtered])

  return (
    <div>
      <h1 className="admin-page-title">Tracks</h1>
      <p
        className="text-sm text-[var(--ink)]/60 -mt-4 mb-6 max-w-2xl"
        style={{ fontFamily: "'Courier Prime', monospace" }}
      >
        Ranking de canciones de los charts (40 Breaks, Novedades y Vinilos) que
        los usuarios están guardando en «Mis Tracks». Se agrupan por URL canónica
        para contar una sola vez aunque el mismo tema aparezca en varios listados.
      </p>

      {loading && (
        <div className="admin-panel !p-8 text-center">
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13, color: 'var(--ink)' }}>
            Cargando estadísticas…
          </span>
        </div>
      )}

      {err && (
        <div className="admin-panel !p-5 !border-[var(--red)]">
          <strong style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--red)' }}>Error: </strong>
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13 }}>{err}</span>
        </div>
      )}

      {!loading && !err && payload && (
        <div className="flex flex-col gap-6">
          {/* Totals ribbon */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            <StatCard label="Guardados totales" value={payload.totals.saves} accent="var(--red)" />
            <StatCard label="Tracks únicos" value={payload.totals.unique_tracks} accent="var(--uv)" />
            <StatCard label="Usuarios activos" value={payload.totals.unique_users} accent="var(--cyan)" />
            <div
              className="flex flex-col justify-between p-4 sm:p-5 border-[3px] border-[var(--ink)] bg-[#fffef6]"
              style={{ boxShadow: '4px 4px 0 var(--ink)' }}
            >
              <span className="text-[9px] font-black tracking-wider uppercase text-[var(--ink)]/55">
                Por fuente
              </span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(['beatport', 'bandcamp', 'youtube'] as const).map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-black tracking-wider border-2 border-[var(--ink)]"
                    style={{ background: KIND_STYLE[k].bg, color: KIND_STYLE[k].fg }}
                  >
                    {KIND_STYLE[k].label}
                    <span className="bg-black/20 px-1 tabular-nums">{payload.totals.by_kind[k]}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar título, artista o sello…"
              className="h-10 px-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] flex-1 min-w-[220px]"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13 }}
            />
            {(['all', 'beatport', 'bandcamp', 'youtube'] as const).map((k) => {
              const active = kindFilter === k
              const label = k === 'all'
                ? `TODO (${payload.top_tracks.length})`
                : `${KIND_STYLE[k].label} (${payload.top_tracks.filter((t) => t.playback_kind === k).length})`
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={`h-10 px-3 border-[3px] border-[var(--ink)] transition-colors cursor-pointer ${
                    active ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
                  }`}
                  style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: 10, letterSpacing: 1 }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Top table */}
          <div className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-x-auto">
            <table className="min-w-full text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
              <thead className="bg-[var(--ink)] text-[var(--paper)]">
                <tr>
                  <Th className="w-10 text-center">#</Th>
                  <Th>Track</Th>
                  <Th>Artistas</Th>
                  <Th>Sello</Th>
                  <Th className="w-20 text-center">Año</Th>
                  <Th className="w-28 text-center">Fuente</Th>
                  <Th className="w-32 text-right">Guardados</Th>
                  <Th className="w-24 text-right">Usuarios</Th>
                  <Th className="w-28 text-right">Último</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-[var(--ink)]/50">
                      Sin resultados
                    </td>
                  </tr>
                ) : filtered.map((t, i) => (
                  <tr key={t.canonical_key} className="border-b-[2px] border-[var(--ink)]/10 hover:bg-[var(--yellow)]/20">
                    <td className="px-2 py-2 text-center text-[var(--ink)]/50 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-black text-[var(--ink)] leading-tight" style={{ fontFamily: "'Unbounded', sans-serif" }}>
                        {t.external_url ? (
                          <a href={t.external_url} target="_blank" rel="noopener noreferrer" className="no-underline hover:underline">
                            {t.title}
                          </a>
                        ) : t.title}
                        {t.mix_name ? <span className="font-normal text-[10px] text-[var(--ink)]/50 ml-1.5">{t.mix_name}</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[var(--ink)]/75">{t.artists || '—'}</td>
                    <td className="px-3 py-2 text-[var(--ink)]/60">{t.label || '—'}</td>
                    <td className="px-3 py-2 text-center text-[var(--ink)]/60 tabular-nums">{t.year ?? '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className="inline-block px-1.5 py-0.5 text-[9px] font-black tracking-wider border-2 border-[var(--ink)]"
                        style={{ background: KIND_STYLE[t.playback_kind].bg, color: KIND_STYLE[t.playback_kind].fg }}
                      >
                        {KIND_STYLE[t.playback_kind].label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="flex-1 h-2 bg-[var(--ink)]/10 border border-[var(--ink)]/20 max-w-[120px] relative">
                          <div
                            className="absolute inset-y-0 left-0 bg-[var(--red)]"
                            style={{ width: `${maxSave ? (t.save_count / maxSave) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="font-black tabular-nums w-8 text-right">{t.save_count}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--ink)]/75">{t.unique_users}</td>
                    <td className="px-3 py-2 text-right text-[10px] text-[var(--ink)]/50">{formatDate(t.last_saved_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Secondary panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title="Sellos más guardados" rows={payload.top_labels.map((r) => ({ label: r.name, value: r.save_count }))} accent="var(--uv)" lang={lang} linkPath={(label) => `/${lang}/labels?q=${encodeURIComponent(label)}`} />
            <Panel title="Artistas más guardados" rows={payload.top_artists.map((r) => ({ label: r.name, value: r.save_count }))} accent="var(--red)" lang={lang} linkPath={(label) => `/${lang}/artists?q=${encodeURIComponent(label)}`} />
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="relative flex flex-col justify-between p-4 sm:p-5 border-[3px] border-[var(--ink)] bg-[#fffef6] overflow-hidden"
      style={{ boxShadow: '4px 4px 0 var(--ink)' }}
    >
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accent }} />
      <span className="text-[9px] font-black tracking-wider uppercase text-[var(--ink)]/55">{label}</span>
      <div
        className="text-3xl sm:text-4xl font-black leading-none mt-3"
        style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
      >
        {value.toLocaleString('es-ES')}
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left px-3 py-2 text-[10px] font-black tracking-wider uppercase border-b-[3px] border-[var(--ink)] ${className}`}
      scope="col"
    >
      {children}
    </th>
  )
}

function Panel({
  title,
  rows,
  accent,
  lang,
  linkPath,
}: {
  title: string
  rows: { label: string; value: number }[]
  accent: string
  lang?: string
  linkPath?: (label: string) => string
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  return (
    <div className="admin-panel !p-5">
      <h2
        className="text-sm font-black uppercase mb-4 pb-2 border-b-[3px] border-[var(--ink)] flex items-center gap-2"
        style={{ fontFamily: "'Unbounded', sans-serif" }}
      >
        <span className="inline-block w-3 h-3" style={{ background: accent }} />
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--ink)]/50" style={{ fontFamily: "'Courier Prime', monospace" }}>Sin datos todavía.</p>
      ) : (
        <ol className="flex flex-col gap-2" style={{ fontFamily: "'Courier Prime', monospace" }}>
          {rows.map((r, i) => (
            <li key={r.label} className="flex items-center gap-3 text-xs">
              <span className="w-5 text-[var(--ink)]/40 tabular-nums">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate font-bold text-[var(--ink)]">
                {lang && linkPath ? (
                  <Link href={linkPath(r.label)} className="no-underline hover:underline text-[var(--ink)]">
                    {r.label}
                  </Link>
                ) : r.label}
              </span>
              <div className="w-24 h-2 bg-[var(--ink)]/10 border border-[var(--ink)]/20 relative">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ background: accent, width: `${max ? (r.value / max) * 100 : 0}%` }}
                />
              </div>
              <span className="w-8 text-right tabular-nums font-black">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
