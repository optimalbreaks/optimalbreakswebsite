// ============================================
// Reel de SESIÓN de festival («pase de festival»), vertical y horizontal
// ============================================
// Distinto del reel de temas para que en el muro de Instagram se distingan:
// fondo = cartel del evento difuminado y teñido con SU color (se saca del
// cartel: cada festival tiene su tono), «LIVE SET» gigante, foto de la sesión
// delante del cartel ladeado, entrada de festival troquelada con los datos y
// una onda de audio. Lo llama `renderReel` (`src/lib/reel-renderer.ts`) cuando `data.variant === 'set'`: sesiones de /mixes/<slug>.

export type SetReelData = {
  title: string
  artists: string
  festival?: string | null
  edition?: string | null
  city?: string | null
  date?: string | null // YYYY-MM-DD
  downloadable?: boolean
}

export type SetAssets = {
  /** Foto/portada de la sesión (cuadrada). */
  cover: CanvasImageSource | null
  coverW: number
  coverH: number
  /** Cartel del evento (vertical). */
  poster: CanvasImageSource | null
  posterW: number
  posterH: number
  /** Fondo pre-horneado (cartel difuminado y teñido). */
  bg: HTMLCanvasElement
  /** Color del festival (sacado del cartel o de la portada). */
  accent: string
  /** Versión clara del color, para textos sobre oscuro. */
  accentLight: string
}

const INK = '#141414'
const PAPER = '#efe6d2'
const RED = '#d62828'
const HEAD = (s: number) => `900 ${Math.round(s)}px Unbounded, 'Arial Black', system-ui, sans-serif`
const MONO = (s: number, w = 700) => `${w} ${Math.round(s)}px 'Courier Prime', ui-monospace, 'Courier New', monospace`

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const easeBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
function hash(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function dateParts(iso?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  return { d: String(Number(m[3])), mon: MONTHS[Number(m[2]) - 1], y: m[1], dots: `${m[3]}.${m[2]}.${m[1]}` }
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, sp: number, align: 'left' | 'center' | 'right' = 'left') {
  ctx.textAlign = 'left'
  const chars = [...text]
  const ws = chars.map((c) => ctx.measureText(c).width)
  const total = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, chars.length - 1)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y)
    cx += ws[i] + sp
  })
  return total
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, font: (s: number) => string, maxW: number, start: number, min: number) {
  let s = start
  ctx.font = font(s)
  while (ctx.measureText(text).width > maxW && s > min) {
    s -= 2
    ctx.font = font(s)
  }
  return s
}

function wrap2(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width <= maxW || !cur) cur = t
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines)
    keep[maxLines - 1] = `${keep[maxLines - 1].replace(/\s+\S*$/, '')}…`
    return keep
  }
  return lines
}

/** Color dominante «vivo» de una imagen (media ponderada por saturación). */
export function dominantColor(img: CanvasImageSource, w: number, h: number): { accent: string; light: string } {
  const c = document.createElement('canvas')
  c.width = 48
  c.height = Math.max(1, Math.round((48 * h) / Math.max(1, w)))
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, c.width, c.height)
  const px = g.getImageData(0, 0, c.width, c.height).data
  let r = 0, gg = 0, b = 0, wsum = 0
  for (let i = 0; i < px.length; i += 4) {
    const R = px[i], G = px[i + 1], B = px[i + 2]
    const max = Math.max(R, G, B), min = Math.min(R, G, B)
    const sat = max === 0 ? 0 : (max - min) / max
    const lum = max / 255
    const wgt = sat * sat * (lum > 0.15 && lum < 0.97 ? 1 : 0.05)
    r += R * wgt; gg += G * wgt; b += B * wgt; wsum += wgt
  }
  if (wsum < 1) return { accent: '#d62828', light: '#ff8a7a' }
  r /= wsum; gg /= wsum; b /= wsum
  // normaliza a un tono saturado y medio
  const max = Math.max(r, gg, b) || 1
  const k = 210 / max
  const R = Math.round(Math.min(255, r * k)), G = Math.round(Math.min(255, gg * k)), B = Math.round(Math.min(255, b * k))
  const L = (v: number) => Math.round(v + (255 - v) * 0.45)
  return { accent: `rgb(${R},${G},${B})`, light: `rgb(${L(R)},${L(G)},${L(B)})` }
}

