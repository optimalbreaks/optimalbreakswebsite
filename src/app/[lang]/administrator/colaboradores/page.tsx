import Link from 'next/link'
import {
  loadCollaboratorContributions,
  type CollaboratorContribution,
  type ContributionCounts,
  type ContributionKind,
  type ContributionRow,
  type ContributionStatus,
} from '@/lib/collaborator-contributions'

export const dynamic = 'force-dynamic'

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif" } as const

const KIND: Record<ContributionKind, string> = {
  tema: 'Tema',
  mix: 'Mix',
  evento: 'Evento',
  artista: 'Artista',
  sello: 'Sello',
}

const STATUS: Record<ContributionStatus, string> = {
  sigue: 'Sigue publicado',
  actualizado: 'Ya estaba',
  'no-entro': 'No entró',
  'ya-no-esta': 'Ya no está',
  'sin-comprobar': 'Sin comprobar',
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function sumCounts(people: CollaboratorContribution[]): ContributionCounts {
  const totals: ContributionCounts = {
    temas: 0,
    mixes: 0,
    eventos: 0,
    actualizados: 0,
    artistas: 0,
    sellos: 0,
    noEntraron: 0,
    yaNoEstan: 0,
  }
  for (const person of people) {
    for (const key of Object.keys(totals) as (keyof ContributionCounts)[]) {
      totals[key] += person.counts[key]
    }
  }
  return totals
}

function Kpi({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="border-[3px] border-[var(--ink)] bg-[#fffef6] px-3 py-3" style={{ boxShadow: '3px 3px 0 var(--ink)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink)]" style={MONO}>
        {label}
      </p>
      <p className="mt-1 text-3xl font-black leading-none" style={DISPLAY}>
        {value}
      </p>
      <p className="mt-2 text-[10px] leading-snug opacity-70" style={MONO}>
        {hint}
      </p>
    </div>
  )
}

function RowList({
  title,
  rows,
  empty,
}: {
  title: string
  rows: ContributionRow[]
  empty: string
}) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={MONO}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm opacity-60" style={MONO}>
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.key} className="border-[3px] border-[var(--ink)] bg-white px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-bold">
                  <span className="mr-2 text-[10px] uppercase tracking-wide" style={MONO}>
                    {KIND[row.kind]}
                  </span>
                  {row.href ? (
                    <Link href={row.href} className="underline decoration-2 underline-offset-2">
                      {row.title}
                    </Link>
                  ) : (
                    row.title
                  )}
                </p>
                <span className="text-[10px] uppercase" style={MONO}>
                  {STATUS[row.status]} · {fmtDate(row.at)}
                </span>
              </div>
              {row.note ? (
                <p className="mt-1 text-[11px] leading-snug opacity-70" style={MONO}>
                  {row.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PersonCard({ lang, person }: { lang: string; person: CollaboratorContribution }) {
  const published = person.rows.filter((r) => r.status === 'sigue')
  const touched = person.rows.filter((r) => r.status === 'actualizado')
  const missed = person.rows.filter((r) => r.status === 'no-entro' || r.status === 'ya-no-esta' || r.status === 'sin-comprobar')
  const c = person.counts
  return (
    <article className="border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
      <header className="border-b-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-3 text-[var(--paper)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black uppercase" style={DISPLAY}>
              {person.name}
            </h2>
            <p className="mt-1 text-[11px]" style={MONO}>
              {person.email || 'Sin email'}
              {person.username ? ` · @${person.username}` : ''}
            </p>
          </div>
          <Link
            href={`/${lang}/administrator/users/${person.id}`}
            className="border-[3px] border-[var(--paper)] px-2 py-1 text-[10px] font-bold uppercase no-underline"
            style={MONO}
          >
            Ficha
          </Link>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed" style={MONO}>
          {c.temas} temas · {c.mixes} mixes · {c.eventos} eventos nuevos
          {c.artistas || c.sellos ? ` · ${c.artistas} artistas · ${c.sellos} sellos` : ''}
          {c.actualizados ? ` · ${c.actualizados} ya estaban` : ''}
          {c.noEntraron ? ` · ${c.noEntraron} no entraron` : ''}
          {c.yaNoEstan ? ` · ${c.yaNoEstan} ya no están` : ''}
        </p>
      </header>
      <div className="grid gap-5 p-4 lg:grid-cols-2">
        <RowList title="Sigue en la web" rows={published} empty="Nada suyo sigue publicado." />
        <div className="flex flex-col gap-5">
          <RowList title="Ya estaba y lo tocó" rows={touched} empty="No ha reescrito fichas que ya existían." />
          <RowList title="No cuenta como aportación" rows={missed} empty="Sin intentos fallidos ni borrados." />
        </div>
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
  const totals = sumCounts(people)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-black uppercase" style={DISPLAY}>
          Colaboradores
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={MONO}>
          Lo que cada colaborador ha confirmado en el chat y lo que sigue publicado. Un guardado que
          falló, o un tema que luego se quitó, no cuenta como aportación. El mismo evento tocado dos
          veces cuenta una.
        </p>
        {totals.artistas || totals.sellos ? (
          <p className="mt-2 text-sm" style={MONO}>
            Fichas nuevas: {totals.artistas} artistas · {totals.sellos} sellos.
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-4 py-3 text-sm" style={MONO}>
          No se ha podido leer la aportación: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Temas" value={totals.temas} hint="Siguen en el catálogo" />
        <Kpi label="Mixes" value={totals.mixes} hint="Sesiones nuevas" />
        <Kpi label="Eventos" value={totals.eventos} hint="Los crearon ellos" />
        <Kpi label="Ya estaban" value={totals.actualizados} hint="Los reescribieron" />
        <Kpi label="No entró" value={totals.noEntraron} hint="Confirmado y falló" />
        <Kpi label="Ya no está" value={totals.yaNoEstan} hint="Se guardó y se quitó" />
      </div>

      {people.length === 0 && !error ? (
        <p className="text-sm" style={MONO}>
          No hay cuentas con rol colaborador.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {people.map((person) => (
            <PersonCard key={person.id} lang={lang} person={person} />
          ))}
        </div>
      )}
    </div>
  )
}
