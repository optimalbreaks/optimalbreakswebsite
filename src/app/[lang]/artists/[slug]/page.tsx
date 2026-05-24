// ============================================
// OPTIMAL BREAKS — Artist Detail Page
// ============================================

import { createSimpleSupabase } from '@/lib/supabase'
import {
  buildArtistSlugLookup,
  fetchAllArtistLinkRows,
  filterRelatedArtistsExcludingLabels,
  normalizeForEntityMatch,
  resolveArtistSlug,
  splitRelatedArtistNames,
} from '@/lib/artist-entity-match'
import { breadcrumbJsonLd, countryNameFromCode, detailPageMetadata, siteNameForLang, SITE_URL } from '@/lib/seo'
import { splitBioParagraphs } from '@/lib/bio-format'
import { displayArtistImageUrl } from '@/lib/artist-public-portrait'
import { sanitizeSlug } from '@/lib/security'
import {
  parsePlayParam,
  findBeatportTopTrackById,
  beatportTrackDetailPath,
  beatportTrackOpenGraphCopy,
} from '@/lib/share-track'
import type { Locale } from '@/lib/i18n-config'
import type { Artist, ArtistKeyRelease, BeatportTopTrack } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import ShareButtons from '@/components/ShareButtons'
import FanCounter from '@/components/FanCounter'
import FavoriteButton from '@/components/FavoriteButton'
import SeenLiveButton from '@/components/SeenLiveButton'
import CardThumbnail from '@/components/CardThumbnail'
import BeatportTopTracks from '@/components/BeatportTopTracks'
import {
  fetchArtistRelatedContent,
  normalizeTrackTitleKey,
  resolveRecommendedMixHref,
} from '@/lib/artist-related-content'

