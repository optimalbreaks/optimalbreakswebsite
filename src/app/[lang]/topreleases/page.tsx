// ============================================
// OPTIMAL BREAKS — Top novedades
// ----------------------------------------------
// Las quincenas y las temporadas nacen en el blog. Aquí se leen agrupadas:
// arriba la última quincena (suena ahí mismo), debajo una tarjeta por
// temporada con sus quincenas dentro. `?year=` cambia de año cuando hay más
// de uno. Las escuchas existen desde el 6 oct 2026: un periodo que cerró
// antes se ordena por votos. El top histórico sigue en /topalltimes.
// ============================================

import Link from 'next/link'
import type { Metadata } from 'next'
import CardThumbnail from '@/components/CardThumbnail'
import { DigestTrackStrip } from '@/components/FortnightDigest'
import { getDictionary } from '@/lib/dictionaries'
import { getFortnightLive, type FortnightLive } from '@/lib/fortnight-live'
import { splitArtistDisplayLine } from '@/lib/artist-slug-map'
import type { Locale } from '@/lib/i18n-config'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import { staticPageMetadata } from '@/lib/seo'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { createCachedSupabase } from '@/lib/supabase-server'
import type { FortnightDigestTrack } from '@/types/database'

export const dynamic = 'force-dynamic'

/** Primer día con escuchas registradas (`track_plays`). */
const PLAYS_SINCE = '2026-10-06'

const COPY = {
  es: {
    kicker: 'TOP NOVEDADES',
    title: 'Top novedades',
    subtitle:
      'Lo más escuchado de cada quincena, agrupado por temporada. Desde el 6 de octubre de 2026 el puesto sale de las escuchas; antes, de los votos.',
    empty: 'Todavía no hay quincenas publicadas.',
    read: 'VER EL ARTÍCULO →',
    plays: 'escuchas',
    playOne: 'escucha',
    votes: 'votos',
    voteOne: 'voto',
    byPlays: 'Más escuchados',
    byVotes: 'Más votados',
    votesNote: 'Ordenado por votos: las escuchas se cuentan desde el 6 oct 2026.',
    latest: 'ÚLTIMA QUINCENA',
    fortnight: 'QUINCENA',
    seasons: ['INVIERNO', 'PRIMAVERA', 'VERANO', 'OTOÑO'],
    seasonNames: ['Invierno', 'Primavera', 'Verano', 'Otoño'],
    running: 'EN CURSO',
    byFortnight: (season: string) => `${season}, quincena a quincena`,
    pending: 'El artículo de la temporada sale cuando cierra el trimestre. Mientras, sus quincenas:',
    fortnights: (n: number) => (n === 1 ? '1 QUINCENA' : `${n} QUINCENAS`),
    playFortnight: '▶ ESCUCHAR LA QUINCENA · {n} TEMAS',
    playSeason: (label: string) => `▶ ESCUCHAR ${label} · {n} TEMAS`,
    years: 'AÑO',
  },
  en: {
    kicker: 'TOP RELEASES',
    title: 'Top releases',
    subtitle:
      'The most played tracks of each fortnight, grouped by season. From 6 October 2026 rank comes from plays; before that, from votes.',
    empty: 'No fortnights published yet.',
    read: 'READ THE ARTICLE →',
    plays: 'plays',
    playOne: 'play',
    votes: 'votes',
    voteOne: 'vote',
    byPlays: 'Most played',
    byVotes: 'Most voted',
    votesNote: 'Ranked by votes: plays are counted from 6 OCT 2026.',
    latest: 'LATEST FORTNIGHT',
    fortnight: 'FORTNIGHT',
    seasons: ['WINTER', 'SPRING', 'SUMMER', 'AUTUMN'],
    seasonNames: ['Winter', 'Spring', 'Summer', 'Autumn'],
    running: 'IN PROGRESS',
    byFortnight: (season: string) => `${season}, fortnight by fortnight`,
    pending: 'The season article comes out when the quarter closes. Meanwhile, its fortnights:',
    fortnights: (n: number) => (n === 1 ? '1 FORTNIGHT' : `${n} FORTNIGHTS`),
    playFortnight: '▶ PLAY THE FORTNIGHT · {n} TRACKS',
    playSeason: (label: string) => `▶ PLAY ${label} · {n} TRACKS`,
    years: 'YEAR',
  },
} as const

type Rank = 'plays' | 'votes'

type PostRow = {
  slug: string
  title_es: string
  title_en: string
  excerpt_es: string | null
  excerpt_en: string | null
  kind: string | null
  from: string | null
  until: string | null
  intro_es: string | null
  intro_en: string | null
  played: FortnightDigestTrack | null
  voted: FortnightDigestTrack | null
  released: FortnightDigestTrack | null
}

