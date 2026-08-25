// ============================================
// OPTIMAL BREAKS — Label Detail Page
// + ShareButtons + FanCounter
// ============================================

import { createCachedSupabase } from '@/lib/supabase-server'
import { displayArtistImageUrl } from '@/lib/artist-public-portrait'
import {
  buildArtistSlugLookup,
  fetchAllArtistLinkRows,
  normalizeForEntityMatch,
  resolveArtistSlug,
} from '@/lib/artist-entity-match'
import { buildFullArtistSlugMap, buildFullLabelSlugMap, filterArtistSlugMapForNames } from '@/lib/artist-slug-map'
import { fetchLabelOnSitePicks } from '@/lib/artist-related-content'
import CountryBadge from '@/components/CountryBadge'
import {
  breadcrumbJsonLd,
  countryNameFromCode,
  detailPageMetadata,
  musicLabelJsonLd,
  siteNameForLang,
  SITE_URL,
  smartTruncate,
} from '@/lib/seo'
import {
  parsePlayParam,
  findBeatportTopTrackById,
  beatportTrackDetailPath,
  beatportTrackOpenGraphCopy,
} from '@/lib/share-track'
import type { Locale } from '@/lib/i18n-config'
import type { Artist, Label, Organization, BeatportTopTrack } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import { splitBioParagraphs } from '@/lib/bio-format'
import FanCounter from '@/components/FanCounter'
import FavoriteButton from '@/components/FavoriteButton'
import CardThumbnail from '@/components/CardThumbnail'
import BeatportTopTracks from '@/components/BeatportTopTracks'
import ArtistFeaturedTracks from '@/components/ArtistFeaturedTracks'
import ArtistShowcase, { type ShowcaseArtist } from '@/components/ArtistShowcase'

type Props = {
  params: { lang: Locale; slug: string }
  searchParams?: Record<string, string | string[] | undefined>
}

/** `?play=beatport:<id>` debe influir en OG en tiempo de petición. */
export const dynamic = 'force-dynamic'
/** Logos / metadatos del sello: sin caché PostgREST (evita placeholder tras UPSERT). */
export const revalidate = 0
type LabelSeoRow = Pick<
  Label,
  'name' | 'description_en' | 'description_es' | 'image_url' | 'og_image_url' | 'country' | 'founded_year'
>
type LabelPageRow = Label & {
  organization: Pick<Organization, 'slug' | 'name'> | null
}

function buildLabelKeywords(label: LabelSeoRow, lang: Locale): string[] {
  const base = lang === 'es'
    ? ['breakbeat', 'sello discográfico', 'electrónica', 'música electrónica']
    : ['breakbeat', 'record label', 'electronic music']
  const specific = [
    label.name,
    label.country ? countryNameFromCode(label.country, lang) || label.country : null,
    label.founded_year ? String(label.founded_year) : null,
  ].filter(Boolean) as string[]
  return Array.from(new Set([...specific, ...base]))
}

function firstSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v[0] : v
}

type RosterArtistRow = Pick<
  Artist,
  | 'id'
  | 'slug'
  | 'name'
  | 'name_display'
  | 'image_url'
  | 'styles'
  | 'country'
  | 'bio_en'
  | 'bio_es'
  | 'beatport_top_tracks'
>

