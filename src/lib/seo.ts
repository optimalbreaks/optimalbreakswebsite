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

/** Home /en y /es: imagen OG para redes (`public/images/opengraph_OB_djdeck.png`). */
export const HOME_OG_IMAGE = '/images/opengraph_OB_djdeck.png' as const

/** Texto alt de la imagen OG de la home (accesibilidad / redes). */
export function homeOgImageAlt(lang: Locale): string {
  return lang === 'es'
    ? 'Optimal Breaks — The Breakbeat Bible, cabina DJ con dos platos y mezcladora'
    : 'Optimal Breaks — The Breakbeat Bible, two-deck DJ mixer artwork'
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
  | 'top100'
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
  /** Keywords adicionales que se anteponen a las default (específicas de esta página). */
  extraKeywords?: string[]
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
    keywords: [
      ...(options?.extraKeywords ?? []),
      ...seo.default_keywords.split(',').map((k) => k.trim()),
    ],
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
  ogType: 'website' | 'article' | 'profile' | 'event' = 'website',
  ogImageUrl?: string | null,
  keywords?: string[],
  /**
   * Si true, no se incluyen `images` en `openGraph` ni `twitter`. Útil cuando
   * la ruta tiene su propio `opengraph-image.tsx` / `twitter-image.tsx`
   * dinámico, ya que Next.js solo lo aplica si los metadatos no sobreescriben
   * `openGraph.images`.
   */
  omitImages?: boolean,
  /**
   * Etiquetas Open Graph extra (se inyectan vía `metadata.other`). Útil para
   * `event:start_time`, `event:end_time`, `article:author`, etc., que el tipo
   * estricto de Next no expone directamente.
   */
  extraOgTags?: Record<string, string>,
): Metadata {
  const url = `${SITE_URL}/${lang}${path}`
  const desc = description ? smartTruncate(description) : ''
  const ogImage = absoluteOgImage(ogImageUrl, lang)
  const usesGeneratedFallback = !ogImageUrl?.trim()
  const ogImageMeta = usesGeneratedFallback
    ? { url: ogImage, width: 1200, height: 630, alt: title }
    : { url: ogImage, alt: title, width: 1200, height: 1200 }

  // OG events: 'event' no figura en el set estricto de tipos de Next
  // (article/website/profile/book/music.*/video.*). Para evitar emitir dos
  // `<meta property="og:type">` (uno desde `openGraph.type` y otro desde
  // `other`), si el caller pide `event` omitimos `openGraph.type` y dejamos
  // que `other['og:type']='event'` sea el único meta `og:type` del head.
  const isEventOg = ogType === 'event'
  const safeOgType: 'website' | 'article' | 'profile' = isEventOg ? 'website' : ogType
  const otherTags: Record<string, string> = {
    ...(isEventOg ? { 'og:type': 'event' } : {}),
    ...(extraOgTags ?? {}),
  }

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
      ...(isEventOg ? {} : { type: safeOgType }),
      ...(omitImages ? {} : { images: [ogImageMeta] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc || undefined,
      ...(omitImages ? {} : { images: [ogImage] }),
    },
    ...(Object.keys(otherTags).length > 0 ? { other: otherTags } : {}),
  }
}

export async function siteNameForLang(lang: Locale): Promise<string> {
  const dict = await getDictionary(lang)
  return (dict.seo as SeoDict).site_name
}

// ============================================
// JSON-LD helpers (rich results)
// ============================================

/** Mapeo ISO 3166-1 alpha-2 → nombre legible (ES por idioma de la ficha).
 *  Usado en `nationality` (Person/MusicGroup) y `addressCountry` (Event/Org).
 *  No es exhaustivo — cubre los países habituales del archivo Optimal Breaks. */
const COUNTRY_NAMES: Record<string, { es: string; en: string }> = {
  ES: { es: 'España', en: 'Spain' },
  UK: { es: 'Reino Unido', en: 'United Kingdom' },
  GB: { es: 'Reino Unido', en: 'United Kingdom' },
  US: { es: 'Estados Unidos', en: 'United States' },
  USA: { es: 'Estados Unidos', en: 'United States' },
  AU: { es: 'Australia', en: 'Australia' },
  DE: { es: 'Alemania', en: 'Germany' },
  FR: { es: 'Francia', en: 'France' },
  NL: { es: 'Países Bajos', en: 'Netherlands' },
  BE: { es: 'Bélgica', en: 'Belgium' },
  IT: { es: 'Italia', en: 'Italy' },
  PT: { es: 'Portugal', en: 'Portugal' },
  IE: { es: 'Irlanda', en: 'Ireland' },
  CA: { es: 'Canadá', en: 'Canada' },
  MX: { es: 'México', en: 'Mexico' },
  BR: { es: 'Brasil', en: 'Brazil' },
  AR: { es: 'Argentina', en: 'Argentina' },
  CL: { es: 'Chile', en: 'Chile' },
  RU: { es: 'Rusia', en: 'Russia' },
  PL: { es: 'Polonia', en: 'Poland' },
  CH: { es: 'Suiza', en: 'Switzerland' },
  AT: { es: 'Austria', en: 'Austria' },
  DK: { es: 'Dinamarca', en: 'Denmark' },
  SE: { es: 'Suecia', en: 'Sweden' },
  NO: { es: 'Noruega', en: 'Norway' },
  FI: { es: 'Finlandia', en: 'Finland' },
  JP: { es: 'Japón', en: 'Japan' },
  NZ: { es: 'Nueva Zelanda', en: 'New Zealand' },
}

