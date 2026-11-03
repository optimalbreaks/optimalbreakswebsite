// ============================================
// OPTIMAL BREAKS — Artículo del día
// La lista de temas de esa fecha vive aquí, no en el índice de novedades.
// Las flechas y el calendario cambian el día. Arriba, las que Optimal Breaks
// ha guardado con «+». Debajo, el resto.
// ============================================

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { DayReleaseDate, DigestTrackRows } from '@/components/FortnightDigest'
import { fetchAllArtistLinkRows } from '@/lib/artist-entity-match'
import { buildFullArtistSlugMap, buildFullLabelSlugMap, filterArtistSlugMapForNames, splitArtistDisplayLine } from '@/lib/artist-slug-map'
import {
  DAY_COPY,
  clampReleaseDay,
  dayReleaseBlurb,
  loadDayReleases,
  longReleaseDay,
  MIN_RELEASE_DAY,
  shiftReleaseDay,
} from '@/lib/fortnight-live'
import type { Locale } from '@/lib/i18n-config'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import { blogPostingJsonLd, breadcrumbJsonLd, detailPageMetadata, SITE_URL, siteNameForLang } from '@/lib/seo'
import { publicOgThirdsUrl } from '@/lib/share-track'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { createCachedSupabase } from '@/lib/supabase-server'
import type { FortnightDigestTrack } from '@/types/database'

export const dynamic = 'force-dynamic'

function todayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
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
  const when = longReleaseDay(day, safeLang)
  const title = `${copy.title} · ${when}`
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
    [copy.title, 'breakbeat', when, ...names.slice(0, 12)],
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
  const when = longReleaseDay(day, lang)
  const articleTitle = `${copy.title} · ${when}`
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
          <DayReleaseDate
            lang={lang}
            day={day}
            today={today}
            label={copy.pick}
            articlePath={`/${lang}/topreleases/dia`}
            headline={longReleaseDay(day, lang)}
            todayBadge={day === today ? copy.today : null}
            prevHref={prev >= MIN_RELEASE_DAY ? `/${lang}/topreleases/dia/${prev}` : null}
            nextHref={day < today ? `/${lang}/topreleases/dia/${next}` : null}
            prevLabel={copy.prev}
            nextLabel={copy.next}
          />
          <h1 className="text-3xl sm:text-5xl font-black leading-[0.95] mb-3" style={display}>{copy.title}</h1>
          <p className="text-[16px] leading-relaxed mb-2" style={{ fontFamily: "'Special Elite', monospace" }}>
            {dayReleaseBlurb(lang, picks.length, rest.length)}
          </p>
          {named.length > 0 ? (
            <p className="text-[15px] leading-relaxed text-[var(--ink)]/80 mb-6" style={{ fontFamily: "'Special Elite', monospace" }}>
              {pickSentence}.
            </p>
          ) : null}

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
