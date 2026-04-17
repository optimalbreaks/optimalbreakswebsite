// ============================================
// OPTIMAL BREAKS — Network Page (La Red del Break)
// Grafo de artistas ↔ sellos ↔ eventos ↔ escenas ↔ organizaciones
// Datos: Supabase (lee solo; SSR). Render: BreakNetworkGraph (canvas).
// ============================================

import type { Metadata } from 'next'
import Link from 'next/link'
import BreakNetworkGraph, {
  type GraphData,
  type GraphPreset,
  type GraphPageDict,
} from '@/components/BreakNetworkGraph'
import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import {
  buildNetworkGraphData,
  type ArtistRow,
  type LabelRow,
  type EventRow,
  type SceneRow,
  type OrgRow,
} from '@/lib/network-graph-build'
import {
  HOME_OG_IMAGE,
  SITE_URL,
  absoluteOgImage,
  ogAlternateLocales,
  smartTruncate,
} from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  const es = lang === 'es'
  const title = es
    ? 'La Red del Break — grafo interactivo | Optimal Breaks'
    : 'The Break Network — interactive graph | Optimal Breaks'
  const description = es
    ? 'Grafo interactivo de la cultura breakbeat: cómo se conectan artistas, sellos, eventos, escenas y organizaciones a lo largo del mapa del género.'
    : 'Interactive graph of breakbeat culture: how artists, labels, events, scenes and organizations connect across the genre map.'
  const url = `${SITE_URL}/${lang}/network`
  const ogImage = absoluteOgImage(HOME_OG_IMAGE, lang)

  return {
    title,
    description: smartTruncate(description, 160),
    alternates: {
      canonical: url,
      languages: {
        es: `${SITE_URL}/es/network`,
        en: `${SITE_URL}/en/network`,
        'x-default': `${SITE_URL}/en/network`,
      },
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: 'Optimal Breaks',
      locale: es ? 'es_ES' : 'en_US',
      alternateLocale: ogAlternateLocales(lang),
      images: [{ url: ogImage, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

function nodeId(type: 'artist' | 'label' | 'event' | 'scene' | 'organization', slug: string): string {
  return `${type}:${slug}`
}

export default async function NetworkPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const es = lang === 'es'
  const supabase = createServerSupabase()

  // Paralelo; todas las tablas son públicas de lectura.
  const [artistsRes, labelsRes, eventsRes, scenesRes, orgsRes] = await Promise.all([
    supabase
      .from('artists')
      .select(
        'id, slug, name, name_display, image_url, country, category, styles, related_artists, labels_founded, era, bio_es, bio_en, recommended_mixes, essential_tracks',
      )
      .order('slug', { ascending: true })
      .limit(2000),
    supabase
      .from('labels')
      .select(
        'id, slug, name, image_url, country, founded_year, key_artists, organization_id, description_es, description_en',
      )
      .order('slug', { ascending: true })
      .limit(2000),
    supabase
      .from('events')
      .select(
        'id, slug, name, image_url, city, country, event_type, date_start, lineup, promoter_organization_id, description_es, description_en',
      )
      .order('date_start', { ascending: false })
      .limit(1500),
    supabase
      .from('scenes')
      .select(
        'id, slug, name_es, name_en, image_url, country, region, era, key_artists, key_labels, description_es, description_en',
      )
      .order('slug', { ascending: true })
      .limit(200),
    supabase
      .from('organizations')
      .select('id, slug, name, image_url, country, base_city, founded_year')
      .order('slug', { ascending: true })
      .limit(200),
  ])

  const artists = (artistsRes.data || []) as ArtistRow[]
  const labels = (labelsRes.data || []) as LabelRow[]
  const events = (eventsRes.data || []) as EventRow[]
  const scenes = (scenesRes.data || []) as SceneRow[]
  const orgs = (orgsRes.data || []) as OrgRow[]

  // --- Construcción del grafo (nodes + edges) con derivaciones ---
  const built = buildNetworkGraphData(
    { artists, labels, events, scenes, organizations: orgs },
    lang,
  )
  const nodes = built.nodes
  const edges = built.edges
  const nodeIndex = new Set(nodes.map((n) => n.id))

  // Presets editoriales — se filtran por slug si existen; solo se publican los que tengan >= 4 nodos
  function collectFromNodeIds(seed: string[], radius = 1): Set<string> {
    const set = new Set<string>()
    const adj = new Map<string, string[]>()
    for (const e of edges) {
      ;(adj.get(e.source) || adj.set(e.source, []).get(e.source))!.push(e.target)
      ;(adj.get(e.target) || adj.set(e.target, []).get(e.target))!.push(e.source)
    }
    let frontier = seed.filter((s) => nodeIndex.has(s))
    for (const s of frontier) set.add(s)
    for (let i = 0; i < radius; i++) {
      const next: string[] = []
      for (const n of frontier) {
        for (const nb of adj.get(n) || []) {
          if (!set.has(nb)) {
            set.add(nb)
            next.push(nb)
          }
        }
      }
      frontier = next
      if (!frontier.length) break
    }
    return set
  }

  const rawPresets: Array<Omit<GraphPreset, 'nodeIds'> & { seed: string[]; radius?: number }> = [
    {
      id: 'nu-skool',
      label_es: 'Nu Skool Breaks',
      label_en: 'Nu Skool Breaks',
      description_es: 'Sellos, artistas y salas del arco nu skool (Finger Lickin\', Marine Parade, Fabric).',
      description_en: 'Labels, artists and venues of the nu skool arc (Finger Lickin\', Marine Parade, Fabric).',
      seed: [
        nodeId('artist', 'stanton-warriors'),
        nodeId('artist', 'krafty-kuts'),
        nodeId('artist', 'plump-djs'),
        nodeId('artist', 'adam-freeland'),
        nodeId('artist', 'freq-nasty'),
        nodeId('label', 'finger-lickin'),
        nodeId('label', 'marine-parade'),
      ],
      radius: 1,
    },
    {
      id: 'andalusia',
      label_es: 'Andalucía',
      label_en: 'Andalusia',
      description_es: 'Edad de oro andaluza y resurgimiento: Raveart, sellos, DJs y eventos.',
      description_en: 'Andalusian golden era and revival: Raveart, labels, DJs and events.',
      seed: [
        nodeId('scene', 'andalusian'),
        nodeId('organization', 'raveart'),
        nodeId('artist', 'cerbero'),
        nodeId('artist', 'bubu'),
        nodeId('artist', 'javy-groove'),
        nodeId('artist', 'yo-speed'),
        nodeId('artist', 'fran-break'),
      ],
      radius: 1,
    },
    {
      id: 'uk-rave',
      label_es: 'UK Rave & Hardcore',
      label_en: 'UK Rave & Hardcore',
      description_es: 'Rave británico y hardcore: The Prodigy, Shut Up and Dance, 808 State, SL2…',
      description_en: 'British rave and hardcore: The Prodigy, Shut Up and Dance, 808 State, SL2…',
      seed: [
        nodeId('artist', 'the-prodigy'),
        nodeId('artist', 'shut-up-and-dance'),
        nodeId('artist', '808-state'),
        nodeId('artist', 'sl2'),
        nodeId('artist', 'altern-8'),
      ],
      radius: 1,
    },
    {
      id: 'big-beat',
      label_es: 'Big Beat',
      label_en: 'Big Beat',
      description_es: 'The Prodigy, Chemical Brothers, Fatboy Slim y el cruce masivo del break.',
      description_en: 'The Prodigy, Chemical Brothers, Fatboy Slim and the mass crossover of breaks.',
      seed: [
        nodeId('artist', 'the-prodigy'),
        nodeId('artist', 'the-chemical-brothers'),
        nodeId('artist', 'fatboy-slim'),
      ],
      radius: 1,
    },
    {
      id: 'pioneers',
      label_es: 'Orígenes y Bronx',
      label_en: 'Origins & Bronx',
      description_es: 'DJ Kool Herc, James Brown, The Winstons y el eje hip-hop que alumbra el break.',
      description_en: 'DJ Kool Herc, James Brown, The Winstons and the hip-hop axis that births the break.',
      seed: [
        nodeId('artist', 'dj-kool-herc'),
        nodeId('artist', 'james-brown'),
        nodeId('artist', 'the-winstons'),
        nodeId('artist', 'public-enemy'),
      ],
      radius: 1,
    },
  ]

  const presets: GraphPreset[] = []
  for (const raw of rawPresets) {
    const set = collectFromNodeIds(raw.seed, raw.radius ?? 1)
    if (set.size < 4) continue
    const { seed: _s, radius: _r, ...rest } = raw
    presets.push({ ...rest, nodeIds: Array.from(set) })
  }

  // Preset implícito "Todo" — lo gestiona el cliente.

  // Top-hub preset: top 50 por grado (siempre disponible, incluso con BD vacía)
  const sortedByDegree = [...nodes]
    .filter((n) => (n.weight || 0) > 0)
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, 50)
  if (sortedByDegree.length >= 4) {
    presets.unshift({
      id: 'top-hubs',
      label_es: 'Nodos principales',
      label_en: 'Main hubs',
      description_es: 'Los 50 nombres más conectados del archivo: por aquí pasa el grafo.',
      description_en: 'The 50 most connected names in the archive: the graph flows through these.',
      nodeIds: sortedByDegree.map((n) => n.id),
    })
  }

  const data: GraphData = { nodes, edges, presets }

  const graphDict = (dict as unknown as Record<string, unknown>)['network'] as
    | GraphPageDict
    | undefined

  const fallbackDict: GraphPageDict = es
    ? {
        tag: '10 — GRAFO',
        title_1: 'LA RED',
        title_2: 'DEL BREAK',
        intro:
          'Cómo se conectan artistas, sellos, eventos y escenas del archivo. Arrastra, haz zoom, filtra por tipo o elige un preset editorial. Pulsa un nodo para abrir su ficha.',
        preset_label: 'Preset',
        preset_all: 'Todo',
        filter_types: 'Tipos',
        filter_artist: 'Artistas',
        filter_label: 'Sellos',
        filter_event: 'Eventos',
        filter_scene: 'Escenas',
        filter_organization: 'Organizaciones',
        search_placeholder: 'Centrar en un nodo…',
        reset: 'Reset',
        legend_title: 'Leyenda',
        legend_artist: 'Artista',
        legend_label: 'Sello',
        legend_event: 'Evento',
        legend_scene: 'Escena',
        legend_organization: 'Organización',
        legend_edge_artist_artist: 'Relacionados',
        legend_edge_artist_label: 'Artista ↔ Sello',
        legend_edge_event_artist: 'Evento ↔ Artista',
        legend_edge_scene_artist: 'Escena ↔ Artista',
        legend_edge_scene_label: 'Escena ↔ Sello',
        legend_edge_label_org: 'Sello ↔ Organización',
        legend_edge_event_org: 'Evento ↔ Organización',
        nodes_count: 'nodos',
        edges_count: 'conexiones',
        empty: 'No hay conexiones que mostrar todavía. Añade fichas al archivo.',
        back_home: 'Volver al inicio',
        layout_label: 'Vista',
        layout_free: 'Libre',
        layout_carta: 'Mapa',
        hint_mobile:
          'Móvil: pellizca con dos dedos para zoom · arrastra con uno para mover · pulsa un nodo para verlo.',
      }
    : {
        tag: '10 — GRAPH',
        title_1: 'THE BREAK',
        title_2: 'NETWORK',
        intro:
          'How artists, labels, events and scenes in the archive connect. Drag, zoom, filter by type or pick an editorial preset. Click a node to open its page.',
        preset_label: 'Preset',
        preset_all: 'All',
        filter_types: 'Types',
        filter_artist: 'Artists',
        filter_label: 'Labels',
        filter_event: 'Events',
        filter_scene: 'Scenes',
        filter_organization: 'Organizations',
        search_placeholder: 'Center on a node…',
        reset: 'Reset',
        legend_title: 'Legend',
        legend_artist: 'Artist',
        legend_label: 'Label',
        legend_event: 'Event',
        legend_scene: 'Scene',
        legend_organization: 'Organization',
        legend_edge_artist_artist: 'Related',
        legend_edge_artist_label: 'Artist ↔ Label',
        legend_edge_event_artist: 'Event ↔ Artist',
        legend_edge_scene_artist: 'Scene ↔ Artist',
        legend_edge_scene_label: 'Scene ↔ Label',
        legend_edge_label_org: 'Label ↔ Organization',
        legend_edge_event_org: 'Event ↔ Organization',
        nodes_count: 'nodes',
        edges_count: 'connections',
        empty: 'No connections to show yet. Add entries to the archive.',
        back_home: 'Back to home',
        layout_label: 'View',
        layout_free: 'Free',
        layout_carta: 'Map',
        hint_mobile:
          'Mobile: pinch with two fingers to zoom · drag with one to pan · tap a node to inspect.',
      }

  const t: GraphPageDict = { ...fallbackDict, ...(graphDict || {}) }

  return (
    <div className="lined min-h-screen px-3 sm:px-6 py-10 sm:py-14">
      <Link href={`/${lang}`} className="btn-back">
        <span className="arrow">←</span> {t.back_home}
      </Link>

      <div className="max-w-[1400px] mx-auto mt-6 sm:mt-8">
        <div className="sec-tag">{t.tag}</div>
        <h1 className="sec-title mt-0">
          {t.title_1}
          <br />
          <span className="hl">{t.title_2}</span>
        </h1>
        <p
          className="mt-4 max-w-[760px] text-[15px] sm:text-[17px] leading-[1.7] text-[var(--dim)]"
          style={{ fontFamily: "'Special Elite', monospace" }}
        >
          {t.intro}
        </p>

        <div
          className="mt-3"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '11px',
            letterSpacing: '2px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}
        >
          {nodes.length} {t.nodes_count} · {edges.length} {t.edges_count}
        </div>

        <BreakNetworkGraph data={data} dict={t} lang={lang} />
      </div>
    </div>
  )
}
