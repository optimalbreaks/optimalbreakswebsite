// ============================================
// OPTIMAL BREAKS — SEO helpers (metadata, canonical, OG)
// ============================================

import type { Metadata } from 'next'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'

export const SITE_URL = 'https://optimalbreaks.com' as const

/** Referenced in manifest; default social preview when no entity image. */
export const DEFAULT_OG_IMAGE_PATH = '/icon-512.png' as const

export function absoluteOgImage(url?: string | null): string {
  const fallback = `${SITE_URL}${DEFAULT_OG_IMAGE_PATH}`
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

export async function staticPageMetadata(lang: Locale, path: string, key: SeoStaticKey): Promise<Metadata> {
  const dict = await getDictionary(lang)
  const seo = dict.seo as SeoDict
  const page = seo[key]
  const siteName = seo.site_name
  const url = `${SITE_URL}/${lang}${path}`
  const ogImage = absoluteOgImage(null)

  return {
    title: page.title,
    description: page.description,
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
      description: page.description,
      url,
      siteName,
      locale: lang === 'es' ? 'es_ES' : 'en_US',
      type: 'website',
      images: [{ url: ogImage, alt: siteName }],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.description,
      images: [ogImage],
    },
  }
}

/** Truncate text at word boundary without cutting mid-word. */
export function smartTruncate(text: string, maxLen = 160): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  const cut = trimmed.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  const result = lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut
  return result.replace(/[,;:\s]+$/, '') + '…'
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
  const ogImage = absoluteOgImage(ogImageUrl)

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
      images: [{ url: ogImage, alt: title }],
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
