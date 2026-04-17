// ============================================
// OPTIMAL BREAKS — Break Network Graph
// Grafo interactivo sobre <canvas>, simulación de fuerzas casera
// (Barnes-Hut-lite por rejilla). Sin dependencias extra.
// ============================================

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n-config'

export type GraphNodeType = 'artist' | 'label' | 'event' | 'scene' | 'organization'

export interface GraphNode {
  id: string
  type: GraphNodeType
  name: string
  image_url: string | null
  href: string
  weight?: number
  meta?: {
    country?: string
    city?: string
    year?: number
    category?: string
    region?: string
    era?: string
    event_type?: string
  }
}

export type GraphEdgeKind =
  | 'artist-artist'
  | 'artist-label'
  | 'event-artist'
  | 'event-org'
  | 'scene-artist'
  | 'scene-label'
  | 'label-org'

export interface GraphEdge {
  source: string
  target: string
  kind: GraphEdgeKind
}

export interface GraphPreset {
  id: string
  label_es: string
  label_en: string
  description_es: string
  description_en: string
  nodeIds: string[]
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  presets: GraphPreset[]
}

export interface GraphPageDict {
  tag: string
  title_1: string
  title_2: string
  intro: string
  preset_label: string
  preset_all: string
  filter_types: string
  filter_artist: string
  filter_label: string
  filter_event: string
  filter_scene: string
  filter_organization: string
  search_placeholder: string
  reset: string
  legend_title: string
  legend_artist: string
  legend_label: string
  legend_event: string
  legend_scene: string
  legend_organization: string
  legend_edge_artist_artist: string
  legend_edge_artist_label: string
  legend_edge_event_artist: string
  legend_edge_scene_artist: string
  legend_edge_scene_label: string
  legend_edge_label_org: string
  legend_edge_event_org: string
  nodes_count: string
  edges_count: string
  empty: string
  back_home: string
  layout_label?: string
  layout_free?: string
  layout_carta?: string
  hint_mobile?: string
}

interface Props {
  data: GraphData
  dict: GraphPageDict
  lang: Locale
}

const TYPE_COLOR: Record<GraphNodeType, string> = {
  artist: '#d62828', // red
  label: '#1a1a1a', // ink
  event: '#7b2ff7', // uv
  scene: '#8db600', // acid
  organization: '#e85d04', // orange
}
const TYPE_STROKE = '#1a1a1a'
const PAPER = '#e8dcc8'

const EDGE_COLOR: Record<GraphEdgeKind, string> = {
  'artist-artist': 'rgba(26,26,26,0.32)',
  'artist-label': 'rgba(214,40,40,0.42)',
  'event-artist': 'rgba(123,47,247,0.42)',
  'event-org': 'rgba(232,93,4,0.42)',
  'scene-artist': 'rgba(141,182,0,0.50)',
  'scene-label': 'rgba(141,182,0,0.30)',
  'label-org': 'rgba(26,26,26,0.50)',
}

interface SimNode {
  id: string
  type: GraphNodeType
  name: string
  image_url: string | null
  href: string
  weight: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  fixed: boolean
}

