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

const TABLE_MAP = {
  artist: { table: 'favorite_artists' as const, column: 'artist_id' },
  label: { table: 'favorite_labels' as const, column: 'label_id' },
  mix: { table: 'saved_mixes' as const, column: 'mix_id' },
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
      className="inline-flex items-center gap-2 h-9 px-3.5 border-2 border-white/30 bg-[var(--ink)] transition-all duration-200 hover:border-[var(--red)] hover:bg-[var(--red)] group cursor-default"
      title={`${count} ${label}`}
    >
      <span
        className="text-[var(--yellow)] group-hover:text-white transition-colors"
        style={{ fontSize: '15px', lineHeight: 1 }}
      >
        ★
      </span>
      <span
        style={{
          fontFamily: "'Unbounded', sans-serif",
          fontWeight: 900,
          fontSize: '14px',
        }}
        className="text-white transition-colors"
      >
        {count}
      </span>
      <span
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontWeight: 700,
          fontSize: '11px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
        className="text-white/60 group-hover:text-white/80 transition-colors"
      >
        {label}
      </span>
    </div>
  )
}
