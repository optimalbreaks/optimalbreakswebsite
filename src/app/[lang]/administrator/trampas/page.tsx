import Link from 'next/link'
import { loadCheatBoard, type CheatMark, type CheatPerson, type CheatTrack } from '@/lib/cheat-board'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif" } as const
const TZ = 'Europe/Madrid'

const KIND: Record<CheatMark['kind'], string> = {
  artista: 'Artista',
  claim: 'Reclamado',
  familiar: 'Familiar',
  sello: 'Sello',
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', {
      timeZone: TZ,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

function pair(count: number, tracks: number, unit: string): string {
  if (!count) return `0 ${unit}`
  const temas = tracks === 1 ? '1 tema' : `${tracks} temas`
  return `${count} ${unit} · ${temas}`
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border-[3px] border-[var(--ink)] bg-[#fffef6] px-4 py-3" style={{ boxShadow: '3px 3px 0 var(--ink)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-60" style={MONO}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-black leading-none" style={DISPLAY}>
        {value}
      </p>
      <p className="mt-1 text-[11px] opacity-70" style={MONO}>
        {hint}
      </p>
    </div>
  )
}

function TrackTable({ tracks }: { tracks: CheatTrack[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[12px]" style={MONO}>
        <thead>
          <tr className="border-b-[3px] border-[var(--ink)] text-[10px] uppercase tracking-wider">
            <th className="py-2 pr-3 font-bold">Tema</th>
            <th className="py-2 pr-3 font-bold">Por qué</th>
            <th className="py-2 pr-3 font-bold">+</th>
            <th className="py-2 pr-3 font-bold">▶</th>
            <th className="py-2 font-bold">Última</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((t) => (
            <tr key={t.key} className="border-b border-[var(--ink)]/15 align-top">
              <td className="py-2 pr-3">
                <span className="font-bold">{t.title}</span>
                {t.artists ? <span className="mt-0.5 block opacity-70">{t.artists}</span> : null}
                {t.label ? <span className="block text-[10px] uppercase opacity-50">{t.label}</span> : null}
              </td>
              <td className="py-2 pr-3">{t.why.join(' · ')}</td>
              <td className="py-2 pr-3 font-bold">{t.votes || '—'}</td>
              <td className="py-2 pr-3 font-bold">{t.plays || '—'}</td>
              <td className="py-2 whitespace-nowrap">{fmtWhen(t.lastAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PersonCard({ lang, rank, person }: { lang: string; rank: number; person: CheatPerson }) {
  return (
    <article className="border-[3px] border-[var(--ink)] bg-[#fffef6]" style={{ boxShadow: '4px 4px 0 var(--ink)' }}>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-3 text-[var(--paper)]">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70" style={MONO}>
            #{rank} · {person.score} movimientos
          </p>
          <h2 className="text-lg font-black uppercase" style={DISPLAY}>
            {person.name}
          </h2>
          <p className="mt-1 break-all text-[11px]" style={MONO}>
            {person.email || 'Sin email'}
            {person.username ? ` · @${person.username}` : ''}
          </p>
        </div>
        <Link
          href={`/${lang}/administrator/users/${person.userId}`}
          className="border-[3px] border-[var(--paper)] px-2 py-1 text-[10px] font-bold uppercase no-underline"
          style={MONO}
        >
          Ficha
        </Link>
      </header>
      <div className="flex flex-col gap-3 p-4">
        <ul className="flex flex-wrap gap-1.5">
          {person.marks.map((m) => (
            <li
              key={`${m.kind}-${m.name}`}
              className="border-[2px] border-[var(--ink)] bg-[var(--yellow)] px-2 py-0.5 text-[10px] font-bold uppercase"
              style={MONO}
            >
              {KIND[m.kind]} · {m.name}
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="text-[13px]" style={MONO}>
            <span className="font-bold">A su nombre. </span>
            {pair(person.nameVotes, person.nameVoteTracks, '«+»')}
            {' · '}
            {pair(person.namePlays, person.namePlayTracks, 'escuchas')}
          </p>
          <p className="text-[13px]" style={MONO}>
            <span className="font-bold">A su sello. </span>
            {pair(person.labelVotes, person.labelVoteTracks, '«+»')}
            {' · '}
            {pair(person.labelPlays, person.labelPlayTracks, 'escuchas')}
          </p>
        </div>
        <p className="text-[12px] opacity-70" style={MONO}>
          El resto de la cuenta: {person.otherVotes} «+» · {person.otherPlays} escuchas
          {person.unresolved ? ` · ${person.unresolved} sin ficha, fuera del puesto` : ''}
        </p>
        {person.tracks.length ? (
          <details className="border-t-[3px] border-[var(--ink)] pt-3">
            <summary className="cursor-pointer text-[12px] font-bold uppercase" style={MONO}>
              Ver {person.tracks.length === 1 ? '1 tema' : `${person.tracks.length} temas`}
            </summary>
            <div className="mt-3">
              <TrackTable tracks={person.tracks} />
            </div>
          </details>
        ) : (
          <p className="text-[12px] opacity-70" style={MONO}>
            Nada registrado a su nombre ni a su sello.
          </p>
        )}
      </div>
    </article>
  )
}

export default async function AdminTrampasPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const board = await loadCheatBoard()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <span
          className="mb-3 inline-block border-2 border-[var(--ink)] bg-[var(--red)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[4px] text-white"
          style={MONO}
        >
          Backstage
        </span>
        <h1 className="text-3xl font-black leading-none sm:text-5xl" style={DISPLAY}>
          Trampas
        </h1>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed" style={MONO}>
          Cuentas ya marcadas: artista, reclamado, familiar o sello. Cuenta cada «+» y cada escucha de un tema que
          lleva ese nombre, y cada «+» o escucha de un tema de ese sello. Si el tema es suyo y del sello, entra una
          vez, en «a su nombre». El puesto suma los dos. No se borra nada.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cuentas" value={String(board.accounts)} hint="Marcadas o reclamadas" />
        <Stat label="«+» a su nombre" value={String(board.nameVotes)} hint="No suben el tema" />
        <Stat label="Escuchas a su nombre" value={String(board.namePlays)} hint="No suben el tema" />
        <Stat label="A su sello" value={String(board.labelVotes + board.labelPlays)} hint={`${board.labelVotes} «+» · ${board.labelPlays} escuchas`} />
      </div>

      {board.people.length ? (
        <div className="flex flex-col gap-4">
          {board.people.map((person, i) => (
            <PersonCard key={person.userId} lang={lang} rank={i + 1} person={person} />
          ))}
        </div>
      ) : (
        <p className="text-[13px]" style={MONO}>
          No hay cuentas marcadas.
        </p>
      )}
    </div>
  )
}
