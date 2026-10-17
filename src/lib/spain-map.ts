// ============================================
// OPTIMAL BREAKS — Mapa de provincias (artículo de agenda)
// Geometría: data/geo/spain-provinces.json (lon/lat simplificado, solo
// servidor). El SVG se recorta a las provincias que tienen citas.
// ============================================

import geo from '../../data/geo/spain-provinces.json'

type Pt = [number, number]
type Box = { w: number; e: number; s: number; n: number }
type Province = { name: string; rings: Pt[][]; box: Box }

function boxOf(rings: Pt[][]): Box {
  const box = { w: Infinity, e: -Infinity, s: Infinity, n: -Infinity }
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < box.w) box.w = x
      if (x > box.e) box.e = x
      if (y < box.s) box.s = y
      if (y > box.n) box.n = y
    }
  }
  return box
}

const DATA = geo as unknown as { provinces: { name: string; rings: Pt[][] }[]; portugal: Pt[][] }
const PROVINCES: Province[] = DATA.provinces.map((p) => ({ name: p.name, rings: p.rings, box: boxOf(p.rings) }))
const PORTUGAL = DATA.portugal
const PORTUGAL_BOX = boxOf(PORTUGAL)

/** Canarias no entra en el recorte: alargaría el mapa medio Atlántico. */
export const CANARY_PROVINCES = new Set(['Las Palmas', 'Santa Cruz de Tenerife'])

export const PROVINCE_REGION: Record<string, string> = {
  'A Coruña': 'Galicia', Lugo: 'Galicia', Ourense: 'Galicia', Pontevedra: 'Galicia',
  Asturias: 'Asturias', Cantabria: 'Cantabria',
  Álava: 'País Vasco', Bizkaia: 'País Vasco', Gipuzkoa: 'País Vasco',
  Navarra: 'Navarra', 'La Rioja': 'La Rioja',
  Huesca: 'Aragón', Teruel: 'Aragón', Zaragoza: 'Aragón',
  Barcelona: 'Cataluña', Girona: 'Cataluña', Lleida: 'Cataluña', Tarragona: 'Cataluña',
  Alicante: 'Comunidad Valenciana', Castellón: 'Comunidad Valenciana', Valencia: 'Comunidad Valenciana',
  Murcia: 'Murcia', Madrid: 'Madrid', 'Illes Balears': 'Baleares',
  Ávila: 'Castilla y León', Burgos: 'Castilla y León', León: 'Castilla y León', Palencia: 'Castilla y León',
  Salamanca: 'Castilla y León', Segovia: 'Castilla y León', Soria: 'Castilla y León',
  Valladolid: 'Castilla y León', Zamora: 'Castilla y León',
  Albacete: 'Castilla-La Mancha', 'Ciudad Real': 'Castilla-La Mancha', Cuenca: 'Castilla-La Mancha',
  Guadalajara: 'Castilla-La Mancha', Toledo: 'Castilla-La Mancha',
  Badajoz: 'Extremadura', Cáceres: 'Extremadura',
  Almería: 'Andalucía', Cádiz: 'Andalucía', Córdoba: 'Andalucía', Granada: 'Andalucía',
  Huelva: 'Andalucía', Jaén: 'Andalucía', Málaga: 'Andalucía', Sevilla: 'Andalucía',
  'Las Palmas': 'Canarias', 'Santa Cruz de Tenerife': 'Canarias',
  Ceuta: 'Ceuta', Melilla: 'Melilla',
}

