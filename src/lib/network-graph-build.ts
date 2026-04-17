// ============================================
// OPTIMAL BREAKS — Build Network Graph (derived edges)
// Construye GraphData a partir de filas de Supabase + derivaciones:
//  - related_artists / labels_founded / key_artists / key_labels / lineup (campos directos)
//  - co-lineup en eventos (>= 2 compartidos)
//  - escena compartida (artist-artist, label-label)
//  - scanning de bios / descriptions: menciones a slugs ya existentes en BD
//  - organization links (label↔org, event↔org)
// ============================================

import type {
  GraphData,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeType,
  GraphPreset,
} from '@/components/BreakNetworkGraph'
import {
  buildArtistSlugLookup,
  normalizeForEntityMatch,
  resolveArtistSlug,
  splitRelatedArtistNames,
} from '@/lib/artist-entity-match'
import { displayArtistImageUrl } from '@/lib/artist-public-portrait'
import type { Locale } from '@/lib/i18n-config'

export interface NetworkBuildInput {
  artists: ArtistRow[]
  labels: LabelRow[]
  events: EventRow[]
  scenes: SceneRow[]
  organizations: OrgRow[]
  /** Opcional: mixes para recuperar fuentes ES/EN y descripciones adicionales */
  mixes?: MixRow[]
}

export interface ArtistRow {
  id: string
  slug: string
  name: string
  name_display: string
  image_url: string | null
  country: string
  category: string
  styles: string[] | null
  related_artists: string[] | null
  labels_founded: string[] | null
  era: string | null
  bio_es?: string | null
  bio_en?: string | null
  recommended_mixes?: string[] | null
  essential_tracks?: string[] | null
}

export interface LabelRow {
  id: string
  slug: string
  name: string
  image_url: string | null
  country: string
  founded_year: number | null
  key_artists: string[] | null
  organization_id: string | null
  description_es?: string | null
  description_en?: string | null
}

export interface EventRow {
  id: string
  slug: string
  name: string
  image_url: string | null
  city: string
  country: string
  event_type: string | null
  date_start: string | null
  lineup: string[] | null
  promoter_organization_id: string | null
  description_es?: string | null
  description_en?: string | null
}

export interface SceneRow {
  id: string
  slug: string
  name_es: string
  name_en: string
  image_url: string | null
  country: string
  region: string | null
  era: string | null
  key_artists: string[] | null
  key_labels: string[] | null
  description_es?: string | null
  description_en?: string | null
}

export interface OrgRow {
  id: string
  slug: string
  name: string
  image_url: string | null
  country: string
  base_city: string | null
  founded_year: number | null
}

export interface MixRow {
  id: string
  slug: string
  title: string
  artist_id: string | null
  artist_name: string | null
  year: number | null
  description_es?: string | null
  description_en?: string | null
}

function nodeId(type: GraphNodeType, slug: string): string {
  return `${type}:${slug}`
}