/** Fondo: cartel (o portada) a sangre, difuminado, oscurecido y teñido. */
export function bakeSetBackground(img: CanvasImageSource | null, iw: number, ih: number, W: number, H: number, accent: string) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = INK
  g.fillRect(0, 0, W, H)
  if (img) {
    const s = Math.max(W / iw, H / ih) * 1.15
    g.filter = 'blur(28px) saturate(1.3)'
    g.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s)
    g.filter = 'none'
  }
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = accent
  g.globalAlpha = 0.55
  g.fillRect(0, 0, W, H)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0.15)')
  v.addColorStop(1, 'rgba(0,0,0,0.78)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
  // grano
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = hash(i, 3) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'
    g.fillRect(hash(i, 1) * W, hash(i, 2) * H, 2, 2)
  }
  return c
}

function drawImageCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / iw, h / ih)
  const sw = w / s, sh = h / s
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h)
}

/** Tarjeta con marco de papel y sombra (foto o cartel). */
function card(ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, w: number, h: number, frame = 14) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(-w / 2 + 16, -h / 2 + 18, w, h)
  ctx.fillStyle = PAPER
  ctx.fillRect(-w / 2 - frame, -h / 2 - frame, w + frame * 2, h + frame * 2)
  drawImageCover(ctx, img, iw, ih, -w / 2, -h / 2, w, h)
}

function tape(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, w = 170) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.fillStyle = 'rgba(240,232,214,0.78)'
  ctx.fillRect(-w / 2, -22, w, 44)
  ctx.restore()
}

/** «LIVE SET» gigante: contorno + relleno que se ilumina al ritmo. */
function liveSet(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number, a: SetAssets, t: number, kick: number) {
  ctx.save()
  ctx.font = HEAD(size)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const p = easeOut(prog(t, 0.2, 0.6))
  const s = 1 + 0.6 * (1 - p)
  ctx.translate(cx, y)
  ctx.scale(s, s)
  ctx.globalAlpha = p
  ctx.lineJoin = 'round'
  ctx.lineWidth = 6
  ctx.strokeStyle = a.accent
  ctx.strokeText('LIVE SET', 8, 8)
  ctx.fillStyle = `rgba(255,255,255,${0.08 + 0.12 * kick})`
  ctx.fillText('LIVE SET', 0, 0)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 5
  ctx.strokeText('LIVE SET', 0, 0)
  ctx.restore()
}

