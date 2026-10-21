// ============================================
// OPTIMAL BREAKS — Top novedades
// ----------------------------------------------
// Las quincenas y las temporadas nacen en el blog. Aquí se leen en una
// línea de tiempo: lo que cada artículo ya dice, con las escuchas delante.
// El top histórico (saves desde el día uno) sigue en /topalltimes.
// ============================================

import Link from 'next/link'
import type { Metadata } from 'next'
import CardThumbnail from '@/components/CardThumbnail'
import { getDictionary } from '@/lib/dictionaries'
import { getFortnightLive, type FortnightPlayedArtist } from '@/lib/fortnight-live'
import type { Locale } from '@/lib/i18n-config'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import { staticPageMetadata } from '@/lib/seo'
import { createCachedSupabase } from '@/lib/supabase-server'
import type { FortnightDigest, FortnightDigestTrack } from '@/types/database'

const COPY = {
  es: {
    kicker: 'TOP NOVEDADES',
    title: 'Top novedades',
    subtitle:
      'Lo más escuchado de cada quincena y de cada temporada. El puesto sale de las escuchas. Los votos y quién más ha publicado siguen en el artículo.',
    empty: 'Todavía no hay quincenas publicadas.',
    read: 'VER EL ARTÍCULO →',
    plays: 'escuchas',
    playOne: 'escucha',
    artists: 'Más escuchados',
    fortnight: 'QUINCENA',
    seasons: ['INVIERNO', 'PRIMAVERA', 'VERANO', 'OTOÑO'],
  },
  en: {
    kicker: 'TOP RELEASES',
    title: 'Top releases',
    subtitle:
      'The most played tracks of each fortnight and each season. Rank comes from plays. Votes and who released the most stay in the article.',
    empty: 'No fortnights published yet.',
    read: 'READ THE ARTICLE →',
    plays: 'plays',
    playOne: 'play',
    artists: 'Most played',
    fortnight: 'FORTNIGHT',
    seasons: ['WINTER', 'SPRING', 'SUMMER', 'AUTUMN'],
  },
} as const

type ReleasePost = {
  slug: string
  title_es: string
  title_en: string
  excerpt_es: string | null
  excerpt_en: string | null
  digest: FortnightDigest
}

function isReleaseDigest(d: unknown): d is FortnightDigest {
  if (!d || typeof d !== 'object') return false
  const x = d as { kind?: string; from?: string; until?: string; copy?: unknown }
  if (x.kind === 'agenda') return false
  return typeof x.from === 'string' && typeof x.until === 'string' && !!x.copy
}

function periodLabel(from: string, until: string, lang: Locale): string {
  const fmt = (ymd: string) =>
    new Date(`${ymd}T12:00:00Z`)
      .toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .replace('.', '')
  return `${fmt(from)} — ${fmt(until)}`
}

function kindLabel(digest: FortnightDigest, lang: Locale): string {
  const t = COPY[lang]
  if (digest.kind !== 'trimestre') return t.fortnight
  const month = Number(digest.from.slice(5, 7))
  const season = t.seasons[Math.max(0, Math.min(3, Math.floor((month - 1) / 3)))]
  return `${season} ${digest.from.slice(0, 4)}`
}

