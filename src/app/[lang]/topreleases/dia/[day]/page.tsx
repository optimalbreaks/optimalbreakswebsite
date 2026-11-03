// ============================================
// OPTIMAL BREAKS — Artículo del día
// La lista de temas de esa fecha vive aquí, no en el índice de novedades.
// Las flechas y el calendario cambian el día. Arriba, las que Optimal Breaks
// ha guardado con «+». Debajo, el resto.
// ============================================

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { CoverThirds } from '@/components/CardThumbnail'
import { DayReleaseDate, DigestTrackRows } from '@/components/FortnightDigest'
import ShareButtons from '@/components/ShareButtons'
import { fetchAllArtistLinkRows } from '@/lib/artist-entity-match'
import { buildFullArtistSlugMap, buildFullLabelSlugMap, filterArtistSlugMapForNames, findArtistSlug, splitArtistDisplayLine } from '@/lib/artist-slug-map'
import { instagramMention } from '@/lib/share-caption'
import {
  DAY_COPY,
  clampReleaseDay,
  dayReleaseBlurb,
  dayReleaseHeading,
  loadDayReleases,
  rankDayReelTracks,
  MIN_RELEASE_DAY,
  shiftReleaseDay,
} from '@/lib/fortnight-live'
import type { Locale } from '@/lib/i18n-config'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import { blogPostingJsonLd, breadcrumbJsonLd, detailPageMetadata, SITE_URL, siteNameForLang } from '@/lib/seo'
import { publicOgThirdsUrl } from '@/lib/share-track'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { createCachedSupabase } from '@/lib/supabase-server'
import type { DayReelInput } from '@/lib/page-reel'
import type { FortnightDigestTrack } from '@/types/database'

const REEL_MONTHS = {
  es: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'],
  en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
} as const

function reelDayLabel(day: string, lang: Locale): string {
  const month = Number(day.slice(5, 7))
  const months = REEL_MONTHS[lang === 'en' ? 'en' : 'es']
  return `${Number(day.slice(8, 10))} ${months[month - 1] || ''} ${day.slice(0, 4)}`
}

function reelAudio(src: string | null | undefined): string | null {
  return src && src.startsWith('/') ? src : null
}

function reelTitle(t: FortnightDigestTrack): string {
  const mix = t.mix_name && !/^original mix$/i.test(t.mix_name) ? ` (${t.mix_name})` : ''
  return `${t.title}${mix}`
}

function dayReelOf(
  lang: Locale,
  day: string,
  title: string,
  excerpt: string,
  picks: FortnightDigestTrack[],
  rest: FortnightDigestTrack[],
  mentions: string[],
) {
  const sounding = (picks.length ? picks : rest).slice(0, 5)
  if (!sounding.length) return undefined
  const shelf = (picks.length ? rest : rest.slice(sounding.length)).slice(0, 8)
  const dayReel: DayReelInput = {
    es: lang !== 'en',
    date: reelDayLabel(day, lang),
    selection: picks.length > 0,
    outCount: picks.length + rest.length,
    picks: sounding.map((t) => ({
      title: reelTitle(t),
      artists: t.artists,
      label: t.label || '',
      artwork: t.artwork_url,
      audio: reelAudio(t.audio_src),
    })),
    rest: shelf.map((t) => ({ artwork: t.artwork_url })),
    mentions,
  }
  return {
    kind: 'blog' as const,
    title,
    date: `${day}T12:00:00+01:00`,
    tags: [] as string[],
    artwork: null,
    tracks: [] as { title: string; meta: string }[],
    artist: '',
    label: '',
    excerpt,
    day: dayReel,
  }
}

/** @ de la selección, en el orden de los créditos. Quien no tiene Instagram en la ficha no sale. */
async function selectionMentions(
  supabase: ReturnType<typeof createCachedSupabase>,
  picks: FortnightDigestTrack[],
  slugMap: Record<string, string>,
): Promise<string[]> {
  const slugs: string[] = []
  const seenSlug = new Set<string>()
  for (const track of picks) {
    for (const name of splitArtistDisplayLine(track.artists)) {
      const slug = findArtistSlug(name, slugMap)
      if (!slug || seenSlug.has(slug)) continue
      seenSlug.add(slug)
      slugs.push(slug)
    }
  }
  if (!slugs.length) return []
  const { data, error } = await supabase.from('artists').select('slug, socials').in('slug', slugs)
  if (error || !data) return []
  const bySlug = new Map(data.map((row) => [row.slug, row.socials]))
  const mentions: string[] = []
  const seen = new Set<string>()
  for (const slug of slugs) {
    const mention = instagramMention(bySlug.get(slug))
    const key = mention?.toLowerCase()
    if (!mention || !key || seen.has(key)) continue
    seen.add(key)
    mentions.push(mention)
  }
  return mentions
}