/** Devuelve el nombre legible del país; si no hay match, devuelve el code tal cual. */
export function countryNameFromCode(code: string | null | undefined, lang: Locale): string | null {
  if (!code) return null
  const trimmed = code.trim()
  if (!trimmed) return null
  const upper = trimmed.toUpperCase()
  const hit = COUNTRY_NAMES[upper]
  if (hit) return hit[lang]
  const lower = trimmed.toLowerCase()
  for (const names of Object.values(COUNTRY_NAMES)) {
    if (names.es.toLowerCase() === lower || names.en.toLowerCase() === lower) {
      return names[lang]
    }
  }
  return trimmed
}

/** ISO 3166-1 alpha-2 normalizado (UK→GB, USA→US, «Russia»→RU). Para banderas y schema. */
export function isoCountryCodeFromCode(code: string | null | undefined): string | null {
  if (!code) return null
  const trimmed = code.trim()
  if (!trimmed) return null
  const upper = trimmed.toUpperCase()
  if (upper === 'UK') return 'GB'
  if (upper === 'USA') return 'US'
  if (upper.length === 2) return upper
  const lower = trimmed.toLowerCase()
  for (const [iso, names] of Object.entries(COUNTRY_NAMES)) {
    if (names.es.toLowerCase() === lower || names.en.toLowerCase() === lower) {
      if (iso === 'UK') return 'GB'
      if (iso === 'USA') return 'US'
      return iso.length === 2 ? iso : null
    }
  }
  return null
}

/** Todos los ISO de un campo país (soporta «AU/UK», «RU», «Russia»…). */
export function countryIsoCodesFromCode(code: string | null | undefined): string[] {
  if (!code) return []
  const trimmed = code.trim()
  if (!trimmed) return []
  const parts = trimmed.split(/[/|,]/).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  const push = (iso: string | null) => {
    if (!iso) return
    const k = iso.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(k)
  }
  if (parts.length > 1) {
    for (const part of parts) push(isoCountryCodeFromCode(part))
    return out
  }
  push(isoCountryCodeFromCode(trimmed))
  return out
}

/** Nombre legible para códigos compuestos («AU/UK» → «Australia / Reino Unido»). */
export function countryDisplayFromCode(code: string | null | undefined, lang: Locale): string | null {
  if (!code) return null
  const trimmed = code.trim()
  if (!trimmed) return null
  const parts = trimmed.split(/[/|,]/).map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) {
    const names = parts.map((p) => countryNameFromCode(p, lang) || p).filter(Boolean)
    return names.length ? names.join(' / ') : trimmed
  }
  return countryNameFromCode(trimmed, lang)
}

/** URL de bandera en flagcdn (PNG, ancho fijo). */
export function flagCdnUrl(iso: string, width = 40): string {
  return `https://flagcdn.com/w${width}/${iso.toLowerCase()}.png`
}

export type BreadcrumbItem = { name: string; url: string }

/** JSON-LD `BreadcrumbList`. Pasa items en orden (Home → Sección → Detalle). */
export function breadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export type EventJsonLdInput = {
  slug: string
  name: string
  description: string | null | undefined
  /** YYYY-MM-DD */
  dateStart: string | null
  /** YYYY-MM-DD */
  dateEnd: string | null
  /** HH:MM[:SS] (hora local del evento) */
  doorsOpen: string | null
  doorsClose: string | null
  city: string
  country: string
  venue: string | null
  address: string | null
  coords: { lat: number; lng: number } | null
  imageUrl: string | null
  ticketsUrl: string | null
  website: string | null
  capacity: number | null
  eventType: 'festival' | 'club_night' | 'past_iconic' | 'upcoming'
  /** Nombre del promotor (organizer). */
  promoterName?: string | null
  promoterSlug?: string | null
  /** Lista plana de artistas (lineup principal); ya filtrada y deduplicada. */
  performers: { name: string; slug?: string | null }[]
}

