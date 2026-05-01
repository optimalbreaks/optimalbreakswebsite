// ============================================
// OPTIMAL BREAKS — Label Detail Page
// + ShareButtons + FanCounter
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { detailPageMetadata, siteNameForLang } from '@/lib/seo'
import { parsePlayParam, upscaleTrackArtworkForOg } from '@/lib/share-track'
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
type LabelSeoRow = Pick<Label, 'name' | 'description_en' | 'description_es' | 'image_url' | 'og_image_url'>
type LabelPageRow = Label & {
  organization: Pick<Organization, 'slug' | 'name'> | null
}

function firstSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v[0] : v
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: raw } = await supabase.from('labels').select('name, description_en, description_es, image_url, og_image_url').eq('slug', slug).single()
  const data = raw as LabelSeoRow | null
  if (!data?.name)
    return { title: lang === 'es' ? 'Sello no encontrado' : 'Label not found', robots: { index: false, follow: true } }
  const siteName = await siteNameForLang(lang)
  const description = (lang === 'es' ? data.description_es : data.description_en)?.slice(0, 160)
  const defaultOgImage = data.og_image_url || data.image_url

  // Si la URL compartida lleva ?play=beatport:<id>, sobreescribimos OG con
  // la portada y título del track concreto del Top 10 del sello.
  const sp = searchParams ?? {}
  const parsedPlay = parsePlayParam(firstSearchParam(sp.play))
  if (parsedPlay?.kind === 'beatport') {
    const { data: topRow } = await supabase.from('labels').select('beatport_top_tracks').eq('slug', slug).single()
    const list = (topRow as { beatport_top_tracks: BeatportTopTrack[] | null } | null)?.beatport_top_tracks ?? []
    const track = list.find((t) => {
      const m = t.beatport_url?.match(/beatport\.com\/track\/[^/]+\/(\d+)/i)
      return m && m[1] === parsedPlay.id
    })
    if (track) {
      const artistsStr = track.artists.map((a) => a.name).filter(Boolean).join(', ')
      const trackTitle = `${track.title}${track.mix_name ? ` (${track.mix_name})` : ''} — ${artistsStr}`
      const bits: string[] = []
      if (track.label) bits.push(track.label)
      const rd = (track.release_date || '').trim().slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) {
        bits.push(rd)
      } else if (track.release_year && track.release_year > 0) {
        bits.push(String(track.release_year))
      }
      const listenPrefix = lang === 'es' ? 'Escucha este track en Optimal Breaks' : 'Listen to this track on Optimal Breaks'
      const trackDesc = bits.length ? `${listenPrefix} · ${bits.join(' · ')}.` : `${listenPrefix}.`
      return detailPageMetadata(
        lang,
        `/labels/${slug}`,
        siteName,
        `${trackTitle} | ${siteName}`,
        trackDesc,
        'website',
        upscaleTrackArtworkForOg(track.artwork_url) || defaultOgImage,
      )
    }
  }

  return detailPageMetadata(lang, `/labels/${slug}`, siteName, data.name, description, 'website', defaultOgImage)
}

export default async function LabelDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: rawLabel } = await supabase
    .from('labels')
    .select('*, organization:organizations!labels_organization_id_fkey(slug, name)')
    .eq('slug', slug)
    .single()
  const label = rawLabel as LabelPageRow | null

  const artistSlugs = new Map<string, string>()
  if (label?.key_artists?.length) {
    const { data: matchedArtists } = await supabase
      .from('artists')
      .select('name, slug')
      .in('name', label.key_artists)
    const rows = (matchedArtists ?? []) as Pick<Artist, 'name' | 'slug'>[]
    for (const a of rows) artistSlugs.set(a.name, a.slug)
  }

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

  return (
    <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
      <Link href={`/${lang}/labels`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>

      {/* Misma estructura hero que artistas: logo acotado + título/compartir en fila (md+) */}
      <header className="mb-8 md:mb-10 border-b-[3px] border-[var(--ink)] pb-8 md:pb-10">
        <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8 lg:gap-10 items-stretch md:items-start">
          <div className="w-full max-w-[min(100%,300px)] sm:max-w-[340px] md:max-w-[min(400px,40vw)] shrink-0 mx-auto md:mx-0">
            <CardThumbnail
              src={label.image_url}
              alt={label.name}
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

      {label.key_artists?.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'ARTISTAS CLAVE' : 'KEY ARTISTS'}</div>
          <div className="flex flex-wrap gap-2">{label.key_artists.map((a: string, i: number) => {
            const artistSlug = artistSlugs.get(a)
            return artistSlug
              ? <Link key={i} href={`/${lang}/artists/${artistSlug}`} className="cutout red no-underline">{a}</Link>
              : <span key={i} className="cutout red">{a}</span>
          })}</div>
        </div>
      )}
      {label.key_releases?.length > 0 && (
        <div className="mt-4 p-4 sm:p-6 border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--red)', marginBottom: '12px' }}>{lang === 'es' ? 'RELEASES CLAVE' : 'KEY RELEASES'}</div>
          <div className="flex flex-wrap gap-2">{label.key_releases.map((r: string, i: number) => <span key={i} className="cutout fill">{r}</span>)}</div>
        </div>
      )}

    </div>
  )
}
