// ============================================
// OPTIMAL BREAKS — Root Layout
// ============================================
// OG / Twitter / descripción por idioma: `app/[lang]/layout.tsx` (generateMetadata).

import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Optimal Breaks',
    template: '%s | Optimal Breaks',
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