/** JSON-LD `Event` / `MusicEvent` / `Festival` para fichas de eventos.
 *  Cubre: name, dates con doors-open, location.Place + PostalAddress + geo,
 *  performers, offers (Tickets), organizer, image, description.
 *
 *  `startDate` / `endDate` se emiten en formato ISO con TZ Europe/Madrid por
 *  defecto (los datos viven en BD como `YYYY-MM-DD` + `HH:MM`). Si no hay
 *  hora de puertas, se emite la fecha sin hora — Google lo acepta. */
export function eventJsonLd(input: EventJsonLdInput, lang: Locale): Record<string, unknown> {
  const url = `${SITE_URL}/${lang}/events/${input.slug}`

  // schema.org @type:  festival → 'Festival'; club_night y resto → 'MusicEvent'
  const ldType = input.eventType === 'festival' ? 'Festival' : 'MusicEvent'

  const startDate = composeIsoDateTime(input.dateStart, input.doorsOpen)
  // Para club_night la noche típicamente cruza medianoche: si endDate < start,
  // empujar al día siguiente. Si no hay date_end, usar dateStart.
  const endDate = composeIsoDateTime(
    input.dateEnd ?? input.dateStart,
    input.doorsClose,
    /* maybeNextDay */ Boolean(input.dateStart && (!input.dateEnd || input.dateEnd === input.dateStart)),
  )

  const isoCountry = isoCountryCodeFromCode(input.country)

  const location: Record<string, unknown> = {
    '@type': 'Place',
    name: input.venue || `${input.city}, ${input.country}`,
    address: {
      '@type': 'PostalAddress',
      ...(input.address ? { streetAddress: input.address } : {}),
      addressLocality: input.city,
      ...(isoCountry ? { addressCountry: isoCountry } : { addressCountry: input.country }),
    },
    ...(input.coords
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: input.coords.lat,
            longitude: input.coords.lng,
          },
        }
      : {}),
  }

  const performers = (input.performers ?? [])
    .map((p) => p.name?.trim())
    .filter((n): n is string => Boolean(n))
    .map((name) => ({ '@type': 'PerformingGroup' as const, name }))

  const offers: Record<string, unknown>[] = []
  if (input.ticketsUrl) {
    offers.push({
      '@type': 'Offer',
      url: input.ticketsUrl,
      availability: 'https://schema.org/InStock',
      ...(startDate ? { validFrom: new Date().toISOString() } : {}),
    })
  } else if (input.website) {
    // Si no hay URL de entradas explícita, la web del evento sirve como
    // referencia para `offers.url` (sin `availability`, sólo informativa).
    offers.push({
      '@type': 'Offer',
      url: input.website,
    })
  }

  const organizer = input.promoterName
    ? {
        '@type': 'Organization',
        name: input.promoterName,
        ...(input.promoterSlug
          ? { url: `${SITE_URL}/${lang}/organizations/${input.promoterSlug}` }
          : {}),
      }
    : null

  const image = input.imageUrl ? absoluteOgImage(input.imageUrl, lang) : null

  return {
    '@context': 'https://schema.org',
    '@type': ldType,
    name: input.name,
    ...(input.description ? { description: smartTruncate(input.description, 500) } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location,
    ...(image ? { image: [image] } : {}),
    ...(performers.length > 0 ? { performer: performers } : {}),
    ...(offers.length > 0 ? { offers } : {}),
    ...(organizer ? { organizer } : {}),
    ...(input.capacity ? { maximumAttendeeCapacity: input.capacity } : {}),
    url,
  }
}

/** Construye un timestamp ISO local (sin Z) a partir de fecha YYYY-MM-DD y
 *  hora HH:MM[:SS]. Si la hora indica madrugada (<06:00) y `maybeNextDay`,
 *  desplaza la fecha un día. Si solo hay fecha, devuelve YYYY-MM-DD. */
function composeIsoDateTime(
  date: string | null,
  time: string | null,
  maybeNextDay = false,
): string | null {
  if (!date) return null
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date)
  if (!dateOk) return null
  if (!time) return date
  const m = String(time).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return date
  const hh = String(parseInt(m[1] ?? '0', 10)).padStart(2, '0')
  const mm = (m[2] ?? '00').padStart(2, '0')
  const ss = (m[3] ?? '00').padStart(2, '0')
  const hourNum = parseInt(hh, 10)
  let outDate = date
  if (maybeNextDay && hourNum < 6) {
    const [y, mo, d] = date.split('-').map(Number)
    const dt = new Date(y, mo - 1, d + 1)
    outDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }
  return `${outDate}T${hh}:${mm}:${ss}`
}

