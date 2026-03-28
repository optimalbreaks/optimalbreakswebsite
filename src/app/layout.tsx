// ============================================
// OPTIMAL BREAKS — Root Layout
// ============================================

import type { Metadata } from 'next'
import { DEFAULT_OG_IMAGE_PATH, SITE_URL } from '@/lib/seo'

const defaultOg = `${SITE_URL}${DEFAULT_OG_IMAGE_PATH}`

export const metadata: Metadata = {
  metadataBase: new URL('https://optimalbreaks.com'),
  title: {
    default: 'Optimal Breaks',
    template: '%s | Optimal Breaks',
  },
  description:
    'Archive, magazine and guide to breakbeat culture—history, artists, scenes and dancefloor memory (EN/ES).',
  keywords: [
    'breakbeat',
    'breaks',
    'UK bass',
    'nu skool breaks',
    'big beat',
    'jungle',
    'drum and bass',
    'rave',
    'electronic music',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Optimal Breaks',
    images: [{ url: defaultOg, alt: 'Optimal Breaks' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [defaultOg],
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
