// ============================================
// OPTIMAL BREAKS — Blog Post Detail (Secure)
// + ShareButtons
// ============================================

import { createCachedSupabase } from '@/lib/supabase-server'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import {
  blogPostingJsonLd,
  breadcrumbJsonLd,
  detailPageMetadata,
  siteNameForLang,
  SITE_URL,
} from '@/lib/seo'
import { applyIndexPolicy, blogIndexability } from '@/lib/index-policy'
import { sanitizeHtml, sanitizeSlug, validateLocale } from '@/lib/security'
import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import ShareButtons from '@/components/ShareButtons'
import BlogViewTracker from '@/components/BlogViewTracker'
import CardThumbnail from '@/components/CardThumbnail'
import BeatportTopTracks from '@/components/BeatportTopTracks'
import FortnightDigest from '@/components/FortnightDigest'
import AgendaDigestView from '@/components/AgendaDigest'
import { getFortnightLive } from '@/lib/fortnight-live'
import { agendaCoverImage, loadAgendaNights } from '@/lib/agenda-nights'
import type { AgendaDigest as AgendaDigestData, BeatportTopTrack, BlogPost, FortnightDigest as FortnightDigestData } from '@/types/database'
import {
  buildFullArtistSlugMap,
  buildFullLabelSlugMap,
  filterArtistSlugMapForNames,
  splitArtistDisplayLine,
} from '@/lib/artist-slug-map'
import { digestCoverUrls, isBlogPosterCover, isReleaseRoundup } from '@/lib/blog-spotlight'
import { digestCoverFocuses } from '@/lib/digest-cover-pick'
import { proxyCatalogArtworkForDisplay, publicOgArtworkUrl, publicOgThirdsUrl } from '@/lib/share-track'
import { fetchAllArtistLinkRows } from '@/lib/artist-entity-match'
import { collectSaveRefsByBeatportUrl } from '@/lib/track-canonical-key'

type Props = { params: Promise<{ lang: Locale; slug: string }> }

/** Dónde vive la ficha. Quincena y trimestre: topreleases. El resto: blog. */
export type ArticleHome = 'blog' | 'topreleases'

function articleSegment(home: ArticleHome): ArticleHome {
  return home === 'topreleases' ? 'topreleases' : 'blog'
}
type BlogSeoRow = Pick<
  BlogPost,
  | 'title_en'
  | 'title_es'
  | 'excerpt_en'
  | 'excerpt_es'
  | 'image_url'
  | 'og_image_url'
  | 'beatport_tracks'
  | 'content_es'
  | 'content_en'
> & {
  covers?: unknown
  agenda_kind?: string | null
  agenda_from?: string | null
  agenda_until?: string | null
  agenda_places?: Record<string, { lat: number; lng: number }> | null
}

