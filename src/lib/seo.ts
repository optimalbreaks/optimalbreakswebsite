// ============================================
// OPTIMAL BREAKS — SEO helpers (metadata, canonical, OG)
// ============================================

import type { Metadata } from 'next'
import { getDictionary } from '@/lib/dictionaries'
import { i18n, type Locale } from '@/lib/i18n-config'

export const SITE_URL = 'https://www.optimalbreaks.com' as const

/** Referenced in manifest / JSON-LD logo; PWA icons. */
export const DEFAULT_OG_IMAGE_PATH = '/icon-512.png' as const

/** Home /en y /es: imagen OG compartida (Facebook, X, etc.). */
export const HOME_OG_IMAGE = '/images/og-home-optimal-beats.jpeg' as const

/** Ruta generada por `app/[lang]/opengraph-image.tsx` (1200×630). */
export function generatedOgImageUrl(lang: Locale): string {
  return `${SITE_URL}/${lang}/opengraph-image`
}

/**
 * URL absoluta para previews: imagen de entidad o imagen OG generada por idioma.
 */
export function absoluteOgImage(url?: string | null, lang?: Locale): string {
  const fallback = generatedOgImageUrl(lang ?? i18n.defaultLocale)
  const u = url?.trim()
  if (!u) return fallback
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('/')) return `${SITE_URL}${u}`
  return fallback
}

export type SeoStaticKey =
  | 'home'
  | 'history'
  | 'artists'
  | 'labels'
  | 'events'
  | 'scenes'
  | 'blog'
  | 'mixes'
  | 'about'
  | 'privacy'
  | 'terms'
  | 'cookies'

type SeoDict = {
  site_name: string
  default_keywords: string
} & Record<SeoStaticKey, { title: string; description: string }>

/** Truncate text at word boundary without cutting mid-word. */
export function smartTruncate(text: string, maxLen = 160): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  const cut = trimmed.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  const result = lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut
  return result.replace(/[,;:\s]+$/, '') + '…'
}

export type StaticPageMetadataOptions = {
  /** Ruta bajo `public/` (p. ej. `/images/foo.jpeg`). Si se omite, se usa la OG generada. */
  ogImagePath?: string | null
  ogImageAlt?: string
}

export async function staticPageMetadata(
  lang: Locale,
  path: string,
  key: SeoStaticKey,
  options?: StaticPageMetadataOptions,
): Promise<Metadata> {
  const dict = await getDictionary(lang)
  const seo = dict.seo as SeoDict
  const page = seo[key]
  const siteName = seo.site_name
  const url = `${SITE_URL}/${lang}${path}`
  const assetPath = options?.ogImagePath?.trim() || null
  const ogImage = absoluteOgImage(assetPath, lang)
  const usesGeneratedFallback = !assetPath
  const ogImageMeta = usesGeneratedFallback
    ? { url: ogImage, width: 1200, height: 630, alt: options?.ogImageAlt ?? siteName }
    : { url: ogImage, alt: options?.ogImageAlt ?? siteName }
  const desc = smartTruncate(page.description, 160)

  return {
    title: page.title,
    description: desc,
    keywords: seo.default_keywords.split(',').map((k) => k.trim()),
    alternates: {
      canonical: url,
      languages: {
        es: `${SITE_URL}/es${path}`,
        en: `${SITE_URL}/en${path}`,
        'x-default': `${SITE_URL}/en${path}`,
      },
    },
    openGraph: {
      title: page.title,
      description: desc,
      url,
      siteName,
      locale: lang === 'es' ? 'es_ES' : 'en_US',
      type: 'website',
      images: [ogImageMeta],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: desc,
      images: [ogImage],
    },
  }
}

export function detailPageMetadata(
  lang: Locale,
  path: string,
  siteName: string,
  title: string,
  description: string | undefined,
  ogType: 'website' | 'article' | 'profile' = 'website',
  ogImageUrl?: string | null,
  keywords?: string[],
): Metadata {
  const url = `${SITE_URL}/${lang}${path}`
  const desc = description ? smartTruncate(description) : ''
  const ogImage = absoluteOgImage(ogImageUrl, lang)
  const usesGeneratedFallback = !ogImageUrl?.trim()
  const ogImageMeta = usesGeneratedFallback
    ? { url: ogImage, width: 1200, height: 630, alt: title }
    : { url: ogImage, alt: title }

  return {
    title,
    description: desc || undefined,
    keywords: keywords?.length ? keywords : undefined,
    alternates: {
      canonical: url,
      languages: {
        es: `${SITE_URL}/es${path}`,
        en: `${SITE_URL}/en${path}`,
        'x-default': `${SITE_URL}/en${path}`,
      },
    },
    openGraph: {
      title,
      description: desc || undefined,
      url,
      siteName,
      locale: lang === 'es' ? 'es_ES' : 'en_US',
      type: ogType,
      images: [ogImageMeta],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc || undefined,
      images: [ogImage],
    },
  }
}

export async function siteNameForLang(lang: Locale): Promise<string> {
  const dict = await getDictionary(lang)
  return (dict.seo as SeoDict).site_name
}