function rosterCardSlug(name: string, index: number): string {
  const n = normalizeForEntityMatch(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return n || `artist-${index + 1}`
}

function rosterBlurb(bio: string | null | undefined): string {
  const first = splitBioParagraphs(bio)[0] || ''
  return first ? smartTruncate(first, 180) : ''
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createCachedSupabase(0)
  const { data: raw } = await supabase
    .from('labels')
    .select('name, description_en, description_es, image_url, og_image_url, country, founded_year')
    .eq('slug', slug)
    .single()
  const data = raw as LabelSeoRow | null
  if (!data?.name)
    return { title: lang === 'es' ? 'Sello no encontrado' : 'Label not found', robots: { index: false, follow: true } }
  const siteName = await siteNameForLang(lang)
  // Pasamos la descripción entera y dejamos que `smartTruncate` (interno de
  // `detailPageMetadata`) recorte sin partir palabras. `slice(0,160)` cortaba
  // "Alcalá" → "Alcal", típico de meta description rota.
  const description = lang === 'es' ? data.description_es : data.description_en
  const defaultOgImage = data.og_image_url || data.image_url
  // Title enriquecido: "Nombre — País (est. AAAA) | Optimal Breaks".
  const countryNice = countryNameFromCode(data.country, lang)
  const titleTail = [countryNice, data.founded_year ? `est. ${data.founded_year}` : null]
    .filter(Boolean)
    .join(' · ')
  const seoTitle = titleTail ? `${data.name} — ${titleTail} | ${siteName}` : `${data.name} | ${siteName}`
  const keywords = buildLabelKeywords(data, lang)

  // Si la URL compartida lleva ?play=beatport:<id>, sobreescribimos OG con
  // la portada y título del track concreto del Top 10 del sello.
  const sp = searchParams ?? {}
  const parsedPlay = parsePlayParam(firstSearchParam(sp.play))
  if (parsedPlay?.kind === 'beatport') {
    const { data: topRow } = await supabase.from('labels').select('beatport_top_tracks').eq('slug', slug).single()
    const list = (topRow as { beatport_top_tracks: BeatportTopTrack[] | null } | null)?.beatport_top_tracks ?? []
    const track = findBeatportTopTrackById(list, parsedPlay.id)
    if (track) {
      const og = beatportTrackOpenGraphCopy(track, lang)
      return detailPageMetadata(
        lang,
        beatportTrackDetailPath('labels', slug, parsedPlay.id),
        siteName,
        `${og.pageTitle} | ${siteName}`,
        og.description,
        'website',
        og.artworkUrl || defaultOgImage,
        keywords,
      )
    }
  }

  return detailPageMetadata(lang, `/labels/${slug}`, siteName, seoTitle, description, 'website', defaultOgImage, keywords)
}

export default async function LabelDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createCachedSupabase(0)
  const readSupabase = createCachedSupabase(0)
  const { data: rawLabel } = await supabase
    .from('labels')
    .select('*, organization:organizations!labels_organization_id_fkey(slug, name)')
    .eq('slug', slug)
    .single()
  const label = rawLabel as LabelPageRow | null

  const [allArtistLinkRows, onSitePicks, { data: labelRows }] = await Promise.all([
    fetchAllArtistLinkRows(readSupabase),
    label ? fetchLabelOnSitePicks(readSupabase, { name: label.name }) : Promise.resolve([]),
    supabase.from('labels').select('name, slug'),
  ])
  const artistSlugByName = buildArtistSlugLookup(allArtistLinkRows)
  const keyArtistNames = (label?.key_artists ?? []).map((n) => n.trim()).filter(Boolean)
  const rosterSlugs = [...new Set(
    keyArtistNames
      .map((n) => resolveArtistSlug(n, artistSlugByName))
      .filter((s): s is string => Boolean(s)),
  )]
  const rosterSelect =
    'id, slug, name, name_display, image_url, styles, country, bio_en, bio_es, beatport_top_tracks'
  const [{ data: rosterBySlugRaw }, { data: rosterByNameRaw }] = await Promise.all([
    rosterSlugs.length
      ? supabase.from('artists').select(rosterSelect).in('slug', rosterSlugs)
      : Promise.resolve({ data: [] as RosterArtistRow[] }),
    keyArtistNames.length
      ? supabase.from('artists').select(rosterSelect).in('name', keyArtistNames)
      : Promise.resolve({ data: [] as RosterArtistRow[] }),
  ])
  const rosterBySlug = new Map<string, RosterArtistRow>()
  const rosterByNormName = new Map<string, RosterArtistRow>()
  for (const row of [...((rosterBySlugRaw ?? []) as RosterArtistRow[]), ...((rosterByNameRaw ?? []) as RosterArtistRow[])]) {
    rosterBySlug.set(row.slug, row)
    const n = normalizeForEntityMatch(row.name)
    const nd = normalizeForEntityMatch(row.name_display)
    if (n) rosterByNormName.set(n, row)
    if (nd) rosterByNormName.set(nd, row)
  }
  const showcaseArtists: ShowcaseArtist[] = []
  const seenCardSlugs = new Set<string>()
  for (let i = 0; i < keyArtistNames.length; i++) {
    const name = keyArtistNames[i]!
    const resolved = resolveArtistSlug(name, artistSlugByName)
    const row = (resolved ? rosterBySlug.get(resolved) : undefined)
      ?? rosterByNormName.get(normalizeForEntityMatch(name))
    const cardSlug = row?.slug || rosterCardSlug(name, i)
    if (seenCardSlugs.has(cardSlug)) continue
    seenCardSlugs.add(cardSlug)
    showcaseArtists.push({
      slug: cardSlug,
      artistId: row?.id ?? null,
      name: row?.name_display?.trim() || row?.name || name,
      desc: rosterBlurb(lang === 'es' ? row?.bio_es : row?.bio_en),
      genres: (row?.styles ?? []).filter(Boolean).slice(0, 5),
      imageUrl: row ? displayArtistImageUrl(row.slug, row.image_url) ?? null : null,
      country: row?.country ?? null,
      fans: 0,
      href: row ? `/${lang}/artists/${row.slug}` : null,
      tracks: ((row?.beatport_top_tracks ?? []) as BeatportTopTrack[])
        .filter((t) => t?.sample_url)
        .slice(0, 10),
    })
  }
  const trackArtistNames = new Set<string>()
  const trackLabelNames = new Set<string>()
  for (const t of (label?.beatport_top_tracks as BeatportTopTrack[] | undefined) ?? []) {
    for (const a of t.artists ?? []) {
      const artistName = (a.name || '').trim()
      if (artistName) trackArtistNames.add(artistName)
    }
    const labelName = (t.label || '').trim()
    if (labelName) trackLabelNames.add(labelName)
  }
  for (const pick of onSitePicks) {
    const artists = Array.isArray(pick.artists) ? pick.artists : []
    for (const a of artists) {
      const artistName = (a.name || '').trim()
      if (artistName) trackArtistNames.add(artistName)
    }
    const pickLabel = (pick.label || '').trim()
    if (pickLabel) trackLabelNames.add(pickLabel)
  }
  const artistSlugMap = filterArtistSlugMapForNames(
    buildFullArtistSlugMap(allArtistLinkRows),
    trackArtistNames,
  )
  const labelSlugMap = filterArtistSlugMapForNames(
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
  if (!label) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <Link href={`/${lang}/labels`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>
        <div className="sec-tag">LABEL</div>
        <h1 className="sec-title"><span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-4 sm:p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}</div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>{lang === 'es' ? 'Ficha del sello en preparación.' : 'Label profile in preparation.'}</p>
        </div>
      </div>
    )
  }

  // ── JSON-LD: MusicLabel + BreadcrumbList ──
  const labelLd = musicLabelJsonLd(
    {
      slug: label.slug,
      name: label.name,
      description: lang === 'es' ? label.description_es : label.description_en,
      imageUrl: label.og_image_url || label.image_url || null,
      country: label.country,
      foundedYear: label.founded_year,
      website: label.website,
      discogsUrl: label.discogs_url,
      beatportUrl: label.beatport_url,
      // El tipo `Label` no expone `socials` directamente (las redes viven en
      // la organización vinculada, no en la fila del sello). Se deja vacío
      // y el helper se apoya en website/discogs/beatport para `sameAs`.
      socials: null,
    },
    lang,
  )
  const breadcrumbLd = breadcrumbJsonLd([
    { name: lang === 'es' ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
    { name: lang === 'es' ? 'Sellos' : 'Labels', url: `${SITE_URL}/${lang}/labels` },
    { name: label.name, url: `${SITE_URL}/${lang}/labels/${slug}` },
  ])
  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [labelLd, breadcrumbLd],
  }
  // alt enriquecido para el logo: "Logo del sello Skint (Reino Unido, est. 1995)".
  const countryNice = countryNameFromCode(label.country, lang)
  const logoAltBits = [
    lang === 'es' ? `Logo del sello ${label.name}` : `${label.name} record label logo`,
    [countryNice, label.founded_year ? (lang === 'es' ? `est. ${label.founded_year}` : `est. ${label.founded_year}`) : null]
      .filter(Boolean)
      .join(', '),
  ].filter(Boolean) as string[]
  const logoAlt = logoAltBits.filter((s) => s.trim()).join(' · ')
  const hasLinksBlock =
    Boolean(label.website?.trim()) ||
    Boolean(label.beatport_url?.trim()) ||
    Boolean(label.discogs_url?.trim())
  const hasKeyReleases = (label.key_releases?.length ?? 0) > 0
  const hasSidebar = hasKeyReleases || hasLinksBlock
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph) }}
      />
    <div className="lined min-h-screen">
      <div className="px-4 sm:px-6 pt-8 sm:pt-12">
      <Link href={`/${lang}/labels`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>

      {/* Misma estructura hero que artistas: logo acotado + título/compartir en fila (md+) */}
      <header className={`${showcaseArtists.length > 0 ? 'mb-0' : 'mb-8 md:mb-10'} border-b-[3px] border-[var(--ink)] pb-8 md:pb-10`}>
        <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8 lg:gap-10 items-stretch md:items-start">
          <div className="w-full max-w-[min(100%,300px)] sm:max-w-[340px] md:max-w-[min(400px,40vw)] shrink-0 mx-auto md:mx-0">
            <CardThumbnail
              src={label.image_url}
              alt={logoAlt}
              aspectClass="aspect-square w-full"
              frameClass="border-[3px] border-[var(--ink)]"
              fit="contain"
            />
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center md:justify-start md:pt-0">
            <div className="sec-tag w-fit">LABEL</div>
            <h1 className="sec-title mt-2 md:mt-3">
              <span className="hl">{label.name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-4 md:mt-6">
              <FavoriteButton type="label" entityId={label.id} size="md" lang={lang} />
              <FanCounter type="label" entityId={label.id} lang={lang} />
              <ShareButtons url={`/${lang}/labels/${slug}`} title={`${label.name} | Optimal Breaks`} lang={lang} />
            </div>
            {(label.beatport_top_tracks as BeatportTopTrack[] | undefined)?.length ? (
              <BeatportTopTracks
                tracks={label.beatport_top_tracks as BeatportTopTrack[]}
                beatportUrl={label.beatport_url}
                lang={lang}
                entityName={label.name}
                artistSlugMap={artistSlugMap}
                labelSlugMap={labelSlugMap}
                origin={{ kind: 'label', id: label.id, slug: label.slug, name: label.name }}
              />
            ) : null}
            {onSitePicks.length > 0 ? (
              <ArtistFeaturedTracks
                picks={onSitePicks}
                lang={lang}
                entityName={label.name}
                artistSlugMap={artistSlugMap}
                labelSlugMap={labelSlugMap}
                heading={lang === 'es' ? 'EN OPTIMAL BREAKS' : 'ON OPTIMAL BREAKS'}
                badge="OB"
                origin={{ kind: 'label', id: label.id, slug: label.slug, name: label.name }}
              />
            ) : null}
            {/* CTA destacado a Discogs: fuente rica de info (catálogo completo, artistas, fechas, reviews).
                Va debajo del Top 10 Beatport para darle protagonismo como referencia externa. */}
            {label.discogs_url && (
              <a
                href={label.discogs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 md:mt-4 inline-flex items-center justify-center gap-2 w-full px-4 py-3 sm:py-3.5 border-[3px] border-[var(--ink)] bg-[var(--red)] text-white no-underline font-black tracking-[2px] uppercase hover:bg-[var(--ink)] transition-colors"
                style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}
                title={lang === 'es' ? 'Ver catálogo completo en Discogs' : 'View full catalogue on Discogs'}
              >
                <span aria-hidden>↗</span>
                <span>
                  {lang === 'es' ? 'Ver catálogo en Discogs' : 'View catalogue on Discogs'}
                </span>
              </a>
            )}
          </div>
        </div>
      </header>
      </div>

      {showcaseArtists.length > 0 ? (
        <ArtistShowcase
          lang={lang}
          tag={lang === 'es' ? 'ROSTER' : 'ROSTER'}
          title1={lang === 'es' ? 'ARTISTAS' : 'LABEL'}
          title2={lang === 'es' ? 'DEL SELLO' : 'ARTISTS'}
          artists={showcaseArtists}
          idPrefix={`label-${slug}`}
          layout="rail"
          originPath={`/${lang}/labels/${slug}`}
        />
      ) : null}

      <div className="px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
      <div className={`grid grid-cols-1 gap-0 border-4 border-[var(--ink)] ${hasSidebar ? 'md:grid-cols-[2fr_1fr]' : ''}`}>
        {/* Bio */}
        <div className={`p-6 sm:p-8 ${hasSidebar ? 'border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]' : ''}`}>
          <div className="flex flex-wrap gap-2 mb-4">
            {label.country ? (
              <CountryBadge country={label.country} lang={lang} size="md" variant="cutout" />
            ) : null}
            {label.founded_year && <span className="cutout outline">Est. {label.founded_year}</span>}
            <span className={`cutout ${label.is_active ? 'acid' : 'red'}`}>{label.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
            {label.organization && (
              <Link href={`/${lang}/organizations/${label.organization.slug}`} className="cutout outline no-underline text-[var(--ink)]">
                {lang === 'es' ? 'Organizacion: ' : 'Organization: '}{label.organization.name}
              </Link>
            )}
          </div>
          <div className="space-y-5">
            {splitBioParagraphs(lang === 'es' ? label.description_es : label.description_en).map((para, i) => (
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

        {hasSidebar ? (
        <div className="p-6 sm:p-8 bg-[var(--ink)] text-[var(--paper)]">
          {hasKeyReleases && (
            <div className={hasLinksBlock ? 'mb-6' : undefined}>
              <h2 style={sidebarHeadingStyle}>
                {lang === 'es' ? 'LANZAMIENTOS CLAVE' : 'KEY RELEASES'}
              </h2>
              {label.key_releases.map((r: string, i: number) => (
                <div key={i} className="py-1 border-b border-dashed border-white/10" style={sidebarRowStyle}>
                  {r}
                </div>
              ))}
            </div>
          )}

          {hasLinksBlock && (
            <div>
              <h2 style={sidebarHeadingStyle}>LINKS</h2>
              {label.website && (
                <a
                  href={label.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-1 text-[var(--cyan)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}
                >
                  WEB →
                </a>
              )}
              {label.beatport_url && (
                <a
                  href={label.beatport_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-1 text-[var(--cyan)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}
                >
                  BEATPORT →
                </a>
              )}
              {label.discogs_url && (
                <a
                  href={label.discogs_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-1 text-[var(--cyan)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}
                >
                  DISCOGS →
                </a>
              )}
            </div>
          )}
        </div>
        ) : null}
      </div>
      </div>

    </div>
    </>
  )
}
