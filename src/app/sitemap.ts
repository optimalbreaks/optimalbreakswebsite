// ============================================
// OPTIMAL BREAKS — Dynamic Sitemap
// ============================================

import { MetadataRoute } from 'next'
import { createCachedSupabase } from '@/lib/supabase-server'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { loadAgendaEvents } from '@/lib/agenda-data'
import { buildCityBuckets, buildMonthBuckets } from '@/lib/event-agenda'
import { eventsOfSeries, FESTIVAL_SERIES, MIN_SERIES_EDITIONS } from '@/lib/event-series'
import {
  artistIndexability,
  blogIndexability,
  eventIndexability,
  labelIndexability,
  type LangIndexability,
} from '@/lib/index-policy'
import { isEventCancelled } from '@/types/database'

const BASE_URL = 'https://www.optimalbreaks.com'

/** Post consolidado en la página pilar /breakbeat (301 en next.config.js). */
const REDIRECTED_BLOG_SLUG =
  'que-es-el-breakbeat-guia-clara-para-entender-el-genero-sus-raices-y-su-evolucion'

const LOCALES = ['en', 'es'] as const

type ChangeFreq = 'daily' | 'weekly' | 'monthly'

function slugList(data: { slug: string }[] | null): string[] {
  if (!data?.length) return []
  return Array.from(new Set(data.map((r) => r.slug).filter(Boolean)))
}

function languagesFor(path: string, indexable: LangIndexability): Record<string, string> {
  const languages: Record<string, string> = {}
  if (indexable.es) languages.es = `${BASE_URL}/es${path}`
  if (indexable.en) languages.en = `${BASE_URL}/en${path}`
  return languages
}

function pushPages(
  entries: MetadataRoute.Sitemap,
  path: string,
  priority: number,
  changeFrequency: ChangeFreq,
  indexable: LangIndexability = { es: true, en: true },
  lastModified?: Date,
) {
  const languages = languagesFor(path, indexable)
  for (const locale of LOCALES) {
    if (!indexable[locale]) continue
    entries.push({
      url: `${BASE_URL}/${locale}${path}`,
      changeFrequency,
      priority,
      alternates: { languages },
      ...(lastModified ? { lastModified } : {}),
    })
  }
}

function staticPriority(page: string): number {
  if (page === '') return 1
  if (page === '/artists' || page === '/charts' || page === '/top100' || page === '/breakbeat') return 0.9
  if (page === '/festivals' || page === '/agenda') return 0.8
  return 0.7
}

function staticFrequency(page: string): ChangeFreq {
  if (page === '' || page === '/blog' || page === '/charts' || page === '/top100') return 'daily'
  return 'weekly'
}

function eventLastModified(updatedAt: string | null | undefined): Date | undefined {
  if (!updatedAt) return undefined
  const d = new Date(updatedAt)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    '',
    '/history',
    '/artists',
    '/labels',
    '/events',
    '/scenes',
    '/blog',
    '/charts',
    '/top100',
    '/mixes',
    '/breakbeat',
    '/festivals',
    '/agenda',
    '/about',
    '/privacy',
    '/terms',
    '/cookies',
  ]

  const entries: MetadataRoute.Sitemap = []

  for (const page of staticPages) {
    pushPages(entries, page, staticPriority(page), staticFrequency(page))
  }

  const client = createCachedSupabase()

  // Bios y artículos pesan: páginas cortas para no pasar el tope de 2 MB de la Data Cache.
  const [artists, labels, blogPosts, eventRows, organizationsR, scenesR, agendaEvents, mixRows] = await Promise.all([
    fetchAllPages<{ slug: string; bio_es: string | null; bio_en: string | null }>(
      (from, to) =>
        client
          .from('artists')
          .select('slug, bio_es, bio_en')
          .order('id', { ascending: true })
          .range(from, to),
      100,
    ),
    fetchAllPages<{ slug: string; description_es: string | null; description_en: string | null }>((from, to) =>
      client
        .from('labels')
        .select('slug, description_es, description_en')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ slug: string; content_es: string | null; content_en: string | null }>(
      (from, to) =>
        client
          .from('blog_posts')
          .select('slug, content_es, content_en')
          .eq('is_published', true)
          .order('id', { ascending: true })
          .range(from, to),
      40,
    ),
    fetchAllPages<{
      slug: string
      date_start: string | null
      date_end: string | null
      description_es: string | null
      description_en: string | null
      lineup: string[] | null
      updated_at: string | null
    }>((from, to) =>
      client
        .from('events')
        .select('slug, date_start, date_end, description_es, description_en, lineup, updated_at')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    client.from('organizations').select('slug'),
    client.from('scenes').select('slug'),
    loadAgendaEvents(),
    fetchAllPages<{ slug: string; event_id: string | null }>((from, to) =>
      client
        .from('mixes')
        .select('slug, event_id')
        .order('id', { ascending: true })
        .range(from, to),
    ).catch(() => [] as { slug: string; event_id: string | null }[]),
  ])

  for (const row of artists) {
    if (!row.slug) continue
    pushPages(entries, `/artists/${row.slug}`, 0.85, 'weekly', artistIndexability(row))
  }
  for (const row of labels) {
    if (!row.slug) continue
    pushPages(entries, `/labels/${row.slug}`, 0.75, 'weekly', labelIndexability(row))
  }
  for (const row of blogPosts) {
    if (!row.slug || row.slug === REDIRECTED_BLOG_SLUG) continue
    pushPages(entries, `/blog/${row.slug}`, 0.8, 'weekly', blogIndexability(row))
  }
  for (const row of eventRows) {
    if (!row.slug) continue
    pushPages(
      entries,
      `/events/${row.slug}`,
      0.75,
      'weekly',
      eventIndexability(row),
      eventLastModified(row.updated_at),
    )
  }

  for (const row of mixRows) {
    if (!row.slug) continue
    pushPages(entries, `/mixes/${row.slug}`, row.event_id ? 0.7 : 0.6, 'monthly')
  }

  const openEvents = agendaEvents.filter((e) => !isEventCancelled(e))
  for (const series of FESTIVAL_SERIES) {
    if (eventsOfSeries(series, agendaEvents).length < MIN_SERIES_EDITIONS) continue
    pushPages(entries, `/festivals/${series.slug}`, 0.75, 'weekly')
  }
  for (const city of buildCityBuckets(openEvents)) {
    pushPages(entries, `/agenda/${city.slug}`, 0.7, 'weekly')
  }
  for (const month of buildMonthBuckets(openEvents)) {
    pushPages(entries, `/agenda/${month.key}`, 0.7, 'weekly')
  }

  const dynamic: { prefix: string; slugs: string[]; priority: number; freq: ChangeFreq }[] = [
    { prefix: '/organizations', slugs: slugList(organizationsR.data), priority: 0.75, freq: 'weekly' },
    { prefix: '/scenes', slugs: slugList(scenesR.data), priority: 0.75, freq: 'weekly' },
  ]

  for (const { prefix, slugs, priority, freq } of dynamic) {
    for (const slug of slugs) {
      pushPages(entries, `${prefix}/${slug}`, priority, freq)
    }
  }

  return entries
}
