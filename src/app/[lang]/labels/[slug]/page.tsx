// ============================================
// OPTIMAL BREAKS — Label Detail Page
// + ShareButtons + FanCounter
// ============================================

import { createCachedSupabase } from '@/lib/supabase-server'
import {
  buildArtistSlugLookup,
  fetchAllArtistLinkRows,
  normalizeForEntityMatch,
  resolveArtistSlug,
} from '@/lib/artist-entity-match'
import { fetchLabelChartLinks } from '@/lib/artist-related-content'
import {
  breadcrumbJsonLd,
  countryNameFromCode,
  detailPageMetadata,
  musicLabelJsonLd,
  siteNameForLang,
  SITE_URL,
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

  const artistSlugs = new Map<string, string>()
  const [{ data: matchedArtists }, allArtistLinkRows, labelChartLinks] = await Promise.all([
    label?.key_artists?.length
      ? supabase.from('artists').select('name, slug').in('name', label.key_artists)
      : Promise.resolve({ data: [] as Pick<Artist, 'name' | 'slug'>[] }),
    fetchAllArtistLinkRows(readSupabase),
    label ? fetchLabelChartLinks(readSupabase, { name: label.name }, lang) : Promise.resolve([]),
  ])
  const rows = (matchedArtists ?? []) as Pick<Artist, 'name' | 'slug'>[]
  for (const a of rows) artistSlugs.set(a.name, a.slug)
  const artistSlugByName = buildArtistSlugLookup(allArtistLinkRows)
  const keyArtistsInCharts = new Set(
    labelChartLinks.flatMap((link) => link.artistNames.map((n) => normalizeForEntityMatch(n))),
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph) }}
      />
    <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
      <Link href={`/${lang}/labels`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>

      {/* Misma estructura hero que artistas: logo acotado + título/compartir en fila (md+) */}
      <header className="mb-8 md:mb-10 border-b-[3px] border-[var(--ink)] pb-8 md:pb-10">
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

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="cutout fill">{label.country}</span>
        {label.founded_year && <span className="cutout outline">Est. {label.founded_year}</span>}
        <span className={`cutout ${label.is_active ? 'acid' : 'red'}`}>{label.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
        {label.organization && (
          <Link href={`/${lang}/organizations/${label.organization.slug}`} className="cutout outline no-underline text-[var(--ink)]">
            {lang === 'es' ? 'Organizacion: ' : 'Organization: '}{label.organization.name}
          </Link>
        )}
      </div>

      {label.website && (
        <div className="flex flex-wrap gap-2 mb-8">
          <a
            href={label.website}
            target="_blank"
            rel="noopener noreferrer"
            className="cutout outline no-underline text-[var(--ink)]"
            title={lang === 'es' ? 'Web oficial del sello' : 'Official label website'}
          >
            {lang === 'es' ? '↗ WEB' : '↗ WEBSITE'}
          </a>
        </div>
      )}
      <div className="max-w-[700px] space-y-5">
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

      {labelChartLinks.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
          <h2 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px', marginTop: 0 }}>
            {lang === 'es' ? 'EN OPTIMAL BREAKS' : 'ON OPTIMAL BREAKS'}
          </h2>
          {labelChartLinks.map((link) => (
            <div key={`${link.kind}-${link.id}`} className="py-2 border-b border-dashed border-white/10 last:border-b-0">
              <Link
                href={link.href}
                className="text-[var(--cyan)] hover:text-white hover:underline transition-colors"
                style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', fontWeight: 700, color: 'rgba(232,220,200,0.85)' }}
              >
                {link.title}
              </Link>
              <div
                className="flex flex-wrap items-baseline gap-x-1 gap-y-0 mt-1"
                style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', color: 'var(--cyan)', letterSpacing: '0.5px' }}
              >
                {link.artistNames.length > 0 ? (
                  <>
                    {link.artistNames.map((artistName, ai) => {
                      const artistSlug = resolveArtistSlug(artistName, artistSlugByName)
                      const showComma = ai < link.artistNames.length - 1
                      return (
                        <span key={`${link.id}-artist-${ai}`} className="inline-flex items-baseline gap-x-0">
                          {artistSlug ? (
                            <Link
                              href={`/${lang}/artists/${artistSlug}`}
                              className="text-[var(--cyan)] hover:text-white hover:underline transition-colors"
                              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px' }}
                            >
                              {artistName}
                            </Link>
                          ) : (
                            <span>{artistName}</span>
                          )}
                          {showComma && <span aria-hidden>,&nbsp;</span>}
                        </span>
                      )
                    })}
                    <span aria-hidden>&nbsp;·&nbsp;</span>
                  </>
                ) : null}
                <span>{link.subtitle}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {label.key_artists?.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
          <h2 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px', marginTop: 0 }}>{lang === 'es' ? 'ARTISTAS CLAVE' : 'KEY ARTISTS'}</h2>
          <div className="flex flex-wrap gap-2">{label.key_artists.map((a: string, i: number) => {
            const artistSlug = artistSlugs.get(a) || resolveArtistSlug(a, artistSlugByName)
            const inCharts = keyArtistsInCharts.has(normalizeForEntityMatch(a))
            return artistSlug
              ? (
                <Link key={i} href={`/${lang}/artists/${artistSlug}`} className="cutout red no-underline" title={inCharts ? (lang === 'es' ? 'Aparece en charts de Optimal Breaks' : 'Featured in Optimal Breaks charts') : undefined}>
                  {a}{inCharts ? ' ★' : ''}
                </Link>
              )
              : <span key={i} className="cutout red">{a}{inCharts ? ' ★' : ''}</span>
          })}</div>
        </div>
      )}
      {label.key_releases?.length > 0 && (
        <div className="mt-4 p-4 sm:p-6 border-4 border-[var(--ink)]">
          <h2 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--red)', marginBottom: '12px', marginTop: 0 }}>{lang === 'es' ? 'RELEASES CLAVE' : 'KEY RELEASES'}</h2>
          <div className="flex flex-wrap gap-2">{label.key_releases.map((r: string, i: number) => <span key={i} className="cutout fill">{r}</span>)}</div>
        </div>
      )}

    </div>
    </>
  )
}
