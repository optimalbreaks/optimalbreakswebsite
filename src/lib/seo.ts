// ============================================
// OPTIMAL BREAKS — SEO helpers (metadata, canonical, OG)
// ============================================

import type { Metadata } from 'next'
import { getDictionary } from '@/lib/dictionaries'
import { displayImageUrl } from '@/lib/image-url'
import {
  SECTION_OG_BASE,
  SECTION_OG_KEYS,
  SECTION_OG_PIXELS,
  SECTION_OG_PIXEL_HEIGHT,
  SECTION_OG_PIXEL_WIDTH,
  type SectionOgKey,
} from '@/lib/og-section-images'
import { i18n, type Locale } from '@/lib/i18n-config'

export const SITE_URL = 'https://www.optimalbreaks.com' as const

/** Referenced in manifest / JSON-LD logo; PWA icons. */
export const DEFAULT_OG_IMAGE_PATH = '/icon-512.png' as const

/** Home /en y /es: imagen OG para redes (arte vinilo + funda punk, no el logo del sitio). */
export const HOME_OG_IMAGE = '/images/opengraph_OB_punk.png' as const

/** Texto alt de la imagen OG de la home (accesibilidad / redes). */
export function homeOgImageAlt(lang: Locale): string {
  return lang === 'es'
    ? 'Optimal Breaks — vinilo y funda artwork'
    : 'Optimal Breaks — vinyl sleeve artwork'
}

/** Idioma secundario para og:locale:alternate (Facebook / Meta). */
export function ogAlternateLocales(lang: Locale): string[] {
  return lang === 'es' ? ['en_US'] : ['es_ES']
}

/** Ruta generada por `app/[lang]/opengraph-image.tsx` (1200×630). */
export function generatedOgImageUrl(lang: Locale): string {
  return `${SITE_URL}/${lang}/opengraph-image`
}

/**
 * URL absoluta para previews: imagen de entidad o imagen OG generada por idioma.
 */
export function absoluteOgImage(url?: string | null, lang?: Locale): string {
  const fallback = generatedOgImageUrl(lang ?? i18n.defaultLocale)
  const raw = url?.trim()
  const u = raw ? displayImageUrl(raw) ?? raw : ''
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
  | 'charts'
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

function seoKeyToSectionOgKey(k: SeoStaticKey): SectionOgKey | null {
  const hit = SECTION_OG_KEYS.find((sk) => sk === k)
  return hit ?? null
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
  const isSectionOg = !!assetPath?.startsWith(`${SECTION_OG_BASE}/`)
  const sectionOgKey = seoKeyToSectionOgKey(key)
  const sectionPixels = sectionOgKey ? SECTION_OG_PIXELS[sectionOgKey] : null
  const ogImageMeta = usesGeneratedFallback
    ? {
        url: ogImage,
        width: 1200,
        height: 630,
        type: 'image/png',
        alt: options?.ogImageAlt ?? siteName,
      }
    : isSectionOg
      ? {
          url: ogImage,
          width: sectionPixels?.width ?? SECTION_OG_PIXEL_WIDTH,
          height: sectionPixels?.height ?? SECTION_OG_PIXEL_HEIGHT,
          type: 'image/png',
          alt: options?.ogImageAlt ?? siteName,
        }
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
      alternateLocale: ogAlternateLocales(lang),
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
      alternateLocale: ogAlternateLocales(lang),
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