type Post = PostRow & { from: string; until: string; season: boolean; year: number; q: number; rank: Rank }

type SeasonGroup = { year: number; q: number; post: Post | null; fortnights: Post[] }

/** Un periodo que cerró antes de que existieran las escuchas se ordena por votos. */
function rankOf(until: string): Rank {
  return until < PLAYS_SINCE ? 'votes' : 'plays'
}

/** Temporada = trimestre natural del punto medio del periodo (una quincena a caballo cae donde pesa más). */
function quarterOf(from: string, until: string): { year: number; q: number } {
  const mid = new Date((Date.parse(`${from}T12:00:00Z`) + Date.parse(`${until}T12:00:00Z`)) / 2)
  return { year: mid.getUTCFullYear(), q: Math.floor(mid.getUTCMonth() / 3) }
}

function quarterBounds(year: number, q: number): { from: string; until: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const last = new Date(Date.UTC(year, q * 3 + 3, 0)).getUTCDate()
  return { from: `${year}-${pad(q * 3 + 1)}-01`, until: `${year}-${pad(q * 3 + 3)}-${pad(last)}` }
}

function todayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function periodLabel(from: string, until: string, lang: Locale): string {
  const fmt = (ymd: string) =>
    new Date(`${ymd}T12:00:00Z`)
      .toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .replace('.', '')
  return `${fmt(from)} — ${fmt(until)}`
}

function trackName(t: FortnightDigestTrack): string {
  return t.mix_name && !/^original mix$/i.test(t.mix_name) ? `${t.title} (${t.mix_name})` : t.title
}

function rankedTracks(post: Post, live: FortnightLive | null): FortnightDigestTrack[] {
  if (post.rank === 'votes') return live?.voted?.length ? live.voted : post.voted ? [post.voted] : []
  if (live?.released?.length) return live.released
  if (live?.played?.length) return live.played
  const frozen = post.released ?? post.played
  return frozen ? [frozen] : []
}

function topArtists(post: Post, live: FortnightLive | null, tracks: FortnightDigestTrack[]): string[] {
  if (post.rank === 'plays' && live?.played_artists?.length) return live.played_artists.slice(0, 3).map((a) => a.name)
  const score = new Map<string, number>()
  for (const t of tracks) {
    for (const name of new Set(splitArtistDisplayLine(t.artists))) score.set(name, (score.get(name) || 0) + t.value)
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>
}): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/topreleases', 'topreleases')
}

