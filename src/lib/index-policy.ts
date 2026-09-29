// ============================================
// OPTIMAL BREAKS — Política de indexación (fase 2 SEO)
// ----------------------------------------------
// Una sola fuente de verdad para decidir qué versión (es/en) de cada ficha
// merece estar en Google. La usan:
//   · generateMetadata de artistas, sellos, eventos y blog (robots noindex +
//     hreflang solo hacia versiones indexables);
//   · el sitemap (solo lista lo indexable).
//
// Las fichas NO indexables siguen existiendo, enlazadas y navegables
// (`follow`), solo se piden fuera del índice. En cuanto alguien completa la
// bio o la traducción, la ficha vuelve sola al índice y al sitemap.
//
// Interruptor de emergencia: INDEX_POLICY_ENABLED = false → todo indexable,
// como antes de la fase 2.
// ============================================

import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'

export const INDEX_POLICY_ENABLED = true

/** Palabras mínimas de biografía (en ESE idioma) para indexar una ficha de artista. */
export const ARTIST_MIN_BIO_WORDS = 80
/** Palabras mínimas de descripción (en ESE idioma) para indexar una ficha de sello. */
export const LABEL_MIN_DESC_WORDS = 50
/** Palabras mínimas de artículo (en ESE idioma) para indexar una entrada del blog. */
export const BLOG_MIN_WORDS = 150
/** Eventos pasados hace más de estos meses, sin descripción ni cartel de artistas → fuera. */
export const EVENT_STALE_MONTHS = 18
export const EVENT_MIN_DESC_WORDS = 25

export function wordCount(text: string | null | undefined): number {
  if (!text) return 0
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9\u00C0-\u024F]/.test(w)).length
}

function normalizedForCompare(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Texto «traducido» = no vacío y distinto del otro idioma (copia sin traducir no cuenta). */
function isRealTranslation(text: string | null | undefined, other: string | null | undefined): boolean {
  const a = normalizedForCompare(text)
  if (!a) return false
  const b = normalizedForCompare(other)
  return a !== b
}

export type LangIndexability = Record<Locale, boolean>

const ALL_INDEXABLE: LangIndexability = { es: true, en: true }

export function artistIndexability(a: { bio_es?: string | null; bio_en?: string | null }): LangIndexability {
  if (!INDEX_POLICY_ENABLED) return ALL_INDEXABLE
  const es = wordCount(a.bio_es) >= ARTIST_MIN_BIO_WORDS
  const en = wordCount(a.bio_en) >= ARTIST_MIN_BIO_WORDS && isRealTranslation(a.bio_en, a.bio_es)
  return { es, en }
}

export function labelIndexability(l: { description_es?: string | null; description_en?: string | null }): LangIndexability {
  if (!INDEX_POLICY_ENABLED) return ALL_INDEXABLE
  const es = wordCount(l.description_es) >= LABEL_MIN_DESC_WORDS
  const en =
    wordCount(l.description_en) >= LABEL_MIN_DESC_WORDS && isRealTranslation(l.description_en, l.description_es)
  return { es, en }
}

export function blogIndexability(p: { content_es?: string | null; content_en?: string | null }): LangIndexability {
  if (!INDEX_POLICY_ENABLED) return ALL_INDEXABLE
  const es = wordCount(p.content_es) >= BLOG_MIN_WORDS
  const en = wordCount(p.content_en) >= BLOG_MIN_WORDS && isRealTranslation(p.content_en, p.content_es)
  return { es, en }
}

function monthsAgoYmd(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

/**
 * Eventos: son el motor de tráfico, así que la regla es muy permisiva.
 * Solo sale del índice un evento ANTIGUO (último día hace > 18 meses) que
 * además no tenga descripción útil ni artistas en el cartel. El idioma
 * inglés sigue la misma regla, más exigir que la descripción no sea una copia.
 */
export function eventIndexability(e: {
  date_start?: string | null
  date_end?: string | null
  description_es?: string | null
  description_en?: string | null
  lineup?: string[] | null
}): LangIndexability {
  if (!INDEX_POLICY_ENABLED) return ALL_INDEXABLE
  const last = (e.date_end || e.date_start || '').slice(0, 10)
  const stale = Boolean(last) && last < monthsAgoYmd(EVENT_STALE_MONTHS)
  const hasLineup = (e.lineup?.length ?? 0) > 0
  if (!stale || hasLineup) return ALL_INDEXABLE
  return {
    es: wordCount(e.description_es) >= EVENT_MIN_DESC_WORDS,
    en: wordCount(e.description_en) >= EVENT_MIN_DESC_WORDS && isRealTranslation(e.description_en, e.description_es),
  }
}

/**
 * Aplica la política a unos metadatos ya construidos:
 *  · versión actual no indexable → `robots: noindex, follow`;
 *  · hreflang solo hacia versiones indexables (Google no quiere alternates
 *    que apunten a páginas noindex); x-default → en si es indexable, si no es.
 */
export function applyIndexPolicy(
  meta: Metadata,
  lang: Locale,
  path: string,
  indexable: LangIndexability,
): Metadata {
  const languages: Record<string, string> = {}
  if (indexable.es) languages.es = `${SITE_URL}/es${path}`
  if (indexable.en) languages.en = `${SITE_URL}/en${path}`
  if (indexable.en) languages['x-default'] = `${SITE_URL}/en${path}`
  else if (indexable.es) languages['x-default'] = `${SITE_URL}/es${path}`

  const out: Metadata = {
    ...meta,
    alternates: {
      ...(meta.alternates ?? {}),
      canonical: `${SITE_URL}/${lang}${path}`,
      // Con una sola versión indexable, un hreflang de un solo idioma no aporta: se omite.
      ...(Object.keys(languages).length > 2 ? { languages } : { languages: {} }),
    },
  }
  if (!indexable[lang]) out.robots = { index: false, follow: true }
  return out
}
