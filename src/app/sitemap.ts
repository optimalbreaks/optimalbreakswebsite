// ============================================
// OPTIMAL BREAKS — Dynamic Sitemap
// ============================================

import { MetadataRoute } from 'next'

const BASE_URL = 'https://optimalbreaks.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ['en', 'es']
  const staticPages = [
    '', '/history', '/artists', '/labels', '/events',
    '/scenes', '/blog', '/mixes', '/about',
    '/privacy', '/terms', '/cookies',
  ]

  const entries: MetadataRoute.Sitemap = []

  // Static pages for each locale
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

  // TODO: Add dynamic entries from Supabase
  // const artists = await supabase.from('artists').select('slug')
  // artists.data?.forEach(a => { ... })

  return entries
}