export default async function TopReleasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Locale }>
  searchParams?: Promise<{ year?: string | string[] }>
}) {
  const { lang } = await params
  const sp = await (searchParams ?? Promise.resolve({} as { year?: string | string[] }))
  await getDictionary(lang)
  const t = COPY[lang]
  const supabase = createCachedSupabase(300, [PUBLIC_CATALOG_CACHE_TAG])

  // Solo los campos que pinta la página: el digest entero pesa 50–80 KB por artículo.
  const rows = await fetchAllPages<PostRow>(
    (a, b) =>
      supabase
        .from('blog_posts')
        .select(
          'slug, title_es, title_en, excerpt_es, excerpt_en, kind:digest->>kind, from:digest->>from, until:digest->>until, intro_es:digest->copy->es->>intro, intro_en:digest->copy->en->>intro, played:digest->played->0, voted:digest->voted->0, released:digest->released->0',
        )
        .eq('is_published', true)
        .not('digest', 'is', null)
        .order('id')
        .range(a, b),
    200,
  ).catch(() => [] as PostRow[])

  const posts: Post[] = rows
    .filter((r): r is PostRow & { from: string; until: string } => !!r.slug && r.kind !== 'agenda' && !!r.from && !!r.until)
    .map((r) => ({ ...r, season: r.kind === 'trimestre', rank: rankOf(r.until), ...quarterOf(r.from, r.until) }))
    .sort((a, b) => b.until.localeCompare(a.until))

  const groups = new Map<string, SeasonGroup>()
  for (const p of posts) {
    const key = `${p.year}-${p.q}`
    const g = groups.get(key) ?? { year: p.year, q: p.q, post: null, fortnights: [] }
    if (p.season) g.post ??= p
    else g.fortnights.push(p)
    groups.set(key, g)
  }
  const seasons = [...groups.values()].sort((a, b) => b.year - a.year || b.q - a.q)
  const years = [...new Set(seasons.map((s) => s.year))]
  const asked = Number(Array.isArray(sp.year) ? sp.year[0] : sp.year)
  const year = years.includes(asked) ? asked : years[0]
  const visible = seasons.filter((s) => s.year === year)
  const hero = year === years[0] ? posts.find((p) => !p.season) ?? null : null

  const liveTargets = [...(hero ? [hero] : []), ...visible.flatMap((s) => (s.post ? [s.post] : []))]
  const liveRows = await Promise.all(
    liveTargets.map((p) => getFortnightLive(p.from, p.until, p.season ? 20 : 10)),
  )
  const live = new Map(liveTargets.map((p, i) => [p.slug, liveRows[i]]))
  const today = todayMadrid()

  const mono = { fontFamily: "'Courier Prime', monospace" } as const
  const display = { fontFamily: "'Unbounded', sans-serif" } as const
  const unitsFor = (rank: Rank) => (rank === 'votes' ? ([t.voteOne, t.votes] as const) : ([t.playOne, t.plays] as const))
  const titleOf = (p: Post) => (lang === 'es' ? p.title_es : p.title_en)
  const introOf = (p: Post) => (lang === 'es' ? p.intro_es || p.excerpt_es : p.intro_en || p.excerpt_en) || ''
  const href = (p: Post) => `/${lang}/topreleases/${p.slug}`

  const readButton = (p: Post) => (
    <Link
      href={href(p)}
      className="inline-flex mt-4 min-h-[40px] items-center px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] no-underline hover:bg-[var(--red)] hover:text-white"
      style={mono}
    >
      {t.read}
    </Link>
  )

  const artistsLine = (p: Post, tracks: FortnightDigestTrack[]) => {
    const names = topArtists(p, live.get(p.slug) ?? null, tracks)
    if (names.length === 0) return null
    return (
      <p className="text-[12px] font-bold mb-3" style={mono}>
        <span className="tracking-[1px] text-[var(--ink)]/50">{p.rank === 'votes' ? t.byVotes : t.byPlays}: </span>
        {names.join(' · ')}
      </p>
    )
  }

  const fortnightRow = (p: Post) => {
    const first = rankedTracks(p, live.get(p.slug) ?? null)[0]
    return (
      <li key={p.slug} className="border-t-2 border-[var(--ink)]/15 first:border-t-0">
        <Link href={href(p)} className="flex items-center gap-3 py-2 no-underline text-[var(--ink)] hover:text-[var(--red)]">
          <div className="w-10 shrink-0">
            <CardThumbnail
              src={first?.artwork_url ?? null}
              alt={first ? `${first.artists} — ${first.title}` : ''}
              aspectClass="aspect-square"
              frameClass="border-[2px] border-[var(--ink)]"
              sizes="40px"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-black uppercase" style={mono}>{periodLabel(p.from, p.until, lang)}</div>
            {first ? (
              <div className="text-[12px] truncate" style={mono}>
                #1 {first.artists} — {trackName(first)}
              </div>
            ) : null}
          </div>
          <span className="shrink-0 text-[14px] font-black" aria-hidden>→</span>
        </Link>
      </li>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        <header className="mb-8 sm:mb-10">
          <span
            className="inline-block px-2 py-1 text-[10px] font-black tracking-[4px] bg-[var(--acid)] text-[var(--ink)] border-2 border-[var(--ink)] mb-3"
            style={mono}
          >
            {t.kicker}
          </span>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[0.95] mb-3" style={{ ...display, color: 'var(--ink)' }}>
            {t.title}
          </h1>
          <p className="text-sm sm:text-base text-[var(--ink)]/60 max-w-2xl" style={mono}>
            {t.subtitle}
          </p>
          {years.length > 1 ? (
            <nav className="flex flex-wrap items-center gap-2 mt-4" aria-label={t.years}>
              <span className="text-[10px] font-black tracking-[2px]" style={mono}>{t.years}</span>
              {years.map((y) => (
                <Link
                  key={y}
                  href={y === years[0] ? `/${lang}/topreleases` : `/${lang}/topreleases?year=${y}`}
                  aria-current={y === year ? 'page' : undefined}
                  className={`px-2.5 py-1 text-[12px] font-black border-2 border-[var(--ink)] no-underline ${y === year ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'}`}
                  style={mono}
                >
                  {y}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>

        {posts.length === 0 ? (
          <p className="text-sm text-[var(--ink)]/50" style={mono}>{t.empty}</p>
        ) : (
          <>
            {hero ? (() => {
              const tracks = rankedTracks(hero, live.get(hero.slug) ?? null)
              const intro = introOf(hero)
              return (
                <article className="mb-10 border-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[6px_6px_0_var(--ink)]">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b-[3px] border-[var(--ink)] bg-[var(--yellow)]">
                    <span className="px-1.5 py-0.5 text-[10px] font-black tracking-[2px] bg-[var(--red)] text-white" style={mono}>
                      {t.latest}
                    </span>
                    <span className="text-[11px] font-bold uppercase" style={mono}>{periodLabel(hero.from, hero.until, lang)}</span>
                  </div>
                  <div className="p-3 sm:p-5">
                    <h2 className="text-2xl sm:text-3xl font-black leading-tight mb-2" style={display}>
                      <Link href={href(hero)} className="text-[var(--ink)] no-underline hover:text-[var(--red)]">{titleOf(hero)}</Link>
                    </h2>
                    {intro ? <p className="text-[14px] leading-relaxed text-[var(--ink)]/70 mb-3" style={mono}>{intro}</p> : null}
                    {artistsLine(hero, tracks)}
                    <DigestTrackStrip
                      tracks={tracks}
                      spot={`h-${hero.slug}`}
                      groupKey={`topreleases:${hero.from}:${hero.until}`}
                      units={unitsFor(hero.rank)}
                      playAll={t.playFortnight}
                      large
                    />
                    {hero.rank === 'votes' ? <p className="mt-2 text-[11px] text-[var(--dim)]" style={mono}>{t.votesNote}</p> : null}
                    {readButton(hero)}
                  </div>
                </article>
              )
            })() : null}

            <ol className="list-none m-0 p-0 relative">
              <span className="absolute left-[7px] top-2 bottom-2 w-[3px] bg-[var(--ink)]" aria-hidden />
              {visible.map((g) => {
                const label = `${t.seasons[g.q]} ${g.year}`
                const bounds = quarterBounds(g.year, g.q)
                const running = !g.post && today >= bounds.from && today <= bounds.until
                const p = g.post
                const tracks = p ? rankedTracks(p, live.get(p.slug) ?? null) : []
                const intro = p ? introOf(p) : ''
                const list = g.fortnights.length > 0 ? <ol className="list-none m-0 p-0">{g.fortnights.map(fortnightRow)}</ol> : null
                return (
                  <li key={`${g.year}-${g.q}`} className="relative pl-8 sm:pl-10 pb-8 last:pb-0">
                    <span className="absolute left-0 top-1.5 h-4 w-4 border-[3px] border-[var(--ink)] bg-[var(--acid)]" aria-hidden />
                    <article className="border-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[4px_4px_0_var(--ink)]">
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b-[3px] border-[var(--ink)] bg-[var(--paper-dark)]">
                        <span className="px-1.5 py-0.5 text-[10px] font-black tracking-[2px] bg-[var(--ink)] text-[var(--paper)]" style={mono}>
                          {label}
                        </span>
                        <span className="text-[11px] font-bold uppercase" style={mono}>{periodLabel(bounds.from, bounds.until, lang)}</span>
                        {running ? (
                          <span className="px-1.5 py-0.5 text-[10px] font-black tracking-[2px] bg-[var(--red)] text-white" style={mono}>
                            {t.running}
                          </span>
                        ) : null}
                      </div>
                      <div className="p-3 sm:p-4">
                        {p ? (
                          <>
                            <h2 className="text-xl sm:text-2xl font-black leading-tight mb-2" style={display}>
                              <Link href={href(p)} className="text-[var(--ink)] no-underline hover:text-[var(--red)]">{titleOf(p)}</Link>
                            </h2>
                            {intro ? <p className="text-[14px] leading-relaxed text-[var(--ink)]/70 mb-3" style={mono}>{intro}</p> : null}
                            {artistsLine(p, tracks)}
                            <DigestTrackStrip
                              tracks={tracks}
                              spot={`s-${p.slug}`}
                              groupKey={`topreleases:${p.from}:${p.until}`}
                              units={unitsFor(p.rank)}
                              playAll={t.playSeason(label)}
                            />
                            {p.rank === 'votes' ? <p className="mt-2 text-[11px] text-[var(--dim)]" style={mono}>{t.votesNote}</p> : null}
                            {readButton(p)}
                            {list ? (
                              <details className="mt-4 border-t-[3px] border-[var(--ink)] pt-2">
                                <summary className="cursor-pointer text-[11px] font-black tracking-[2px] py-1" style={mono}>
                                  {t.fortnights(g.fortnights.length)}
                                </summary>
                                {list}
                              </details>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <h2 className="text-xl sm:text-2xl font-black leading-tight mb-2" style={display}>
                              {t.byFortnight(`${t.seasonNames[g.q]} ${g.year}`)}
                            </h2>
                            {running ? <p className="text-[13px] text-[var(--ink)]/70 mb-2" style={mono}>{t.pending}</p> : null}
                            {list}
                          </>
                        )}
                      </div>
                    </article>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </div>
    </main>
  )
}