export async function generateArticleMetadata({ params }: Props, home: ArticleHome): Promise<Metadata> {
  const { lang, slug } = await params
  const safeLang = validateLocale(lang)
  const safeSlug = sanitizeSlug(slug)
  if (!safeSlug) return { title: safeLang === 'es' ? 'Entrada no encontrada' : 'Post not found', robots: { index: false, follow: true } }
  const supabase = createCachedSupabase(300, [PUBLIC_CATALOG_CACHE_TAG])
  const { data: raw } = await supabase
    .from('blog_posts')
    .select('title_en, title_es, excerpt_en, excerpt_es, image_url, og_image_url, beatport_tracks, content_es, content_en, covers:digest->covers, agenda_kind:digest->>kind, agenda_from:digest->>from, agenda_until:digest->>until, agenda_places:digest->places')
    .eq('slug', safeSlug)
    .eq('is_published', true)
    .single()
  const data = raw as BlogSeoRow | null
  if (!data) return { title: safeLang === 'es' ? 'Entrada no encontrada' : 'Post not found', robots: { index: false, follow: true } }
  const roundup = isReleaseRoundup(safeSlug, data.agenda_kind)
  if (home === 'blog' && roundup) permanentRedirect(`/${safeLang}/topreleases/${safeSlug}`)
  if (home === 'topreleases' && !roundup) permanentRedirect(`/${safeLang}/blog/${safeSlug}`)
  const articlePath = `/${articleSegment(home)}/${safeSlug}`
  const title = safeLang === 'es' ? data.title_es : data.title_en
  const description = safeLang === 'es' ? data.excerpt_es : data.excerpt_en
  const siteName = await siteNameForLang(safeLang)
  const agendaCover =
    data.agenda_kind === 'agenda' && data.agenda_from && data.agenda_until
      ? agendaCoverImage(await loadAgendaNights(supabase, data.agenda_from, data.agenda_until, data.agenda_places ?? {}))
      : null
  const albumArt =
    agendaCover ||
    data.image_url ||
    (Array.isArray(data.beatport_tracks) ? data.beatport_tracks[0]?.artwork_url : null) ||
    null
  const coverPick = digestCoverUrls(data.covers)
  const thirdsOg = publicOgThirdsUrl(coverPick)
  // OG / Twitter: misma portada que en la ficha (CardThumbnail). og_image_url es plantilla 1200×630 aparte; no sustituye la carátula editorial.
  // Quincena y trimestre: las tres primeras carátulas en tercios.
  // Política de indexación: la versión de un idioma sin traducir (vacía o copia del otro) → noindex.
  return applyIndexPolicy(
    detailPageMetadata(
      safeLang,
      articlePath,
      siteName,
      title,
      description,
      'article',
      (coverPick.length >= 2 ? thirdsOg : null) || publicOgArtworkUrl(albumArt) || albumArt || data.og_image_url,
    ),
    safeLang,
    articlePath,
    blogIndexability(data),
  )
}