/** Construye nodos y aristas para /network, con derivaciones agresivas. */
export function buildNetworkGraphData(
  input: NetworkBuildInput,
  lang: Locale,
): GraphData {
  const { artists, labels, events, scenes, organizations } = input
  const nodes: GraphNode[] = []
  const nodeIndex = new Set<string>()

  // --- Nodes ---
  for (const a of artists) {
    const id = nodeId('artist', a.slug)
    if (nodeIndex.has(id)) continue
    nodeIndex.add(id)
    nodes.push({
      id,
      type: 'artist',
      name: a.name_display?.trim() || a.name || a.slug,
      image_url: displayArtistImageUrl(a.slug, a.image_url ?? null) ?? null,
      href: `/${lang}/artists/${a.slug}`,
      meta: { country: a.country || '', category: a.category || '', era: a.era || '' },
    })
  }
  for (const l of labels) {
    const id = nodeId('label', l.slug)
    if (nodeIndex.has(id)) continue
    nodeIndex.add(id)
    nodes.push({
      id,
      type: 'label',
      name: l.name || l.slug,
      image_url: l.image_url ?? null,
      href: `/${lang}/labels/${l.slug}`,
      meta: { country: l.country || '', year: l.founded_year ?? undefined },
    })
  }
  for (const e of events) {
    const id = nodeId('event', e.slug)
    if (nodeIndex.has(id)) continue
    nodeIndex.add(id)
    nodes.push({
      id,
      type: 'event',
      name: e.name || e.slug,
      image_url: e.image_url ?? null,
      href: `/${lang}/events/${e.slug}`,
      meta: {
        country: e.country || '',
        city: e.city || '',
        event_type: e.event_type || '',
        year: e.date_start ? Number(e.date_start.slice(0, 4)) || undefined : undefined,
      },
    })
  }
  for (const s of scenes) {
    const id = nodeId('scene', s.slug)
    if (nodeIndex.has(id)) continue
    nodeIndex.add(id)
    nodes.push({
      id,
      type: 'scene',
      name: (lang === 'es' ? s.name_es : s.name_en) || s.name_en || s.name_es || s.slug,
      image_url: s.image_url ?? null,
      href: `/${lang}/scenes/${s.slug}`,
      meta: { country: s.country || '', region: s.region || '', era: s.era || '' },
    })
  }
  for (const o of organizations) {
    const id = nodeId('organization', o.slug)
    if (nodeIndex.has(id)) continue
    nodeIndex.add(id)
    nodes.push({
      id,
      type: 'organization',
      name: o.name || o.slug,
      image_url: o.image_url ?? null,
      href: `/${lang}/organizations/${o.slug}`,
      meta: { country: o.country || '', city: o.base_city || '', year: o.founded_year ?? undefined },
    })
  }

  // --- Lookup maps ---
  const artistLinkRows = artists.map((a) => ({
    name: a.name,
    name_display: a.name_display,
    slug: a.slug,
  }))
  const artistSlugByName = buildArtistSlugLookup(artistLinkRows)
  const labelSlugByName = new Map<string, string>()
  for (const l of labels) {
    const key = normalizeForEntityMatch(l.name)
    if (key && !labelSlugByName.has(key)) labelSlugByName.set(key, l.slug)
  }
  const orgById = new Map(organizations.map((o) => [o.id, o.slug]))
  const sceneSlugByName = new Map<string, string>()
  for (const s of scenes) {
    for (const n of [s.name_es, s.name_en, s.region]) {
      const key = normalizeForEntityMatch(n || '')
      if (key && !sceneSlugByName.has(key)) sceneSlugByName.set(key, s.slug)
    }
  }

  // --- Edges index ---
  const edges: GraphEdge[] = []
  const edgeIndex = new Set<string>()
  const edgeKey = (src: string, tgt: string, kind: GraphEdgeKind) => {
    const a = src < tgt ? src : tgt
    const b = src < tgt ? tgt : src
    return `${kind}|${a}|${b}`
  }
  function pushEdge(source: string, target: string, kind: GraphEdgeKind) {
    if (source === target) return
    if (!nodeIndex.has(source) || !nodeIndex.has(target)) return
    const k = edgeKey(source, target, kind)
    if (edgeIndex.has(k)) return
    edgeIndex.add(k)
    edges.push({ source, target, kind })
  }

  // --- Direct edges from BD arrays ---
  // Artist ↔ Artist (related_artists, split "A & B")
  for (const a of artists) {
    const src = nodeId('artist', a.slug)
    for (const entry of a.related_artists || []) {
      for (const seg of splitRelatedArtistNames(entry)) {
        const slug = resolveArtistSlug(seg, artistSlugByName)
        if (slug && slug !== a.slug) pushEdge(src, nodeId('artist', slug), 'artist-artist')
      }
    }
    for (const name of a.labels_founded || []) {
      const key = normalizeForEntityMatch(name)
      const slug = labelSlugByName.get(key)
      if (slug) pushEdge(src, nodeId('label', slug), 'artist-label')
    }
  }
  // Label → Artist (key_artists) + Label → Organization
  for (const l of labels) {
    const src = nodeId('label', l.slug)
    for (const name of l.key_artists || []) {
      for (const seg of splitRelatedArtistNames(name)) {
        const slug = resolveArtistSlug(seg, artistSlugByName)
        if (slug) pushEdge(src, nodeId('artist', slug), 'artist-label')
      }
    }
    if (l.organization_id) {
      const orgSlug = orgById.get(l.organization_id)
      if (orgSlug) pushEdge(src, nodeId('organization', orgSlug), 'label-org')
    }
  }
  // Event → Artist (lineup) + Event → Organization
  for (const e of events) {
    const src = nodeId('event', e.slug)
    for (const name of e.lineup || []) {
      for (const seg of splitRelatedArtistNames(name)) {
        const slug = resolveArtistSlug(seg, artistSlugByName)
        if (slug) pushEdge(src, nodeId('artist', slug), 'event-artist')
      }
    }
    if (e.promoter_organization_id) {
      const orgSlug = orgById.get(e.promoter_organization_id)
      if (orgSlug) pushEdge(src, nodeId('organization', orgSlug), 'event-org')
    }
  }
  // Scene → Artist/Label
  for (const s of scenes) {
    const src = nodeId('scene', s.slug)
    for (const name of s.key_artists || []) {
      for (const seg of splitRelatedArtistNames(name)) {
        const slug = resolveArtistSlug(seg, artistSlugByName)
        if (slug) pushEdge(src, nodeId('artist', slug), 'scene-artist')
      }
    }
    for (const name of s.key_labels || []) {
      const key = normalizeForEntityMatch(name)
      const slug = labelSlugByName.get(key)
      if (slug) pushEdge(src, nodeId('label', slug), 'scene-label')
    }
  }

  // --- Derived: Artist ↔ Artist por co-lineup (≥2 eventos compartidos) ---
  {
    const colineupCount = new Map<string, number>()
    for (const e of events) {
      const uniqSlugs = new Set<string>()
      for (const name of e.lineup || []) {
        for (const seg of splitRelatedArtistNames(name)) {
          const slug = resolveArtistSlug(seg, artistSlugByName)
          if (slug) uniqSlugs.add(slug)
        }
      }
      const arr = Array.from(uniqSlugs).sort()
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const k = `${arr[i]}|${arr[j]}`
          colineupCount.set(k, (colineupCount.get(k) || 0) + 1)
        }
      }
    }
    colineupCount.forEach((count, k) => {
      if (count < 2) return
      const [s1, s2] = k.split('|')
      pushEdge(nodeId('artist', s1), nodeId('artist', s2), 'artist-artist')
    })
  }

  // --- Derived: Artist ↔ Artist por escena compartida ---
  // Ya existe scene → artist directo; añadimos puente directo cuando 2 artistas pertenecen
  // a la misma escena (si no lo están ya por otros medios).
  for (const s of scenes) {
    const slugs = new Set<string>()
    for (const name of s.key_artists || []) {
      for (const seg of splitRelatedArtistNames(name)) {
        const slug = resolveArtistSlug(seg, artistSlugByName)
        if (slug) slugs.add(slug)
      }
    }
    const arr = Array.from(slugs)
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        pushEdge(nodeId('artist', arr[i]), nodeId('artist', arr[j]), 'artist-artist')
      }
    }
    // Label-label puente en la misma escena: suele ser útil
    const labelSlugs = new Set<string>()
    for (const name of s.key_labels || []) {
      const key = normalizeForEntityMatch(name)
      const slug = labelSlugByName.get(key)
      if (slug) labelSlugs.add(slug)
    }
    const labelArr = Array.from(labelSlugs)
    for (let i = 0; i < labelArr.length; i++) {
      for (let j = i + 1; j < labelArr.length; j++) {
        pushEdge(
          nodeId('label', labelArr[i]),
          nodeId('label', labelArr[j]),
          'label-org',
        )
      }
    }
  }

  // --- Bio scanning ---
  // Recorre bios/descripciones y encuentra menciones a slugs que ya existen en BD.
  // Solo aplica a nombres >= 4 caracteres (evita falsos positivos con "83", "DnB").
  const nameToArtistSlug = collectNameLookup(
    artists.map((a) => ({
      names: [a.name, a.name_display].filter(Boolean) as string[],
      slug: a.slug,
    })),
  )
  const nameToLabelSlug = collectNameLookup(labels.map((l) => ({ names: [l.name], slug: l.slug })))
  const nameToSceneSlug = collectNameLookup(
    scenes.map((s) => ({
      names: [s.name_en, s.name_es, s.region].filter(Boolean) as string[],
      slug: s.slug,
    })),
  )

  const scanArtistMentions = (text: string) =>
    scanMentions(text, nameToArtistSlug)
  const scanLabelMentions = (text: string) => scanMentions(text, nameToLabelSlug)
  const scanSceneMentions = (text: string) => scanMentions(text, nameToSceneSlug)

  // Artists
  for (const a of artists) {
    const src = nodeId('artist', a.slug)
    const text = `${a.bio_es || ''}\n${a.bio_en || ''}`
    if (!text.trim()) continue
    for (const slug of scanArtistMentions(text)) {
      if (slug !== a.slug) pushEdge(src, nodeId('artist', slug), 'artist-artist')
    }
    for (const slug of scanLabelMentions(text)) {
      pushEdge(src, nodeId('label', slug), 'artist-label')
    }
    for (const slug of scanSceneMentions(text)) {
      pushEdge(src, nodeId('scene', slug), 'scene-artist')
    }
  }
  // Labels
  for (const l of labels) {
    const src = nodeId('label', l.slug)
    const text = `${l.description_es || ''}\n${l.description_en || ''}`
    if (!text.trim()) continue
    for (const slug of scanArtistMentions(text)) {
      pushEdge(src, nodeId('artist', slug), 'artist-label')
    }
    for (const slug of scanSceneMentions(text)) {
      pushEdge(src, nodeId('scene', slug), 'scene-label')
    }
  }
  // Scenes
  for (const s of scenes) {
    const src = nodeId('scene', s.slug)
    const text = `${s.description_es || ''}\n${s.description_en || ''}`
    if (!text.trim()) continue
    for (const slug of scanArtistMentions(text)) {
      pushEdge(src, nodeId('artist', slug), 'scene-artist')
    }
    for (const slug of scanLabelMentions(text)) {
      pushEdge(src, nodeId('label', slug), 'scene-label')
    }
  }
  // Events
  for (const e of events) {
    const src = nodeId('event', e.slug)
    const text = `${e.description_es || ''}\n${e.description_en || ''}`
    if (!text.trim()) continue
    for (const slug of scanArtistMentions(text)) {
      pushEdge(src, nodeId('artist', slug), 'event-artist')
    }
  }

  // --- Weights por grado ---
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1)
    degree.set(e.target, (degree.get(e.target) || 0) + 1)
  }
  for (const n of nodes) {
    n.weight = degree.get(n.id) || 0
  }

  return { nodes, edges, presets: [] as GraphPreset[] }
}

