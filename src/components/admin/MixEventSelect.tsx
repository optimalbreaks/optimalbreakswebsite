'use client'

import { useEffect, useState } from 'react'
import { adminListAll } from '@/lib/admin-api'

type EventOption = { id: string; name: string; date_start: string | null; city: string | null }

/** Evento donde se grabó la sesión (`mixes.event_id`). */
export default function MixEventSelect({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [events, setEvents] = useState<EventOption[]>([])

  useEffect(() => {
    adminListAll<EventOption>('events', { order: 'date_start', dir: 'desc' })
      .then(setEvents)
      .catch(() => setEvents([]))
  }, [])

  return (
    <div className="md:col-span-2">
      <label className="admin-label">Evento (sesión grabada en…)</label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className="admin-input">
        <option value="">— Ninguno —</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {[ev.date_start?.slice(0, 10), ev.name, ev.city].filter(Boolean).join(' · ')}
          </option>
        ))}
      </select>
      <p className="admin-muted text-xs mt-1 normal-case">
        La sesión aparece en la ficha del evento y en la página del festival, y su ficha /mixes enlaza al evento.
      </p>
    </div>
  )
}
