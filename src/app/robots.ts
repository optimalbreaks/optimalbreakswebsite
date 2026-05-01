// ============================================
// OPTIMAL BREAKS — robots.txt
//
// Reglas:
// - Genéricas (*): permitir todo el sitio salvo zonas privadas/internas.
// - Crawlers de Open Graph (Facebook, WhatsApp, Twitter/X, LinkedIn, Meta):
//   bloque dedicado que les permite explícitamente todo (incluido /api/og/*
//   por si en el futuro hay endpoints OG dinámicos), para que generen las
//   previsualizaciones cuando se comparte un enlace.
//
// NOTA IMPORTANTE: ningún cambio aquí desbloquea solo el problema de
// Vercel Bot Protection devolviendo 403 al scraper de Facebook. Eso vive
// en `Vercel Dashboard → Settings → Firewall → Custom Rules` (regla de
// Bypass para el UA `facebookexternalhit`). robots.txt no es la causa
// del 403 pero sí buena práctica para que los scrapers vean que pueden
// recoger Open Graph del sitio.
// ============================================

import { MetadataRoute } from 'next'

const COMMON_DISALLOW = [
  '/api/',
  '/_next/',
  '/en/login',
  '/es/login',
  '/en/dashboard',
  '/es/dashboard',
  '/*/administrator',
]

const OG_CRAWLER_USER_AGENTS = [
  'facebookexternalhit',
  'Facebot',
  'meta-externalagent',
  'Twitterbot',
  'LinkedInBot',
  'WhatsApp',
  'Slackbot-LinkExpanding',
  'TelegramBot',
  'Discordbot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: COMMON_DISALLOW,
      },
      // Crawlers de Open Graph: tienen su propio bloque para ser explícitos
      // y no depender de la entrada genérica `*`. Permiten todo, incluido
      // /api/og/* (rutas reservadas a metadatos para previsualizaciones).
      {
        userAgent: OG_CRAWLER_USER_AGENTS,
        allow: ['/', '/api/og/'],
        disallow: COMMON_DISALLOW.filter((p) => p !== '/api/'),
      },
    ],
    sitemap: 'https://www.optimalbreaks.com/sitemap.xml',
  }
}
