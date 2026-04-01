// ============================================
// OPTIMAL BREAKS — 40 Breaks Vitales (Charts Page)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { ChartEdition, ChartTrack } from '@/types/database'
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

  let editionQuery = supabase
    .from('chart_editions')
    .select('*')
    .eq('is_published', true)

  if (searchParams.week) {
    editionQuery = editionQuery.eq('week_date', searchParams.week)
  } else {
    editionQuery = editionQuery.order('week_date', { ascending: false }).limit(1)
  }

  const { data: editions } = await editionQuery
  const edition: ChartEdition | null = editions?.[0] ?? null

  let tracks: ChartTrack[] = []
  if (edition) {
    const { data } = await supabase
      .from('chart_tracks')
      .select('*')
      .eq('chart_edition_id', edition.id)
      .order('position', { ascending: true })
    tracks = (data as ChartTrack[]) ?? []
  }

  const { data: allEditions } = await supabase
    .from('chart_editions')
    .select('week_date, title')
    .eq('is_published', true)
    .order('week_date', { ascending: false })
    .limit(52)

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <ChartView
        lang={lang}
        dict={dict}
        edition={edition}
        tracks={tracks}
        allEditions={(allEditions as Pick<ChartEdition, 'week_date' | 'title'>[]) ?? []}
      />
    </main>
  )
}
