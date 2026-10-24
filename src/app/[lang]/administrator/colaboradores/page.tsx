import type { ReactNode } from 'react'
import Link from 'next/link'
import AdminTileDialog from '@/components/admin/AdminTileDialog'
import {
  isLiveContribution,
  loadCollaboratorContributions,
  weekStartMs,
  type CollaboratorContribution,
  type ContributionKind,
  type ContributionRow,
} from '@/lib/collaborator-contributions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif" } as const

const KIND: Record<ContributionKind, string> = {
  tema: 'Tema',
  mix: 'Mix',
  evento: 'Evento',
  artista: 'Artista',
  sello: 'Sello',
}

const CATEGORIES: { kind: ContributionKind; label: string; always: boolean }[] = [
  { kind: 'tema', label: 'Temas', always: true },
  { kind: 'mix', label: 'Mixes', always: true },
  { kind: 'evento', label: 'Eventos', always: true },
  { kind: 'artista', label: 'Artistas', always: false },
  { kind: 'sello', label: 'Sellos', always: false },
]

function impactHint(rows: ContributionRow[]): string {
  const plays = rows.reduce((n, r) => n + r.plays, 0)
  const saves = rows.reduce((n, r) => n + r.saves, 0)
  if (!plays && !saves) return 'Nuevos, siguen en la web'
  return [plays ? `▶ ${plays}` : '', saves ? `+ ${saves}` : ''].filter(Boolean).join(' · ')
}

const TZ = 'Europe/Madrid'

function fmtDay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', { timeZone: TZ, day: 'numeric', month: 'short' })
  } catch {
    return iso.slice(0, 10)
  }
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-ES', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function daysAgo(iso: string | null): string {
  if (!iso) return 'Nunca'
  const madridDay = (d: Date) => Date.parse(d.toLocaleDateString('en-CA', { timeZone: TZ }))
  const days = Math.round((madridDay(new Date()) - madridDay(new Date(iso))) / 86_400_000)
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return `Hace ${days} días`
}

function liveTotal(p: CollaboratorContribution): number {
  const c = p.counts
  return c.temas + c.mixes + c.eventos + c.artistas + c.sellos + c.actualizados
}

function liveBreakdown(p: CollaboratorContribution): string {
  const c = p.counts
  const parts = [
    c.temas ? `${c.temas} temas` : '',
    c.mixes ? `${c.mixes} mixes` : '',
    c.eventos ? `${c.eventos} eventos` : '',
    c.artistas ? `${c.artistas} artistas` : '',
    c.sellos ? `${c.sellos} sellos` : '',
    c.actualizados ? `${c.actualizados} completadas` : '',
  ].filter(Boolean)
  return parts.join(' · ') || '—'
}

function Impact({ plays, saves }: { plays: number; saves: number }) {
  if (!plays && !saves) return null
  return (
    <span className="whitespace-nowrap text-[10px] font-bold uppercase" style={MONO}>
      {plays ? `▶ ${plays}` : ''}
      {plays && saves ? ' · ' : ''}
      {saves ? `+ ${saves}` : ''}
    </span>
  )
}

