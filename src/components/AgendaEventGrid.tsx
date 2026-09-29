// ============================================
// OPTIMAL BREAKS — Rejilla de carteles para agenda / festivales
// (server component; reutiliza EventFlyer en modo compacto)
// ============================================

import EventFlyer from '@/components/EventFlyer'
import { imageCacheVersion, versionedImageUrl } from '@/lib/image-url'
import {
  eventLocationLabel,
  eventTypeShortLabel,
  shortDateRange,
  type AgendaEvent,
} from '@/lib/event-agenda'
import { eventNoticeKind } from '@/types/database'
import { isUpcomingOrOngoing } from '@/lib/event-series'

export default function AgendaEventGrid({
  events,
  lang,
}: {
  events: AgendaEvent[]
  lang: 'es' | 'en'
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
      {events.map((e) => {
        const notice = eventNoticeKind(e)
        return (
          <EventFlyer
            key={e.slug}
            date={shortDateRange(e.date_start, e.date_end, lang)}
            name={e.name}
            location={eventLocationLabel(e)}
            type={
              // `upcoming` en BD pero ya pasado (dato sin actualizar) → no decir «Próximo».
              e.event_type === 'upcoming' && !isUpcomingOrOngoing(e)
                ? lang === 'es'
                  ? 'Evento'
                  : 'Event'
                : eventTypeShortLabel(e.event_type, lang)
            }
            imageUrl={versionedImageUrl(e.image_url, imageCacheVersion(e.updated_at))}
            href={`/${lang}/events/${e.slug}`}
            entityId={e.id}
            lang={lang}
            cancelled={notice === 'cancelled'}
            postponed={notice === 'postponed'}
            compact
          />
        )
      })}
    </div>
  )
}