/** Lookup `normalizedName (≥4 chars) → slug` para scanning de textos. */
function collectNameLookup(
  rows: { names: string[]; slug: string }[],
): Map<string, string> {
  const map = new Map<string, string>()
  // Sort by length DESC so larger names match before shorter substrings.
  const sorted = [...rows].sort((a, b) => {
    const la = Math.max(...a.names.map((n) => n.length), 0)
    const lb = Math.max(...b.names.map((n) => n.length), 0)
    return lb - la
  })
  for (const r of sorted) {
    for (const n of r.names) {
      if (!n) continue
      const norm = normalizeForEntityMatch(n)
      if (!norm || norm.length < 4) continue
      if (!map.has(norm)) map.set(norm, r.slug)
      const depref = norm.replace(/^(dj|mc|the)\s+/, '')
      if (depref && depref !== norm && depref.length >= 4 && !map.has(depref)) {
        map.set(depref, r.slug)
      }
    }
  }
  return map
}

/** Busca menciones por palabras clave en el texto. Devuelve slugs únicos (array). */
function scanMentions(text: string, lookup: Map<string, string>): string[] {
  if (!text) return []
  const slugs: string[] = []
  const seen = new Set<string>()
  const normText = ` ${normalizeForEntityMatch(text)} `
  lookup.forEach((slug, key) => {
    if (seen.has(slug)) return
    const needle = ` ${key} `
    if (normText.includes(needle)) {
      seen.add(slug)
      slugs.push(slug)
      return
    }
    const alt1 = ` ${key}.`
    const alt2 = ` ${key},`
    const alt3 = `-${key} `
    if (normText.includes(alt1) || normText.includes(alt2) || normText.includes(alt3)) {
      seen.add(slug)
      slugs.push(slug)
    }
  })
  return slugs
}