/** Entrada de festival troquelada: datos + DJs + código de barras. */
function ticket(
  ctx: CanvasRenderingContext2D,
  d: SetReelData,
  a: SetAssets,
  w: number,
  h: number,
  t: number,
  t0: number,
) {
  const dp = dateParts(d.date)
  // cuerpo con muescas semicirculares (troquel) a los lados y línea perforada
  const stubW = Math.round(w * 0.24)
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(-w / 2 + 14, -h / 2 + 16, w, h)
  ctx.beginPath()
  ctx.moveTo(-w / 2, -h / 2)
  ctx.lineTo(w / 2, -h / 2)
  ctx.lineTo(w / 2, -22)
  ctx.arc(w / 2, 0, 22, -Math.PI / 2, Math.PI / 2, true)
  ctx.lineTo(w / 2, h / 2)
  ctx.lineTo(-w / 2, h / 2)
  ctx.lineTo(-w / 2, 22)
  ctx.arc(-w / 2, 0, 22, Math.PI / 2, -Math.PI / 2, true)
  ctx.closePath()
  ctx.fillStyle = PAPER
  ctx.fill()
  // franja de color del festival arriba
  ctx.save()
  ctx.clip()
  ctx.fillStyle = a.accent
  ctx.fillRect(-w / 2, -h / 2, w, 58)
  ctx.restore()
  // perforación
  const px = w / 2 - stubW
  ctx.strokeStyle = 'rgba(20,20,20,0.5)'
  ctx.setLineDash([8, 9])
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(px, -h / 2 + 70)
  ctx.lineTo(px, h / 2 - 12)
  ctx.stroke()
  ctx.setLineDash([])

  const L = -w / 2 + 34
  ctx.textBaseline = 'middle'
  // cabecera de la franja
  ctx.fillStyle = '#fff'
  ctx.font = MONO(22)
  spaced(ctx, 'OPTIMAL BREAKS · FESTIVAL PASS', L, -h / 2 + 30, 4)
  ctx.font = MONO(22)
  spaced(ctx, 'ADMIT ONE', w / 2 - 28, -h / 2 + 30, 4, 'right')

  // festival
  const fest = (d.festival || d.edition || 'LIVE SET').toUpperCase()
  const areaW = px - L - 26
  ctx.fillStyle = INK
  const fs = fitFont(ctx, fest, (s) => HEAD(s), areaW, 46, 24)
  ctx.font = HEAD(fs)
  ctx.textAlign = 'left'
  ctx.fillText(fest, L, -h / 2 + 106)
  // datos
  const row = (label: string, value: string, y: number) => {
    ctx.font = MONO(18)
    ctx.fillStyle = 'rgba(20,20,20,0.55)'
    spaced(ctx, label, L, y, 3)
    ctx.font = MONO(28)
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.fillText(value, L + 132, y + 1)
  }
  const ry = -h / 2 + 152
  if (d.edition && d.festival && d.edition !== d.festival) row('EDITION', d.edition.toUpperCase().slice(0, 30), ry)
  row('DATE', dp ? dp.dots : '—', ry + 40)
  row('CITY', (d.city || '—').toUpperCase().slice(0, 26), ry + 80)

  // DJs (lo más grande)
  ctx.font = HEAD(40)
  const djs = d.artists.toUpperCase()
  let djSize = 44
  ctx.font = HEAD(djSize)
  let lines = wrap2(ctx, djs, areaW, 2)
  while (lines.some((l) => ctx.measureText(l).width > areaW) && djSize > 26) {
    djSize -= 2
    ctx.font = HEAD(djSize)
    lines = wrap2(ctx, djs, areaW, 2)
  }
  const dy0 = h / 2 - 34 - (lines.length - 1) * djSize * 1.1
  const typed = prog(t, t0 + 0.5, t0 + 1.4)
  lines.forEach((ln, i) => {
    const n = Math.ceil(ln.length * typed)
    ctx.fillStyle = INK
    ctx.fillText(ln.slice(0, n), L, dy0 + i * djSize * 1.1)
  })
  // subrayado de color bajo los DJs
  ctx.fillStyle = a.accent
  ctx.fillRect(L, dy0 + (lines.length - 1) * djSize * 1.1 + djSize * 0.62, Math.min(areaW, 260) * easeOut(prog(t, t0 + 1.3, t0 + 1.7)), 8)

  // talón: código de barras + FREE DOWNLOAD
  const sx = px + 26
  const sw = stubW - 52
  const bh = h * 0.42
  const by = -h / 2 + 80
  let x = sx
  let k = 0
  ctx.fillStyle = INK
  while (x < sx + sw) {
    const bw = 2 + Math.floor(hash(k, 7) * 4)
    if (hash(k, 11) > 0.35) ctx.fillRect(x, by, bw, bh)
    x += bw + 2
    k++
  }
  // línea de escaneo
  const scan = (t * 0.6) % 1
  ctx.fillStyle = 'rgba(214,40,40,0.75)'
  ctx.fillRect(sx - 4, by + bh * scan, sw + 8, 3)
  ctx.font = MONO(16)
  ctx.fillStyle = 'rgba(20,20,20,0.6)'
  spaced(ctx, dp ? `${dp.d} ${dp.mon} ${dp.y}` : 'LIVE', sx + sw / 2, by + bh + 22, 2, 'center')
  if (d.downloadable) {
    ctx.save()
    ctx.translate(sx + sw / 2, h / 2 - 54)
    ctx.rotate(-0.08)
    ctx.fillStyle = INK
    ctx.fillRect(-sw / 2 - 6, -26, sw + 12, 52)
    ctx.fillStyle = '#fff'
    ctx.font = HEAD(15)
    ctx.textAlign = 'center'
    ctx.fillText('FREE', 0, -8)
    ctx.fillText('DOWNLOAD', 0, 12)
    ctx.restore()
  }
  ctx.restore()
}

/** Sello «LIVE ON 19 SEP 2026» (tinta del color del festival). */
function liveStamp(ctx: CanvasRenderingContext2D, d: SetReelData, a: SetAssets, p: number) {
  const dp = dateParts(d.date)
  if (!dp || p <= 0) return
  ctx.save()
  const s = 1 + 0.9 * (1 - easeOut(p))
  ctx.scale(s, s)
  ctx.globalAlpha = Math.min(1, p * 1.6)
  ctx.rotate(-0.16)
  const R = 92
  ctx.strokeStyle = RED
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(0, 0, R - 13, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(239,230,210,0.88)'
  ctx.beginPath()
  ctx.arc(0, 0, R - 16, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = RED
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = MONO(18)
  spaced(ctx, 'LIVE ON', 0, -36, 4, 'center')
  ctx.font = HEAD(50)
  ctx.textAlign = 'center'
  ctx.fillText(dp.d, 0, 2)
  ctx.font = HEAD(20)
  ctx.fillText(`${dp.mon} ${dp.y}`, 0, 42)
  ctx.restore()
}

/** Onda de audio de la sesión con cabezal que avanza. */
function waveform(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: SetAssets, t: number, dur: number, kick: number, reveal: number) {
  if (reveal <= 0) return
  const n = 96
  const bw = w / n
  const head = clamp(t / dur)
  for (let i = 0; i < n; i++) {
    if (i / n > reveal) break
    const env = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.21) * 0.6 + Math.sin(i * 0.057) * 0.4)
    const v = env * (0.55 + 0.45 * hash(i, 5)) * (1 + 0.25 * kick * (i / n < head ? 1 : 0.3))
    const bh = Math.max(4, h * v)
    ctx.fillStyle = i / n < head ? a.accentLight : 'rgba(255,255,255,0.28)'
    ctx.fillRect(x + i * bw + 1, y - bh / 2, bw - 3, bh)
  }
  ctx.fillStyle = `rgba(255,255,255,${reveal})`
  ctx.fillRect(x + w * head - 2, y - h / 2 - 10, 4, h + 20)
}

