// ============================================
// OPTIMAL BREAKS — robots.txt
// ============================================

import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/_next/'],
    },
    sitemap: 'https://optimalbreaks.com/sitemap.xml',
  }
}
