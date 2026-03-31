// ============================================
// OPTIMAL BREAKS — Fan Counter
// Public aggregate count of favorites
// Shows "★ 47 fans" with fanzine aesthetic
// ============================================

'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase'

interface FanCounterProps {
  /** 'artist' | 'label' | 'event' | 'mix' */
  type: 'artist' | 'label' | 'event' | 'mix'
  /** The ID of the entity */
  entityId: string
  lang: string
}

const TABLE_MAP: Record<string, { table: string; column: string }> = {
  artist: { table: 'favorite_artists', column: 'artist_id' },
  label: { table: 'favorite_labels', column: 'label_id' },
  mix: { table: 'saved_mixes', column: 'mix_id' },
}

export default function FanCounter({ type, entityId, lang }: FanCounterProps) {
  const [count, setCount] = useState<number | null>(null)
  const es = lang === 'es'

  useEffect(() => {
    const fetchCount = async () => {
      if (!entityId) return

      try {
        const supabase = createBrowserSupabase()
        if (type === 'event') {
          const { data, error } = await (supabase as any).rpc('event_engaged_user_count', { eid: entityId })
          if (!error && typeof data === 'number') {
            setCount(data)
            return
          }
          const { count: fallback } = await supabase
            .from('event_attendance')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', entityId)
          if (fallback !== null) setCount(fallback)
          return
        }

        const config = TABLE_MAP[type]
        if (!config) return

        const { count: total, error } = await supabase
          .from(config.table)
          .select('*', { count: 'exact', head: true })
          .eq(config.column, entityId)

        if (!error && total !== null) {
          setCount(total)
        }
      } catch {
        // Silent fail — counter is nice-to-have
      }
    }

    fetchCount()
  }, [entityId, type])

  if (count === null || count === 0) return null

  const labels: Record<string, { en: string; es: string }> = {
    artist: { en: count === 1 ? 'fan' : 'fans', es: count === 1 ? 'fan' : 'fans' },
    label: { en: count === 1 ? 'follower' : 'followers', es: count === 1 ? 'seguidor' : 'seguidores' },
    event: { en: count === 1 ? 'interested' : 'interested', es: count === 1 ? 'interesado' : 'interesados' },
    mix: { en: count === 1 ? 'save' : 'saves', es: count === 1 ? 'guardado' : 'guardados' },
  }

  const label = labels[type]?.[es ? 'es' : 'en'] || 'fans'

  return (
    <div
      className="inline-flex items-center gap-[6px] px-3 py-[5px] border-2 border-[var(--red)] transition-all duration-200 hover:bg-[var(--red)] hover:text-white group"
      title={`${count} ${label}`}
    >
      <span
        className="text-[var(--red)] group-hover:text-white transition-colors"
        style={{ fontSize: '14px' }}
      >
        ★
      </span>
      <span
        style={{
          fontFamily: "'Unbounded', sans-serif",
          fontWeight: 900,
          fontSize: '14px',
          color: 'var(--red)',
        }}
        className="group-hover:text-white transition-colors"
      >
        {count}
      </span>
      <span
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontWeight: 700,
          fontSize: '9px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--dim)',
        }}
        className="group-hover:text-white/70 transition-colors"
      >
        {label}
      </span>
    </div>
  )
}
