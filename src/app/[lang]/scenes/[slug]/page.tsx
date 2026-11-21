// ============================================
// OPTIMAL BREAKS — Scene Detail Page
// + ShareButtons
// ============================================

import { createCachedSupabase } from '@/lib/supabase-server'
import { detailPageMetadata, siteNameForLang } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'
import type { Artist, Label, Scene } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ShareButtons from '@/components/ShareButtons'
import { descriptionLooksLikeHtml, splitBioParagraphs } from '@/lib/bio-format'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: Promise<{ lang: Locale; slug: string }> }
type SceneSeoRow = Pick<Scene, 'name_en' | 'name_es' | 'description_en' | 'description_es' | 'image_url' | 'og_image_url'>

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function linkSceneDescriptionHtml(
  html: string,
  lang: Locale,
  artistSlugs: Map<string, string>,
  labelSlugs: Map<string, string>,
) {
  const entries = [
    ...Array.from(artistSlugs.entries()).flatMap(([name, slug]) => {
      const href = `/${lang}/artists/${slug}`
      const aliases = name.startsWith('The ') ? [name.slice(4)] : []
      return [name, ...aliases].map((alias) => ({ name: alias, href }))
    }),
    ...Array.from(labelSlugs.entries()).flatMap(([name, slug]) => {
      const href = `/${lang}/labels/${slug}`
      const aliases = name.endsWith(' Records') ? [name.slice(0, -8)] : []
      return [name, ...aliases].map((alias) => ({ name: alias, href }))
    }),
  ]
    .filter(({ name }) => name.trim().length > 2)
    .sort((a, b) => b.name.length - a.name.length)

  const byName = new Map<string, string>()
  for (const { name, href } of entries) {
    const key = name.toLocaleLowerCase()
    if (!byName.has(key)) byName.set(key, href)
  }

  const names = Array.from(byName.keys()).sort((a, b) => b.length - a.length)
  if (!names.length) return html

  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${names.map(escapeRegExp).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu')
  let insideAnchor = false

  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<a\b/i.test(part)) insideAnchor = true
        if (/^<\/a>/i.test(part)) insideAnchor = false
        return part
      }
      if (insideAnchor) return part

      return part.replace(pattern, (match, prefix: string, name: string) => {
        const href = byName.get(name.toLocaleLowerCase())
        if (!href) return match
        return `${prefix}<a href="${href}">${name}</a>`
      })
    })
    .join('')
}

