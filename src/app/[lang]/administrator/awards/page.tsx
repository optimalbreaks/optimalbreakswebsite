'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { EmptyState, HorizontalRankBars } from '@/components/admin/AdminEngagementCharts'
import type { AwardCategory, AwardEntry, AwardsAxis, AwardsBoard, AwardsMode } from '@/lib/awards-board'

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

  const years = board?.years?.length ? board.years : [Number(year) || new Date().getFullYear()]
  const edition = board?.edition
  const coverage = board?.coverage
  const countryPct =
    coverage && coverage.credit_events > 0
      ? Math.round((coverage.credit_events_with_country / coverage.credit_events) * 100)
      : 0

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[3px] text-[var(--red)]" style={mono}>
            BreaksPoll · solo admin
          </p>
          <h1 className="text-3xl sm:text-4xl font-black leading-none mt-1" style={display}>
            Awards
          </h1>
          <p className="text-[11px] font-bold text-[var(--ink)]/55 mt-2 max-w-xl leading-relaxed" style={mono}>
            Cada «+» de Mis Tracks es un voto. Las canciones siguen el Top 100. Artistas, sellos y países
            usan el tablero: sin auto-voto y sin el volcado de un sello fichado.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[2px]" style={mono}>
            Edición
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="border-[3px] border-[var(--ink)] bg-[#fffef6] px-2 py-1.5 text-[12px] font-bold"
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
          <div className="flex flex-wrap gap-2">
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
        <div className={loading ? 'opacity-60 pointer-events-none' : ''}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Votos de la edición" value={num(edition.saves)} sub="«+» que entran en este corte" accent="var(--red)" />
            <Kpi label="Temas" value={num(edition.tracks)} sub="Misma canción, una sola vez" accent="var(--yellow)" />
            <Kpi label="Quien vota" value={num(edition.users)} sub="Cuentas con al menos un «+»" accent="var(--uv)" />
            <Kpi label="Créditos con país" value={`${countryPct}%`} sub="Sin país no hay premio español" accent="var(--cyan)" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {edition.categories.map((cat) => (
              <CategoryCard key={cat.id} cat={cat} lang={lang} />
            ))}
          </div>

          <section className="mt-6 border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
            <Head title="Por país" hint="Nacionalidad de la ficha, con los créditos de esta edición. Un país compuesto suma en los dos." />
            <div className="p-4 overflow-x-auto">
              {edition.countries.length === 0 ? (
                <EmptyState message="Sin países en este corte" />
              ) : (
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
                        <td className="px-3 py-2 text-[12px] font-bold text-right tabular-nums">{num(c.save_count)}</td>
                        <td className="px-3 py-2 text-[12px] font-bold text-right tabular-nums">{num(c.artist_count)}</td>
                        <td className="px-3 py-2 text-[12px] font-bold text-right tabular-nums">{num(c.unique_users)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="mt-4 border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
            <Head title="Por año de lanzamiento" hint={board.release_years_hint} />
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HorizontalRankBars
                rows={board.release_years.slice(0, 16).map((r) => ({ name: r.label, value: r.save_count }))}
                valueLabel="+"
                color="var(--red)"
              />
              <div className="overflow-x-auto">
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
                    {board.release_years.map((r) => (
                      <tr key={r.label}>
                        <td className="px-3 py-2 text-[12px] font-black">{r.label}</td>
                        <td className="px-3 py-2 text-[12px] font-bold text-right tabular-nums">{num(r.save_count)}</td>
                        <td className="px-3 py-2 text-[12px] font-bold text-right tabular-nums">{num(r.unique_tracks)}</td>
                        <td className="px-3 py-2 text-[11px] font-bold">{r.top_title || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="mt-4 border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
            <Head
              title="Cobertura"
              hint={`${num(coverage.tracks_without_year)} temas sin año · ${num(coverage.orphan_saves)} «+» sin ficha de canción · ${num(coverage.aggregator_saves)} en agregadores (no compiten como sello). El premio español solo ve lo que tiene país.`}
            />
            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
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
    <div className="inline-flex border-[3px] border-[var(--ink)]" style={mono}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider ${
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
    <div className="relative p-4 border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: accent }} />
      <div className="text-[10px] font-black uppercase tracking-[2px] text-[var(--ink)]/55 mb-2" style={mono}>
        {label}
      </div>
      <div className="text-3xl font-black leading-none" style={display}>
        {value}
      </div>
      <p className="text-[10px] font-bold text-[var(--ink)]/45 mt-2" style={mono}>
        {sub}
      </p>
    </div>
  )
}

function Head({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="px-4 py-3 border-b-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
      <h2 className="text-sm font-black uppercase" style={display}>
        {title}
      </h2>
      <p className="text-[10px] font-bold opacity-70 mt-1 leading-relaxed" style={mono}>
        {hint}
      </p>
    </div>
  )
}

function CategoryCard({ cat, lang }: { cat: AwardCategory; lang: string }) {
  const winner = cat.entries[0]
  const rest = cat.entries.slice(1)
  return (
    <section className="border-[3px] border-[var(--ink)] bg-[#fffef6] flex flex-col" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
      <div className="px-4 py-3 border-b-[3px] border-[var(--ink)]">
        <h2 className="text-sm font-black uppercase" style={display}>
          {cat.title}
        </h2>
        <p className="text-[10px] font-bold text-[var(--ink)]/50 mt-1 leading-relaxed" style={mono}>
          {cat.hint}
        </p>
      </div>
      <div className="p-4 flex-1">
        {!winner ? (
          <EmptyState message="Nadie entra en este corte" />
        ) : (
          <>
            <NomineeRow entry={winner} lang={lang} lead />
            {rest.length > 0 && (
              <ol className="mt-3 space-y-2 border-t-2 border-[var(--ink)]/10 pt-3">
                {rest.map((e) => (
                  <li key={`${cat.id}-${e.rank}`}>
                    <NomineeRow entry={e} lang={lang} />
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

function NomineeRow({ entry, lang, lead = false }: { entry: AwardEntry; lang: string; lead?: boolean }) {
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
  return (
    <div className="flex items-start gap-3">
      {entry.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.image_url} alt="" className={`shrink-0 border-[3px] border-[var(--ink)] object-cover ${lead ? 'w-16 h-16' : 'w-10 h-10'}`} />
      ) : (
        <span
          className={`shrink-0 flex items-center justify-center border-[3px] border-[var(--ink)] bg-[var(--yellow)] font-black ${lead ? 'w-16 h-16 text-lg' : 'w-10 h-10 text-xs'}`}
          style={display}
        >
          {entry.rank}
        </span>
      )}
      <div className="min-w-0">
        <div className={`font-black leading-tight ${lead ? 'text-xl' : 'text-[13px]'}`} style={display}>
          {title}
        </div>
        {entry.detail && (
          <p className="text-[10px] font-bold text-[var(--ink)]/55 mt-0.5 leading-snug" style={mono}>
            {entry.detail}
          </p>
        )}
        <p className="text-[10px] font-black uppercase tracking-wider mt-1" style={mono}>
          {num(entry.save_count)} +
          {' · '}
          {num(entry.unique_users)} {entry.unique_users === 1 ? 'fan' : 'fans'}
          {entry.unique_tracks != null ? ` · ${num(entry.unique_tracks)} temas` : ''}
        </p>
      </div>
    </div>
  )
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
              <span className="min-w-0">
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
