// ============================================
// OPTIMAL BREAKS — Legacy redirect
// Maps /dashboard?tab=xxx → /mi-cuenta/<slug> for backwards compat.
// ============================================

'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const TAB_TO_SLUG: Record<string, string> = {
  favorites: 'favoritos',
  sightings: 'vistos-en-vivo',
  events: 'eventos',
  reviews: 'resenas',
  mixes: 'mixes',
  profile: 'perfil',
  tracks: 'tracks',
}

export default function DashboardLegacyRedirect({ lang }: { lang: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  const tab = sp?.get('tab') || ''

  useEffect(() => {
    const slug = TAB_TO_SLUG[tab]
    if (slug) router.replace(`/${lang}/mi-cuenta/${slug}`)
  }, [tab, lang, router])

  return null
}
