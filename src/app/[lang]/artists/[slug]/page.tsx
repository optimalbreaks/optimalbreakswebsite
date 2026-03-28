// ============================================
// OPTIMAL BREAKS — Artist Detail Page
// ============================================

import { createSimpleSupabase } from '@/lib/supabase'
import { detailPageMetadata, siteNameForLang, SITE_URL } from '@/lib/seo'
import { splitBioParagraphs } from '@/lib/bio-format'
import { sanitizeSlug } from '@/lib/security'
import type { Locale } from '@/lib/i18n-config'
import type { Artist, ArtistKeyRelease } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import FanCounter from '@/components/FanCounter'
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

/** Normaliza nombres para enlazar con filas de BD (apóstrofos, espacios). */
function normalizeForEntityMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[''´`]/g, '')
    .replace(/\s+/g, ' ')
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

  const [{ data: labelRows }, { data: allArtistsForLinks }] = await Promise.all([
    supabase.from('labels').select('name, slug'),
    supabase.from('artists').select('name, name_display, slug'),
  ])

  const labelSlugByName = new Map<string, string>()
  for (const row of labelRows ?? []) {
    const key = normalizeForEntityMatch(row.name)
    if (key && !labelSlugByName.has(key)) labelSlugByName.set(key, row.slug)
  }

  const artistSlugByName = new Map<string, string>()
  for (const row of allArtistsForLinks ?? []) {
    const k1 = normalizeForEntityMatch(row.name)
    if (k1 && !artistSlugByName.has(k1)) artistSlugByName.set(k1, row.slug)
    if (row.name_display) {
      const k2 = normalizeForEntityMatch(row.name_display)
      if (k2 && !artistSlugByName.has(k2)) artistSlugByName.set(k2, row.slug)
    }
  }

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

        <div className="sec-tag">{artist.category?.toUpperCase().replace('_', ' ') || 'ARTIST'}</div>
        <h1 className="sec-title">
          <span className="hl">{artist.name_display || artist.name}</span>
        </h1>

        {artist.real_name && (
          <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '14px', letterSpacing: '1px', color: 'var(--dim)', marginTop: '-8px', marginBottom: '16px' }}>
            {artist.real_name}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-8">
          <FanCounter type="artist" entityId={artist.id} lang={lang} />
          <ShareButtons url={`/${lang}/artists/${slug}`} title={`${artist.name} | Optimal Breaks`} lang={lang} />
        </div>

        <div className="mb-8 -mx-4 sm:mx-0 border-y-[3px] border-[var(--ink)] overflow-hidden">
          <CardThumbnail
            src={artist.image_url}
            alt={artist.name_display || artist.name}
            heightClass="h-48 sm:h-64 md:h-72"
            frameClass="border-0"
          />
        </div>

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

            {/* Related artists */}
            {artist.related_artists?.length > 0 && (
              <div className="mb-6">
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>
                  {lang === 'es' ? 'ARTISTAS RELACIONADOS' : 'RELATED ARTISTS'}
                </div>
                <div className="flex flex-wrap gap-1">
                  {artist.related_artists.map((relatedName: string, i: number) => {
                    const relatedSlug = artistSlugByName.get(normalizeForEntityMatch(relatedName))
                    const rowClass = 'py-1 border-b border-dashed border-white/10 block w-full'
                    const rowStyle = {
                      fontFamily: "'Courier Prime', monospace",
                      fontSize: '12px',
                      color: 'rgba(232,220,200,0.6)',
                    }
                    if (relatedSlug && relatedSlug !== slug) {
                      return (
                        <Link
                          key={i}
                          href={`/${lang}/artists/${relatedSlug}`}
                          className={`${rowClass} text-[var(--cyan)] hover:text-white hover:underline transition-colors`}
                          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}
                        >
                          {relatedName}
                        </Link>
                      )
                    }
                    return (
                      <span key={i} className={rowClass} style={rowStyle}>
                        {relatedName}
                      </span>
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