type Props = {
  params: Promise<{ lang: Locale; slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function firstSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v[0] : v
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Si alguien confunde la URL del retrato (README: `/images/artists/*.webp`) con el slug del artista. */
const SLUG_QUE_PARECE_IMAGEN_ARTISTA =
  /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?\.(webp|jpe?g|png)$/i

function redirectSiSlugEsNombreDeImagenEstatica(rawSlug: string) {
  const s = rawSlug.trim()
  if (!SLUG_QUE_PARECE_IMAGEN_ARTISTA.test(s)) return
  redirect(`/images/artists/${s.toLowerCase()}`)
}

type ArtistSeoRow = Pick<Artist, 'name' | 'bio_en' | 'bio_es' | 'image_url' | 'og_image_url' | 'styles' | 'country' | 'era'>

const SOLO_CATEGORIES = new Set(['pioneer', 'us_artist', 'current'])

/** Primer párrafo de la bio = "lead" para meta description y JSON-LD. */
function bioLead(bio: string | null | undefined, max = 300): string | undefined {
  const paras = splitBioParagraphs(bio)
  const first = paras[0] || (bio ? bio.trim() : '')
  if (!first) return undefined
  return first.length <= max ? first : first.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

function buildJsonLd(artist: Artist, lang: Locale, slug: string) {
  const isSolo = SOLO_CATEGORIES.has(artist.category)
  const url = `${SITE_URL}/${lang}/artists/${slug}`
  const imageUrl = displayArtistImageUrl(slug, artist.image_url)
  const countryName = countryNameFromCode(artist.country, lang)

  // sameAs: redes sociales + web oficial. La web personal del artista se
  // referencia aquí (NO en mainEntityOfPage, que debe apuntar a la canónica
  // de la propia ficha — corrección sobre la versión anterior).
  const sameAs = [
    artist.website,
    ...(artist.socials ? Object.values(artist.socials) : []),
  ].filter((v): v is string => Boolean(v && String(v).trim()))

  return {
    '@context': 'https://schema.org',
    '@type': isSolo ? 'Person' : 'MusicGroup',
    name: artist.name_display || artist.name,
    url,
    ...(imageUrl && { image: imageUrl }),
    ...(countryName && { nationality: countryName }),
    genre: artist.styles?.join(', ') || 'Breakbeat',
    description: bioLead(lang === 'es' ? artist.bio_es : artist.bio_en, 300),
    ...(sameAs.length > 0 ? { sameAs: Array.from(new Set(sameAs)) } : {}),
    mainEntityOfPage: url,
  }
}

function buildArtistKeywords(artist: ArtistSeoRow, lang: Locale): string[] {
  const base = lang === 'es'
    ? ['breakbeat', 'artista', 'DJ', 'productor', 'musica electronica']
    : ['breakbeat', 'artist', 'DJ', 'producer', 'electronic music']
  const specific = [
    artist.name,
    ...(artist.styles || []),
    artist.country,
    artist.era,
  ].filter(Boolean)
  return Array.from(new Set([...specific, ...base]))
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang, slug: rawSlug } = await params
  redirectSiSlugEsNombreDeImagenEstatica(rawSlug)
  const slug = sanitizeSlug(rawSlug)
  const supabase = createSimpleSupabase()
  const { data: raw } = await supabase
    .from('artists')
    .select('name, bio_en, bio_es, image_url, og_image_url, styles, country, era')
    .eq('slug', slug)
    .single()
  const meta = raw as ArtistSeoRow | null

  if (!meta?.name) {
    return {
      title: lang === 'es' ? 'Artista no encontrado' : 'Artist not found',
      robots: { index: false, follow: true },
    }
  }

  const siteName = await siteNameForLang(lang)
  // El primer párrafo (lead) suele ser introductorio; mejor para meta/OG que
  // pasar la bio entera y dejar que `smartTruncate` recorte por la mitad.
  const description = bioLead(lang === 'es' ? meta.bio_es : meta.bio_en, 220)
  const keywords = buildArtistKeywords(meta, lang)

  const ogPortrait =
    meta.og_image_url?.trim() ||
    displayArtistImageUrl(slug, meta.image_url) ||
    meta.image_url

  // Si la URL compartida lleva ?play=beatport:<id>, sobreescribimos OG con
  // la portada y título del track concreto, para que WhatsApp/redes muestren
  // la canción específica en vez de la ficha entera del artista.
  const sp: Record<string, string | string[] | undefined> = await (searchParams ?? Promise.resolve({}))
  const playRaw = firstSearchParam(sp.play)
  const parsedPlay = parsePlayParam(playRaw)
  if (parsedPlay?.kind === 'beatport') {
    const { data: topRow } = await supabase
      .from('artists')
      .select('beatport_top_tracks')
      .eq('slug', slug)
      .single()
    const list = (topRow as { beatport_top_tracks: BeatportTopTrack[] | null } | null)?.beatport_top_tracks ?? []
    const track = findBeatportTopTrackById(list, parsedPlay.id)
    if (track) {
      const og = beatportTrackOpenGraphCopy(track, lang)
      return detailPageMetadata(
        lang,
        beatportTrackDetailPath('artists', slug, parsedPlay.id),
        siteName,
        `${og.pageTitle} | ${siteName}`,
        og.description,
        'website',
        og.artworkUrl || ogPortrait,
        keywords,
      )
    }
  }

  // `website` (no `profile`): Meta/WhatsApp priorizan og:image del track/ficha;
  // con `profile` a veces ignoran la carátula y el preview en Facebook queda roto.
  return detailPageMetadata(
    lang,
    `/artists/${slug}`,
    siteName,
    `${meta.name} | ${siteName}`,
    description,
    'website',
    ogPortrait,
    keywords,
  )
}

export default async function ArtistDetailPage({ params, searchParams }: Props) {
  const { lang, slug: rawSlug } = await params
  redirectSiSlugEsNombreDeImagenEstatica(rawSlug)
  const sp: Record<string, string | string[] | undefined> = await (searchParams ?? Promise.resolve({}))
  const editSightingRaw = firstSearchParam(sp.editSighting)
  const editSightingId = editSightingRaw && UUID_RE.test(editSightingRaw) ? editSightingRaw : null
  const slug = sanitizeSlug(rawSlug)
  const supabase = createSimpleSupabase()
  const { data: rawArtist } = await supabase
    .from('artists')
    .select('*')
    .eq('slug', slug)
    .single()
  const artist = rawArtist as Artist | null

  if (!artist) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <Link href={`/${lang}/artists`} className="btn-back">
          <span className="arrow">←</span> {lang === 'es' ? 'Volver a Artistas' : 'Back to Artists'}
        </Link>
        <div className="sec-tag">ARTIST</div>
        <h1 className="sec-title">
          <span className="hl">{rawSlug.replace(/-/g, ' ').toUpperCase()}</span>
        </h1>
        <div className="mt-6 p-4 sm:p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>
            {lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}
          </div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>
            {lang === 'es' ? 'La ficha de este artista se está preparando.' : 'This artist profile is being prepared.'}
          </p>
        </div>
      </div>
    )
  }

  const [{ data: labelRows }, allArtistLinkRows, relatedContent] = await Promise.all([
    supabase.from('labels').select('name, slug'),
    fetchAllArtistLinkRows(supabase),
    fetchArtistRelatedContent(supabase, artist, lang),
  ])

  const labelSlugByName = new Map<string, string>()
  for (const row of labelRows ?? []) {
    const key = normalizeForEntityMatch(row.name)
    if (key && !labelSlugByName.has(key)) labelSlugByName.set(key, row.slug)
  }

  const artistSlugByName = buildArtistSlugLookup(allArtistLinkRows)
  const relatedArtistsForDisplay = filterRelatedArtistsExcludingLabels(
    artist.related_artists,
    labelSlugByName,
  )

  const bio = lang === 'es' ? artist.bio_es : artist.bio_en
  const bioBlocks = splitBioParagraphs(bio)
  const jsonLd = buildJsonLd(artist, lang, slug)
  const breadcrumbLd = breadcrumbJsonLd([
    { name: lang === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
    { name: lang === 'es' ? 'Artistas' : 'Artists', url: `${SITE_URL}/${lang}/artists` },
    { name: artist.name_display || artist.name, url: `${SITE_URL}/${lang}/artists/${slug}` },
  ])
  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [jsonLd, breadcrumbLd],
  }
  // alt enriquecido para el retrato: "Retrato de Fatboy Slim — DJ y productor (UK)"
  const portraitAltBits = [
    lang === 'es'
      ? `Retrato de ${artist.name_display || artist.name}`
      : `${artist.name_display || artist.name} portrait`,
    artist.styles?.[0] || null,
    countryNameFromCode(artist.country, lang),
  ].filter(Boolean) as string[]
  const portraitAlt = portraitAltBits.join(' · ')
  const keyReleases = (artist.key_releases || []) as ArtistKeyRelease[]
  const labelsArr = artist.labels_founded || []
  const recommendedMixes = artist.recommended_mixes || []
  const { chartLinks, mixLinks, upcomingEvents, trackHrefByTitle } = relatedContent
  const hasOnSiteBlock =
    chartLinks.length > 0 || mixLinks.length > 0 || upcomingEvents.length > 0
  const hasLinksBlock =
    Boolean(artist.website?.trim()) ||
    Boolean(artist.beatport_url?.trim()) ||
    Boolean(artist.socials && Object.keys(artist.socials).length > 0)
  const beatportInSocials = Object.keys(artist.socials || {}).some(
    (k) => k.toLowerCase() === 'beatport',
  )

  const sidebarHeadingStyle = {
    fontFamily: "'Darker Grotesque', sans-serif",
    fontWeight: 900,
    fontSize: '16px',
    color: 'var(--yellow)',
    marginBottom: '8px',
    marginTop: 0,
  } as const
  const sidebarRowStyle = {
    fontFamily: "'Courier Prime', monospace",
    fontSize: '12px',
    color: 'rgba(232,220,200,0.6)',
  } as const
  const sidebarLinkStyle = {
    fontFamily: "'Courier Prime', monospace",
    fontSize: '12px',
  } as const

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph) }}
      />

      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <Link href={`/${lang}/artists`} className="btn-back">
          <span className="arrow">←</span> {lang === 'es' ? 'Volver a Artistas' : 'Back to Artists'}
        </Link>

        {/* Hero: misma proporción cuadrada que las cards del listado; en md+ foto + nombre en fila */}
        <header className="mb-8 md:mb-10 border-b-[3px] border-[var(--ink)] pb-8 md:pb-10">
          <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8 lg:gap-10 items-stretch md:items-start">
            <div className="w-full max-w-[min(100%,300px)] sm:max-w-[340px] md:max-w-[min(400px,40vw)] shrink-0 mx-auto md:mx-0">
              <CardThumbnail
                src={displayArtistImageUrl(slug, artist.image_url)}
                alt={portraitAlt}
                aspectClass="aspect-square w-full"
                frameClass="border-[3px] border-[var(--ink)]"
              />
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-center md:justify-start md:pt-0">
              <div className="sec-tag w-fit">{artist.category?.toUpperCase().replace('_', ' ') || 'ARTIST'}</div>
              <h1 className="sec-title mt-2 md:mt-3">
                <span className="hl">{artist.name_display || artist.name}</span>
              </h1>
              {artist.real_name && (
                <p
                  className="mt-1"
                  style={{
                    fontFamily: "'Courier Prime', monospace",
                    fontSize: '14px',
                    letterSpacing: '1px',
                    color: 'var(--dim)',
                  }}
                >
                  {artist.real_name}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-4 md:mt-6">
                <FavoriteButton type="artist" entityId={artist.id} size="md" lang={lang} />
                <SeenLiveButton
                  artistId={artist.id}
                  artistName={artist.name_display || artist.name}
                  lang={lang}
                  editSightingId={editSightingId}
                />
                <FanCounter type="artist" entityId={artist.id} lang={lang} />
                <ShareButtons
                  url={`/${lang}/artists/${slug}`}
                  title={`${artist.name} | Optimal Breaks`}
                  lang={lang}
                />
              </div>
              {(artist.beatport_top_tracks as BeatportTopTrack[] | undefined)?.length ? (
                <BeatportTopTracks
                  tracks={artist.beatport_top_tracks as BeatportTopTrack[]}
                  beatportUrl={artist.beatport_url}
                  lang={lang}
                  entityName={artist.name_display || artist.name}
                  origin={{
                    kind: 'artist',
                    id: artist.id,
                    slug: artist.slug,
                    name: artist.name_display || artist.name,
                  }}
                />
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-0 border-4 border-[var(--ink)]">
          {/* Bio */}
          <div className="p-6 sm:p-8 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]">
            <div className="flex flex-wrap gap-2 mb-4">
              {artist.styles?.map((s: string, i: number) => (
                <span key={i} className="cutout red">{s}</span>
              ))}
              <span className="cutout fill">{artist.country}</span>
              <span className="cutout outline">{artist.era}</span>
            </div>
            <div className="space-y-5">
              {bioBlocks.map((para, i) => (
                <p
                  key={i}
                  style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.85 }}
                  className="text-[var(--ink)]"
                >
                  {para}
                </p>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="p-6 sm:p-8 bg-[var(--ink)] text-[var(--paper)]">
            {/* Cross-links dinámicos: charts, mixes, eventos futuros */}
            {hasOnSiteBlock && (
              <div className="mb-6">
                <h2 style={sidebarHeadingStyle}>
                  {lang === 'es' ? 'EN OPTIMAL BREAKS' : 'ON OPTIMAL BREAKS'}
                </h2>
                {chartLinks.map((link) => (
                  <div key={`chart-${link.id}-${link.kind}`} className="py-2 border-b border-dashed border-white/10">
                    <Link
                      href={link.href}
                      className="text-[var(--cyan)] hover:text-white hover:underline transition-colors"
                      style={{ ...sidebarLinkStyle, fontWeight: 700, color: 'rgba(232,220,200,0.85)' }}
                    >
                      {link.title}
                    </Link>
                    <div style={{ ...sidebarRowStyle, fontSize: '10px', color: 'var(--cyan)', letterSpacing: '0.5px', marginTop: '2px' }}>
                      {link.subtitle}
                    </div>
                  </div>
                ))}
                {mixLinks.map((mix) => (
                  <div key={`mix-${mix.slug}`} className="py-2 border-b border-dashed border-white/10">
                    <Link
                      href={mix.href}
                      className="text-[var(--cyan)] hover:text-white hover:underline transition-colors"
                      style={{ ...sidebarLinkStyle, fontWeight: 700, color: 'rgba(232,220,200,0.85)' }}
                    >
                      {lang === 'es' ? 'Mix' : 'Mix'}: {mix.title}
                    </Link>
                    {mix.year && (
                      <div style={{ ...sidebarRowStyle, fontSize: '10px', color: 'var(--cyan)', letterSpacing: '0.5px', marginTop: '2px' }}>
                        {mix.year}
                      </div>
                    )}
                  </div>
                ))}
                {upcomingEvents.map((ev) => (
                  <div key={`event-${ev.slug}`} className="py-2 border-b border-dashed border-white/10">
                    <Link
                      href={ev.href}
                      className="text-[var(--cyan)] hover:text-white hover:underline transition-colors"
                      style={{ ...sidebarLinkStyle, fontWeight: 700, color: 'rgba(232,220,200,0.85)' }}
                    >
                      {ev.name}
                    </Link>
                    <div style={{ ...sidebarRowStyle, fontSize: '10px', color: 'var(--cyan)', letterSpacing: '0.5px', marginTop: '2px' }}>
                      {[
                        ev.dateStart
                          ? new Date(`${ev.dateStart.slice(0, 10)}T12:00:00`).toLocaleDateString(
                              lang === 'es' ? 'es-ES' : 'en-GB',
                              { day: 'numeric', month: 'short', year: 'numeric' },
                            )
                          : null,
                        ev.city,
                        lang === 'es' ? 'Próximo evento' : 'Upcoming event',
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Essential tracks */}
            {artist.essential_tracks?.length > 0 && (
              <div className="mb-6">
                <h2 style={sidebarHeadingStyle}>
                  {lang === 'es' ? 'TRACKS ESENCIALES' : 'ESSENTIAL TRACKS'}
                </h2>
                {artist.essential_tracks.map((t: string, i: number) => {
                  const chartHref = trackHrefByTitle.get(normalizeTrackTitleKey(t))
                  return (
                    <div key={i} className="py-1 border-b border-dashed border-white/10" style={sidebarRowStyle}>
                      {chartHref ? (
                        <Link
                          href={chartHref}
                          className="text-[var(--cyan)] hover:text-white hover:underline transition-colors"
                          style={sidebarLinkStyle}
                        >
                          {t}
                        </Link>
                      ) : (
                        t
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Recommended mixes (editorial) */}
            {recommendedMixes.length > 0 && (
              <div className="mb-6">
                <h2 style={sidebarHeadingStyle}>
                  {lang === 'es' ? 'MIXES RECOMENDADOS' : 'RECOMMENDED MIXES'}
                </h2>
                {recommendedMixes.map((mixLabel: string, i: number) => {
                  const mixHref = resolveRecommendedMixHref(mixLabel, mixLinks)
                  return (
                    <div key={i} className="py-1 border-b border-dashed border-white/10" style={sidebarRowStyle}>
                      {mixHref ? (
                        <Link
                          href={mixHref}
                          className="text-[var(--cyan)] hover:text-white hover:underline transition-colors"
                          style={sidebarLinkStyle}
                        >
                          {mixLabel}
                        </Link>
                      ) : (
                        mixLabel
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Key releases */}
            {keyReleases.length > 0 && (
              <div className="mb-6">
                <h2 style={sidebarHeadingStyle}>
                  {lang === 'es' ? 'LANZAMIENTOS CLAVE' : 'KEY RELEASES'}
                </h2>
                {keyReleases.map((r, i) => (
                  <div key={i} className="py-2 border-b border-dashed border-white/10">
                    <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', color: 'rgba(232,220,200,0.85)', fontWeight: 700 }}>
                      {r.title} <span style={{ color: 'var(--yellow)', fontSize: '11px' }}>({r.year})</span>
                    </div>
                    {r.note && (
                      <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', color: 'var(--cyan)', letterSpacing: '0.5px', marginTop: '2px' }}>
                        {r.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Labels founded */}
            {labelsArr.length > 0 && (
              <div className="mb-6">
                <h2 style={sidebarHeadingStyle}>
                  {lang === 'es' ? 'SELLOS FUNDADOS' : 'LABELS FOUNDED'}
                </h2>
                <div className="flex flex-wrap gap-1">
                  {labelsArr.map((labelText, i) => {
                    const labelSlug = labelSlugByName.get(normalizeForEntityMatch(labelText))
                    const chipStyle = {
                      fontFamily: "'Courier Prime', monospace",
                      fontWeight: 700,
                      fontSize: '10px',
                      letterSpacing: '1px',
                      textTransform: 'uppercase' as const,
                      padding: '3px 8px',
                      display: 'inline-block' as const,
                    }
                    if (labelSlug) {
                      return (
                        <Link
                          key={i}
                          href={`/${lang}/labels/${labelSlug}`}
                          className="bg-[var(--red)] text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--yellow)] transition-[filter]"
                          style={chipStyle}
                        >
                          {labelText}
                        </Link>
                      )
                    }
                    return (
                      <span key={i} className="bg-[var(--red)] text-white" style={chipStyle}>
                        {labelText}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Related artists (excluye nombres que coinciden con sellos en BD) */}
            {relatedArtistsForDisplay.length > 0 && (
              <div className="mb-6">
                <h2 style={sidebarHeadingStyle}>
                  {lang === 'es' ? 'ARTISTAS RELACIONADOS' : 'RELATED ARTISTS'}
                </h2>
                <div className="flex flex-col gap-0">
                  {relatedArtistsForDisplay.map((relatedName: string, i: number) => {
                    const segments = splitRelatedArtistNames(relatedName)
                    const rowClass = 'py-1 border-b border-dashed border-white/10 w-full'
                    const rowStyle = {
                      fontFamily: "'Courier Prime', monospace",
                      fontSize: '12px',
                      color: 'rgba(232,220,200,0.6)',
                    }
                    return (
                      <div key={i} className={`${rowClass} flex flex-wrap items-baseline gap-x-1 gap-y-0`}>
                        {segments.map((seg, si) => {
                          const relatedSlug = resolveArtistSlug(seg, artistSlugByName)
                          const showAmp = si < segments.length - 1
                          const isSelf = relatedSlug === slug
                          const linkable = relatedSlug && !isSelf
                          return (
                            <span key={si} className="inline-flex flex-wrap items-baseline gap-x-1">
                              {linkable ? (
                                <Link
                                  href={`/${lang}/artists/${relatedSlug}`}
                                  className="text-[var(--cyan)] hover:text-white hover:underline transition-colors"
                                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}
                                >
                                  {seg}
                                </Link>
                              ) : (
                                <span style={rowStyle}>{seg}</span>
                              )}
                              {showAmp && <span style={rowStyle} aria-hidden>&nbsp;&amp;&nbsp;</span>}
                            </span>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Socials / Links */}
            {hasLinksBlock && (
              <div>
                <h2 style={sidebarHeadingStyle}>LINKS</h2>
                {artist.website && (
                  <a href={artist.website} target="_blank" rel="noopener noreferrer" className="block py-1 text-[var(--cyan)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    WEB →
                  </a>
                )}
                {artist.beatport_url && !beatportInSocials && (
                  <a href={artist.beatport_url} target="_blank" rel="noopener noreferrer" className="block py-1 text-[var(--cyan)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    BEATPORT →
                  </a>
                )}
                {Object.entries(artist.socials || {}).map(([key, url]) => (
                  <a key={key} href={url as string} target="_blank" rel="noopener noreferrer" className="block py-1 text-[var(--cyan)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    {key} →
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </>
  )
}
