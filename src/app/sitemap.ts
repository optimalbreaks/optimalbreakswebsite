// ============================================
// OPTIMAL BREAKS — Dynamic Sitemap
// ============================================

import { MetadataRoute } from 'next'
import { createSimpleSupabase } from '@/lib/supabase'

const BASE_URL = 'https://optimalbreaks.com'

function slugList(data: { slug: string }[] | null): string[] {
  if (!data?.length) return []
  return Array.from(new Set(data.map((r) => r.slug).filter(Boolean)))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales = ['en', 'es'] as const
  const staticPages = [
    '',
    '/history',
    '/artists',
    '/labels',
    '/events',
    '/scenes',
    '/blog',
    '/mixes',
    '/about',
    '/privacy',
    '/terms',
    '/cookies',
  ]

  const entries: MetadataRoute.Sitemap = []

  for (const locale of locales) {
    for (const page of staticPages) {
      entries.push({
        url: `${BASE_URL}/${locale}${page}`,
        lastModified: new Date(),
        changeFrequency: page === '' ? 'daily' : page === '/blog' ? 'daily' : 'weekly',
        priority: page === '' ? 1 : page === '/artists' ? 0.9 : 0.7,
        alternates: {
          languages: {
            es: `${BASE_URL}/es${page}`,
            en: `${BASE_URL}/en${page}`,
          },
        },
      })
    }
  }

  const client = createSimpleSupabase()
  const [artistsR, labelsR, organizationsR, eventsR, scenesR, blogR] = await Promise.all([
    client.from('artists').select('slug'),
    client.from('labels').select('slug'),
    client.from('organizations').select('slug'),
    client.from('events').select('slug'),
    client.from('scenes').select('slug'),
    client.from('blog_posts').select('slug').eq('is_published', true),
  ])

  const dynamic: { prefix: string; slugs: string[]; priority: number; freq: 'weekly' | 'monthly' }[] = [
    { prefix: '/artists', slugs: slugList(artistsR.data), priority: 0.85, freq: 'weekly' },
    { prefix: '/labels', slugs: slugList(labelsR.data), priority: 0.75, freq: 'weekly' },
    { prefix: '/organizations', slugs: slugList(organizationsR.data), priority: 0.75, freq: 'weekly' },
    { prefix: '/events', slugs: slugList(eventsR.data), priority: 0.75, freq: 'weekly' },
    { prefix: '/scenes', slugs: slugList(scenesR.data), priority: 0.75, freq: 'weekly' },
    { prefix: '/blog', slugs: slugList(blogR.data), priority: 0.8, freq: 'weekly' },
  ]

  for (const { prefix, slugs, priority, freq } of dynamic) {
    for (const slug of slugs) {
      const pagePath = `${prefix}/${slug}`
      for (const locale of locales) {
        entries.push({
          url: `${BASE_URL}/${locale}${pagePath}`,
          lastModified: new Date(),
          changeFrequency: freq,
          priority,
          alternates: {
            languages: {
              es: `${BASE_URL}/es${pagePath}`,
              en: `${BASE_URL}/en${pagePath}`,
            },
          },
        })
      }
    }
  }

  return entries
}
