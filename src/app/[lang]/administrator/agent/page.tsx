'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import AgentArtist from '@/components/admin/AgentArtist'
import AgentLabel from '@/components/admin/AgentLabel'
import AgentEvent from '@/components/admin/AgentEvent'
import AgentArtistPhoto from '@/components/admin/AgentArtistPhoto'
import AgentEventPoster from '@/components/admin/AgentEventPoster'
import AgentLabelLogo from '@/components/admin/AgentLabelLogo'

const TABS = [
  { key: 'artists', label: 'Bio artistas', icon: '♫', description: 'Genera biografías de artistas con IA + búsqueda web y guarda en Supabase.' },
  { key: 'labels', label: 'Bio sellos', icon: '◈', description: 'Genera fichas de sellos discográficos con IA + búsqueda web y guarda en Supabase.' },
  { key: 'events', label: 'Enriquecer eventos', icon: '⚡', description: 'Enriquece fichas de eventos existentes con IA + búsqueda web (fecha, lineup, venue, etc.).' },
  { key: 'artist-photo', label: 'Fotos artistas', icon: '📷', description: 'Busca fotos de artistas en Google Imágenes, la IA elige la mejor y la sube a Storage.' },
  { key: 'label-logo', label: 'Logos sellos', icon: '🏷', description: 'Busca logos de sellos en Google Imágenes, la IA elige el mejor y lo sube a Storage.' },
  { key: 'event-poster', label: 'Carteles eventos', icon: '🎨', description: 'Busca carteles/flyers de eventos en Google Imágenes, la IA elige el mejor y lo sube a Storage.' },
] as const

type TabKey = typeof TABS[number]['key']

export default function AgentPage() {
  const params = useParams()
  const lang = (params.lang as string) || 'es'
  const [activeTab, setActiveTab] = useState<TabKey>('artists')

  const current = TABS.find((t) => t.key === activeTab)!

  return (
    <div className="max-w-3xl mx-auto space-y-6 text-[var(--ink)]">
      <div>
        <span className="sec-tag">IA</span>
        <h1 className="sec-title !mb-2">Centro de agentes</h1>
        <p className="admin-muted max-w-xl">
          Genera y enriquece fichas de artistas, sellos y eventos con IA. Busca imágenes, fotos, logos y carteles automáticamente.
        </p>
      </div>

      {/* Tab bar — two rows for 6 tabs */}
      <div className="space-y-0">
        <div className="flex flex-wrap gap-0 border-b-[3px] border-[var(--ink)]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 border-[3px] border-b-0 -mb-[3px] transition-colors duration-100 ${
                activeTab === tab.key
                  ? 'border-[var(--ink)] bg-[var(--paper)] z-10'
                  : 'border-transparent bg-transparent text-[var(--ink)]/60 hover:text-[var(--ink)] hover:bg-[var(--yellow)]/30'
              }`}
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '10px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              <span className="text-sm leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab description */}
      <p
        className="text-sm text-[var(--ink)]/70 -mt-2"
        style={{ fontFamily: "'Special Elite', monospace" }}
      >
        {current.description}
      </p>

      {/* Tab content */}
      {activeTab === 'artists' && <AgentArtist lang={lang} />}
      {activeTab === 'labels' && <AgentLabel lang={lang} />}
      {activeTab === 'events' && <AgentEvent lang={lang} />}
      {activeTab === 'artist-photo' && <AgentArtistPhoto lang={lang} />}
      {activeTab === 'label-logo' && <AgentLabelLogo lang={lang} />}
      {activeTab === 'event-poster' && <AgentEventPoster lang={lang} />}
    </div>
  )
}