export const dynamic = 'force-dynamic'

function todayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function DayCovers({ tracks, stamp }: { tracks: FortnightDigestTrack[]; stamp: string }) {
  const srcs: string[] = []
  const seen = new Set<string>()
  for (const t of tracks) {
    if (!t.artwork_url || seen.has(t.artwork_url)) continue
    seen.add(t.artwork_url)
    srcs.push(t.artwork_url)
    if (srcs.length === 3) break
  }
  if (!srcs.length) return null
  return (
    <div className="relative -mx-4 mb-6 border-y-[3px] border-[var(--ink)] sm:mx-0 sm:border-[3px]">
      <CoverThirds
        srcs={srcs}
        alt=""
        aspectClass="aspect-[3/1]"
        frameClass="border-0"
        sizes="(max-width: 640px) 34vw, 270px"
      />
      <div className="absolute bottom-3 left-3 border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-3 py-1 text-[13px] font-black sm:text-[15px]" style={{ fontFamily: "'Unbounded', sans-serif" }}>
        {stamp}
      </div>
    </div>
  )
}

function trackLine(t: FortnightDigestTrack): string {
  const mix = t.mix_name && !/^original mix$/i.test(t.mix_name) ? ` (${t.mix_name})` : ''
  return `${t.artists} — ${t.title}${mix}`
}