export type SetLayout = 'vertical' | 'horizontal'

export function drawSetFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  d: SetReelData,
  a: SetAssets,
  W: number,
  H: number,
  dur: number,
) {
  const horizontal = W > H
  const beat = 60 / 132
  const beatsIn = Math.max(0, t - 2.4) / beat
  const ph = (beatsIn % 1) * beat
  const kick = t > 2.4 ? Math.exp(-ph / 0.1) : 0
  const endT = dur - 3.2

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  // fondo con deriva lenta + golpe al ritmo
  const z = 1.04 + 0.04 * (t / dur) + 0.01 * kick
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.scale(z, z)
  ctx.globalAlpha = prog(t, 0, 0.6)
  ctx.drawImage(a.bg, -W / 2, -H / 2, W, H)
  ctx.restore()
  ctx.globalAlpha = 1

  // zona segura
  const S = horizontal ? 0.94 : 0.86
  ctx.save()
  ctx.translate(W / 2, H / 2 + (horizontal ? 0 : 10))
  ctx.scale(S, S)
  ctx.translate(-W / 2, -H / 2)

  // cinta superior con el festival (del color del festival)
  const tickerY = horizontal ? 70 : 120
  {
    const p = prog(t, 0.4, 0.9)
    if (p > 0) {
      ctx.save()
      ctx.translate(W / 2, tickerY)
      ctx.rotate(horizontal ? -0.012 : -0.025)
      ctx.fillStyle = a.accent
      ctx.globalAlpha = p
      ctx.fillRect(-W, -30, W * 2, 60)
      ctx.fillStyle = INK
      ctx.fillRect(-W, -30, W * 2, 4)
      ctx.fillRect(-W, 26, W * 2, 4)
      ctx.font = HEAD(28)
      ctx.fillStyle = '#fff'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      const unit = `${(d.festival || d.edition || 'LIVE SET').toUpperCase()}  ★  LIVE SET  ★  OPTIMAL BREAKS  ★  `
      const uw = ctx.measureText(unit).width
      let x = -W - ((t * 140) % uw)
      while (x < W) {
        ctx.fillText(unit, x, 2)
        x += uw
      }
      ctx.restore()
    }
  }

  const hasPoster = !!a.poster
  const mainImg = a.cover || a.poster
  const mainW = a.cover ? a.coverW : a.posterW
  const mainH = a.cover ? a.coverH : a.posterH

  if (!horizontal) {
    // ---------- VERTICAL ----------
    ctx.save()
    ctx.font = MONO(24)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.globalAlpha = prog(t, 0.6, 1)
    ctx.textBaseline = 'middle'
    spaced(ctx, 'OPTIMAL BREAKS PRESENTS', W / 2, 230, 8, 'center')
    ctx.restore()
    liveSet(ctx, W / 2, 400, 170, a, t, kick)

    // cartel detrás (ladeado) + foto de la sesión delante
    const enter = prog(t, 0.8, 1.6)
    if (enter > 0) {
      const dropY = (1 - easeBack(enter)) * -1400
      if (hasPoster && a.cover) {
        ctx.save()
        ctx.translate(W / 2 + 190, 820 + dropY * 1.1)
        ctx.rotate(0.09 + 0.01 * Math.sin(t * 1.3))
        card(ctx, a.poster!, a.posterW, a.posterH, 380, 380 * (a.posterH / a.posterW))
        ctx.restore()
      }
      ctx.save()
      ctx.translate(W / 2 - (hasPoster && a.cover ? 90 : 0), 840 + dropY)
      ctx.rotate(-0.04)
      const s = 1 + 0.012 * kick
      ctx.scale(s, s)
      if (mainImg) {
        const cw = a.cover ? 560 : 520
        const ch = a.cover ? 560 : Math.min(760, 520 * (mainH / mainW))
        card(ctx, mainImg, mainW, mainH, cw, ch)
        tape(ctx, -cw / 2 + 20, -ch / 2 - 6, -0.6)
        tape(ctx, cw / 2 - 20, ch / 2 + 6, -0.6)
        // sello LIVE ON sobre la foto
        ctx.save()
        ctx.translate(cw / 2 - 40, -ch / 2 + 60)
        liveStamp(ctx, d, a, prog(t, 2.2, 2.45))
        ctx.restore()
      }
      ctx.restore()
    }

    // entrada de festival (sube desde abajo)
    const tp = prog(t, 1.9, 2.5)
    if (tp > 0) {
      const ty = 1350 + (1 - easeBack(tp)) * 700
      ctx.save()
      ctx.translate(W / 2, ty + 20)
      ctx.rotate(0.015)
      ticket(ctx, d, a, 880, 440, t, 2.1)
      ctx.restore()
    }

    // onda + enlace
    waveform(ctx, 100, 1610, W - 200, 70, a, t, dur, kick, easeOut(prog(t, 2.6, 3.4)))
    const lp = prog(t, 3.2, 3.6)
    if (lp > 0) {
      ctx.save()
      ctx.globalAlpha = lp
      ctx.font = HEAD(30)
      const txt = d.downloadable ? 'FREE DOWNLOAD · LINK IN BIO' : 'FULL SET · LINK IN BIO'
      const tw = ctx.measureText(txt).width + 60
      const pulse = t > endT ? 1 + 0.04 * kick : 1
      ctx.translate(W / 2, 1715)
      ctx.scale(pulse, pulse)
      ctx.fillStyle = INK
      ctx.fillRect(-tw / 2 + 8, -34 + 8, tw, 68)
      ctx.fillStyle = a.accent
      ctx.fillRect(-tw / 2, -34, tw, 68)
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(txt, 0, 2)
      ctx.restore()
    }
  } else {
    // ---------- HORIZONTAL ----------
    const enter = prog(t, 0.8, 1.6)
    if (enter > 0) {
      const dropY = (1 - easeBack(enter)) * -1100
      if (hasPoster && a.cover) {
        ctx.save()
        ctx.translate(560, 560 + dropY * 1.1)
        ctx.rotate(0.08)
        card(ctx, a.poster!, a.posterW, a.posterH, 400, 400 * (a.posterH / a.posterW))
        ctx.restore()
      }
      ctx.save()
      ctx.translate(hasPoster && a.cover ? 380 : 470, 580 + dropY)
      ctx.rotate(-0.04)
      if (mainImg) {
        const cw = a.cover ? 520 : 460
        const ch = a.cover ? 520 : Math.min(720, 460 * (mainH / mainW))
        card(ctx, mainImg, mainW, mainH, cw, ch)
        tape(ctx, -cw / 2 + 20, -ch / 2 - 6, -0.6)
        ctx.save()
        ctx.translate(cw / 2 - 30, -ch / 2 + 60)
        liveStamp(ctx, d, a, prog(t, 2.2, 2.45))
        ctx.restore()
      }
      ctx.restore()
    }
    ctx.save()
    ctx.font = MONO(22)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.globalAlpha = prog(t, 0.6, 1)
    ctx.textBaseline = 'middle'
    spaced(ctx, 'OPTIMAL BREAKS PRESENTS', 1350, 190, 8, 'center')
    ctx.restore()
    liveSet(ctx, 1350, 340, 150, a, t, kick)
    const tp = prog(t, 1.9, 2.5)
    if (tp > 0) {
      ctx.save()
      ctx.translate(1350, 600 + (1 - easeBack(tp)) * 600)
      ctx.rotate(0.012)
      ticket(ctx, d, a, 820, 420, t, 2.1)
      ctx.restore()
    }
    waveform(ctx, 960, 872, 780, 56, a, t, dur, kick, easeOut(prog(t, 2.6, 3.4)))
    const lp = prog(t, 3.2, 3.6)
    if (lp > 0) {
      ctx.save()
      ctx.globalAlpha = lp
      ctx.font = HEAD(26)
      const txt = d.downloadable ? 'FREE DOWNLOAD · LINK IN POST' : 'FULL SET · LINK IN POST'
      const tw = ctx.measureText(txt).width + 56
      ctx.translate(1350, 968)
      ctx.fillStyle = INK
      ctx.fillRect(-tw / 2 + 8, -30 + 8, tw, 60)
      ctx.fillStyle = a.accent
      ctx.fillRect(-tw / 2, -30, tw, 60)
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(txt, 0, 2)
      ctx.restore()
    }
  }
  ctx.restore()
}