function stripHtmlForMeta(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

const SCENE_SEO_OVERRIDES: Record<string, { es: { title: string; description: string }; en: { title: string; description: string } }> = {
  'andalusian-breakbeat': {
    es: {
      title: 'Breakbeat Andaluz: historia, DJs, salas y escena actual',
      description:
        'Todo sobre el breakbeat andaluz: origen en los 90, auge en Málaga, Sevilla y Granada, DJs y sellos clave, festivales y agenda actual del ritmo roto en Andalucía.',
    },
    en: {
      title: 'Andalusian Breakbeat: History, DJs, Clubs & Scene Guide',
      description:
        'The complete guide to Andalusian breakbeat: 90s roots in southern Spain, key DJs, labels, iconic clubs, festivals and the current breakbeat agenda.',
    },
  },
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createCachedSupabase()
  const { data: raw } = await supabase
    .from('scenes')
    .select('name_en, name_es, description_en, description_es, image_url, og_image_url')
    .eq('slug', slug)
    .single()
  const data = raw as SceneSeoRow | null
  if (!data) return { title: lang === 'es' ? 'Escena no encontrada' : 'Scene not found', robots: { index: false, follow: true } }
  const override = SCENE_SEO_OVERRIDES[slug]?.[lang]
  const rawName = lang === 'es' ? data.name_es : data.name_en
  const title =
    override?.title ||
    (rawName.length <= 28
      ? lang === 'es'
        ? `${rawName}: historia, DJs y sellos clave`
        : `${rawName}: History, Key DJs & Labels`
      : rawName)
  const siteName = await siteNameForLang(lang)
  const cleanDesc = stripHtmlForMeta(lang === 'es' ? data.description_es : data.description_en)
  const description = override?.description || cleanDesc
  return detailPageMetadata(lang, `/scenes/${slug}`, siteName, title, description, 'website', data.og_image_url || data.image_url)
}

export default async function SceneDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createCachedSupabase()
  const { data: rawScene } = await supabase.from('scenes').select('*').eq('slug', slug).single()
  const scene = rawScene as Scene | null
  if (!scene) notFound()

  const artistSlugs = new Map<string, string>()
  if (scene?.key_artists?.length) {
    const { data: matchedArtists } = await supabase
      .from('artists')
      .select('name, slug')
      .in('name', scene.key_artists)
    const artistRows = (matchedArtists ?? []) as Pick<Artist, 'name' | 'slug'>[]
    for (const a of artistRows) artistSlugs.set(a.name, a.slug)
  }

  const labelSlugs = new Map<string, string>()
  if (scene?.key_labels?.length) {
    const { data: matchedLabels } = await supabase
      .from('labels')
      .select('name, slug')
      .in('name', scene.key_labels)
    const labelRows = (matchedLabels ?? []) as Pick<Label, 'name' | 'slug'>[]
    for (const l of labelRows) labelSlugs.set(l.name, l.slug)
  }

  const sceneName = lang === 'es' ? scene.name_es : scene.name_en
  const sceneDescription = lang === 'es' ? scene.description_es : scene.description_en
  const sceneBodyIsHtml = descriptionLooksLikeHtml(sceneDescription)
  const linkedSceneDescription = sceneBodyIsHtml
    ? linkSceneDescriptionHtml(sceneDescription ?? '', lang, artistSlugs, labelSlugs)
    : sceneDescription

  return (
    <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
      <Link href={`/${lang}/scenes`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Escenas' : 'Back to Scenes'}</Link>
      <div className="sec-tag">SCENE</div>
      <h1 className="sec-title"><span className="hl">{sceneName}</span></h1>

      {/* Share row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <ShareButtons url={`/${lang}/scenes/${slug}`} title={`${sceneName} | Optimal Breaks`} lang={lang} />
      </div>

      <div className="mb-8 -mx-4 sm:mx-0 border-y-[3px] border-[var(--ink)] overflow-hidden">
        <CardThumbnail
          src={scene.og_image_url || scene.image_url}
          alt={sceneName}
          heightClass="h-48 sm:h-56 md:h-64"
          frameClass="border-0"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <span className="cutout fill">{scene.country}</span>
        {scene.region && <span className="cutout outline">{scene.region}</span>}
        <span className="cutout red">{scene.era}</span>
      </div>
      {sceneBodyIsHtml ? (
        <article
          className="max-w-[700px] mb-8 prose-ob prose-ob-blog text-[var(--ink)]"
          dangerouslySetInnerHTML={{ __html: linkedSceneDescription ?? '' }}
        />
      ) : (
        <div className="max-w-[700px] mb-8 space-y-5">
          {splitBioParagraphs(sceneDescription).map((para, i) => (
            <p
              key={i}
              style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.85 }}
              className="text-[var(--ink)]"
            >
              {para}
            </p>
          ))}
        </div>
      )}
      {scene.key_artists?.length > 0 && (
        <div className="p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)] mb-4">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'ARTISTAS CLAVE' : 'KEY ARTISTS'}</div>
          <div className="flex flex-wrap gap-2">{scene.key_artists.map((a: string, i: number) => {
            const aSlug = artistSlugs.get(a)
            return aSlug
              ? <Link key={i} href={`/${lang}/artists/${aSlug}`} className="cutout red no-underline">{a}</Link>
              : <span key={i} className="cutout red">{a}</span>
          })}</div>
        </div>
      )}
      {scene.key_labels?.length > 0 && (
        <div className="p-4 sm:p-6 border-4 border-[var(--ink)] mb-4">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--red)', marginBottom: '12px' }}>{lang === 'es' ? 'SELLOS CLAVE' : 'KEY LABELS'}</div>
          <div className="flex flex-wrap gap-2">{scene.key_labels.map((l: string, i: number) => {
            const lSlug = labelSlugs.get(l)
            return lSlug
              ? <Link key={i} href={`/${lang}/labels/${lSlug}`} className="cutout fill no-underline">{l}</Link>
              : <span key={i} className="cutout fill">{l}</span>
          })}</div>
        </div>
      )}
      <nav
        aria-label={lang === 'es' ? 'Explorar más en Optimal Breaks' : 'Explore more on Optimal Breaks'}
        className="mt-6 p-4 sm:p-5 border-4 border-[var(--ink)] bg-[var(--paper)] flex flex-wrap items-center gap-3"
      >
        <span style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', letterSpacing: '0.06em' }} className="uppercase text-[var(--ink)]">
          {lang === 'es' ? 'SEGUIR EXPLORANDO:' : 'KEEP EXPLORING:'}
        </span>
        <Link href={`/${lang}/breakbeat`} className="cutout red no-underline">
          {lang === 'es' ? '¿Qué es el breakbeat?' : 'What is breakbeat?'}
        </Link>
        <Link href={`/${lang}/agenda`} className="cutout fill no-underline">
          {lang === 'es' ? 'Agenda breakbeat' : 'Breakbeat agenda'}
        </Link>
        <Link href={`/${lang}/festivals`} className="cutout outline no-underline">
          {lang === 'es' ? 'Festivales' : 'Festivals'}
        </Link>
      </nav>
    </div>
  )
}
