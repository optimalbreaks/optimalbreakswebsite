// ============================================
// OPTIMAL BREAKS — 40 Breaks Vitales (Charts Page)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { ChartEdition, ChartFeaturedTrack, ChartTrack } from '@/types/database'
import type { Metadata } from 'next'
import { staticPageMetadata } from '@/lib/seo'
import ChartView from '@/components/ChartView'

export async function generateMetadata({
  params,
}: {
  params: { lang: Locale }
}): Promise<Metadata> {
  return staticPageMetadata(params.lang, '/charts', 'charts')
}

export default async function ChartsPage({
  params,
  searchParams,
}: {
  params: { lang: Locale }
  searchParams: { week?: string }
}) {
  const lang = params.lang
  const dict = await getDictionary(lang)
  const supabase = createServerSupabase()

  const { data: editionsRaw } = await supabase
    .from('chart_editions')
    .select('*')
    .eq('is_published', true)
    .order('week_date', { ascending: false })
    .limit(52)

  const editions = (editionsRaw as ChartEdition[] | null) ?? []
  const editionIds = editions.map((e) => e.id)

  let allTracks: ChartTrack[] = []
  let allFeatured: ChartFeaturedTrack[] = []
  if (editionIds.length > 0) {
    const { data: trks } = await supabase
      .from('chart_tracks')
      .select('*')
      .in('chart_edition_id', editionIds)
      .order('position', { ascending: true })
    allTracks = (trks as ChartTrack[]) ?? []

    const { data: feat } = await supabase
      .from('chart_featured_tracks')
      .select('*')
      .in('chart_edition_id', editionIds)
      .order('sort_order', { ascending: true })
    allFeatured = (feat as ChartFeaturedTrack[]) ?? []
  }

  const byEdition = new Map<string, ChartTrack[]>()
  for (const t of allTracks) {
    const id = t.chart_edition_id
    const list = byEdition.get(id) ?? []
    list.push(t)
    byEdition.set(id, list)
  }

  const featuredByEdition = new Map<string, ChartFeaturedTrack[]>()
  for (const row of allFeatured) {
    const id = row.chart_edition_id
    const list = featuredByEdition.get(id) ?? []
    list.push(row)
    featuredByEdition.set(id, list)
  }

  const weeks = editions.map((edition) => ({
    edition,
    tracks: byEdition.get(edition.id) ?? [],
    featured: featuredByEdition.get(edition.id) ?? [],
  }))

  const validWeekParam =
    searchParams.week && editions.some((e) => e.week_date === searchParams.week)
      ? searchParams.week
      : undefined

  const defaultExpandedWeekDate =
    validWeekParam ?? editions[0]?.week_date ?? ''

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <ChartView
        lang={lang}
        dict={dict}
        weeks={weeks}
        defaultExpandedWeekDate={defaultExpandedWeekDate}
      />
    </main>
  )
}