export function normalizePlace(raw: string | null | undefined): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const TEXT_ALIASES: [string, string][] = [
  ...PROVINCES.map((p) => [normalizePlace(p.name), p.name] as [string, string]),
  ['araba', 'Álava'], ['vizcaya', 'Bizkaia'], ['bilbao', 'Bizkaia'], ['guipuzcoa', 'Gipuzkoa'],
  ['donostia', 'Gipuzkoa'], ['san sebastian', 'Gipuzkoa'], ['vitoria', 'Álava'], ['gasteiz', 'Álava'],
  ['baleares', 'Illes Balears'], ['mallorca', 'Illes Balears'],
  ['ibiza', 'Illes Balears'], ['eivissa', 'Illes Balears'], ['menorca', 'Illes Balears'],
  ['tenerife', 'Santa Cruz de Tenerife'], ['gran canaria', 'Las Palmas'], ['lanzarote', 'Las Palmas'],
  ['fuerteventura', 'Las Palmas'], ['coruna', 'A Coruña'], ['la coruna', 'A Coruña'],
  ['alacant', 'Alicante'], ['castello', 'Castellón'], ['gerona', 'Girona'], ['lerida', 'Lleida'],
  ['orense', 'Ourense'], ['oviedo', 'Asturias'], ['gijon', 'Asturias'], ['santander', 'Cantabria'],
  ['pamplona', 'Navarra'], ['iruna', 'Navarra'], ['logrono', 'La Rioja'], ['marbella', 'Málaga'],
  ['jerez de la frontera', 'Cádiz'], ['algeciras', 'Cádiz'], ['elche', 'Alicante'], ['benidorm', 'Alicante'],
  ['cartagena', 'Murcia'], ['vigo', 'Pontevedra'], ['gandia', 'Valencia'],
]

/** Provincia por el texto de la ciudad («La Rambla, Córdoba» → Córdoba). */
export function provinceFromText(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    const hay = ` ${normalizePlace(text)} `
    if (hay.trim() === '') continue
    for (const [key, name] of TEXT_ALIASES) {
      if (hay.includes(` ${key} `)) return name
    }
  }
  return null
}