export type BlogPostingJsonLdInput = {
  slug: string
  title: string
  description: string | null
  /** ISO timestamp de publicación. */
  datePublished: string | null
  /** ISO timestamp de última edición. Si no se conoce, usar el mismo que `datePublished`. */
  dateModified: string | null
  authorName: string | null
  /** URL del autor (perfil interno, web personal, etc.). Opcional. */
  authorUrl?: string | null
  imageUrl: string | null
  category: string | null
  tags: string[] | null
  /** Idioma del contenido (`es` / `en`). */
  inLanguage: Locale
  /** Recuento aproximado de palabras del artículo, si se conoce. */
  wordCount?: number | null
}

/** JSON-LD `BlogPosting` para artículos del blog.
 *
 *  Cumple los requisitos de Google Rich Results para `Article`/`BlogPosting`:
 *  - `headline`, `image` (ImageObject), `datePublished`, `dateModified`
 *  - `author` (Person) y `publisher` (Organization con `logo.ImageObject`)
 *  - `mainEntityOfPage` apuntando a la canónica del propio artículo. */
export function blogPostingJsonLd(input: BlogPostingJsonLdInput, lang: Locale): Record<string, unknown> {
  const url = `${SITE_URL}/${lang}/blog/${input.slug}`
  const image = input.imageUrl ? absoluteOgImage(input.imageUrl, lang) : null

  const author: Record<string, unknown> = {
    '@type': 'Person',
    name: input.authorName || 'Optimal Breaks',
    ...(input.authorUrl ? { url: input.authorUrl } : {}),
  }

  // Google exige `publisher.Organization` con `logo.ImageObject` para
  // BlogPosting. Apuntamos al icono 512×512 que ya existe en `/public`.
  const publisher = {
    '@type': 'Organization',
    name: 'Optimal Breaks',
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}${DEFAULT_OG_IMAGE_PATH}`,
      width: 512,
      height: 512,
    },
  }

  const tagList = (input.tags ?? []).filter((t): t is string => Boolean(t && t.trim()))

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.title,
    ...(input.description ? { description: smartTruncate(input.description, 280) } : {}),
    ...(image
      ? {
          image: {
            '@type': 'ImageObject',
            url: image,
            width: 1200,
            height: 630,
          },
        }
      : {}),
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    // dateModified es preferido por Google; si la BD no lo tiene, alineamos
    // con datePublished para no dejar la propiedad vacía (Google avisa).
    ...(input.dateModified
      ? { dateModified: input.dateModified }
      : input.datePublished
        ? { dateModified: input.datePublished }
        : {}),
    author,
    publisher,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: input.inLanguage === 'es' ? 'es-ES' : 'en-US',
    url,
    ...(input.category ? { articleSection: input.category } : {}),
    ...(tagList.length > 0 ? { keywords: tagList.join(', ') } : {}),
    ...(typeof input.wordCount === 'number' && input.wordCount > 0
      ? { wordCount: input.wordCount }
      : {}),
  }
}

export type MusicLabelJsonLdInput = {
  slug: string
  name: string
  description: string | null
  imageUrl: string | null
  country: string | null
  foundedYear: number | null
  website: string | null
  discogsUrl: string | null
  beatportUrl: string | null
  socials: Record<string, string> | null
}

/** JSON-LD `MusicLabel` (subtipo de `Organization`) para fichas de sello. */
export function musicLabelJsonLd(input: MusicLabelJsonLdInput, lang: Locale): Record<string, unknown> {
  const url = `${SITE_URL}/${lang}/labels/${input.slug}`
  const isoCountry = isoCountryCodeFromCode(input.country)
  const sameAs = [
    input.website,
    input.discogsUrl,
    input.beatportUrl,
    ...Object.values(input.socials ?? {}),
  ].filter((v): v is string => Boolean(v && v.trim()))

  const image = input.imageUrl ? absoluteOgImage(input.imageUrl, lang) : null

  return {
    '@context': 'https://schema.org',
    '@type': 'MusicLabel',
    name: input.name,
    url,
    ...(image ? { logo: image, image } : {}),
    ...(input.description ? { description: smartTruncate(input.description, 500) } : {}),
    ...(input.foundedYear ? { foundingDate: String(input.foundedYear) } : {}),
    ...(input.country
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(isoCountry ? { addressCountry: isoCountry } : { addressCountry: input.country }),
          },
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs: Array.from(new Set(sameAs)) } : {}),
    mainEntityOfPage: url,
  }
}
