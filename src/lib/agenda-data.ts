// ============================================
// OPTIMAL BREAKS — Carga de eventos para agenda / festivales (server-only)
// ----------------------------------------------
// Una sola lectura paginada y cacheada (Data Cache 5 min) de las columnas
// ligeras de `events`, compartida por /agenda, /festivals y el sitemap.
// `cache()` de React deduplica la llamada entre generateMetadata y la página.
// ============================================

import { cache } from 'react'
import { createCachedSupabase } from '@/lib/supabase-server'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { AGENDA_EVENT_COLUMNS, type AgendaEvent } from '@/lib/event-agenda'

export type AgendaEventFull = AgendaEvent & { lineup: string[] | null }

export const loadAgendaEvents = cache(async (): Promise<AgendaEventFull[]> => {
  const supabase = createCachedSupabase()
  return fetchAllPages<AgendaEventFull>((from, to) =>
    supabase
      .from('events')
      .select(`${AGENDA_EVENT_COLUMNS}, lineup`)
      .order('date_start', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, to),
  ).catch(() => [] as AgendaEventFull[])
})