function inRing(x: number, y: number, ring: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Provincia de un punto. La simplificación deja huecos de ~1 km en la costa: se prueba la más cercana. */
export function provinceAt(lat: number, lng: number): string | null {
  for (const p of PROVINCES) {
    if (lng < p.box.w || lng > p.box.e || lat < p.box.s || lat > p.box.n) continue
    if (p.rings.some((r) => inRing(lng, lat, r))) return p.name
  }
  let best: { name: string; d: number } | null = null
  for (const p of PROVINCES) {
    for (const ring of p.rings) {
      for (const [x, y] of ring) {
        const d = (x - lng) ** 2 + (y - lat) ** 2
        if (!best || d < best.d) best = { name: p.name, d }
      }
    }
  }
  return best && best.d < 0.05 ** 2 ? best.name : null
}

export type AgendaMapSvg = {
  width: number
  height: number
  /** Tamaño de las etiquetas: el recorte de media España las encoge. */
  font: number
  portugal: string | null
  portugalLabel: { x: number; y: number; vertical: boolean } | null
  context: { name: string; d: string }[]
  hot: { name: string; d: string; count: number; label: { x: number; y: number } }[]
  dots: { name: string; x: number; y: number; end: boolean }[]
}

const WIDTH = 760

function intersects(a: Box, b: Box): boolean {
  return a.w < b.e && a.e > b.w && a.s < b.n && a.n > b.s
}

function ringArea(ring: Pt[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  return Math.abs(a / 2)
}

export function buildAgendaMap(
  counts: Map<string, number>,
  cities: { name: string; lat: number; lng: number }[],
): AgendaMapSvg | null {
  const hotProvinces = PROVINCES.filter((p) => counts.has(p.name) && !CANARY_PROVINCES.has(p.name))
  if (!hotProvinces.length) return null

  const view: Box = { w: Infinity, e: -Infinity, s: Infinity, n: -Infinity }
  for (const p of hotProvinces) {
    view.w = Math.min(view.w, p.box.w)
    view.e = Math.max(view.e, p.box.e)
    view.s = Math.min(view.s, p.box.s)
    view.n = Math.max(view.n, p.box.n)
  }
  const kx = Math.cos((((view.s + view.n) / 2) * Math.PI) / 180)
  const padLat = Math.max(0.25, (view.n - view.s) * 0.08)
  view.s -= padLat
  view.n += padLat
  view.w -= padLat / kx
  view.e += padLat / kx
  let spanX = (view.e - view.w) * kx
  let spanY = view.n - view.s
  if (spanY < 1.6) {
    view.s -= (1.6 - spanY) / 2
    view.n += (1.6 - spanY) / 2
    spanY = 1.6
  }
  if (spanX / spanY < 1.2) {
    const grow = (1.2 * spanY - spanX) / kx / 2
    view.w -= grow
    view.e += grow
    spanX = 1.2 * spanY
  } else if (spanX / spanY > 1.6) {
    const grow = (spanX / 1.6 - spanY) / 2
    view.s -= grow
    view.n += grow
    spanY = spanX / 1.6
  }

  const scale = WIDTH / spanX
  const height = Math.round(spanY * scale)
  const font = Math.max(10, Math.min(15, (15 * scale) / 150))
  const px = (lng: number, lat: number): Pt => [(lng - view.w) * kx * scale, (view.n - lat) * scale]
  const path = (rings: Pt[][]) => {
    let d = ''
    for (const ring of rings) {
      if (ringArea(ring) * kx * scale * scale < 6) continue
      let last: Pt | null = null
      const pts: string[] = []
      for (const [lng, lat] of ring) {
        const [x, y] = px(lng, lat)
        if (last && Math.abs(x - last[0]) < 0.8 && Math.abs(y - last[1]) < 0.8) continue
        last = [x, y]
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
      }
      if (pts.length >= 3) d += `M${pts.join('L')}Z`
    }
    return d
  }

  const dots = cities.map((c) => {
    const [x, y] = px(c.lng, c.lat)
    return { name: c.name, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, end: x > WIDTH * 0.68 }
  })

  const hot = hotProvinces.map((p) => {
    const ring = p.rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a))
    const rb = boxOf([ring])
    const label = p.name.toUpperCase()
    const halfW = (label.length * font * 0.72) / 2 + 4
    const center = px((rb.w + rb.e) / 2, (rb.s + rb.n) / 2)
    let best: { x: number; y: number; score: number } | null = null
    for (let i = 1; i < 12; i++) {
      for (let j = 1; j < 12; j++) {
        const lng = rb.w + ((rb.e - rb.w) * i) / 12
        const lat = rb.s + ((rb.n - rb.s) * j) / 12
        if (!inRing(lng, lat, ring)) continue
        const [x, y] = px(lng, lat)
        if (x - halfW < 4 || x + halfW > WIDTH - 4 || y - font * 1.4 < 0 || y + font * 2.2 > height) continue
        const top = y - font * 1.2
        const bottom = y + font * 2.3
        let near = 90
        let covered = false
        for (const d of dots) {
          near = Math.min(near, Math.hypot(d.x - x, d.y - y))
          const textW = d.name.length * 7.8
          const left = d.end ? d.x - 10 - textW : d.x - 7
          const right = d.end ? d.x + 7 : d.x + 10 + textW
          if (left < x + halfW && right > x - halfW && d.y - 9 < bottom && d.y + 9 > top) covered = true
        }
        let outside = 0
        for (const [ox, oy] of [[x - halfW * 0.85, y - font * 0.4], [x + halfW * 0.85, y - font * 0.4], [x, bottom]]) {
          if (!inRing(view.w + ox / (kx * scale), view.n - oy / scale, ring)) outside++
        }
        const score = near - Math.hypot(x - center[0], y - center[1]) * 0.25 - (covered ? 200 : 0) - outside * 40
        if (!best || score > best.score) best = { x, y, score }
      }
    }
    const at = best ?? { x: center[0], y: center[1] }
    return {
      name: p.name,
      d: path(p.rings),
      count: counts.get(p.name) ?? 0,
      label: { x: Math.round(at.x), y: Math.round(at.y) },
    }
  })

  const hotNames = new Set(hotProvinces.map((p) => p.name))
  const context = PROVINCES.filter((p) => !hotNames.has(p.name) && intersects(p.box, view)).map((p) => ({
    name: p.name,
    d: path(p.rings),
  }))

  let portugal: string | null = null
  let portugalLabel: AgendaMapSvg['portugalLabel'] = null
  if (intersects(PORTUGAL_BOX, view)) {
    portugal = path(PORTUGAL)
    const mainland: Box = { w: -9.5, e: -6.4, s: 37.0, n: 42.0 }
    const w = Math.max(mainland.w, view.w)
    const e = Math.min(mainland.e, view.e)
    const s = Math.max(mainland.s, view.s)
    const n = Math.min(mainland.n, view.n)
    if (e > w && n > s) {
      const [x1, y1] = px(w, n)
      const [x2, y2] = px(Math.min(e, w + 1.2), s)
      if (x2 - x1 > 14 && y2 - y1 > 60) {
        portugalLabel = { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), vertical: y2 - y1 > x2 - x1 }
      }
    }
  }

  return { width: WIDTH, height, font: Math.round(font * 10) / 10, portugal, portugalLabel, context, hot, dots }
}