export async function ArticlePage({ params }: Props, home: ArticleHome) {
  const { lang, slug } = await params
  const safeLang = validateLocale(lang)
  const safeSlug = sanitizeSlug(slug)
  const supabase = createCachedSupabase(300, [PUBLIC_CATALOG_CACHE_TAG])
  let rawPost: unknown = null
  if (safeSlug) {
    const res = await supabase.from('blog_posts').select('*').eq('slug', safeSlug).eq('is_published', true).single()
    rawPost = res.data
  }
  const post = rawPost as BlogPost | null

  if (!post) notFound()

  const roundup = isReleaseRoundup(safeSlug, post.digest?.kind)
  if (home === 'blog' && roundup) permanentRedirect(`/${safeLang}/topreleases/${safeSlug}`)
  if (home === 'topreleases' && !roundup) permanentRedirect(`/${safeLang}/blog/${safeSlug}`)
  const segment = articleSegment(home)
  const sharePath = `/${safeLang}/${segment}/${safeSlug}`
  const sectionHref = `/${safeLang}/${segment}`
  const sectionLabel = segment === 'topreleases'
    ? (safeLang === 'es' ? 'Novedades' : 'Releases')
    : 'Blog'
  const backLabel = segment === 'topreleases'
    ? (safeLang === 'es' ? 'Volver a Novedades' : 'Back to Releases')
    : (safeLang === 'es' ? 'Volver al Blog' : 'Back to Blog')
  const moreLabel = segment === 'topreleases'
    ? (safeLang === 'es' ? 'MÁS NOVEDADES' : 'MORE RELEASES')
    : (safeLang === 'es' ? 'MÁS ARTÍCULOS' : 'MORE ARTICLES')

  const title = safeLang === 'es' ? post.title_es : post.title_en
  const rawContent = safeLang === 'es' ? post.content_es : post.content_en
  const content = sanitizeHtml(rawContent || '')
  const excerpt = (safeLang === 'es' ? post.excerpt_es : post.excerpt_en) || null
  const rawDigest = post.digest?.copy ? post.digest : null
  const agendaStored: AgendaDigestData | null = rawDigest?.kind === 'agenda' ? rawDigest : null
  const storedDigest: FortnightDigestData | null = rawDigest && rawDigest.kind !== 'agenda' ? rawDigest : null
  const agendaNights = agendaStored ? await loadAgendaNights(supabase, agendaStored.from, agendaStored.until, agendaStored.places) : []
  const quarter = storedDigest?.kind === 'trimestre'
  const week = storedDigest?.kind === 'semana'
  const live = storedDigest ? await getFortnightLive(storedDigest.from, storedDigest.until, quarter ? 20 : 10) : null
  const digest = storedDigest && live
    ? { ...storedDigest, released: live.released, played: live.played, voted: live.voted, votes_total: live.votes_total, voters_total: live.voters_total }
    : storedDigest
  const heroCovers = digestCoverUrls(digest?.covers)
  const heroFocus = await digestCoverFocuses(digest?.covers)
  const albumTracks = Array.isArray(post.beatport_tracks)
    ? (post.beatport_tracks as BeatportTopTrack[])
    : []
  const dayLabel = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(safeLang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const fortnightRange = digest
    ? safeLang === 'es'
      ? `${dayLabel(digest.from)} al ${dayLabel(digest.until)}`
      : `${dayLabel(digest.from)} to ${dayLabel(digest.until)}`
    : ''
  const fortnightWeeks = (() => {
    if (!digest) return ''
    if (quarter) {
      const month = (iso: string) =>
        new Date(`${iso}T12:00:00Z`).toLocaleDateString(safeLang === 'es' ? 'es-ES' : 'en-GB', { month: 'long', timeZone: 'UTC' })
      return safeLang === 'es'
        ? `semanas de ${month(digest.from)} a ${month(digest.until)}`
        : `weeks from ${month(digest.from)} to ${month(digest.until)}`
    }
    const d = new Date(`${digest.from}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    const out: string[] = []
    for (; d.toISOString().slice(0, 10) <= digest.until; d.setUTCDate(d.getUTCDate() + 7)) {
      out.push(dayLabel(d.toISOString().slice(0, 10)))
    }
    const and = safeLang === 'es' ? ' y ' : ' and '
    const list = out.length > 1 ? `${out.slice(0, -1).join(', ')}${and}${out[out.length - 1]}` : out[0]
    return (safeLang === 'es' ? 'semanas del ' : 'weeks of ') + list
  })()
  const coverRaw = agendaCoverImage(agendaNights) || post.image_url || albumTracks[0]?.artwork_url || null
  const coverSrc = proxyCatalogArtworkForDisplay(coverRaw) || coverRaw
  const albumCover = albumTracks.length > 0
  const posterCover = isBlogPosterCover(coverRaw, { album: albumCover, slug: safeSlug })

  let artistSlugMap: Record<string, string> | undefined
  let labelSlugMap: Record<string, string> | undefined
  let saveRefsByUrl: ReturnType<typeof collectSaveRefsByBeatportUrl> | undefined

  if (albumTracks.length > 0 || digest) {
    const trackArtistNames = new Set<string>()
    const trackLabelNames = new Set<string>()
    const titles = new Set<string>()
    for (const t of albumTracks) {
      for (const a of t.artists ?? []) {
        const artistName = (a.name || '').trim()
        if (artistName) trackArtistNames.add(artistName)
      }
      const labelName = (t.label || '').trim()
      if (labelName) trackLabelNames.add(labelName)
      const titleName = (t.title || '').trim()
      if (titleName) titles.add(titleName)
    }
    if (digest) {
      for (const tr of [...(digest.picks ?? []), ...(digest.released ?? []), ...digest.played, ...digest.voted]) {
        for (const name of splitArtistDisplayLine(tr.artists)) trackArtistNames.add(name)
        const labelName = (tr.label || '').trim()
        if (labelName) trackLabelNames.add(labelName)
      }
      for (const a of live?.played_artists ?? []) trackArtistNames.add(a.name)
    }

    const titleList = Array.from(titles)
    const [allArtistLinkRows, { data: labelRows }, { data: featuredRows }, { data: chartRows }] =
      await Promise.all([
        fetchAllArtistLinkRows(supabase),
        supabase.from('labels').select('name, slug'),
        titleList.length
          ? supabase
              .from('chart_featured_tracks')
              .select('id, title, mix_name, artists, link_url')
              .in('title', titleList)
          : Promise.resolve({ data: [] as never[] }),
        titleList.length
          ? supabase
              .from('chart_tracks')
              .select('id, title, mix_name, artists, beatport_url')
              .in('title', titleList)
          : Promise.resolve({ data: [] as never[] }),
      ])

    artistSlugMap = filterArtistSlugMapForNames(
      buildFullArtistSlugMap(allArtistLinkRows),
      trackArtistNames,
    )
    labelSlugMap = filterArtistSlugMapForNames(
      buildFullLabelSlugMap(
        ((labelRows ?? []) as { slug: string; name: string | null }[]).map((r) => ({
          slug: r.slug,
          name: r.name,
          name_display: null,
        })),
      ),
      trackLabelNames,
      { labelSuffixes: true },
    )
    saveRefsByUrl = collectSaveRefsByBeatportUrl(albumTracks, {
      featured: (featuredRows ?? []) as {
        id: string
        title: string | null
        mix_name: string | null
        artists: unknown
        link_url: string | null
      }[],
      chart: (chartRows ?? []) as {
        id: string
        title: string | null
        mix_name: string | null
        artists: unknown
        beatport_url: string | null
      }[],
    })
  }
  // wordCount aproximado para BlogPosting (sumando contenido sanitizado + tags
  // suelen sobrar; restamos rudimentariamente las etiquetas HTML).
  const wordCount = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length

  const articleLd = blogPostingJsonLd(
    {
      slug: safeSlug,
      title,
      description: excerpt,
      datePublished: post.published_at,
      // BlogPost actual no expone updated_at; usamos datePublished como
      // dateModified hasta tener un campo dedicado en la BD.
      dateModified: post.published_at,
      authorName: post.author || null,
      imageUrl: (heroCovers.length >= 2 ? publicOgThirdsUrl(heroCovers) : null) || publicOgArtworkUrl(coverRaw) || coverSrc || post.og_image_url || null,
      category: post.category || null,
      tags: post.tags ?? [],
      inLanguage: safeLang,
      wordCount,
      section: segment,
    },
    safeLang,
  )
  const breadcrumbLd = breadcrumbJsonLd([
    { name: safeLang === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}/${safeLang}` },
    { name: sectionLabel, url: `${SITE_URL}${sectionHref}` },
    { name: title, url: `${SITE_URL}${sharePath}` },
  ])
  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [articleLd, breadcrumbLd],
  }

  // Fecha legible + atributo ISO para `<time datetime="...">` (Google extrae
  // mejor las fechas con datetime explícito).
  const dateIso = post.published_at ?? ''
  const dateLabel = post.published_at
    ? new Date(post.published_at).toLocaleDateString(safeLang === 'es' ? 'es-ES' : 'en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : ''

  // Vídeos R/F del artículo (solo admins; ver src/lib/page-reel.ts).
  const firstTrack = albumTracks[0]
  const trackArtists = (t: BeatportTopTrack) => (t.artists || []).map((a) => a.name).filter(Boolean).join(', ')
  const blogReel = {
    kind: 'blog' as const,
    title,
    date: post.published_at ?? null,
    tags: ((post.tags ?? []) as string[]).slice(0, 6),
    artwork: coverRaw,
    tracks: albumTracks.map((t) => ({
      title: t.mix_name && !/^original/i.test(t.mix_name) ? `${t.title} (${t.mix_name})` : t.title,
      meta: [t.bpm ? `${Math.round(t.bpm)} BPM` : '', t.key || ''].filter(Boolean).join(' · '),
      artists: trackArtists(t),
    })),
    artist: firstTrack ? trackArtists(firstTrack) : '',
    label: firstTrack?.label || '',
    excerpt: excerpt || '',
    fortnight: digest
      ? {
          // share-reel-images solo acepta https: los retratos de /images/... van absolutos.
          ...(() => {
            const abs = (u: string | null) => (u && u.startsWith('/') ? `${SITE_URL}${u}` : u)
            return {
              covers: digest.covers.slice(0, 12).map((u) => abs(u) as string),
              played: digest.played.slice(0, 5).map((r) => ({ title: r.title, artists: r.artists, value: r.value, artwork: abs(r.artwork_url) })),
              voted: digest.voted.slice(0, 5).map((r) => ({ title: r.title, artists: r.artists, value: r.value, artwork: abs(r.artwork_url) })),
              stars: digest.top100.slice(0, 6).map((a) => ({ rank: a.rank, name: a.name, track: a.tracks[0]?.title || '', image: abs(a.image_url) })),
            }
          })(),
          period: quarter ? ('QUARTER' as const) : week ? ('WEEK' as const) : undefined,
          from: digest.from,
          until: digest.until,
          totals: { ...digest.totals, prev: digest.totals.prev_tracks },
          artists: digest.artists.slice(0, 6).map((a) => ({ name: a.name, tracks: a.tracks, releases: a.releases })),
          labels: digest.labels.slice(0, 6).map((l) => ({ name: l.name, tracks: l.tracks })),
          bpm: digest.sound.avg_bpm,
          prevBpm: digest.sound.prev_avg_bpm,
          bands: digest.sound.bands,
          key: digest.sound.keys[0]?.key ?? null,
          debutTotal: digest.debut_total,
          debut: digest.debut.slice(0, 6).map((n) => n.name),
        }
      : undefined,
    agenda: agendaStored && agendaNights.length > 0
      ? {
          es: safeLang === 'es',
          from: agendaStored.from,
          until: agendaStored.until,
          extra: Math.max(0, agendaNights.length - 24),
          events: agendaNights.slice(0, 24).map((n) => ({
            name: n.name,
            date: n.date,
            dateEnd: n.dateEnd,
            place: n.place,
            lineup: n.lineup.slice(0, 12),
            postponed: n.postponed,
            image: n.image && n.image.startsWith('/') ? `${SITE_URL}${n.image}` : n.image,
          })),
        }
      : undefined,
  }

  // alt enriquecido para la portada del artículo.
  const coverAlt = safeLang === 'es'
    ? `Imagen de portada del artículo: ${title}`
    : `Cover image: ${title}`

  return (
    <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20 max-w-[800px] mx-auto">
      <BlogViewTracker slug={safeSlug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph) }} />
      <Link href={sectionHref} className="btn-back"><span className="arrow">←</span> {backLabel}</Link>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <span className="cutout red">{post.category}</span>
        {dateIso && (
          <time
            dateTime={dateIso}
            style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}
          >
            {dateLabel}
          </time>
        )}
      </div>

      <h1 className="sec-title text-[clamp(24px,5vw,44px)] mb-2"><span className="hl">{title}</span></h1>

      {/* Share row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {post.author && (
          <address
            className="not-italic"
            style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '2px', color: 'var(--dim)' }}
          >
            {safeLang === 'es' ? 'POR' : 'BY'}{' '}
            <span itemProp="author">{post.author.toUpperCase()}</span>
          </address>
        )}
        <ShareButtons
          url={sharePath}
          title={`${title} | Optimal Breaks`}
          lang={safeLang}
          pageReel={!agendaStored || agendaNights.length > 0 ? blogReel : undefined}
        />
      </div>

      {!digest && !agendaStored && (
        <div
          className={`mb-8 -mx-4 sm:mx-0 border-y-[3px] border-[var(--ink)] overflow-hidden ${
            posterCover ? 'bg-[var(--paper-dark)]' : ''
          }`}
        >
          <div className={posterCover ? 'mx-auto w-full max-w-[560px]' : undefined}>
            <CardThumbnail
              src={coverSrc}
              alt={coverAlt}
              aspectClass={posterCover ? 'aspect-square' : 'aspect-[16/9] sm:aspect-[21/9]'}
              fit={posterCover ? 'contain' : 'cover'}
              frameClass="border-0"
            />
          </div>
        </div>
      )}

      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {post.tags.map((t: string, i: number) => <span key={i} className="cutout fill">{t}</span>)}
        </div>
      )}

      {digest && <FortnightDigest digest={digest} lang={safeLang} artistSlugMap={artistSlugMap} labelSlugMap={labelSlugMap} liveAt={live?.updated_at ?? null} heroFocus={heroFocus} playedArtists={live?.played_artists} />}

      {agendaStored && <AgendaDigestView digest={agendaStored} nights={agendaNights} lang={safeLang} />}

      {albumTracks.length > 0 && (
        <div className={digest ? 'mt-12' : 'mb-10'}>
          {digest && (
            <p className="text-[14px] leading-snug mb-3" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {safeLang === 'es'
                ? `Una playlist con lo mejor ${quarter ? 'del trimestre' : 'de la quincena'}: las exclusivas, lo más escuchado en la web y, después, lo más votado y los temas nuevos de las estrellas del top histórico. Solo temas salidos del ${fortnightRange}.`
                : `A playlist with the best of the ${quarter ? 'quarter' : 'fortnight'}: exclusives, the most played on the site, then the most voted and new tracks by all-time top stars. Only tracks released ${fortnightRange}.`}
            </p>
          )}
          <BeatportTopTracks
            tracks={albumTracks}
            beatportUrl={post.beatport_release_url || null}
            lang={safeLang}
            entityName={title}
            artistSlugMap={artistSlugMap}
            labelSlugMap={labelSlugMap}
            saveRefsByUrl={saveRefsByUrl}
            heading={
              digest
                ? safeLang === 'es'
                  ? `LAS ${albumTracks.length} IMPRESCINDIBLES ${quarter ? 'DEL TRIMESTRE' : 'DE LA QUINCENA'}`
                  : `THE ${quarter ? "QUARTER'S" : "FORTNIGHT'S"} ${albumTracks.length} ESSENTIALS`
                : safeLang === 'es' ? 'ESCUCHAR EL ÁLBUM' : 'LISTEN TO THE ALBUM'
            }
            defaultExpanded
            badgeVariant="index"
            stacked
            shareToCharts
          />
        </div>
      )}

      {digest && (
        <div className="mt-8 border-4 border-[var(--ink)] bg-[var(--yellow)] p-5 sm:p-6 shadow-[6px_6px_0_var(--ink)]">
          <p className="text-[22px] sm:text-[28px] leading-none uppercase" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900 }}>
            {safeLang === 'es'
              ? `¿Quieres los ${digest.totals.tracks} temas?`
              : `Want all ${digest.totals.tracks} tracks?`}
          </p>
          <p className="text-[14px] leading-snug mt-2 mb-4" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {week
              ? safeLang === 'es'
                ? `Están todos en New Releases, en la semana del ${dayLabel(digest.from)}.`
                : `They are all in New Releases, in the week of ${dayLabel(digest.from)}.`
              : safeLang === 'es'
                ? `Están todos en New Releases, en las ${fortnightWeeks}.`
                : `They are all in New Releases, in the ${fortnightWeeks}.`}
          </p>
          <Link
            href={week ? `/${safeLang}/charts?week=${digest.from}` : `/${safeLang}/charts`}
            className="inline-block bg-[var(--red)] text-white border-4 border-[var(--ink)] px-5 py-3 text-[15px] tracking-wider shadow-[4px_4px_0_var(--ink)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_var(--ink)] transition-transform"
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700 }}
          >
            {week
              ? safeLang === 'es' ? '▶ ESCUCHAR LA SEMANA ENTERA' : '▶ PLAY THE FULL WEEK'
              : safeLang === 'es' ? '▶ ESCUCHAR LAS SEMANAS ENTERAS' : '▶ PLAY THE FULL WEEKS'}
          </Link>
        </div>
      )}

      {!digest && !agendaStored && <article className="prose-ob prose-ob-blog" dangerouslySetInnerHTML={{ __html: content }} />}

      {/* Bottom share */}
      <div className="mt-12 pt-8 border-t-4 border-dashed border-[var(--ink)] flex flex-wrap items-center justify-between gap-4">
        <Link href={sectionHref} className="btn-back !mb-0"><span className="arrow">←</span> {moreLabel}</Link>
        <ShareButtons url={sharePath} title={`${title} | Optimal Breaks`} lang={safeLang} />
      </div>
    </div>
  )
}