function trackName(t: FortnightDigestTrack): string {
  return t.mix_name && !/^original mix$/i.test(t.mix_name) ? `${t.title} (${t.mix_name})` : t.title
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
}: {
  params: Promise<{ lang: Locale }>
}) {
  const { lang } = await params
  await getDictionary(lang)
  const t = COPY[lang]
  const supabase = createCachedSupabase(300, [PUBLIC_CATALOG_CACHE_TAG])
  const { data } = await supabase
    .from('blog_posts')
    .select('slug, title_es, title_en, excerpt_es, excerpt_en, published_at, digest')
    .eq('is_published', true)
    .not('digest', 'is', null)
    .order('published_at', { ascending: false })
    .limit(40)

  const posts: ReleasePost[] = (data ?? [])
    .filter((row) => row.slug && isReleaseDigest(row.digest))
    .map((row) => ({
      slug: row.slug,
      title_es: row.title_es,
      title_en: row.title_en,
      excerpt_es: row.excerpt_es,
      excerpt_en: row.excerpt_en,
      digest: row.digest as FortnightDigest,
    }))
    .sort((a, b) => b.digest.until.localeCompare(a.digest.until))

  const live = await Promise.all(
    posts.map((p) => getFortnightLive(p.digest.from, p.digest.until, p.digest.kind === 'trimestre' ? 20 : 10)),
  )

  const mono = { fontFamily: "'Courier Prime', monospace" } as const
  const display = { fontFamily: "'Unbounded', sans-serif" } as const

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
        </header>

        {posts.length === 0 ? (
          <p className="text-sm text-[var(--ink)]/50" style={mono}>{t.empty}</p>
        ) : (
          <ol className="list-none m-0 p-0 relative">
            <span className="absolute left-[7px] top-2 bottom-2 w-[3px] bg-[var(--ink)]" aria-hidden />
            {posts.map((post, i) => {
              const digest = post.digest
              const row = live[i]
              const tracks = (row?.played?.length ? row.played : row?.released?.length ? row.released : digest.played?.length ? digest.played : digest.released) ?? []
              const shown = tracks.slice(0, 8)
              const artists: FortnightPlayedArtist[] = row?.played_artists?.slice(0, 3) ?? []
              const title = lang === 'es' ? post.title_es : post.title_en
              const intro = digest.copy?.[lang]?.intro || (lang === 'es' ? post.excerpt_es : post.excerpt_en) || ''
              return (
                <li key={post.slug} className="relative pl-8 sm:pl-10 pb-8 last:pb-0">
                  <span className="absolute left-0 top-1.5 h-4 w-4 border-[3px] border-[var(--ink)] bg-[var(--acid)]" aria-hidden />
                  <article className="border-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[4px_4px_0_var(--ink)]">
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b-[3px] border-[var(--ink)] bg-[var(--paper-dark)]">
                      <span className="px-1.5 py-0.5 text-[10px] font-black tracking-[2px] bg-[var(--ink)] text-[var(--paper)]" style={mono}>
                        {kindLabel(digest, lang)}
                      </span>
                      <span className="text-[11px] font-bold uppercase" style={mono}>
                        {periodLabel(digest.from, digest.until, lang)}
                      </span>
                    </div>
                    <div className="p-3 sm:p-4">
                      <h2 className="text-xl sm:text-2xl font-black leading-tight mb-2" style={display}>
                        <Link href={`/${lang}/blog/${post.slug}`} className="text-[var(--ink)] no-underline hover:text-[var(--red)]">
                          {title}
                        </Link>
                      </h2>
                      {intro ? (
                        <p className="text-[14px] leading-relaxed text-[var(--ink)]/70 mb-3" style={mono}>{intro}</p>
                      ) : null}
                      {artists.length > 0 ? (
                        <p className="text-[12px] font-bold mb-3" style={mono}>
                          <span className="tracking-[1px] text-[var(--ink)]/50">{t.artists}: </span>
                          {artists.map((a) => a.name).join(' · ')}
                        </p>
                      ) : null}
                      {shown.length > 0 ? (
                        <ol className="list-none m-0 p-0 grid grid-cols-4 sm:grid-cols-8 gap-1.5 sm:gap-2">
                          {shown.map((track, n) => (
                            <li key={`${post.slug}-${track.featured_id || n}`}>
                              <Link href={`/${lang}/blog/${post.slug}`} className="block no-underline text-[var(--ink)]" title={`${track.artists} — ${trackName(track)}`}>
                                <CardThumbnail
                                  src={track.artwork_url}
                                  alt={`${track.artists} — ${track.title}`}
                                  aspectClass="aspect-square"
                                  frameClass="border-[2px] border-[var(--ink)]"
                                  sizes="80px"
                                />
                                <span className="mt-1 block text-[9px] font-black truncate" style={mono}>
                                  #{n + 1} {track.artists}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                      <Link
                        href={`/${lang}/blog/${post.slug}`}
                        className="inline-flex mt-4 min-h-[40px] items-center px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] no-underline hover:bg-[var(--red)] hover:text-white"
                        style={mono}
                      >
                        {t.read}
                      </Link>
                    </div>
                  </article>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </main>
  )
}
