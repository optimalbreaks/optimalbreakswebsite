/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'geo-media.beatport.com',
      },
      {
        protocol: 'https',
        hostname: 'f4.bcbits.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: '*.sndcdn.com',
      },
      {
        protocol: 'https',
        hostname: '*.mzstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'i.discogs.com',
      },
    ],
  },

  // Redirección de dominio raíz a www (canonical)
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'optimalbreaks.com',
          },
        ],
        destination: 'https://www.optimalbreaks.com/:path*',
        permanent: true,
      },
      /** Slug antiguo del perfil Masterblaster (rebrand a nombre real Aquasky Vs Masterblaster) */
      {
        source: '/:lang/artists/master-blaster',
        destination: '/:lang/artists/aquasky-vs-masterblaster',
        permanent: true,
      },
      /** Olibass 2026: ficha aplazada (15 ago) duplicaba la cita del 19 sept */
      {
        source: '/:lang/events/olibass-music-festival-2026-torredonjimeno',
        destination: '/:lang/events/olibass-music-festival-open-air',
        permanent: true,
      },
    ]
  },

  // Security headers
  async headers() {
    const noStoreArtists = [
      {
        key: 'Cache-Control',
        value: 'private, no-cache, no-store, max-age=0, must-revalidate',
      },
      {
        key: 'CDN-Cache-Control',
        value: 'no-store',
      },
    ]
    return [
      { source: '/:lang/artists', headers: noStoreArtists },
      { source: '/:lang/artists/:slug*', headers: noStoreArtists },
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // Prevent MIME-type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Enable XSS protection (legacy browsers)
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // Control referrer info
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permissions policy — restrict browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Strict Transport Security (HTTPS only)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https: https://www.googletagmanager.com",
              "media-src 'self' https:",
              "connect-src 'self' https://*.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
              "frame-src 'self' https://www.youtube.com https://w.soundcloud.com https://www.mixcloud.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },

  // Disable x-powered-by header
  poweredByHeader: false,

  // Next 16: Turbopack por defecto. El import de .woff2 (Unbounded 900) iba
  // por una regla webpack; aquí el equivalente.
  turbopack: {
    rules: {
      '*.woff2': {
        type: 'asset',
      },
    },
  },
}

module.exports = nextConfig
