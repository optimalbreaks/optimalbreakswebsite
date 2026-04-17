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
  const dragRef = useRef<{ nodeId: string | null; pointerX: number; pointerY: number; panning: boolean } | null>(
    null,
  )
  const heatRef = useRef<number>(1)
  const imageCacheRef = useRef<Map<string, HTMLImageElement | 'error'>>(new Map())
  const hoverRef = useRef<string | null>(null)
  const hoverRedrawRef = useRef<boolean>(false)

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

  // Reconstruye simulación cuando cambia el subset visible.
  useEffect(() => {
    const nodes: SimNode[] = []
    const idx = new Map<string, SimNode>()
    const w = wrapRef.current?.clientWidth || 900
    const h = 620
    const cx = w / 2
    const cy = h / 2
    const ringR = Math.min(w, h) * 0.32 + 30
    for (let i = 0; i < visibleNodes.length; i++) {
      const n = visibleNodes[i]
      const weight = n.weight || 1
      const r = 5 + Math.min(14, Math.sqrt(weight) * 2.6)
      const ang = (i / Math.max(1, visibleNodes.length)) * Math.PI * 2 + 0.1
      const rad = ringR * (0.6 + 0.4 * Math.random())
      const sn: SimNode = {
        id: n.id,
        type: n.type,
        name: n.name,
        image_url: n.image_url,
        href: n.href,
        weight,
        x: cx + Math.cos(ang) * rad,
        y: cy + Math.sin(ang) * rad,
        vx: 0,
        vy: 0,
        r,
        fixed: false,
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
    heatRef.current = 1
    viewRef.current = { tx: 0, ty: 0, scale: 1 }

    // Pre-cook: iteraciones sin render
    for (let i = 0; i < 220; i++) stepSimulation(0.05)

    // Autozoom para encajar
    autoFitView()

    startLoop()

    return () => {
      stopLoop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, visibleEdges])

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

  // HiDPI canvas + resize
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (!canvas || !wrap) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = wrap.clientWidth
      const h = 620
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
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Pointer handlers
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

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
        const r = n.r + 2
        if (dx * dx + dy * dy <= r * r) return n
      }
      return null
    }

    function clientPoint(e: PointerEvent | MouseEvent | WheelEvent) {
      const rect = canvas!.getBoundingClientRect()
      return { x: (e.clientX as number) - rect.left, y: (e.clientY as number) - rect.top }
    }

    function onPointerDown(e: PointerEvent) {
      const p = clientPoint(e)
      const node = pickNode(p.x, p.y)
      if (node) {
        canvas!.setPointerCapture(e.pointerId)
        node.fixed = true
        dragRef.current = { nodeId: node.id, pointerX: p.x, pointerY: p.y, panning: false }
        heatRef.current = Math.max(heatRef.current, 0.5)
      } else {
        canvas!.setPointerCapture(e.pointerId)
        dragRef.current = { nodeId: null, pointerX: p.x, pointerY: p.y, panning: true }
      }
    }
    function onPointerMove(e: PointerEvent) {
      const p = clientPoint(e)
      const drag = dragRef.current
      if (!drag) {
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
      if (drag.panning) {
        viewRef.current.tx += p.x - drag.pointerX
        viewRef.current.ty += p.y - drag.pointerY
        drag.pointerX = p.x
        drag.pointerY = p.y
        requestRedraw()
        return
      }
      if (drag.nodeId && simRef.current) {
        const node = simRef.current.nodes.find((n) => n.id === drag.nodeId)
        if (node) {
          const { tx, ty, scale } = viewRef.current
          node.x = (p.x - tx) / scale
          node.y = (p.y - ty) / scale
          node.vx = 0
          node.vy = 0
          drag.pointerX = p.x
          drag.pointerY = p.y
          heatRef.current = Math.max(heatRef.current, 0.6)
          requestRedraw()
        }
      }
    }
    function onPointerUp(e: PointerEvent) {
      const drag = dragRef.current
      if (drag?.nodeId && simRef.current) {
        const node = simRef.current.nodes.find((n) => n.id === drag.nodeId)
        if (node) node.fixed = false
      }
      const p = clientPoint(e)
      // Click vs drag: si apenas se movió y había nodo
      if (drag && !drag.panning && drag.nodeId) {
        const start = { x: drag.pointerX, y: drag.pointerY }
        const moved = Math.abs(start.x - p.x) + Math.abs(start.y - p.y)
        if (moved < 6) {
          const node = simRef.current?.nodes.find((n) => n.id === drag.nodeId)
          if (node) {
            setSelectedNode(node.id)
          }
        }
      }
      if (drag && drag.panning) {
        // Nada que hacer
      }
      canvas!.releasePointerCapture(e.pointerId)
      dragRef.current = null
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const p = clientPoint(e)
      const prev = viewRef.current.scale
      const factor = Math.exp(-e.deltaY * 0.0015)
      const next = Math.max(0.25, Math.min(3.5, prev * factor))
      // Zoom alrededor del cursor
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
    const h = 620
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
    const h = 620
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
    const h = 620
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

      {/* Canvas + overlay */}
      <div
        ref={wrapRef}
        className="relative mt-4 border-[4px] border-[var(--ink)] bg-[var(--paper)] shadow-[5px_5px_0_var(--ink)]"
        style={{ height: 620 }}
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
          className="block w-full h-[620px]"
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