function Summary({ people }: { people: CollaboratorContribution[] }) {
  const th = 'px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap'
  const td = 'px-3 py-2 align-top'
  return (
    <div className="overflow-x-auto border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
      <table className="w-full min-w-[720px] border-collapse text-sm" style={MONO}>
        <thead className="bg-[var(--ink)] text-[var(--paper)]">
          <tr>
            <th className={th}>Colaborador</th>
            <th className={th}>En la web</th>
            <th className={`${th} text-right`}>Esta semana</th>
            <th className={`${th} text-right`}>Semana pasada</th>
            <th className={th}>Última vez</th>
            <th className={`${th} text-right`}>Escuchas</th>
            <th className={`${th} text-right`}>«+»</th>
            <th className={`${th} text-right`}>Fallos nuestros</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className="border-t-[2px] border-[var(--ink)]">
              <td className={td}>
                <a href={`#colab-${p.id}`} className="font-bold underline decoration-2 underline-offset-2">
                  {p.name}
                </a>
                <span className="block text-[10px] opacity-70">
                  {p.artistSlug ? `Ficha: ${p.artistName}` : 'Sin ficha de artista'}
                </span>
              </td>
              <td className={td}>
                <span className="text-lg font-black" style={DISPLAY}>
                  {liveTotal(p)}
                </span>
                <span className="block text-[10px] opacity-70">{liveBreakdown(p)}</span>
              </td>
              <td className={`${td} text-right text-lg font-black`} style={DISPLAY}>
                {p.counts.thisWeek}
              </td>
              <td className={`${td} text-right text-lg font-black`} style={DISPLAY}>
                {p.counts.lastWeek}
              </td>
              <td className={`${td} whitespace-nowrap`}>{daysAgo(p.lastAt)}</td>
              <td className={`${td} text-right font-bold`}>{p.counts.plays}</td>
              <td className={`${td} text-right font-bold`}>{p.counts.saves}</td>
              <td className={`${td} text-right ${p.counts.sistema ? 'font-bold text-[var(--red)]' : 'opacity-50'}`}>
                {p.counts.sistema}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LiveRow({ row }: { row: ContributionRow }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-[2px] border-[var(--ink)] bg-white px-3 py-2">
      <p className="min-w-0 font-bold">
        <span className="mr-2 text-[10px] uppercase tracking-wide" style={MONO}>
          {KIND[row.kind]}
        </span>
        {row.status === 'actualizado' ? (
          <span className="mr-2 bg-[var(--yellow)] px-1 text-[10px] uppercase" style={MONO}>
            Completó
          </span>
        ) : null}
        {row.href ? (
          <Link href={row.href} className="underline decoration-2 underline-offset-2">
            {row.title}
          </Link>
        ) : (
          row.title
        )}
      </p>
      <span className="flex items-baseline gap-3">
        <Impact plays={row.plays} saves={row.saves} />
        <span className="text-[10px] uppercase opacity-60" style={MONO}>
          {fmtDateTime(row.at)}
        </span>
      </span>
    </li>
  )
}

function Timeline({ rows }: { rows: ContributionRow[] }) {
  const weeks = new Map<number, ContributionRow[]>()
  for (const row of rows) {
    const w = weekStartMs(Date.parse(row.at))
    const list = weeks.get(w) || []
    list.push(row)
    weeks.set(w, list)
  }
  const ordered = [...weeks.entries()].sort((a, b) => b[0] - a[0])
  return (
    <div className="flex flex-col gap-4">
      {ordered.map(([week, list]) => (
        <section key={week}>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={MONO}>
            Semana del {fmtDay(new Date(week).toISOString())} · {list.length}
          </h4>
          <ul className="flex flex-col gap-1.5">
            {list.map((row) => (
              <LiveRow key={row.key} row={row} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function notCountedRows(rows: ContributionRow[]) {
  return {
    system: rows.filter((r) => r.status === 'sistema'),
    repeated: rows.filter((r) => r.status === 'repetido'),
    merged: rows.filter((r) => r.status === 'fusionado'),
    gone: rows.filter((r) => r.status === 'ya-no-esta'),
    unchecked: rows.filter((r) => r.status === 'sin-comprobar'),
  }
}

function NotCounted({ rows }: { rows: ContributionRow[] }) {
  const { system, repeated, merged, gone, unchecked } = notCountedRows(rows)

  const causes = new Map<string, ContributionRow[]>()
  for (const r of system) {
    const k = r.cause || 'Error al guardar'
    causes.set(k, [...(causes.get(k) || []), r])
  }

  const item = (r: ContributionRow, extra?: ReactNode) => (
    <li key={r.key} className="text-[12px] leading-snug" style={MONO}>
      <span className="mr-1 text-[10px] uppercase opacity-60">{KIND[r.kind]}</span>
      {r.title}
      {extra}
      <span className="ml-1 opacity-50">· {fmtDay(r.at)}</span>
      {r.note ? <span className="ml-1 opacity-50">· {r.note}</span> : null}
    </li>
  )

  return (
    <div className="flex flex-col gap-4">
        {system.length ? (
          <div>
            <h5 className="text-[11px] font-bold uppercase" style={MONO}>
              Fallos nuestros, no suyos
            </h5>
            <p className="mb-1 text-[11px] opacity-70" style={MONO}>
              Lo confirmó bien y el guardado falló por Beatport o por un bug del chat.
            </p>
            {[...causes.entries()].map(([cause, list]) => (
              <div key={cause} className="mt-2">
                <p className="text-[11px] font-bold" style={MONO}>
                  {cause} · {list.length}
                </p>
                <ul className="ml-3 list-disc pl-3">{list.map((r) => item(r))}</ul>
              </div>
            ))}
          </div>
        ) : null}
        {repeated.length ? (
          <div>
            <h5 className="mb-1 text-[11px] font-bold uppercase" style={MONO}>
              Ya estaban en la web
            </h5>
            <ul className="ml-3 list-disc pl-3">{repeated.map((r) => item(r))}</ul>
          </div>
        ) : null}
        {merged.length ? (
          <div>
            <h5 className="mb-1 text-[11px] font-bold uppercase" style={MONO}>
              Fusionados con otra ficha suya
            </h5>
            <ul className="ml-3 list-disc pl-3">
              {merged.map((r) =>
                item(
                  r,
                  r.mergedInto ? (
                    <>
                      {' → '}
                      {r.mergedInto.href ? (
                        <Link href={r.mergedInto.href} className="underline">
                          {r.mergedInto.title}
                        </Link>
                      ) : (
                        r.mergedInto.title
                      )}
                    </>
                  ) : null,
                ),
              )}
            </ul>
          </div>
        ) : null}
        {gone.length ? (
          <div>
            <h5 className="mb-1 text-[11px] font-bold uppercase" style={MONO}>
              Se guardó y luego se quitó
            </h5>
            <ul className="ml-3 list-disc pl-3">{gone.map((r) => item(r))}</ul>
          </div>
        ) : null}
        {unchecked.length ? (
          <div>
            <h5 className="mb-1 text-[11px] font-bold uppercase" style={MONO}>
              Sin comprobar (un lote con nuevos y repetidos)
            </h5>
            <ul className="ml-3 list-disc pl-3">{unchecked.map((r) => item(r))}</ul>
          </div>
        ) : null}
    </div>
  )
}

function PersonCard({ lang, person }: { lang: string; person: CollaboratorContribution }) {
  const live = person.rows.filter((r) => isLiveContribution(r.status))
  const newOf = (kind: ContributionKind) => live.filter((r) => r.kind === kind && r.status === 'sigue')
  const completed = live.filter((r) => r.status === 'actualizado')
  const top = live
    .filter((r) => r.plays || r.saves)
    .sort((a, b) => b.plays + b.saves * 3 - (a.plays + a.saves * 3))
    .slice(0, 15)
  const nc = notCountedRows(person.rows)
  const notCounted = person.rows.length - live.length
  return (
    <article
      id={`colab-${person.id}`}
      className="scroll-mt-24 border-[3px] border-[var(--ink)] bg-[#fffef6]"
      style={{ boxShadow: '4px 4px 0 var(--ink)' }}
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-3 text-[var(--paper)]">
        <div className="min-w-0">
          <h2 className="text-lg font-black uppercase" style={DISPLAY}>
            {person.name}
          </h2>
          <p className="mt-1 break-all text-[11px]" style={MONO}>
            {person.email || 'Sin email'}
            {person.username ? ` · @${person.username}` : ''} · última aportación {daysAgo(person.lastAt).toLowerCase()}
            {' · '}
            {person.artistSlug ? (
              <Link href={`/${lang}/artists/${person.artistSlug}`} className="underline">
                Ficha: {person.artistName}
              </Link>
            ) : (
              'Sin ficha de artista'
            )}
          </p>
        </div>
        <Link
          href={`/${lang}/administrator/users/${person.id}`}
          className="border-[3px] border-[var(--paper)] px-2 py-1 text-[10px] font-bold uppercase no-underline"
          style={MONO}
        >
          Ficha
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]">
        {CATEGORIES.filter((c) => c.always || newOf(c.kind).length).map((c) => {
          const list = newOf(c.kind)
          return (
            <AdminTileDialog
              key={c.kind}
              label={c.label}
              value={list.length}
              hint={impactHint(list)}
              title={`${person.name} · ${c.label} · ${list.length}`}
            >
              <Timeline rows={list} />
            </AdminTileDialog>
          )
        })}
        <AdminTileDialog
          label="Completadas"
          value={completed.length}
          hint="Fichas que ya existían"
          tone="yellow"
          title={`${person.name} · Completadas · ${completed.length}`}
        >
          <p className="mb-3 text-[12px] opacity-70" style={MONO}>
            Ya estaban en la web y él las terminó: line-up, fecha, cartel, sesión.
          </p>
          <Timeline rows={completed} />
        </AdminTileDialog>
        <AdminTileDialog
          label="Escuchas"
          value={person.counts.plays}
          hint={person.counts.saves ? `+ ${person.counts.saves} ${person.counts.saves === 1 ? 'guardado' : 'guardados'}` : 'De otros usuarios'}
          title={`${person.name} · Lo que más se escucha`}
        >
          <ul className="flex flex-col gap-1.5">
            {top.map((row) => (
              <LiveRow key={row.key} row={row} />
            ))}
          </ul>
        </AdminTileDialog>
        <AdminTileDialog
          label="No cuenta"
          value={notCounted}
          hint={nc.system.length ? `${nc.system.length} fallos nuestros` : 'Repetidos y quitados'}
          tone="muted"
          title={`${person.name} · No cuenta como aportación`}
        >
          <NotCounted rows={person.rows} />
        </AdminTileDialog>
      </div>
    </article>
  )
}

export default async function CollaboratorsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  let people: CollaboratorContribution[] = []
  let error: string | null = null
  try {
    people = await loadCollaboratorContributions(lang)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const active = people.filter((p) => p.rows.length > 0)
  const idle = people.filter((p) => p.rows.length === 0)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-black uppercase" style={DISPLAY}>
          Colaboradores
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={MONO}>
          Lo que cada colaborador ha subido por el chat y sigue en la web. El sello público «Artista
          colaborador» solo sale en una ficha reclamada: quien no tiene ficha aparece aquí igual.
          «Completadas» son fichas que ya existían y él terminó (line-up, fecha, cartel). Escuchas y «+»
          son de otros usuarios: los suyos no cuentan. Lo que falló por Beatport o por un bug nuestro va
          aparte y no le resta.
        </p>
      </header>

      {error ? (
        <p className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-4 py-3 text-sm" style={MONO}>
          No se ha podido leer la aportación: {error}
        </p>
      ) : null}

      {people.length === 0 && !error ? (
        <p className="text-sm" style={MONO}>
          No hay cuentas con rol colaborador.
        </p>
      ) : null}

      {active.length ? <Summary people={active} /> : null}

      {idle.length ? (
        <p className="text-sm" style={MONO}>
          <span className="font-bold uppercase">Sin aportaciones todavía:</span>{' '}
          {idle.map((p, i) => (
            <span key={p.id}>
              {i ? ', ' : ''}
              <Link href={`/${lang}/administrator/users/${p.id}`} className="underline">
                {p.name}
              </Link>
              {p.artistName ? ` (ficha ${p.artistName})` : ' (sin ficha)'}
            </span>
          ))}
          .
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        {active.map((person) => (
          <PersonCard key={person.id} lang={lang} person={person} />
        ))}
      </div>
    </div>
  )
}