interface SimEdge {
  source: SimNode
  target: SimNode
  kind: GraphEdgeKind
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

type LayoutMode = 'force' | 'carta'

export default function BreakNetworkGraph({ data, dict, lang }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const simRef = useRef<{
    nodes: SimNode[]
    edges: SimEdge[]
    adjacency: Map<string, Set<string>>
  } | null>(null)
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1 })
  // Pointers activos para multitouch (pinch-zoom + pan)
  const pointersRef = useRef<Map<number, { x: number; y: number; startX: number; startY: number; nodeId: string | null; dragging: boolean; moved: number }>>(
    new Map(),
  )
  const pinchRef = useRef<{ startDist: number; startScale: number; midX: number; midY: number } | null>(null)
  const heatRef = useRef<number>(1)
  const imageCacheRef = useRef<Map<string, HTMLImageElement | 'error'>>(new Map())
  const hoverRef = useRef<string | null>(null)
  const hoverRedrawRef = useRef<boolean>(false)
  /** Altura actual del canvas (px). Se recalcula en resize según viewport. */
  const canvasHeightRef = useRef<number>(620)
  const [canvasHeight, setCanvasHeight] = useState<number>(620)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force')

  // Filtros
  const typeOptions: { id: GraphNodeType; label: string; color: string }[] = useMemo(
    () => [
      { id: 'artist', label: dict.filter_artist, color: TYPE_COLOR.artist },
      { id: 'label', label: dict.filter_label, color: TYPE_COLOR.label },
      { id: 'event', label: dict.filter_event, color: TYPE_COLOR.event },
      { id: 'scene', label: dict.filter_scene, color: TYPE_COLOR.scene },
      { id: 'organization', label: dict.filter_organization, color: TYPE_COLOR.organization },
    ],
    [dict],
  )

  const defaultTypes: Set<GraphNodeType> = useMemo(
    () => new Set<GraphNodeType>(['artist', 'label', 'event', 'scene', 'organization']),
    [],
  )

  // Preset por defecto: el primero de la lista si hay; si no, "all".
  const [presetId, setPresetId] = useState<string>(() => data.presets[0]?.id || 'all')
  const [activeTypes, setActiveTypes] = useState<Set<GraphNodeType>>(defaultTypes)
  const [search, setSearch] = useState('')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [hoverNode, setHoverNode] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  void tick

  // Calcula el subset visible: intersección preset ∩ filtro de tipos.
  const visibleNodes: GraphNode[] = useMemo(() => {
    let base: GraphNode[] = data.nodes
    if (presetId !== 'all') {
      const preset = data.presets.find((p) => p.id === presetId)
      if (preset) {
        const set = new Set(preset.nodeIds)
        base = data.nodes.filter((n) => set.has(n.id))
      }
    }
    if (activeTypes.size === 0) return base
    return base.filter((n) => activeTypes.has(n.type))
  }, [data, presetId, activeTypes])

  const visibleEdges: GraphEdge[] = useMemo(() => {
    const idSet = new Set(visibleNodes.map((n) => n.id))
    return data.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target))
  }, [data, visibleNodes])

  // --- Layout Carta: carriles por escena + tiempo en eje Y ---
  // Devuelve posiciones deterministas por nodo visible, en coordenadas de mundo.
  type CartaLane = { id: string; label: string; nodeIds: string[]; colorHint: string }
  function computeCartaLayout(
    nodesIn: GraphNode[],
    edgesIn: GraphEdge[],
    w: number,
    h: number,
  ): { positions: Map<string, { x: number; y: number }>; lanes: CartaLane[] } {
    const positions = new Map<string, { x: number; y: number }>()

    // 1) Encuentra escenas visibles
    const sceneNodes = nodesIn.filter((n) => n.type === 'scene')

    // 2) Para cada nodo, contamos conexiones con cada escena
    const sceneByNode = new Map<string, Map<string, number>>()
    for (const n of nodesIn) sceneByNode.set(n.id, new Map())
    const sceneIds = new Set(sceneNodes.map((s) => s.id))
    for (const e of edgesIn) {
      if (sceneIds.has(e.source)) {
        const m = sceneByNode.get(e.target)
        if (m) m.set(e.source, (m.get(e.source) || 0) + 1)
      }
      if (sceneIds.has(e.target)) {
        const m = sceneByNode.get(e.source)
        if (m) m.set(e.target, (m.get(e.source) || 0) + 1)
      }
    }

    // 3) Asigna primary lane por nodo
    function countryLaneId(country: string) {
      const c = (country || '').trim().toUpperCase()
      if (!c) return 'lane:misc'
      if (c === 'ES' || c === 'SPAIN' || c === 'ESPAÑA') return 'lane:country:ES'
      if (c === 'UK' || c === 'GB' || c === 'ENGLAND' || c === 'UNITED KINGDOM') return 'lane:country:UK'
      if (c === 'US' || c === 'USA' || c === 'UNITED STATES') return 'lane:country:US'
      return `lane:country:${c}`
    }
    function countryLaneLabel(country: string) {
      const c = (country || '').trim().toUpperCase()
      if (c === 'ES' || c === 'SPAIN' || c === 'ESPAÑA') return lang === 'es' ? 'España' : 'Spain'
      if (c === 'UK' || c === 'GB' || c === 'ENGLAND' || c === 'UNITED KINGDOM') return 'UK'
      if (c === 'US' || c === 'USA' || c === 'UNITED STATES') return 'US'
      return c || (lang === 'es' ? 'Varios' : 'Misc')
    }

    const nodeLane = new Map<string, string>()
    for (const n of nodesIn) {
      if (n.type === 'scene') {
        nodeLane.set(n.id, n.id) // la escena vive en su propio carril
        continue
      }
      const counts = sceneByNode.get(n.id) || new Map<string, number>()
      let bestScene: string | null = null
      let bestCount = 0
      counts.forEach((c, sid) => {
        if (c > bestCount) {
          bestCount = c
          bestScene = sid
        }
      })
      if (bestScene) nodeLane.set(n.id, bestScene)
      else nodeLane.set(n.id, countryLaneId(n.meta?.country || ''))
    }

    // 4) Carril "Otros" para organizaciones/eventos sin escena/country
    // (ya cubierto por country; si no hay country caerá en "lane:misc")

    // 5) Construir la lista de carriles (escenas + países usados)
    const laneIds = new Set<string>()
    nodeLane.forEach((lid) => laneIds.add(lid))

    const lanes: CartaLane[] = []
    // Primero las escenas (ordenadas por número de nodos que contienen, desc)
    const sceneOrder = sceneNodes
      .filter((s) => laneIds.has(s.id))
      .map((s) => ({
        s,
        count: nodesIn.filter((n) => nodeLane.get(n.id) === s.id).length,
      }))
      .sort((a, b) => b.count - a.count)
    for (const { s } of sceneOrder) {
      lanes.push({ id: s.id, label: s.name, nodeIds: [], colorHint: TYPE_COLOR.scene })
    }
    // Luego países en uso
    const countryLaneIds = Array.from(laneIds).filter((l) => l.startsWith('lane:country:'))
    countryLaneIds.sort()
    for (const lid of countryLaneIds) {
      const country = lid.replace('lane:country:', '')
      lanes.push({
        id: lid,
        label: countryLaneLabel(country),
        nodeIds: [],
        colorHint: '#6b7280',
      })
    }
    // Finalmente "lane:misc"
    if (laneIds.has('lane:misc')) {
      lanes.push({
        id: 'lane:misc',
        label: lang === 'es' ? 'Varios' : 'Misc',
        nodeIds: [],
        colorHint: '#6b7280',
      })
    }

    // 6) Rellena nodeIds por carril
    const laneIndex = new Map<string, number>()
    lanes.forEach((l, i) => laneIndex.set(l.id, i))
    for (const n of nodesIn) {
      const lid = nodeLane.get(n.id) || 'lane:misc'
      const laneIdx = laneIndex.get(lid)
      if (laneIdx === undefined) continue
      lanes[laneIdx].nodeIds.push(n.id)
    }

    // 7) Eje temporal: extraer año/era por nodo
    function parseYear(meta: GraphNode['meta'] | undefined, type: GraphNodeType): number {
      const m = meta || {}
      if (typeof m.year === 'number' && m.year > 1900) return m.year
      const era = (m.era || '').toLowerCase()
      if (era) {
        const match = era.match(/(19|20)\d{2}/)
        if (match) return Number(match[0])
        if (era.includes('60s') || era.includes('1960')) return 1965
        if (era.includes('70s') || era.includes('1970')) return 1975
        if (era.includes('80s') || era.includes('1980')) return 1985
        if (era.includes('90s') || era.includes('1990')) return 1995
        if (era.includes('00s') || era.includes('2000')) return 2003
        if (era.includes('10s') || era.includes('2010')) return 2013
        if (era.includes('20s') || era.includes('2020')) return 2022
        if (era.includes('pioneer') || era.includes('old')) return 1985
        if (era.includes('golden') || era.includes('nu')) return 2001
      }
      if (type === 'event') return 2024
      if (type === 'artist') {
        const cat = (m.category || '').toLowerCase()
        if (cat === 'pioneer') return 1975
        if (cat === 'uk_legend' || cat === 'us_artist') return 1998
        if (cat === 'andalusian') return 2018
        if (cat === 'current') return 2022
        if (cat === 'crew') return 2020
      }
      return 2005
    }

    const years = nodesIn.map((n) => parseYear(n.meta, n.type))
    const minYear = Math.min(...years, 1970)
    const maxYear = Math.max(...years, new Date().getFullYear())
    const yearSpan = Math.max(1, maxYear - minYear)

    // 8) Colocar cada nodo dentro de su carril
    const laneCount = Math.max(1, lanes.length)
    const padX = 80
    const padTop = 70
    const padBottom = 60
    const usableH = Math.max(220, h - padTop - padBottom)
    const laneWidth = Math.max(180, (w - padX * 2) / laneCount)
    const totalW = laneWidth * laneCount

    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li]
      const laneCenterX = padX + li * laneWidth + laneWidth / 2 - (totalW - (w - padX * 2)) / 2
      // Ordenar por año dentro del carril
      const items = lane.nodeIds
        .map((id) => nodesIn.find((n) => n.id === id)!)
        .filter(Boolean)
        .map((n) => ({ n, year: parseYear(n.meta, n.type) }))
        .sort((a, b) => a.year - b.year)
      const usedYPositions = new Map<number, number>() // bucket 0..yearSpan → count
      for (const { n, year } of items) {
        const yRel = (year - minYear) / yearSpan
        const yBase = padTop + yRel * usableH
        // Stagger horizontal para evitar amontonamiento en el mismo año
        const bucket = Math.round(yRel * 40) // 40 buckets por carril
        const count = usedYPositions.get(bucket) || 0
        usedYPositions.set(bucket, count + 1)
        const jitterX = ((count % 5) - 2) * 22 + (count > 4 ? (count - 4) * 8 : 0)
        const jitterY = Math.floor(count / 5) * 24
        positions.set(n.id, { x: laneCenterX + jitterX, y: yBase + jitterY })
      }
    }

    return { positions, lanes }
  }

  const cartaLayoutRef = useRef<{ lanes: CartaLane[]; minYear: number; maxYear: number } | null>(null)

  // Reconstruye simulación cuando cambia el subset visible o el modo.
  useEffect(() => {
    const nodes: SimNode[] = []
    const idx = new Map<string, SimNode>()
    const w = wrapRef.current?.clientWidth || 900
    const h = canvasHeightRef.current || 620
    const cx = w / 2
    const cy = h / 2
    const ringR = Math.min(w, h) * 0.32 + 30

    // Posiciones iniciales según modo
    let cartaPositions: Map<string, { x: number; y: number }> | null = null
    let lanesComputed: CartaLane[] | null = null
    if (layoutMode === 'carta') {
      const built = computeCartaLayout(visibleNodes, visibleEdges, w, h)
      cartaPositions = built.positions
      lanesComputed = built.lanes
    }

    for (let i = 0; i < visibleNodes.length; i++) {
      const n = visibleNodes[i]
      const weight = n.weight || 1
      const r = 5 + Math.min(14, Math.sqrt(weight) * 2.6)
      let x: number
      let y: number
      if (cartaPositions) {
        const p = cartaPositions.get(n.id)
        x = p?.x ?? cx
        y = p?.y ?? cy
      } else {
        const ang = (i / Math.max(1, visibleNodes.length)) * Math.PI * 2 + 0.1
        const rad = ringR * (0.6 + 0.4 * Math.random())
        x = cx + Math.cos(ang) * rad
        y = cy + Math.sin(ang) * rad
      }
      const sn: SimNode = {
        id: n.id,
        type: n.type,
        name: n.name,
        image_url: n.image_url,
        href: n.href,
        weight,
        x,
        y,
        vx: 0,
        vy: 0,
        r,
        fixed: layoutMode === 'carta',
      }
      nodes.push(sn)
      idx.set(n.id, sn)
    }
    const edges: SimEdge[] = []
    const adjacency = new Map<string, Set<string>>()
    for (const e of visibleEdges) {
      const s = idx.get(e.source)
      const t = idx.get(e.target)
      if (!s || !t) continue
      edges.push({ source: s, target: t, kind: e.kind })
      if (!adjacency.has(s.id)) adjacency.set(s.id, new Set())
      if (!adjacency.has(t.id)) adjacency.set(t.id, new Set())
      adjacency.get(s.id)!.add(t.id)
      adjacency.get(t.id)!.add(s.id)
    }
    simRef.current = { nodes, edges, adjacency }

    if (layoutMode === 'carta') {
      heatRef.current = 0
      cartaLayoutRef.current = lanesComputed
        ? (() => {
            // Extrae min/max year observados para etiquetas del eje
            const years = visibleNodes.map((n) => {
              const m = n.meta || {}
              if (typeof m.year === 'number' && m.year > 1900) return m.year
              const era = (m.era || '').toLowerCase()
              const match = era.match(/(19|20)\d{2}/)
              return match ? Number(match[0]) : 2005
            })
            return {
              lanes: lanesComputed,
              minYear: Math.min(...years, 1970),
              maxYear: Math.max(...years, new Date().getFullYear()),
            }
          })()
        : null
    } else {
      heatRef.current = 1
      cartaLayoutRef.current = null
      for (let i = 0; i < 220; i++) stepSimulation(0.05)
    }

    viewRef.current = { tx: 0, ty: 0, scale: 1 }
    autoFitView()
    startLoop()

    return () => {
      stopLoop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, visibleEdges, layoutMode])

  // Image loader
  useEffect(() => {
    const cache = imageCacheRef.current
    for (const n of visibleNodes) {
      if (!n.image_url) continue
      if (cache.has(n.image_url)) continue
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.loading = 'lazy'
      img.onload = () => {
        cache.set(n.image_url!, img)
        requestRedraw()
      }
      img.onerror = () => {
        cache.set(n.image_url!, 'error')
      }
      img.src = n.image_url
      cache.set(n.image_url, img)
    }
  }, [visibleNodes])

  // HiDPI canvas + resize (responsive height)
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (!canvas || !wrap) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = wrap.clientWidth
      const vw = window.innerWidth || 1024
      // En móvil queremos MUCHA altura (grafos así son inusables en 300px).
      // En desktop mantenemos 620. En tablet, valor intermedio.
      const vh = window.innerHeight || 720
      let h: number
      if (vw < 640) h = Math.max(460, Math.min(Math.round(vh * 0.78), 720))
      else if (vw < 1024) h = Math.max(520, Math.min(Math.round(vh * 0.72), 680))
      else h = 620
      canvasHeightRef.current = h
      setCanvasHeight(h)
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      requestRedraw()
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
    }
  }, [])

  // Pointer handlers (multitouch: pinch-zoom + pan + tap)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Umbral de movimiento para decidir entre TAP vs DRAG (px de pantalla).
    // En móvil los dedos son imprecisos: 10px es un buen compromiso.
    const DRAG_THRESHOLD = 10

    function pickNode(cx: number, cy: number): SimNode | null {
      const sim = simRef.current
      if (!sim) return null
      const { tx, ty, scale } = viewRef.current
      const wx = (cx - tx) / scale
      const wy = (cy - ty) / scale
      for (let i = sim.nodes.length - 1; i >= 0; i--) {
        const n = sim.nodes[i]
        const dx = n.x - wx
        const dy = n.y - wy
        // Targets táctiles más grandes en móvil (hit radius mayor)
        const r = n.r + 6
        if (dx * dx + dy * dy <= r * r) return n
      }
      return null
    }

    function clientPoint(e: PointerEvent | MouseEvent | WheelEvent) {
      const rect = canvas!.getBoundingClientRect()
      return { x: (e.clientX as number) - rect.left, y: (e.clientY as number) - rect.top }
    }

    function updatePointer(id: number, x: number, y: number) {
      const p = pointersRef.current.get(id)
      if (p) {
        p.moved += Math.abs(x - p.x) + Math.abs(y - p.y)
        p.x = x
        p.y = y
      }
    }

    function onPointerDown(e: PointerEvent) {
      const p = clientPoint(e)
      canvas!.setPointerCapture(e.pointerId)
      const node = pickNode(p.x, p.y)
      pointersRef.current.set(e.pointerId, {
        x: p.x,
        y: p.y,
        startX: p.x,
        startY: p.y,
        nodeId: node?.id ?? null,
        dragging: false,
        moved: 0,
      })
      // Si aparece un segundo dedo, inicializamos pinch
      if (pointersRef.current.size === 2) {
        const arr = Array.from(pointersRef.current.values())
        const [a, b] = arr
        const dx = a.x - b.x
        const dy = a.y - b.y
        pinchRef.current = {
          startDist: Math.hypot(dx, dy) || 1,
          startScale: viewRef.current.scale,
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2,
        }
        // Anula cualquier drag de nodo del primer puntero
        pointersRef.current.forEach((p) => {
          p.dragging = false
          p.nodeId = null
        })
      }
    }

    function onPointerMove(e: PointerEvent) {
      const p = clientPoint(e)
      const prev = pointersRef.current.get(e.pointerId)

      // Hover (solo ratón, sin puntero presionado)
      if (!prev && e.pointerType === 'mouse') {
        const node = pickNode(p.x, p.y)
        const newHover = node?.id ?? null
        if (hoverRef.current !== newHover) {
          hoverRef.current = newHover
          setHoverNode(newHover)
          canvas!.style.cursor = newHover ? 'pointer' : 'grab'
          requestRedraw()
        }
        return
      }
      if (!prev) return
      updatePointer(e.pointerId, p.x, p.y)

      // PINCH-ZOOM con 2 dedos
      if (pointersRef.current.size === 2 && pinchRef.current) {
        const arr = Array.from(pointersRef.current.values())
        const [a, b] = arr
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.hypot(dx, dy) || 1
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2
        const ratio = dist / pinchRef.current.startDist
        const rawScale = pinchRef.current.startScale * ratio
        const next = Math.max(0.25, Math.min(4, rawScale))
        // Zoom alrededor del punto medio actual + pan por desplazamiento del midpoint
        const view = viewRef.current
        const prevScale = view.scale
        const wx = (pinchRef.current.midX - view.tx) / prevScale
        const wy = (pinchRef.current.midY - view.ty) / prevScale
        view.scale = next
        view.tx = midX - wx * next
        view.ty = midY - wy * next
        // El pinchRef se actualiza para que el pan del midpoint sea suave
        pinchRef.current.midX = midX
        pinchRef.current.midY = midY
        pinchRef.current.startDist = dist
        pinchRef.current.startScale = next
        requestRedraw()
        return
      }

      // Un solo dedo: TAP vs DRAG según umbral y tipo (nodo o pan)
      if (pointersRef.current.size === 1) {
        const moved = Math.abs(p.x - prev.startX) + Math.abs(p.y - prev.startY)
        if (!prev.dragging && moved < DRAG_THRESHOLD) return // aún no decidido
        prev.dragging = true

        if (prev.nodeId && simRef.current) {
          // Drag de nodo: solo cuando empezó en un nodo
          const node = simRef.current.nodes.find((n) => n.id === prev.nodeId)
          if (node) {
            node.fixed = true
            const { tx, ty, scale } = viewRef.current
            node.x = (p.x - tx) / scale
            node.y = (p.y - ty) / scale
            node.vx = 0
            node.vy = 0
            heatRef.current = Math.max(heatRef.current, 0.6)
            requestRedraw()
          }
        } else {
          // Pan
          const dx = p.x - prev.startX
          const dy = p.y - prev.startY
          // Aplica el delta respecto a la última posición
          const lastDx = (prev as { lastDx?: number }).lastDx ?? 0
          const lastDy = (prev as { lastDy?: number }).lastDy ?? 0
          viewRef.current.tx += dx - lastDx
          viewRef.current.ty += dy - lastDy
          ;(prev as { lastDx?: number; lastDy?: number }).lastDx = dx
          ;(prev as { lastDx?: number; lastDy?: number }).lastDy = dy
          requestRedraw()
        }
      }
    }

    function onPointerUp(e: PointerEvent) {
      const prev = pointersRef.current.get(e.pointerId)
      try {
        canvas!.releasePointerCapture(e.pointerId)
      } catch {}
      pointersRef.current.delete(e.pointerId)
      if (pointersRef.current.size < 2) pinchRef.current = null

      if (!prev) return

      // Libera el nodo arrastrado (no queremos que quede pinchado)
      if (prev.dragging && prev.nodeId && simRef.current) {
        const node = simRef.current.nodes.find((n) => n.id === prev.nodeId)
        if (node) node.fixed = false
      }

      // Tap: cantidad mínima de movimiento y no estaba en modo drag
      const moved = Math.abs(prev.x - prev.startX) + Math.abs(prev.y - prev.startY)
      if (!prev.dragging && moved < DRAG_THRESHOLD) {
        if (prev.nodeId) {
          setSelectedNode(prev.nodeId)
        } else if (pointersRef.current.size === 0) {
          // Tap en vacío cierra el panel
          setSelectedNode(null)
        }
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const p = clientPoint(e)
      const prev = viewRef.current.scale
      const factor = Math.exp(-e.deltaY * 0.0015)
      const next = Math.max(0.25, Math.min(4, prev * factor))
      const wx = (p.x - viewRef.current.tx) / prev
      const wy = (p.y - viewRef.current.ty) / prev
      viewRef.current.scale = next
      viewRef.current.tx = p.x - wx * next
      viewRef.current.ty = p.y - wy * next
      requestRedraw()
    }

    function onDoubleClick(e: MouseEvent) {
      const p = clientPoint(e)
      const node = pickNode(p.x, p.y)
      if (node?.href) {
        window.open(node.href, '_blank', 'noopener,noreferrer')
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('pointerleave', (e) => onPointerUp(e as PointerEvent))
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('dblclick', onDoubleClick)
    canvas.style.cursor = 'grab'
    canvas.style.touchAction = 'none'

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDoubleClick)
    }
  }, [])

  function autoFitView() {
    const sim = simRef.current
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!sim || !wrap || !canvas || sim.nodes.length === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of sim.nodes) {
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x > maxX) maxX = n.x
      if (n.y > maxY) maxY = n.y
    }
    const bw = maxX - minX || 1
    const bh = maxY - minY || 1
    const w = wrap.clientWidth
    const h = canvasHeightRef.current || 620
    const pad = 50
    const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh, 1.6)
    const safeScale = isFinite(scale) && scale > 0 ? scale : 1
    viewRef.current.scale = safeScale
    viewRef.current.tx = (w - (minX + maxX) * safeScale) / 2
    viewRef.current.ty = (h - (minY + maxY) * safeScale) / 2
  }

  function stepSimulation(alpha: number) {
    const sim = simRef.current
    if (!sim) return
    const { nodes, edges } = sim
    const heat = Math.max(0.05, heatRef.current)
    const a = alpha * heat

    // Repulsión: rejilla aproximada
    const cellSize = 70
    const grid = new Map<string, SimNode[]>()
    for (const n of nodes) {
      const gx = Math.floor(n.x / cellSize)
      const gy = Math.floor(n.y / cellSize)
      const key = `${gx},${gy}`
      ;(grid.get(key) || grid.set(key, []).get(key))!.push(n)
    }
    for (const n of nodes) {
      const gx = Math.floor(n.x / cellSize)
      const gy = Math.floor(n.y / cellSize)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get(`${gx + dx},${gy + dy}`)
          if (!cell) continue
          for (const m of cell) {
            if (m === n) continue
            const ex = n.x - m.x
            const ey = n.y - m.y
            const d2 = ex * ex + ey * ey + 0.01
            const d = Math.sqrt(d2)
            if (d > 160) continue
            const force = (1800 * a) / d2
            n.vx += (ex / d) * force
            n.vy += (ey / d) * force
          }
        }
      }
    }

    // Atracción por aristas
    for (const e of edges) {
      const s = e.source
      const t = e.target
      const dx = t.x - s.x
      const dy = t.y - s.y
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01
      const rest = 80
      const k = 0.08 * a
      const force = (d - rest) * k
      const fx = (dx / d) * force
      const fy = (dy / d) * force
      if (!s.fixed) {
        s.vx += fx
        s.vy += fy
      }
      if (!t.fixed) {
        t.vx -= fx
        t.vy -= fy
      }
    }

    // Gravedad ligera al centro
    for (const n of nodes) {
      if (n.fixed) continue
      n.vx += -n.x * 0.002 * a
      n.vy += -n.y * 0.002 * a
    }

    // Integración y amortiguación
    for (const n of nodes) {
      if (n.fixed) continue
      n.vx *= 0.78
      n.vy *= 0.78
      // Speed cap
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy)
      const maxSpeed = 30
      if (speed > maxSpeed) {
        n.vx = (n.vx / speed) * maxSpeed
        n.vy = (n.vy / speed) * maxSpeed
      }
      n.x += n.vx
      n.y += n.vy
    }

    // Enfría
    heatRef.current *= 0.985
  }

  function requestRedraw() {
    if (hoverRedrawRef.current) return
    hoverRedrawRef.current = true
    requestAnimationFrame(() => {
      hoverRedrawRef.current = false
      draw()
    })
  }

  function draw() {
    const canvas = canvasRef.current
    const sim = simRef.current
    if (!canvas || !sim) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const wrap = wrapRef.current
    const w = wrap?.clientWidth || 900
    const h = canvasHeightRef.current || 620
    ctx.save()
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, w, h)

    const { tx, ty, scale } = viewRef.current
    ctx.translate(tx, ty)
    ctx.scale(scale, scale)

    const hover = hoverRef.current
    const sel = selectedNode
    const focus = hover || sel
    const adj = sim.adjacency
    const focusAdj = focus ? adj.get(focus) || new Set<string>() : null

    // --- Dibujo de carriles + eje temporal (solo modo Carta) ---
    const cartaInfo = layoutMode === 'carta' ? cartaLayoutRef.current : null
    if (cartaInfo && sim.nodes.length > 0) {
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const n of sim.nodes) {
        if (n.x < minX) minX = n.x
        if (n.x > maxX) maxX = n.x
        if (n.y < minY) minY = n.y
        if (n.y > maxY) maxY = n.y
      }
      const padLane = 40
      minX -= padLane
      maxX += padLane
      minY -= 50
      maxY += 40
      const { lanes, minYear, maxYear } = cartaInfo
      const laneCount = Math.max(1, lanes.length)
      const laneSpanX = (maxX - minX) / laneCount
      // Bandas alternas
      ctx.save()
      for (let i = 0; i < laneCount; i++) {
        const x0 = minX + i * laneSpanX
        const x1 = x0 + laneSpanX
        ctx.fillStyle = i % 2 === 0 ? 'rgba(26,26,26,0.04)' : 'rgba(26,26,26,0.08)'
        ctx.fillRect(x0, minY, x1 - x0, maxY - minY)
      }
      // Líneas verticales entre carriles
      ctx.strokeStyle = 'rgba(26,26,26,0.25)'
      ctx.lineWidth = 1 / scale
      for (let i = 1; i < laneCount; i++) {
        const x0 = minX + i * laneSpanX
        ctx.beginPath()
        ctx.moveTo(x0, minY)
        ctx.lineTo(x0, maxY)
        ctx.stroke()
      }
      // Líneas horizontales cada década
      const decadeStart = Math.floor(minYear / 10) * 10
      const decadeEnd = Math.ceil(maxYear / 10) * 10
      const yearSpan = Math.max(1, maxYear - minYear)
      ctx.strokeStyle = 'rgba(26,26,26,0.12)'
      ctx.setLineDash([6 / scale, 6 / scale])
      for (let yr = decadeStart; yr <= decadeEnd; yr += 10) {
        const yRel = (yr - minYear) / yearSpan
        const y = minY + 50 + yRel * (maxY - minY - 90)
        ctx.beginPath()
        ctx.moveTo(minX, y)
        ctx.lineTo(maxX, y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      // Etiquetas de carril (arriba)
      const laneFont = 12 / scale
      ctx.font = `900 ${laneFont}px "Unbounded", sans-serif`
      ctx.fillStyle = '#1a1a1a'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let i = 0; i < laneCount; i++) {
        const lane = lanes[i]
        const cx = minX + i * laneSpanX + laneSpanX / 2
        const label = lane.label.toUpperCase()
        const metrics = ctx.measureText(label)
        const padX = 6 / scale
        const padY = 3 / scale
        ctx.fillStyle = '#e8dcc8'
        ctx.fillRect(
          cx - metrics.width / 2 - padX,
          minY + 12 - padY,
          metrics.width + padX * 2,
          laneFont + padY * 2,
        )
        ctx.strokeStyle = '#1a1a1a'
        ctx.lineWidth = 1.2 / scale
        ctx.strokeRect(
          cx - metrics.width / 2 - padX,
          minY + 12 - padY,
          metrics.width + padX * 2,
          laneFont + padY * 2,
        )
        ctx.fillStyle = '#1a1a1a'
        ctx.fillText(label, cx, minY + 12)
      }
      // Etiquetas de año (izquierda)
      const yearFont = 10 / scale
      ctx.font = `700 ${yearFont}px "Courier Prime", monospace`
      ctx.fillStyle = 'rgba(26,26,26,0.55)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      for (let yr = decadeStart; yr <= decadeEnd; yr += 10) {
        const yRel = (yr - minYear) / yearSpan
        const y = minY + 50 + yRel * (maxY - minY - 90)
        ctx.fillText(String(yr), minX + 4, y)
      }
      ctx.restore()
    }

    // Aristas
    ctx.lineWidth = 1 / scale
    for (const e of sim.edges) {
      const isFocused = focus && (e.source.id === focus || e.target.id === focus)
      const dim = focus && !isFocused
      ctx.strokeStyle = dim ? 'rgba(26,26,26,0.08)' : EDGE_COLOR[e.kind]
      ctx.lineWidth = isFocused ? 1.8 / scale : 1 / scale
      ctx.beginPath()
      ctx.moveTo(e.source.x, e.source.y)
      ctx.lineTo(e.target.x, e.target.y)
      ctx.stroke()
    }

    // Nodos
    for (const n of sim.nodes) {
      const isFocused = focus === n.id
      const connected = focusAdj?.has(n.id)
      const dim = focus && !isFocused && !connected
      ctx.globalAlpha = dim ? 0.22 : 1
      const color = TYPE_COLOR[n.type]
      // Imagen (si hay)
      const cached = n.image_url ? imageCacheRef.current.get(n.image_url) : null
      const img = cached && cached !== 'error' ? cached : null
      ctx.save()
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
      if (img) {
        ctx.clip()
        ctx.drawImage(img, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2)
        ctx.restore()
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.lineWidth = (isFocused ? 3 : 1.5) / scale
        ctx.strokeStyle = isFocused ? color : TYPE_STROKE
        ctx.stroke()
      } else {
        ctx.fillStyle = color
        ctx.fill()
        ctx.restore()
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.lineWidth = (isFocused ? 3 : 1.5) / scale
        ctx.strokeStyle = TYPE_STROKE
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // Etiquetas de nodos conectados/focus y grandes
    ctx.fillStyle = '#1a1a1a'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const labelFontPx = 11 / scale
    ctx.font = `700 ${labelFontPx}px "Courier Prime", monospace`
    for (const n of sim.nodes) {
      const isFocused = focus === n.id
      const connected = focusAdj?.has(n.id)
      const show = isFocused || connected || scale > 1.15 || n.r > 9
      if (!show) continue
      const label = n.name
      const lx = n.x + n.r + 4
      const ly = n.y
      const dim = focus && !isFocused && !connected
      if (dim) continue
      // Fondo de etiqueta para legibilidad
      const metrics = ctx.measureText(label)
      const padX = 3 / scale
      const padY = 2 / scale
      ctx.fillStyle = 'rgba(232,220,200,0.85)'
      ctx.fillRect(
        lx - padX,
        ly - labelFontPx / 2 - padY,
        metrics.width + padX * 2,
        labelFontPx + padY * 2,
      )
      ctx.fillStyle = isFocused ? '#d62828' : '#1a1a1a'
      ctx.fillText(label, lx, ly)
    }

    ctx.restore()
  }

  function startLoop() {
    stopLoop()
    let last = 0
    const loop = (t: number) => {
      if (!simRef.current) return
      const dt = last ? (t - last) / 1000 : 0.016
      last = t
      // Solo itera si hay calor
      if (heatRef.current > 0.02) {
        stepSimulation(Math.min(0.06, dt * 60 * 0.06))
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }
  function stopLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }

  // Buscador interno: centra un nodo
  const searchMatches = useMemo(() => {
    if (!search.trim()) return [] as SimNode[]
    const sim = simRef.current
    if (!sim) return []
    const q = normalize(search.trim())
    return sim.nodes.filter((n) => normalize(n.name).includes(q)).slice(0, 8)
  }, [search, tick])

  function focusOnNode(id: string) {
    const sim = simRef.current
    const wrap = wrapRef.current
    if (!sim || !wrap) return
    const node = sim.nodes.find((n) => n.id === id)
    if (!node) return
    const w = wrap.clientWidth
    const h = canvasHeightRef.current || 620
    const scale = Math.max(1.2, viewRef.current.scale)
    viewRef.current.scale = scale
    viewRef.current.tx = w / 2 - node.x * scale
    viewRef.current.ty = h / 2 - node.y * scale
    setSelectedNode(id)
    requestRedraw()
  }

  const selectedMeta: GraphNode | null = useMemo(() => {
    if (!selectedNode) return null
    return data.nodes.find((n) => n.id === selectedNode) || null
  }, [selectedNode, data.nodes])

  const detailMetaLine: string | null = useMemo(() => {
    if (!selectedMeta) return null
    const parts: string[] = []
    const m = selectedMeta.meta || {}
    if (m.country) parts.push(m.country)
    if (m.city) parts.push(m.city)
    if (m.region) parts.push(m.region)
    if (m.era) parts.push(m.era)
    if (m.year) parts.push(String(m.year))
    if (m.category) parts.push(m.category)
    return parts.join(' · ')
  }, [selectedMeta])

  const toggleType = (t: GraphNodeType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
    setSelectedNode(null)
  }

  const resetView = () => {
    autoFitView()
    heatRef.current = 0.8
    setSelectedNode(null)
    setSearch('')
    requestRedraw()
  }

  // Para forzar re-render de matches cuando cambia la simulación
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 1000)
    return () => window.clearInterval(t)
  }, [])

  const presetLabel = (p: GraphPreset) => (lang === 'es' ? p.label_es : p.label_en)
  const presetDesc = (p: GraphPreset) => (lang === 'es' ? p.description_es : p.description_en)
  const currentPreset = data.presets.find((p) => p.id === presetId) || null

  const hoverNodeMeta: GraphNode | null = useMemo(() => {
    if (!hoverNode) return null
    return data.nodes.find((n) => n.id === hoverNode) || null
  }, [hoverNode, data.nodes])

  return (
    <div className="mt-6 sm:mt-8">
      {/* Controles */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 sm:gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: '10px',
              letterSpacing: '2px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
            }}
          >
            {dict.preset_label}:
          </span>
          <button
            type="button"
            onClick={() => {
              setPresetId('all')
              setSelectedNode(null)
            }}
            className={`cutout ${presetId === 'all' ? 'fill' : 'outline'} cursor-pointer`}
            style={{ margin: 0 }}
          >
            {dict.preset_all}
          </button>
          {data.presets.map((p) => {
            const active = presetId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPresetId(p.id)
                  setSelectedNode(null)
                }}
                className={`cutout ${active ? 'red' : 'outline'} cursor-pointer`}
                title={presetDesc(p)}
                style={{ margin: 0 }}
              >
                {presetLabel(p)}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 justify-start lg:justify-end">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={dict.search_placeholder}
              className="w-[240px] max-w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)]"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: '12px',
                letterSpacing: '1px',
                color: 'var(--ink)',
              }}
            />
            {search && searchMatches.length > 0 ? (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--paper)] border-[3px] border-[var(--ink)] z-20 max-h-[240px] overflow-y-auto shadow-[3px_3px_0_var(--ink)]">
                {searchMatches.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      focusOnNode(m.id)
                      setSearch('')
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left border-b border-[var(--ink)]/10 bg-transparent hover:bg-[var(--yellow)] cursor-pointer"
                    style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}
                  >
                    <span
                      className="w-2 h-2 shrink-0 rounded-full"
                      style={{ background: TYPE_COLOR[m.type] }}
                      aria-hidden
                    />
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="inline-flex border-[3px] border-[var(--ink)]" role="group" aria-label={dict.layout_label || 'Layout'}>
            <button
              type="button"
              onClick={() => {
                setLayoutMode('force')
                setSelectedNode(null)
              }}
              aria-pressed={layoutMode === 'force'}
              className="cursor-pointer"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: '11px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                fontWeight: 700,
                padding: '8px 12px',
                background: layoutMode === 'force' ? 'var(--ink)' : 'var(--paper)',
                color: layoutMode === 'force' ? 'var(--paper)' : 'var(--ink)',
                borderRight: '3px solid var(--ink)',
              }}
            >
              {dict.layout_free || (lang === 'es' ? 'Libre' : 'Free')}
            </button>
            <button
              type="button"
              onClick={() => {
                setLayoutMode('carta')
                setSelectedNode(null)
              }}
              aria-pressed={layoutMode === 'carta'}
              className="cursor-pointer"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: '11px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                fontWeight: 700,
                padding: '8px 12px',
                background: layoutMode === 'carta' ? 'var(--ink)' : 'var(--paper)',
                color: layoutMode === 'carta' ? 'var(--paper)' : 'var(--ink)',
              }}
            >
              {dict.layout_carta || (lang === 'es' ? 'Mapa' : 'Map')}
            </button>
          </div>
          <button
            type="button"
            onClick={resetView}
            className="cutout outline cursor-pointer"
            style={{ margin: 0 }}
          >
            {dict.reset}
          </button>
        </div>
      </div>

      {/* Tipos */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '10px',
            letterSpacing: '2px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}
        >
          {dict.filter_types}:
        </span>
        {typeOptions.map((opt) => {
          const active = activeTypes.has(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleType(opt.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 border-[3px] border-[var(--ink)] cursor-pointer"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: '10px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                fontWeight: 700,
                background: active ? 'var(--paper)' : 'var(--paper-dark)',
                color: 'var(--ink)',
                opacity: active ? 1 : 0.55,
              }}
              aria-pressed={active}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: opt.color, border: '1.5px solid var(--ink)' }}
                aria-hidden
              />
              {opt.label}
            </button>
          )
        })}
      </div>

      {currentPreset ? (
        <p
          className="mt-2"
          style={{
            fontFamily: "'Special Elite', monospace",
            fontSize: '13px',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          {presetDesc(currentPreset)}
        </p>
      ) : null}

      {dict.hint_mobile ? (
        <p
          className="mt-2 sm:hidden"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '11px',
            color: 'var(--text-muted)',
            letterSpacing: '0.5px',
            lineHeight: 1.4,
          }}
        >
          {dict.hint_mobile}
        </p>
      ) : null}

      {/* Canvas + overlay */}
      <div
        ref={wrapRef}
        className="relative mt-4 border-[4px] border-[var(--ink)] bg-[var(--paper)] shadow-[5px_5px_0_var(--ink)]"
        style={{ height: canvasHeight, touchAction: 'none' }}
      >
        {visibleNodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p
              className="max-w-[420px]"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: '13px',
                letterSpacing: '1px',
                color: 'var(--text-muted)',
              }}
            >
              {dict.empty}
            </p>
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          aria-label={`${dict.title_1} ${dict.title_2}`}
          role="img"
          className="block w-full"
          style={{ height: canvasHeight, touchAction: 'none' }}
        />

        {hoverNodeMeta && !selectedMeta ? (
          <div
            className="pointer-events-none absolute top-3 left-3 right-3 sm:right-auto sm:max-w-[340px] bg-[var(--paper)] border-[3px] border-[var(--ink)] shadow-[3px_3px_0_var(--ink)] px-3 py-2"
          >
            <div
              className="flex items-center gap-2"
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontWeight: 800,
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '-0.2px',
              }}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: TYPE_COLOR[hoverNodeMeta.type], border: '1.5px solid var(--ink)' }}
                aria-hidden
              />
              <span className="truncate">{hoverNodeMeta.name}</span>
            </div>
            <div
              className="mt-0.5"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '2px', color: 'var(--text-muted)', textTransform: 'uppercase' }}
            >
              {legendLabelForType(hoverNodeMeta.type, dict)}
            </div>
          </div>
        ) : null}

        {selectedMeta ? (
          <div className="absolute top-3 left-3 right-3 sm:right-auto sm:max-w-[380px] bg-[var(--paper)] border-[3px] border-[var(--ink)] shadow-[4px_4px_0_var(--ink)]">
            <div className="flex items-stretch">
              <div
                className="w-16 h-16 shrink-0 border-r-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)]"
                aria-hidden
              >
                {selectedMeta.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedMeta.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      background: TYPE_COLOR[selectedMeta.type],
                      color: 'white',
                      fontFamily: "'Unbounded', sans-serif",
                      fontWeight: 900,
                      fontSize: '18px',
                    }}
                  >
                    {selectedMeta.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="px-3 py-2 flex-1 min-w-0">
                <div
                  className="truncate"
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontWeight: 900,
                    fontSize: '14px',
                    textTransform: 'uppercase',
                    letterSpacing: '-0.2px',
                  }}
                >
                  {selectedMeta.name}
                </div>
                <div
                  className="mt-0.5"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '2px', color: 'var(--text-muted)', textTransform: 'uppercase' }}
                >
                  {legendLabelForType(selectedMeta.type, dict)}
                </div>
                {detailMetaLine ? (
                  <div
                    className="truncate mt-0.5"
                    style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--text-muted)' }}
                  >
                    {detailMetaLine}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                aria-label="Close"
                className="w-8 shrink-0 border-l-[3px] border-[var(--ink)] bg-transparent hover:bg-[var(--yellow)] cursor-pointer"
                style={{ fontFamily: "'Courier Prime', monospace", fontSize: '16px' }}
              >
                ×
              </button>
            </div>
            <a
              href={selectedMeta.href}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 border-t-[3px] border-[var(--ink)] no-underline bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] transition-colors"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              {lang === 'es' ? 'Abrir ficha ↗' : 'Open page ↗'}
            </a>
          </div>
        ) : null}

        {/* Leyenda */}
        <div
          className="absolute bottom-3 right-3 hidden sm:block bg-[var(--paper)] border-[3px] border-[var(--ink)] shadow-[3px_3px_0_var(--ink)] px-3 py-2 max-w-[260px]"
        >
          <div
            className="mb-1.5"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: '10px',
              letterSpacing: '2px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {dict.legend_title}
          </div>
          <ul className="space-y-[4px]">
            {typeOptions.map((opt) => (
              <li key={opt.id} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: opt.color, border: '1.5px solid var(--ink)' }}
                  aria-hidden
                />
                <span
                  style={{
                    fontFamily: "'Courier Prime', monospace",
                    fontSize: '10px',
                    letterSpacing: '1px',
                  }}
                >
                  {opt.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function legendLabelForType(t: GraphNodeType, dict: GraphPageDict): string {
  switch (t) {
    case 'artist':
      return dict.legend_artist
    case 'label':
      return dict.legend_label
    case 'event':
      return dict.legend_event
    case 'scene':
      return dict.legend_scene
    case 'organization':
      return dict.legend_organization
  }
}