function joinList(items: string[], lang: Locale): string {
  if (items.length <= 1) return items[0] || ''
  const last = items[items.length - 1]
  return `${items.slice(0, -1).join(', ')} ${lang === 'es' ? 'y' : 'and'} ${last}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale; day: string }>
}): Promise<Metadata> {
  const { lang, day: raw } = await params
  const copy = DAY_COPY[lang === 'en' ? 'en' : 'es']
  const safeLang = lang === 'en' ? 'en' : 'es'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { title: copy.title, robots: { index: false, follow: true } }
  }
  const today = todayMadrid()
  const day = clampReleaseDay(raw, today)
  const heading = dayReleaseHeading(day, safeLang)
  const title = heading.title
  const supabase = createCachedSupabase(300, [PUBLIC_CATALOG_CACHE_TAG])
  const { picks, rest } = await loadDayReleases(supabase, day)
  const blurb = dayReleaseBlurb(safeLang, picks.length, rest.length)
  const named = [...picks, ...rest].slice(0, 4).map(trackLine)
  const description = named.length ? `${blurb} ${joinList(named, safeLang)}.` : blurb
  const image = publicOgThirdsUrl([...picks, ...rest].map((t) => t.artwork_url))
  const names = [...picks, ...rest].flatMap((t) => splitArtistDisplayLine(t.artists))
  return detailPageMetadata(
    safeLang,
    `/topreleases/dia/${day}`,
    await siteNameForLang(safeLang),
    title,
    description,
    'article',
    image,
    ['breakbeat', title, ...names.slice(0, 12)],
    false,
    { 'article:published_time': `${day}T12:00:00+01:00` },
  )
}

export default async function DayReleaseArticlePage({
  params,
}: {
  params: Promise<{ lang: Locale; day: string }>
}) {
  const { lang, day: raw } = await params
  const today = todayMadrid()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) notFound()
  if (raw > today) redirect(`/${lang}/topreleases/dia/${today}`)
  if (raw < MIN_RELEASE_DAY) notFound()
  const day = clampReleaseDay(raw, today)
  const copy = DAY_COPY[lang]
  const supabase = createCachedSupabase(300, [PUBLIC_CATALOG_CACHE_TAG])
  const { picks, rest } = await loadDayReleases(supabase, day)
  const dayTracks = [...picks, ...rest]
  const artistNames = new Set<string>()
  const labelNames = new Set<string>()
  for (const t of dayTracks) {
    for (const name of splitArtistDisplayLine(t.artists)) artistNames.add(name)
    if (t.label) labelNames.add(t.label)
  }
  const [artistRows, labelRows] = await Promise.all([
    artistNames.size ? fetchAllArtistLinkRows(supabase) : Promise.resolve([]),
    labelNames.size
      ? fetchAllPages<{ slug: string; name: string | null }>((from, to) =>
          supabase.from('labels').select('slug, name').order('slug', { ascending: true }).range(from, to),
        ).catch(() => [] as { slug: string; name: string | null }[])
      : Promise.resolve([] as { slug: string; name: string | null }[]),
  ])
  const artistSlugMap = filterArtistSlugMapForNames(buildFullArtistSlugMap(artistRows), artistNames)
  const mentions = picks.length ? await selectionMentions(supabase, picks, artistSlugMap).catch(() => [] as string[]) : []
  const labelSlugMap = filterArtistSlugMapForNames(
    buildFullLabelSlugMap(labelRows.map((r) => ({ slug: r.slug, name: r.name, name_display: null }))),
    labelNames,
    { labelSuffixes: true },
  )
  const prev = shiftReleaseDay(day, -1)
  const next = shiftReleaseDay(day, 1)
  const back = `/${lang}/topreleases`
  const named = picks.slice(0, 4).map(trackLine)
  const extra = picks.length - named.length
  const pickSentence = extra > 0
    ? `${named.join(', ')}${lang === 'es' ? ` y ${extra} más` : ` and ${extra} more`}`
    : joinList(named, lang)
  const mono = { fontFamily: "'Courier Prime', monospace" } as const
  const display = { fontFamily: "'Unbounded', sans-serif" } as const
  const heading = dayReleaseHeading(day, lang)
  const articleTitle = heading.h1
  const reelPicks = picks.length > 1 ? await rankDayReelTracks(picks) : picks
  const articleBlurb = dayReleaseBlurb(lang, picks.length, rest.length)
  const articleDescription = named.length ? `${articleBlurb} ${pickSentence}.` : articleBlurb
  const articleImage = publicOgThirdsUrl(dayTracks.map((t) => t.artwork_url))
  const articleLd = blogPostingJsonLd(
    {
      slug: `dia/${day}`,
      title: articleTitle,
      description: articleDescription,
      datePublished: `${day}T12:00:00+01:00`,
      dateModified: `${day}T12:00:00+01:00`,
      authorName: 'Optimal Breaks',
      imageUrl: articleImage,
      category: copy.section,
      tags: [...artistNames].slice(0, 12),
      inLanguage: lang,
      section: 'topreleases',
    },
    lang,
  )
  const breadcrumbLd = breadcrumbJsonLd([
    { name: lang === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
    { name: lang === 'es' ? 'Novedades' : 'Releases', url: `${SITE_URL}/${lang}/topreleases` },
    { name: articleTitle, url: `${SITE_URL}/${lang}/topreleases/dia/${day}` },
  ])

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        <Link href={back} className="inline-flex mb-4 text-[12px] font-black tracking-wider text-[var(--ink)] no-underline hover:text-[var(--red)]" style={mono}>
          {copy.back}
        </Link>
        <article>
          <DayCovers tracks={picks.length ? picks : rest} stamp={copy.section} />
          <DayReleaseDate
            lang={lang}
            day={day}
            today={today}
            label={copy.pick}
            articlePath={`/${lang}/topreleases/dia`}
            headline={heading.when}
            lead={heading.lead}
            kicker={copy.section}
            todayBadge={day === today ? copy.today : null}
            prevHref={prev >= MIN_RELEASE_DAY ? `/${lang}/topreleases/dia/${prev}` : null}
            nextHref={day < today ? `/${lang}/topreleases/dia/${next}` : null}
            prevLabel={copy.prev}
            nextLabel={copy.next}
          />
          <p className="mb-5 max-w-2xl text-[18px] leading-relaxed sm:text-[20px]" style={{ fontFamily: "'Special Elite', monospace" }}>
            {dayReleaseBlurb(lang, picks.length, rest.length)}
          </p>
          <div className="mb-6 grid max-w-md grid-cols-2 gap-3">
            <div className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-3 py-3 shadow-[4px_4px_0_var(--ink)]">
              <div className="text-3xl font-black leading-none" style={display}>{picks.length}</div>
              <div className="mt-1 text-[11px] font-black uppercase tracking-[0.12em]" style={mono}>
                {lang === 'es' ? 'En la selección' : 'In the pick'}
              </div>
            </div>
            <div className="border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-3 shadow-[4px_4px_0_var(--ink)]">
              <div className="text-3xl font-black leading-none" style={display}>{picks.length + rest.length}</div>
              <div className="mt-1 text-[11px] font-black uppercase tracking-[0.12em]" style={mono}>
                {lang === 'es' ? 'Ese día' : 'That day'}
              </div>
            </div>
          </div>
          <div className="mb-2">
            <ShareButtons
              url={`/${lang}/topreleases/dia/${day}`}
              title={`${articleTitle} | Optimal Breaks`}
              lang={lang}
              pageReel={dayReelOf(lang, day, articleTitle, articleBlurb, reelPicks, rest, mentions)}
            />
          </div>

          <DigestTrackRows
            groupKey={`topreleases:day:${day}`}
            lang={lang}
            artistSlugMap={artistSlugMap}
            labelSlugMap={labelSlugMap}
            groups={[
              { title: copy.picksTitle, tracks: picks, spot: `picks-${day}`, tone: 'pick' },
              { title: copy.restTitle, tracks: rest, spot: `rest-${day}`, tone: 'rest' },
            ]}
          />
        </article>
      </div>
    </main>
  )
}
