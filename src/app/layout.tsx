// ============================================
// OPTIMAL BREAKS — Root Layout
// ============================================

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Optimal Breaks — The Breakbeat Bible',
    template: '%s | Optimal Breaks',
  },
  description:
    'Archive, magazine, guide and scene memory dedicated to preserving and celebrating breakbeat culture worldwide.',
  keywords: [
    'breakbeat', 'breaks', 'UK bass', 'electronic music', 'rave',
    'jungle', 'drum and bass', 'nu skool breaks', 'big beat',
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
