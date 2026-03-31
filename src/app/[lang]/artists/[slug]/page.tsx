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
import { detailPageMetadata, siteNameForLang, SITE_URL } from '@/lib/seo'
import { splitBioParagraphs } from '@/lib/bio-format'
import { sanitizeSlug } from '@/lib/security'
import type { Locale } from '@/lib/i18n-config'
import type { Artist, ArtistKeyRelease } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import FanCounter from '@/components/FanCounter'
import FavoriteButton from '@/components/FavoriteButton'
import SeenLiveButton from '@/components/SeenLiveButton'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: { lang: Locale; slug: string } }
type ArtistSeoRow = Pick<Artist, 'name' | 'bio_en' | 'bio_es' | 'image_url' | 'styles' | 'country' | 'era'>

const SOLO_CATEGORIES = new Set(['pioneer', 'us_artist', 'current'])

function buildJsonLd(artist: Artist, lang: Locale, slug: string) {
  const isSolo = SOLO_CATEGORIES.has(artist.category)
  const url = `${SITE_URL}/${lang}/artists/${slug}`

  return {
    '@context': 'https://schema.org',
    '@type': isSolo ? 'Person' : 'MusicGroup',
    name: artist.name_display || artist.name,
    url,
    ...(artist.image_url && { image: artist.image_url }),
    ...(artist.country && { nationality: artist.country }),
    genre: artist.styles?.join(', ') || 'Breakbeat',
    description: (lang === 'es' ? artist.bio_es : artist.bio_en)?.slice(0, 300),
    sameAs: artist.socials ? Object.values(artist.socials).filter(Boolean) : [],
    ...(artist.website && { mainEntityOfPage: artist.website }),
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug: rawSlug } = await params
  const slug = sanitizeSlug(rawSlug)
  const supabase = createSimpleSupabase()
  const { data: raw } = await supabase
    .from('artists')
    .select('name, bio_en, bio_es, image_url, styles, country, era')
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
  const description = lang === 'es' ? meta.bio_es : meta.bio_en
  const keywords = buildArtistKeywords(meta, lang)

  return detailPageMetadata(
    lang,
    `/artists/${slug}`,
    siteName,
    `${meta.name} | ${siteName}`,
    description,
    'profile',
    meta.image_url,
    keywords,
  )
}

export default async function ArtistDetailPage({ params }: Props) {
  const { lang, slug: rawSlug } = await params
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

  const [{ data: labelRows }, allArtistLinkRows] = await Promise.all([
    supabase.from('labels').select('name, slug'),
    fetchAllArtistLinkRows(supabase),
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
  const keyReleases = (artist.key_releases || []) as ArtistKeyRelease[]
  const labelsArr = artist.labels_founded || []

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
                src={artist.image_url}
                alt={artist.name_display || artist.name}
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
                <SeenLiveButton artistId={artist.id} artistName={artist.name_display || artist.name} lang={lang} />
                <FanCounter type="artist" entityId={artist.id} lang={lang} />
                <ShareButtons
                  url={`/${lang}/artists/${slug}`}
                  title={`${artist.name} | Optimal Breaks`}
                  lang={lang}
                />
              </div>
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
            {/* Essential tracks */}
            {artist.essential_tracks?.length > 0 && (
              <div className="mb-6">
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>
                  {lang === 'es' ? 'TRACKS ESENCIALES' : 'ESSENTIAL TRACKS'}
                </div>
                {artist.essential_tracks.map((t: string, i: number) => (
                  <div key={i} className="py-1 border-b border-dashed border-white/10" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'rgba(232,220,200,0.6)' }}>
                    {t}
                  </div>
                ))}
              </div>
            )}

            {/* Key releases */}
            {keyReleases.length > 0 && (
              <div className="mb-6">
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>
                  {lang === 'es' ? 'LANZAMIENTOS CLAVE' : 'KEY RELEASES'}
                </div>
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
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>
                  {lang === 'es' ? 'SELLOS FUNDADOS' : 'LABELS FOUNDED'}
                </div>
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
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>
                  {lang === 'es' ? 'ARTISTAS RELACIONADOS' : 'RELATED ARTISTS'}
                </div>
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
            {artist.socials && Object.keys(artist.socials).length > 0 && (
              <div>
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>LINKS</div>
                {artist.website && (
                  <a href={artist.website} target="_blank" rel="noopener noreferrer" className="block py-1 text-[var(--cyan)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    WEB →
                  </a>
                )}
                {Object.entries(artist.socials).map(([key, url]) => (
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
