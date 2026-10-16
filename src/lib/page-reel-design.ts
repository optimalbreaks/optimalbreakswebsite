// ============================================
// OPTIMAL BREAKS — Vídeos de página (Top 100, New Releases, artículo del blog)
//
// Diseño y animación de los vídeos R (vertical 1080×1920) y F (horizontal
// 1920×1080) de /top100, /charts (cada semana de New Releases) y /blog/<slug>.
// Cada función dibuja el fotograma del instante t (s); el vídeo lo codifica
// `encodeCanvasVideo` (reel-renderer.ts). Estética de la web: papel, tinta,
// rojo, amarillo, UV. Cada página tiene su color dominante para que en el muro
// de Instagram no parezcan el mismo reel: Top 100 = negro/morado,
// New Releases = rojo, Blog = amarillo. Sin audio (la música se pone en la red).
// ============================================

export type Img = HTMLImageElement | ImageBitmap
export type TopRow = { pos: number; title: string; artists: string; label: string; saves: number; img: Img | null }
export type WeekData = { week: string; count: number; tracks: { title: string; artists: string; label: string; img: Img | null }[] }

const PAPER = '#e8dcc8'
const PAPER2 = '#f3ead8'
const INK = '#1a1a1a'
const RED = '#d62828'
const YELLOW = '#f7e733'
const ACID = '#8db600'
const UV = '#7b2ff7'
const MUTED = '#4a4238'
const HEAD = (s: number) => `900 ${Math.round(s)}px Unbounded, 'Arial Black', sans-serif`
const MONO = (s: number, w = 700) => `${w} ${Math.round(s)}px 'Courier Prime', monospace`

function hash(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, sp: number, align: 'left' | 'center' | 'right' = 'left') {
  ctx.textAlign = 'left'
  const ch = [...text]
  const ws = ch.map((c) => ctx.measureText(c).width)
  const total = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, ch.length - 1)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  ch.forEach((c, i) => {
    ctx.fillText(c, cx, y)
    cx += ws[i] + sp
  })
  return total
}
function fit(ctx: CanvasRenderingContext2D, text: string, font: (s: number) => string, maxW: number, start: number, min = 12) {
  let s = start
  ctx.font = font(s)
  let t = text
  while (ctx.measureText(t).width > maxW && s > min) {
    s -= 1
    ctx.font = font(s)
  }
  while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2)
  return t === text ? t : `${t.trimEnd()}…`
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/)
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
  return lines
}
function paper(ctx: CanvasRenderingContext2D, W: number, H: number, base = PAPER) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(26,26,26,0.06)'
  ctx.lineWidth = 2
  for (let y = 0; y < H; y += 34) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = hash(i, 1) > 0.5 ? 'rgba(26,26,26,0.05)' : 'rgba(255,255,255,0.12)'
    ctx.fillRect(hash(i, 2) * W, hash(i, 3) * H, 2, 2)
  }
}
function hazard(ctx: CanvasRenderingContext2D, y: number, h: number, W: number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, y, W, h)
  ctx.clip()
  ctx.fillStyle = YELLOW
  ctx.fillRect(0, y, W, h)
  ctx.fillStyle = INK
  for (let x = -h; x < W + h; x += 44) {
    ctx.beginPath()
    ctx.moveTo(x, y + h)
    ctx.lineTo(x + h, y)
    ctx.lineTo(x + h + 22, y)
    ctx.lineTo(x + 22, y + h)
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = INK
  ctx.fillRect(0, y + h, W, 4)
}
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, shadow = INK, off = 10, border = 5) {
  ctx.fillStyle = shadow
  ctx.fillRect(x + off, y + off, w, h)
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
  ctx.lineWidth = border
  ctx.strokeStyle = INK
  ctx.strokeRect(x + border / 2, y + border / 2, w - border, h - border)
}
function chip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg = '#fff', size = 22) {
  ctx.font = MONO(size)
  const tw = [...text].reduce((a, c) => a + ctx.measureText(c).width + 4, 0)
  const w = tw + 28
  const h = size + 20
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  ctx.lineWidth = 3
  ctx.strokeStyle = INK
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3)
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  spaced(ctx, text, x + 14, y + h / 2 + 1, 4)
  return w
}
function cover(ctx: CanvasRenderingContext2D, img: Img | null, x: number, y: number, s: number, border = 3) {
  if (img) ctx.drawImage(img, x, y, s, s)
  else {
    ctx.fillStyle = INK
    ctx.fillRect(x, y, s, s)
  }
  ctx.lineWidth = border
  ctx.strokeStyle = INK
  ctx.strokeRect(x, y, s, s)
}
function obHeader(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = HEAD(size)
  const a = 'OPTIMAL '
  const wa = ctx.measureText(a).width
  ctx.lineWidth = 3
  ctx.strokeStyle = RED
  ctx.strokeText(a, x + 3, y + 3)
  ctx.fillStyle = PAPER
  ctx.fillText(a, x, y)
  ctx.strokeStyle = INK
  ctx.strokeText(a, x, y)
  ctx.fillStyle = INK
  ctx.fillText('BREAKS', x + wa + 3, y + 3)
  ctx.fillStyle = RED
  ctx.fillText('BREAKS', x + wa, y)
}
function uniqueCovers<T extends { artists: string; label: string; title: string }>(ts: T[]) {
  const seen = new Set<string>()
  return ts.filter((t) => {
    const k = t.label + '|' + t.title.replace(/\s*\(.*\)\s*$/, '')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

type C = CanvasRenderingContext2D
export const DUR = 14
const BEAT = 60 / 135
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3)
const back = (x: number) => {
  x = clamp(x)
  const c = 2.2
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}
const ph = (t: number, a: number, d: number) => clamp((t - a) / d)
const beatPulse = (t: number) => Math.pow(1 - ((t / BEAT) % 1), 3)

function slide(ctx: C, p: number, dx: number, dy: number, fn: () => void) {
  if (p <= 0) return
  ctx.save()
  ctx.globalAlpha = clamp(p * 2)
  const e = ease(p)
  ctx.translate(dx * (1 - e), dy * (1 - e))
  fn()
  ctx.restore()
}
function pop(ctx: C, p: number, cx: number, cy: number, fn: () => void, rot = 0) {
  if (p <= 0) return
  ctx.save()
  const s = back(p)
  ctx.translate(cx, cy)
  ctx.rotate(rot * (1 - ease(p)))
  ctx.scale(s, s)
  ctx.translate(-cx, -cy)
  ctx.globalAlpha = clamp(p * 4)
  fn()
  ctx.restore()
}

// ecualizador al ritmo (135 BPM)
function eq(ctx: C, x: number, y: number, w: number, h: number, n: number, t: number, on = 1) {
  const bw = w / n
  const bp = beatPulse(t)
  for (let i = 0; i < n; i++) {
    const k = hash(i, 7)
    const ph2 = hash(i, 8) * 6.28
    let v = 0.12 + 0.5 * Math.abs(Math.sin(t * (4 + k * 9) + ph2)) + 0.38 * bp * (0.4 + 0.6 * hash(i, 9))
    v = Math.min(1, v) * on + 0.08 * (1 - on)
    const bh = Math.max(5, h * v)
    ctx.fillStyle = INK
    ctx.fillRect(x + i * bw + 1, y + h - bh, bw - 4, bh)
    ctx.fillStyle = i % 3 === 1 ? YELLOW : RED
    ctx.fillRect(x + i * bw + 1, y + h - bh, bw - 4, Math.min(10, bh))
  }
}

type PT = { title: string; artists: string; img: Img | null }
// reproductor «como la web»: portada, NOW PLAYING, título, artista, ecualizador, barra de avance
function player(ctx: C, x: number, y: number, w: number, h: number, tr: PT, prog: number, t: number, label: string, right = '') {
  box(ctx, x, y, w, h, '#fff', INK, 10, 5)
  const cs = h - 36
  cover(ctx, tr.img, x + 18, y + 18, cs, 3)
  const tx = x + 18 + cs + 22
  const eqW = Math.min(170, w * 0.2)
  const tw = w - (tx - x) - eqW - 50
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = MONO(19)
  ctx.fillStyle = RED
  spaced(ctx, '▶ ' + label, tx, y + 42, 4)
  ctx.fillStyle = INK
  ctx.fillText(fit(ctx, tr.title, (s) => HEAD(s), tw, 30, 16), tx, y + 84)
  ctx.fillStyle = RED
  ctx.fillText(fit(ctx, tr.artists, (s) => MONO(s), tw, 23, 13), tx, y + 114)
  eq(ctx, x + w - eqW - 26, y + 24, eqW, h * 0.44, 9, t)
  const py = y + h - 34
  const pw = w - (tx - x) - 26
  ctx.fillStyle = PAPER2
  ctx.fillRect(tx, py, pw, 14)
  ctx.fillStyle = RED
  ctx.fillRect(tx, py, pw * clamp(prog), 14)
  ctx.lineWidth = 3
  ctx.strokeStyle = INK
  ctx.strokeRect(tx, py, pw, 14)
  ctx.fillStyle = INK
  ctx.fillRect(tx + pw * clamp(prog) - 7, py - 8, 14, 30)
  if (right) {
    ctx.font = MONO(18)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'right'
    ctx.fillText(right, x + w - 26, py - 12)
    ctx.textAlign = 'left'
  }
}

function scaled(ctx: C, W: number, H: number, V: boolean, dy = 0) {
  if (V) return
  ctx.translate(W / 2, H / 2 + dy)
  ctx.scale(0.94, 0.94)
  ctx.translate(-W / 2, -H / 2)
}

// ===================== TOP 100 =====================
export function animTop(ctx: C, W: number, H: number, rows: TopRow[], t: number) {
  const V = H > W
  paper(ctx, W, H)
  hazard(ctx, 0, 34, W)
  if (V) hazard(ctx, H - 34, 34, W)
  ctx.save()
  scaled(ctx, W, H, V)
  const L = V
    ? { hx: 70, hy: 200, t1: 400, t2: 510, tsize: 104, sub: 565, card: { x: 70, y: 610, w: 930, h: 280 }, list: { x: 70, y: 935, w: 930, rh: 64 }, pl: { x: 70, y: 1545, w: 930, h: 170 }, cta: 1775 }
    : { hx: 90, hy: 120, t1: 300, t2: 400, tsize: 96, sub: 545, card: { x: 90, y: 600, w: 780, h: 340 }, list: { x: 960, y: 110, w: 860, rh: 70 }, pl: { x: 960, y: 795, w: 860, h: 170 }, cta: 1015 }
  const STEP = 0.62
  const T0 = 1.3
  const T1 = T0 + 9 * STEP

  // cabecera
  slide(ctx, ph(t, 0, 0.5), -60, 0, () => {
    obHeader(ctx, L.hx, L.hy, 40)
    chip(ctx, L.hx, L.hy + 32, 'TOP 100 · COMMUNITY', ACID, '#fff', 22)
  })
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  slide(ctx, ph(t, 0.15, 0.5), 0, 60, () => {
    ctx.font = HEAD(L.tsize)
    ctx.fillStyle = INK
    if (V) ctx.fillText('MOST SAVED', L.hx - 6, L.t1)
    else {
      ctx.fillText('MOST', L.hx - 4, L.t1)
      ctx.fillText('SAVED', L.hx - 4, L.t2)
    }
  })
  const bY = V ? L.t2 : L.t2 + 100
  slide(ctx, ph(t, 0.35, 0.5), 0, 60, () => {
    ctx.font = HEAD(L.tsize)
    const bw = ctx.measureText('BREAKS').width
    ctx.fillStyle = YELLOW
    const hp = ease(ph(t, 0.7, 0.5))
    ctx.fillRect(L.hx - 10, bY - L.tsize * 0.6, (bw + 18) * hp, L.tsize * 0.5)
    ctx.fillStyle = INK
    ctx.fillText('BREAKS', L.hx - 4, bY)
  })
  slide(ctx, ph(t, 0.8, 0.5), 0, 20, () => {
    ctx.font = MONO(24, 400)
    ctx.fillStyle = MUTED
    spaced(ctx, 'NO VOTES · NO POLLS · ONLY REAL SAVES', L.hx, L.sub + (V ? 0 : 0), 3)
  })

  // lista 10 → 2 (cuenta atrás)
  const { list } = L
  slide(ctx, ph(t, 0.9, 0.4), 80, 0, () => box(ctx, list.x, list.y, list.w, list.rh * 9 + 10, PAPER2, INK, 10, 5))
  const curK = t < T1 ? Math.floor((t - T0) / STEP) : 99
  rows.slice(1, 10).forEach((r, i) => {
    const k = 10 - r.pos
    const p = ph(t, T0 + k * STEP, 0.35)
    const y = list.y + 5 + i * list.rh
    slide(ctx, p, 120, 0, () => {
      if (k === curK) {
        ctx.fillStyle = YELLOW
        ctx.fillRect(list.x + 5, y + 3, list.w - 10, list.rh - 3)
      }
      if (i > 0) {
        ctx.fillStyle = INK
        ctx.fillRect(list.x + 5, y, list.w - 10, 3)
      }
      const nb = list.rh - 20
      ctx.fillStyle = r.pos <= 3 ? RED : INK
      ctx.fillRect(list.x + 18, y + 11, nb, nb)
      ctx.fillStyle = '#fff'
      ctx.font = HEAD(nb * 0.5)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(r.pos), list.x + 18 + nb / 2, y + 11 + nb / 2 + 1)
      cover(ctx, r.img, list.x + 30 + nb, y + 9, list.rh - 16, 2)
      ctx.font = MONO(19)
      const st = `${r.saves} SAVES`
      const sw = ctx.measureText(st).width + 22
      const tx = list.x + 30 + nb + list.rh - 16 + 16
      const tw = list.w - (tx - list.x) - sw - 44
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = INK
      ctx.fillText(fit(ctx, r.title, (s) => HEAD(s), tw, 26, 15), tx, y + list.rh * 0.47)
      ctx.fillStyle = RED
      ctx.fillText(fit(ctx, r.artists, (s) => MONO(s), tw, 22, 13), tx, y + list.rh * 0.84)
      ctx.font = MONO(19)
      ctx.fillStyle = UV
      ctx.fillRect(list.x + list.w - sw - 22, y + list.rh / 2 - 16, sw, 32)
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.strokeRect(list.x + list.w - sw - 22, y + list.rh / 2 - 16, sw, 32)
      ctx.fillStyle = '#fff'
      ctx.textBaseline = 'middle'
      ctx.fillText(st, list.x + list.w - sw - 11, y + list.rh / 2 + 1)
    })
  })

  // nº1: hueco con «?» hasta que entra
  const c = L.card
  const r1 = rows[0]
  if (t < T1) {
    slide(ctx, ph(t, 1.0, 0.4), 0, 40, () => {
      ctx.setLineDash([16, 12])
      ctx.lineWidth = 5
      ctx.strokeStyle = INK
      ctx.strokeRect(c.x, c.y, c.w, c.h)
      ctx.setLineDash([])
      ctx.fillStyle = INK
      ctx.font = HEAD(c.h * 0.42)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const wob = Math.sin(t * 6) * 0.04
      ctx.save()
      ctx.translate(c.x + c.w / 2, c.y + c.h / 2)
      ctx.rotate(wob)
      ctx.fillText('#1 ?', 0, 6)
      ctx.restore()
    })
  }
  pop(ctx, ph(t, T1, 0.5), c.x + c.w / 2, c.y + c.h / 2, () => {
    box(ctx, c.x, c.y, c.w, c.h, INK, RED, 14, 5)
    const cs = c.h - 48
    const bp = t > T1 ? beatPulse(t) * 0.025 : 0
    ctx.save()
    ctx.translate(c.x + 24 + cs / 2, c.y + 24 + cs / 2)
    ctx.scale(1 + bp, 1 + bp)
    cover(ctx, r1.img, -cs / 2, -cs / 2, cs, 4)
    ctx.restore()
    pop(ctx, ph(t, T1 + 0.3, 0.4), c.x + 24 + cs - 26, c.y + 50, () => {
      ctx.save()
      ctx.translate(c.x + 24 + cs - 26, c.y + 50)
      ctx.rotate(0.12)
      ctx.fillStyle = RED
      ctx.fillRect(-56, -38, 112, 76)
      ctx.strokeStyle = INK
      ctx.lineWidth = 4
      ctx.strokeRect(-56, -38, 112, 76)
      ctx.fillStyle = '#fff'
      ctx.font = HEAD(42)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('#1', 0, 3)
      ctx.restore()
    })
    const tx = c.x + 24 + cs + 32
    const tw = c.w - (tx - c.x) - 30
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = MONO(20)
    ctx.fillStyle = YELLOW
    spaced(ctx, 'NUMBER ONE', tx, c.y + 62, 6)
    ctx.fillStyle = '#fff'
    ctx.fillText(fit(ctx, r1.title.toUpperCase(), (s) => HEAD(s), tw, 46, 24), tx, c.y + 120)
    ctx.fillStyle = RED
    ctx.fillText(fit(ctx, r1.artists, (s) => MONO(s), tw, 28, 16), tx, c.y + 164)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText(fit(ctx, r1.label.toUpperCase(), (s) => MONO(s, 400), tw, 23, 13), tx, c.y + 200)
    // contador de saves que sube
    const n = Math.round(r1.saves * ease(ph(t, T1 + 0.4, 0.8)))
    ctx.fillStyle = YELLOW
    ctx.fillRect(tx, c.y + c.h - 66, 200, 46)
    ctx.fillStyle = INK
    ctx.font = HEAD(28)
    ctx.textBaseline = 'middle'
    ctx.fillText(`${n}`, tx + 16, c.y + c.h - 42)
    ctx.font = MONO(19)
    spaced(ctx, 'SAVES', tx + 76, c.y + c.h - 42, 3)
  }, -0.08)

  // reproductor
  const curRow = t >= T1 ? r1 : rows.find((r) => 10 - r.pos === Math.max(0, curK)) || rows[Math.min(9, rows.length - 1)]
  const prog = t >= T1 ? (t - T1) / (DUR - T1) : ((t - T0) % STEP) / STEP
  slide(ctx, ph(t, T0 - 0.2, 0.4), 0, 60, () =>
    player(ctx, L.pl.x, L.pl.y, L.pl.w, L.pl.h, curRow, prog, t, `NOW PLAYING · #${curRow.pos}`),
  )
  // CTA
  slide(ctx, ph(t, T1 + 1.2, 0.5), 0, 20, () => {
    const pulse = 1 + 0.04 * beatPulse(t)
    ctx.save()
    ctx.translate(V ? W / 2 : L.pl.x + L.pl.w / 2, L.cta)
    ctx.scale(pulse, pulse)
    ctx.font = HEAD(V ? 30 : 26)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const txt = V ? 'FULL TOP 100 · LINK IN BIO' : 'FULL TOP 100 · LINK IN POST'
    const w = ctx.measureText(txt).width + 60
    ctx.fillStyle = INK
    ctx.fillRect(-w / 2 + 8, -34 + 8, w, 68)
    ctx.fillStyle = RED
    ctx.fillRect(-w / 2, -34, w, 68)
    ctx.lineWidth = 4
    ctx.strokeStyle = INK
    ctx.strokeRect(-w / 2, -34, w, 68)
    ctx.fillStyle = '#fff'
    ctx.fillText(txt, 0, 2)
    ctx.restore()
  })
  ctx.restore()
}

// ===================== NEW RELEASES =====================
export function animWeek(ctx: C, W: number, H: number, d: WeekData, t: number) {
  const V = H > W
  paper(ctx, W, H, PAPER2)
  const strip = `OPTIMAL BREAKS · NEW RELEASES · WEEK OF ${d.week.toUpperCase()} · `
  for (const [yy, dir] of (V ? [[0, -1], [H - 64, 1]] : [[0, -1]]) as [number, number][]) {
    ctx.fillStyle = RED
    ctx.fillRect(0, yy, W, 64)
    ctx.fillStyle = INK
    ctx.fillRect(0, yy === 0 ? 64 : yy - 5, W, 5)
    ctx.fillStyle = '#fff'
    ctx.font = MONO(22)
    ctx.textBaseline = 'middle'
    const sw = spaced(ctx, strip, -1e5, -1000, 4) + 4
    let sx = (((dir * t * 90) % sw) + sw) % sw - sw
    while (sx < W) {
      spaced(ctx, strip, sx, yy + 34, 4)
      sx += sw
    }
  }
  ctx.save()
  scaled(ctx, W, H, V, 20)
  const L = V
    ? { hx: 70, hy: 200, n: 400, r: 510, bx: 70, by: 560, bw: 940, cs: 250, gy: 690, gx: 0, pl: { x: 70, y: 1560, w: 940, h: 170 } }
    : { hx: 90, hy: 120, n: 310, r: 430, bx: 90, by: 480, bw: 800, cs: 236, gy: 110, gx: 1010, pl: { x: 90, y: 600, w: 800, h: 170 } }
  const gap = 18
  const gw = L.cs * 3 + gap * 2 + 44
  const gx = V ? (W - gw) / 2 - 6 : L.gx

  slide(ctx, ph(t, 0, 0.5), -60, 0, () => {
    obHeader(ctx, L.hx, L.hy, 40)
    chip(ctx, L.hx, L.hy + 32, 'WEEKLY CHART', RED, '#fff', 22)
  })
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  slide(ctx, ph(t, 0.15, 0.5), 0, 60, () => {
    ctx.font = HEAD(112)
    ctx.fillStyle = INK
    ctx.fillText('NEW', L.hx - 4, L.n)
  })
  slide(ctx, ph(t, 0.3, 0.5), 0, 60, () => {
    ctx.font = HEAD(112)
    const off = 6 * ease(ph(t, 0.6, 0.3))
    ctx.fillStyle = INK
    ctx.fillText('RELEASES', L.hx - 4 + off, L.r + off)
    ctx.fillStyle = RED
    ctx.fillText('RELEASES', L.hx - 4, L.r)
  })
  slide(ctx, ph(t, 0.6, 0.45), -80, 0, () => {
    ctx.fillStyle = '#f2e8a6'
    ctx.fillRect(L.bx, L.by, L.bw, 84)
    ctx.lineWidth = 5
    ctx.strokeStyle = RED
    ctx.strokeRect(L.bx, L.by, L.bw, 84)
    ctx.fillStyle = INK
    ctx.font = MONO(28)
    ctx.textBaseline = 'middle'
    ctx.fillText(`▼  Week of ${d.week}`, L.bx + 22, L.by + 44)
    chip(ctx, L.bx + L.bw - 200, L.by + 22, 'THIS WEEK', ACID, '#fff', 18)
  })

  // estantería de portadas
  const covers = uniqueCovers(d.tracks).slice(0, 9)
  const TP = 3.0
  const SEG = (DUR - TP) / covers.length
  const ci = t >= TP ? Math.min(covers.length - 1, Math.floor((t - TP) / SEG)) : -1
  slide(ctx, ph(t, 0.7, 0.4), 0, 60, () => {
    box(ctx, gx, L.gy, gw, gw, '#fff', RED, 14, 5)
    ctx.save()
    ctx.translate(gx + gw / 2, L.gy - 6)
    ctx.rotate(-0.03)
    ctx.fillStyle = 'rgba(247,231,51,0.85)'
    ctx.fillRect(-120, -18, 240, 40)
    ctx.restore()
  })
  const pos = (i: number) => [gx + 22 + (i % 3) * (L.cs + gap), L.gy + 22 + Math.floor(i / 3) * (L.cs + gap)]
  covers.forEach((tr, i) => {
    const [x, y] = pos(i)
    if (i === ci) return
    pop(ctx, ph(t, 1.0 + i * 0.14, 0.4), x + L.cs / 2, y + L.cs / 2, () => {
      cover(ctx, tr.img, x, y, L.cs, 3)
      if (ci >= 0) {
        ctx.fillStyle = 'rgba(243,234,216,0.35)'
        ctx.fillRect(x, y, L.cs, L.cs)
      }
    }, (hash(i, 3) - 0.5) * 0.6)
  })
  if (ci >= 0) {
    const [x, y] = pos(ci)
    const lift = ease(ph(t, TP + ci * SEG, 0.25))
    const s = 1 + 0.08 * lift + 0.015 * beatPulse(t)
    ctx.save()
    ctx.translate(x + L.cs / 2, y + L.cs / 2)
    ctx.scale(s, s)
    ctx.rotate(-0.03 * lift)
    ctx.fillStyle = INK
    ctx.fillRect(-L.cs / 2 + 10, -L.cs / 2 + 12, L.cs, L.cs)
    cover(ctx, covers[ci].img, -L.cs / 2, -L.cs / 2, L.cs, 3)
    ctx.lineWidth = 8
    ctx.strokeStyle = RED
    ctx.strokeRect(-L.cs / 2 - 4, -L.cs / 2 - 4, L.cs + 8, L.cs + 8)
    // mini ecualizador sobre la portada
    ctx.fillStyle = 'rgba(26,26,26,0.85)'
    ctx.fillRect(-L.cs / 2, L.cs / 2 - 62, L.cs, 62)
    eq(ctx, -L.cs / 2 + 14, L.cs / 2 - 56, L.cs - 28, 50, 12, t)
    ctx.restore()
  }
  // sello
  const sx = V ? gx + gw - 30 : gx + gw - 30
  const sy = L.gy + gw - 40
  pop(ctx, ph(t, 2.4, 0.45), sx, sy, () => {
    ctx.save()
    ctx.translate(sx, sy)
    ctx.rotate(-0.18 + 0.03 * Math.sin(t * 2))
    ctx.fillStyle = YELLOW
    ctx.beginPath()
    ctx.arc(0, 0, 110, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 6
    ctx.strokeStyle = RED
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, 94, 0, Math.PI * 2)
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = RED
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = HEAD(62)
    ctx.fillText(String(Math.round(d.count * ease(ph(t, 2.4, 0.8)))), 0, -12)
    ctx.font = MONO(19)
    spaced(ctx, 'NEW TRACKS', 0, 40, 3, 'center')
    ctx.restore()
  }, 0.5)

  // reproductor + siguiente
  const cur = covers[Math.max(0, ci)]
  const prog = ci >= 0 ? ((t - TP) % SEG) / SEG : 0
  slide(ctx, ph(t, TP - 0.4, 0.4), 0, 60, () =>
    player(ctx, L.pl.x, L.pl.y, L.pl.w, L.pl.h, cur, prog, t, 'NOW PLAYING', `${Math.max(0, ci) + 1} / ${d.count}`),
  )
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (!V) {
    const nx = covers.slice(ci + 1, ci + 3)
    slide(ctx, ph(t, TP - 0.2, 0.4), 0, 40, () => {
      ctx.font = MONO(20)
      ctx.fillStyle = MUTED
      spaced(ctx, 'UP NEXT', L.bx, L.pl.y + L.pl.h + 52, 4)
      nx.forEach((tr, i) => {
        const y = L.pl.y + L.pl.h + 70 + i * 62
        cover(ctx, tr.img, L.bx, y, 50, 2)
        ctx.fillStyle = INK
        ctx.fillText(fit(ctx, tr.title, (s) => HEAD(s), 420, 22, 14), L.bx + 66, y + 24)
        ctx.fillStyle = RED
        ctx.fillText(fit(ctx, tr.artists, (s) => MONO(s), 300, 19, 12), L.bx + 66, y + 48)
      })
    })
  }
  slide(ctx, ph(t, TP, 0.4), 0, 20, () => {
    ctx.font = MONO(22)
    ctx.fillStyle = INK
    const txt = `LISTEN ALL ${d.count} · ${V ? 'LINK IN BIO' : 'LINK IN POST'}`
    if (V) spaced(ctx, txt, W / 2, L.pl.y + L.pl.h + 66, 3, 'center')
    else spaced(ctx, txt, L.bx + L.bw, L.pl.y + L.pl.h + 52, 3, "right")
  })
  ctx.restore()
}

// ===================== BLOG =====================
export type BlogAnim = {
  title: string
  /** Índice de palabra desde el que se subraya en amarillo (ver `blogHighlightFrom`). */
  highlightFrom: number
  date: string
  tags: string[]
  img: Img | null
  /** Temas del álbum (si el artículo lo tiene): el reproductor los recorre. */
  tracks: { title: string; meta: string; artists?: string }[]
  artist: string
  label: string
  /** Sin temas: el extracto ocupa el hueco del reproductor. */
  excerpt: string
}

/** Subrayado: lo que va tras «:» o, si no hay, el último tercio del título. */
export function blogHighlightFrom(title: string): number {
  const words = title.trim().split(/\s+/)
  const colon = words.findIndex((w) => w.endsWith(':'))
  if (colon >= 0 && colon < words.length - 1) return colon + 1
  return Math.max(1, words.length - Math.max(2, Math.round(words.length / 3)))
}

function vinyl(ctx: C, cx: number, cy: number, r: number, rot: number, label: string) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 2
  for (let rr = r * 0.4; rr < r * 0.96; rr += 7) {
    ctx.beginPath()
    ctx.arc(0, 0, rr, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = YELLOW
  ctx.font = HEAD(r * 0.09)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('OPTIMAL', 0, -r * 0.14)
  ctx.fillText('BREAKS', 0, -r * 0.03)
  ctx.font = MONO(r * 0.06)
  ctx.fillStyle = '#fff'
  ctx.fillText(label, 0, r * 0.15)
  ctx.fillStyle = PAPER2
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.025, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // brillo fijo
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  g.addColorStop(0.3, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.1)')
  g.addColorStop(0.7, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
  ctx.restore()
}

export function animBlog(ctx: C, W: number, H: number, d: BlogAnim, t: number) {
  const V = H > W
  paper(ctx, W, H, '#ece2cf')
  ctx.fillStyle = YELLOW
  ctx.fillRect(0, 0, W, 64)
  hazard(ctx, 64, 26, W)
  if (V) hazard(ctx, H - 30, 30, W)
  ctx.fillStyle = INK
  ctx.font = MONO(20)
  ctx.textBaseline = 'middle'
  spaced(ctx, 'OPTIMAL BREAKS · THE BREAKBEAT BIBLE · BLOG', V ? W / 2 : 60, 34, 5, V ? 'center' : 'left')
  ctx.save()
  scaled(ctx, W, H, V, 20)
  const L = V
    ? { x: 70, chipY: 190, ty: 330, ts: 64, lh: 76, ww: 930, tagMax: 1010, pc: 500 }
    : { x: 90, chipY: 150, ty: 270, ts: 70, lh: 82, ww: 1060, tagMax: 1150, pc: 440 }

  slide(ctx, ph(t, 0, 0.4), -40, 0, () => {
    let x = L.x
    x += chip(ctx, x, L.chipY, 'ARTICLE', RED, '#fff', 20) + 16
    ctx.font = MONO(22, 400)
    ctx.fillStyle = MUTED
    ctx.textBaseline = 'middle'
    spaced(ctx, d.date.toUpperCase(), x, L.chipY + 21, 3)
  })
  // Títulos largos: baja el cuerpo hasta caber en 4 líneas.
  let ts = L.ts
  ctx.font = HEAD(ts)
  let lines = wrap(ctx, d.title.toUpperCase(), L.ww)
  while (lines.length > 4 && ts > 40) {
    ts -= 4
    ctx.font = HEAD(ts)
    lines = wrap(ctx, d.title.toUpperCase(), L.ww)
  }
  lines = lines.slice(0, 5)
  const lh = Math.round(ts * 1.18)
  let y = L.ty - (L.ts - ts)
  let wc = 0
  lines.forEach((ln, li) => {
    const words = ln.split(' ')
    const hiFrom = Math.max(0, d.highlightFrom - wc)
    const yy = y
    slide(ctx, ph(t, 0.25 + li * 0.15, 0.45), 0, 50, () => {
      ctx.font = HEAD(ts)
      if (hiFrom < words.length) {
        const pre = words.slice(0, hiFrom).join(' ')
        const preW = pre ? ctx.measureText(pre + ' ').width : 0
        const hiW = ctx.measureText(words.slice(hiFrom).join(' ')).width
        ctx.fillStyle = YELLOW
        ctx.fillRect(L.x - 6 + preW, yy - ts * 0.84, (hiW + 14) * ease(ph(t, 1.2, 0.5)), ts * 1.06)
      }
      ctx.fillStyle = INK
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(ln, L.x, yy)
    })
    y += lh
    wc += words.length
  })
  slide(ctx, ph(t, 1.3, 0.4), 0, 20, () => {
    ctx.font = MONO(20)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    spaced(ctx, d.label ? `BY OPTIMAL BREAKS · ${d.label.toUpperCase()}` : 'BY OPTIMAL BREAKS', L.x, y + 4, 4)
  })
  let tx = L.x
  let ty = y + 36
  d.tags.slice(0, 6).forEach((tg, i) => {
    ctx.font = MONO(18)
    const w = [...tg].reduce((a, ch) => a + ctx.measureText(ch).width + 4, 0) + 28
    if (tx + w > L.tagMax) {
      tx = L.x
      ty += 52
    }
    const x0 = tx
    const y0 = ty
    pop(ctx, ph(t, 1.5 + i * 0.1, 0.35), x0 + w / 2, y0 + 19, () => chip(ctx, x0, y0, tg, INK, '#fff', 18))
    tx += w + 10
  })

  // portada + vinilo
  const pc = L.pc
  const hasTracks = d.tracks.length > 0
  // Con álbum, la funda se aparta para que asome el vinilo.
  const ccx = V ? (hasTracks ? W / 2 - 100 : W / 2) : hasTracks ? 1330 : 1420
  const ccy = V ? ty + 110 + pc / 2 + 20 : 390
  const out = ease(ph(t, 1.9, 0.9)) * pc * 0.42
  const rot = t * 3.49
  const coverIn = ph(t, 0.7, 0.7)
  if (coverIn > 0) {
    ctx.save()
    ctx.globalAlpha = clamp(coverIn * 2)
    const e = back(coverIn)
    ctx.translate(ccx, ccy - 120 * (1 - ease(coverIn)))
    ctx.rotate(0.03 + 0.25 * (1 - e))
    ctx.translate(-ccx, -ccy)
    if (out > 1 && hasTracks) vinyl(ctx, ccx + out, ccy, pc * 0.47, rot, `${d.tracks.length} TRACKS`)
    ctx.translate(ccx, ccy)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(-pc / 2 + 14, -pc / 2 + 16, pc, pc)
    ctx.fillStyle = '#fff'
    ctx.fillRect(-pc / 2 - 18, -pc / 2 - 18, pc + 36, pc + 36)
    if (d.img) ctx.drawImage(d.img, -pc / 2, -pc / 2, pc, pc)
    ctx.strokeStyle = INK
    ctx.lineWidth = 4
    ctx.strokeRect(-pc / 2 - 18, -pc / 2 - 18, pc + 36, pc + 36)
    ctx.save()
    ctx.translate(0, -pc / 2 - 20)
    ctx.rotate(-0.04)
    ctx.fillStyle = 'rgba(160,150,40,0.85)'
    ctx.fillRect(-90, -18, 180, 36)
    ctx.restore()
    ctx.restore()
  }
  // pegatina con nº de temas
  const stx = ccx - pc / 2 + 10
  const sty = ccy + pc / 2 - 20
  if (hasTracks) pop(ctx, ph(t, 2.6, 0.4), stx, sty, () => {
    ctx.save()
    ctx.translate(stx, sty)
    ctx.rotate(-0.15)
    const s = 1 + 0.05 * beatPulse(t)
    ctx.scale(s, s)
    ctx.fillStyle = UV
    ctx.beginPath()
    ctx.arc(0, 0, 76, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = HEAD(40)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(d.tracks.length), 0, -10)
    ctx.font = MONO(15)
    ctx.fillText('TRACKS · PLAY', 0, 26)
    ctx.restore()
  }, 0.6)

  // reproductor recorriendo el tracklist
  const TP = 3.0
  // Hasta 11 temas en pantalla; si el álbum es más largo, se recorren los primeros.
  const shown = d.tracks.slice(0, 11)
  const SEG = (DUR - TP - 1.2) / Math.max(1, shown.length)
  const ti = t >= TP ? Math.min(shown.length - 1, Math.floor((t - TP) / SEG)) : 0
  const prog = t >= TP ? clamp((t - TP - ti * SEG) / SEG) : 0
  const pl = V ? { x: 70, y: ccy + pc / 2 + 80, w: 930, h: 170 } : { x: 1080, y: 720, w: 760, h: 170 }
  if (hasTracks) {
    const tr = shown[ti]
    slide(ctx, ph(t, TP - 0.5, 0.45), 0, 60, () =>
      player(ctx, pl.x, pl.y, pl.w, pl.h, { title: tr.title, artists: tr.artists || d.artist, img: d.img }, prog, t, `TRACK ${String(ti + 1).padStart(2, '0')}/${d.tracks.length}`, tr.meta),
    )
  } else if (d.excerpt) {
    slide(ctx, ph(t, 2.2, 0.45), 0, 60, () => {
      ctx.font = MONO(24, 400)
      const ex = wrap(ctx, d.excerpt, pl.w - 60).slice(0, 4)
      box(ctx, pl.x, pl.y, pl.w, Math.max(pl.h, ex.length * 36 + 44), '#fff', INK, 10, 4)
      ctx.fillStyle = INK
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ex.forEach((l, i) => ctx.fillText(l, pl.x + 30, pl.y + 50 + i * 36))
    })
  }
  // botón leer (late al final)
  const by = V ? pl.y + (hasTracks ? pl.h : Math.max(pl.h, 188)) + 50 : ty + 110
  const bw = V ? 930 : 620
  slide(ctx, ph(t, V ? TP : 2.0, 0.4), 0, 30, () => {
    const s = t > DUR - 2.5 ? 1 + 0.04 * beatPulse(t) : 1
    ctx.save()
    ctx.translate(L.x + bw / 2, by + 42)
    ctx.scale(s, s)
    ctx.translate(-(L.x + bw / 2), -(by + 42))
    box(ctx, L.x, by, bw, 84, YELLOW, INK, 10, 5)
    ctx.fillStyle = INK
    ctx.font = HEAD(30)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(V ? 'READ IT · LINK IN BIO →' : 'READ IT · LINK IN POST →', L.x + bw / 2, by + 44)
    ctx.restore()
  })
  ctx.restore()
}

// ===================== QUINCENA (blog con digest) =====================
// Escenas cortas de datos, no el artículo: cada una dice quién lidera y lo
// enseña con barras, carátulas o fotos. Rótulo de datos corriendo arriba y
// barrido rojo entre escenas.
export type FortnightTrackAnim = { title: string; artists: string; value: number; img: Img | null }
export type FortnightAnim = {
  range: string
  totals: { tracks: number; artists: number; labels: number; releases: number; prev: number }
  covers: (Img | null)[]
  played: FortnightTrackAnim[]
  voted: FortnightTrackAnim[]
  artists: { name: string; tracks: number; releases: number }[]
  stars: { rank: number; name: string; track: string; img: Img | null }[]
  labels: { name: string; tracks: number }[]
  bpm: number | null
  prevBpm: number | null
  bands: { band: string; count: number }[]
  key: string | null
  debutTotal: number
  debut: string[]
}
export const FORTNIGHT_DUR = 28

type FnScene = 'intro' | 'played' | 'voted' | 'artists' | 'stars' | 'labels' | 'sound' | 'outro'
type Box = { x: number; y: number; w: number; h: number }
type FnLayout = { V: boolean; hx: number; kY: number; hY: number; hW: number; S: Box; foot: Box }

function fnScenes(d: FortnightAnim): { k: FnScene; a: number; b: number }[] {
  const all: [FnScene, number, boolean][] = [
    ['intro', 3.2, true],
    ['played', 4.2, d.played.length > 0],
    ['voted', 3.8, d.voted.length > 0],
    ['artists', 3.8, d.artists.length > 0],
    ['stars', 4, d.stars.length > 0],
    ['labels', 2.8, d.labels.length > 0],
    ['sound', 2.8, d.bands.length > 0],
    ['outro', 3.4, true],
  ]
  const on = all.filter(([, , ok]) => ok)
  const k = FORTNIGHT_DUR / on.reduce((s, [, w]) => s + w, 0)
  let a = 0
  return on.map(([key, w]) => {
    const sc = { k: key, a, b: a + w * k }
    a = sc.b
    return sc
  })
}

function fnHeader(ctx: C, L: FnLayout, lt: number, kicker: string, head: string, sub: string, color: string) {
  slide(ctx, ph(lt, 0, 0.35), -90, 0, () => chip(ctx, L.hx, L.kY, kicker, color, '#fff', L.V ? 24 : 22))
  let s = L.V ? 100 : 86
  ctx.font = HEAD(s)
  const forced = head.includes('\n')
  const wrapHead = () => (forced ? head.toUpperCase().split('\n') : wrap(ctx, head.toUpperCase(), L.hW))
  let lines = wrapHead()
  while (forced && lines.some((l) => ctx.measureText(l).width > L.hW) && s > 48) {
    s -= 4
    ctx.font = HEAD(s)
  }
  while (lines.length > 2 && s > 48) {
    s -= 4
    ctx.font = HEAD(s)
    lines = wrapHead()
  }
  if (lines.length > 2) lines = [lines[0], fit(ctx, lines.slice(1).join(' '), HEAD, L.hW, s, s)]
  const lh = s * 1.08
  lines.forEach((ln, i) => {
    const y = L.hY + i * lh
    slide(ctx, ph(lt, 0.1 + i * 0.12, 0.4), 0, 70, () => {
      ctx.font = HEAD(s)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      if (i === lines.length - 1) {
        ctx.fillStyle = YELLOW
        ctx.fillRect(L.hx - 8, y - s * 0.78, (ctx.measureText(ln).width + 16) * ease(ph(lt, 0.45, 0.4)), s * 0.95)
      }
      ctx.fillStyle = INK
      ctx.fillText(ln, L.hx, y)
    })
  })
  if (!sub) return
  const sy = L.hY + (lines.length - 1) * lh + (L.V ? 70 : 64)
  slide(ctx, ph(lt, 0.4, 0.4), 0, 30, () => {
    ctx.font = MONO(L.V ? 30 : 27)
    ctx.fillStyle = RED
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    wrap(ctx, sub, L.hW).slice(0, 2).forEach((l, i) => ctx.fillText(l, L.hx, sy + i * (L.V ? 40 : 36)))
  })
}

function fnRanking(ctx: C, S: Box, rows: FortnightTrackAnim[], lt: number, t: number, unit: string, accent: string) {
  const n = Math.min(5, rows.length)
  const gap = 16
  const rh = (S.h - gap * (n - 1)) / 5
  const max = Math.max(1, ...rows.slice(0, n).map((r) => r.value))
  rows.slice(0, n).forEach((r, i) => {
    const y = S.y + i * (rh + gap)
    const at = 0.35 + (n - 1 - i) * 0.2
    slide(ctx, ph(lt, at, 0.4), 180, 0, () => {
      const top = i === 0
      box(ctx, S.x, y, S.w, rh, top ? YELLOW : '#fff', INK, 8, 4)
      ctx.fillStyle = top ? RED : INK
      ctx.font = HEAD(rh * 0.36)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), S.x + 52, y + rh / 2 + 2)
      const cs = rh - 28
      const cx = S.x + 100
      ctx.save()
      if (top) {
        const s = 1 + 0.05 * beatPulse(t)
        ctx.translate(cx + cs / 2, y + 14 + cs / 2)
        ctx.scale(s, s)
        ctx.translate(-(cx + cs / 2), -(y + 14 + cs / 2))
      }
      cover(ctx, r.img, cx, y + 14, cs, 3)
      ctx.restore()
      const tx = cx + cs + 24
      const tw = S.w - (tx - S.x) - 170
      const grow = ease(ph(lt, at + 0.25, 0.8))
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = INK
      ctx.fillText(fit(ctx, r.title.toUpperCase(), HEAD, tw, rh * 0.19, 14), tx, y + rh * 0.36)
      ctx.fillStyle = RED
      ctx.fillText(fit(ctx, r.artists, (s) => MONO(s), tw, rh * 0.15, 12), tx, y + rh * 0.58)
      const by = y + rh * 0.7
      const bh = rh * 0.13
      ctx.fillStyle = PAPER2
      ctx.fillRect(tx, by, tw, bh)
      ctx.fillStyle = accent
      ctx.fillRect(tx, by, tw * (r.value / max) * grow, bh)
      ctx.lineWidth = 2
      ctx.strokeStyle = INK
      ctx.strokeRect(tx, by, tw, bh)
      ctx.textAlign = 'right'
      ctx.fillStyle = INK
      ctx.font = HEAD(rh * 0.3)
      ctx.fillText(String(Math.round(r.value * grow)), S.x + S.w - 26, y + rh * 0.54)
      ctx.font = MONO(rh * 0.11)
      ctx.fillStyle = MUTED
      ctx.fillText(unit, S.x + S.w - 26, y + rh * 0.78)
    })
  })
}

function fnBars(ctx: C, S: Box, rows: { name: string; value: number; note: string }[], lt: number, t: number, max6 = 6) {
  const n = Math.min(max6, rows.length)
  const gap = 20
  const rh = (S.h - gap * (max6 - 1)) / max6
  const max = Math.max(1, ...rows.slice(0, n).map((r) => r.value))
  rows.slice(0, n).forEach((r, i) => {
    const y = S.y + i * (rh + gap)
    const at = 0.3 + i * 0.14
    slide(ctx, ph(lt, at, 0.4), -160, 0, () => {
      const grow = ease(ph(lt, at + 0.15, 0.9))
      ctx.font = MONO(rh * 0.17)
      const noteW = ctx.measureText(r.note).width
      ctx.fillStyle = MUTED
      ctx.textAlign = 'right'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(r.note, S.x + S.w, y + rh * 0.36)
      ctx.textAlign = 'left'
      ctx.fillStyle = INK
      ctx.fillText(fit(ctx, r.name.toUpperCase(), HEAD, S.w - noteW - 28, rh * 0.32, 14), S.x, y + rh * 0.36)
      const by = y + rh * 0.48
      const bh = rh * 0.44
      const bw = (S.w - 8) * (r.value / max) * grow
      ctx.fillStyle = INK
      ctx.fillRect(S.x + 6, by + 6, Math.max(bw, 10), bh)
      ctx.fillStyle = i === 0 ? RED : i % 2 ? UV : INK
      ctx.fillRect(S.x, by, Math.max(bw, 10), bh)
      ctx.lineWidth = 3
      ctx.strokeStyle = INK
      ctx.strokeRect(S.x, by, Math.max(bw, 10), bh)
      if (bw > 90) {
        ctx.fillStyle = i === 0 ? YELLOW : '#fff'
        ctx.font = HEAD(bh * 0.6)
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(Math.round(r.value * grow)), S.x + bw - 14, by + bh / 2 + 2)
      }
    })
    if (i === 0) {
      const lx = S.x + S.w * 0.55
      const ly = y + rh * 0.7
      pop(ctx, ph(lt, at + 1, 0.4), lx, ly, () => {
        ctx.save()
        ctx.translate(lx, ly)
        ctx.rotate(-0.14 + 0.03 * Math.sin(t * 3))
        const s = 1 + 0.06 * beatPulse(t)
        ctx.scale(s, s)
        ctx.fillStyle = YELLOW
        ctx.fillRect(-82, -26, 164, 52)
        ctx.lineWidth = 4
        ctx.strokeStyle = INK
        ctx.strokeRect(-82, -26, 164, 52)
        ctx.fillStyle = INK
        ctx.font = HEAD(24)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('LEADER', 0, 2)
        ctx.restore()
      }, 0.4)
    }
  })
}

function fnCoverRow(ctx: C, imgs: (Img | null)[], x: number, y: number, w: number, cs: number, speed: number, t: number) {
  const list = imgs.filter(Boolean) as Img[]
  if (!list.length) return
  const gap = 14
  const span = list.length * (cs + gap)
  const off = (((t * speed) % span) + span) % span
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y - 4, w, cs + 8)
  ctx.clip()
  for (let k = -1; k <= Math.ceil(w / span) + 1; k++) {
    list.forEach((im, i) => {
      const cx = x + k * span + i * (cs + gap) - off
      if (cx > x - cs && cx < x + w) cover(ctx, im, cx, y, cs, 3)
    })
  }
  ctx.restore()
}

export function animFortnight(ctx: C, W: number, H: number, d: FortnightAnim, t: number) {
  const V = H > W
  const L: FnLayout = V
    ? { V, hx: 70, kY: 180, hY: 340, hW: 940, S: { x: 70, y: 590, w: 940, h: 980 }, foot: { x: 70, y: 1650, w: 940, h: 18 } }
    : { V, hx: 90, kY: 160, hY: 310, hW: 760, S: { x: 940, y: 130, w: 890, h: 850 }, foot: { x: 90, y: 880, w: 760, h: 16 } }
  const S = L.S
  paper(ctx, W, H, '#ece2cf')

  // rótulo de datos que corre arriba
  const delta = d.totals.tracks - d.totals.prev
  const facts = [
    `FORTNIGHT ${d.range}`,
    `${d.totals.tracks} TRACKS`,
    `${d.totals.artists} ARTISTS`,
    `${d.totals.labels} LABELS`,
    d.played[0] ? `MOST PLAYED: ${d.played[0].title.toUpperCase()}` : '',
    d.voted[0] ? `MOST VOTED: ${d.voted[0].title.toUpperCase()}` : '',
    d.artists[0] ? `TOP RELEASER: ${d.artists[0].name.toUpperCase()}` : '',
    d.bpm ? `AVG ${Math.round(d.bpm)} BPM` : '',
    `${d.debutTotal} DEBUTS`,
    '',
  ].filter((f, i, a) => f || i === a.length - 1).join(' · ')
  ctx.fillStyle = YELLOW
  ctx.fillRect(0, 0, W, 70)
  ctx.fillStyle = INK
  ctx.font = MONO(24)
  ctx.textBaseline = 'middle'
  const fw = spaced(ctx, facts, -1e5, -1000, 4) + 4
  let fx = -((t * 160) % fw)
  while (fx < W) {
    spaced(ctx, facts, fx, 37, 4)
    fx += fw
  }
  hazard(ctx, 70, 26, W)
  if (V) hazard(ctx, H - 30, 30, W)

  const scenes = fnScenes(d)
  const found = scenes.findIndex((s) => t >= s.a && t < s.b)
  const si = found === -1 ? scenes.length - 1 : found
  const sc = scenes[si]
  const lt = t - sc.a
  const dur = sc.b - sc.a
  const last = si === scenes.length - 1

  ctx.save()
  if (!last) {
    const ex = ease(ph(lt, dur - 0.32, 0.32))
    ctx.translate(-W * 0.35 * ex, 0)
    ctx.globalAlpha = 1 - ex
  }

  if (sc.k === 'intro') {
    fnHeader(ctx, L, lt, 'BREAKBEAT FORTNIGHT', d.range.replace(' — ', ' —\n'), `${d.totals.tracks} NEW TRACKS · ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} VS PREVIOUS`, RED)
    const gap = 22
    const cw = (S.w - gap) / 2
    const ch = V ? 250 : 220
    const stats: [string, number, string][] = [
      ['TRACKS', d.totals.tracks, RED],
      ['ARTISTS', d.totals.artists, INK],
      ['LABELS', d.totals.labels, UV],
      ['RELEASES', d.totals.releases, INK],
    ]
    stats.forEach(([label, val, col], i) => {
      const x = S.x + (i % 2) * (cw + gap)
      const y = S.y + Math.floor(i / 2) * (ch + gap)
      const at = 0.3 + i * 0.18
      pop(ctx, ph(lt, at, 0.45), x + cw / 2, y + ch / 2, () => {
        box(ctx, x, y, cw, ch, i === 0 ? YELLOW : '#fff', INK, 10, 5)
        ctx.fillStyle = col
        ctx.font = HEAD(ch * 0.5)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(String(Math.round(val * ease(ph(lt, at, 1.1)))), x + 28, y + ch * 0.62)
        ctx.fillStyle = INK
        ctx.font = MONO(ch * 0.11)
        spaced(ctx, label, x + 30, y + ch * 0.84, 5)
      }, (hash(i, 5) - 0.5) * 0.4)
    })
    const ry = S.y + ch * 2 + gap + 50
    const cs = V ? 200 : 170
    slide(ctx, ph(lt, 1.2, 0.5), 0, 80, () => {
      fnCoverRow(ctx, d.covers, S.x, ry, S.w, cs, 120, t)
      fnCoverRow(ctx, [...d.covers].reverse(), S.x, ry + cs + 22, S.w, cs, -120, t)
    })
  } else if (sc.k === 'played' || sc.k === 'voted') {
    const rows = sc.k === 'played' ? d.played : d.voted
    const r0 = rows[0]
    const unit = sc.k === 'played' ? 'PLAYS' : 'VOTES'
    fnHeader(
      ctx, L, lt,
      sc.k === 'played' ? 'MOST PLAYED ON OPTIMAL BREAKS' : 'MOST VOTED BY THE COMMUNITY',
      `${r0.artists.split(',')[0]} ${sc.k === 'played' ? 'LEADS' : 'ON TOP'}`,
      `«${r0.title}» · ${r0.value} ${unit}`,
      sc.k === 'played' ? RED : UV,
    )
    fnRanking(ctx, S, rows, lt, t, unit, sc.k === 'played' ? RED : UV)
  } else if (sc.k === 'artists') {
    const a0 = d.artists[0]
    fnHeader(ctx, L, lt, 'WHO RELEASED THE MOST', `${a0.name} LEADS`, `${a0.tracks} TRACKS IN ${a0.releases} RELEASE${a0.releases === 1 ? '' : 'S'}`, INK)
    fnBars(ctx, S, d.artists.map((a) => ({ name: a.name, value: a.tracks, note: `${a.tracks} TRACKS · ${a.releases} REL.` })), lt, t)
  } else if (sc.k === 'stars') {
    const s0 = d.stars[0]
    fnHeader(ctx, L, lt, 'TOP 100 STARS · NEW MUSIC', `${d.stars.length} TOP 100 STARS DROPPED`, `#${s0.rank} ${s0.name.toUpperCase()} WITH «${s0.track}»`, ACID)
    const cols = 3
    const gap = 20
    const cw = (S.w - gap * (cols - 1)) / cols
    const cellH = cw + (V ? 130 : 110)
    d.stars.slice(0, 6).forEach((s, i) => {
      const x = S.x + (i % cols) * (cw + gap)
      const y = S.y + Math.floor(i / cols) * (cellH + gap)
      pop(ctx, ph(lt, 0.3 + i * 0.16, 0.45), x + cw / 2, y + cw / 2, () => {
        box(ctx, x, y, cw, cellH, '#fff', INK, 8, 4)
        ctx.save()
        ctx.beginPath()
        ctx.rect(x + 4, y + 4, cw - 8, cw - 8)
        ctx.clip()
        const z = 1 + 0.06 * ph(lt, 0.3 + i * 0.16, 3)
        ctx.translate(x + cw / 2, y + cw / 2)
        ctx.scale(z, z)
        if (s.img) ctx.drawImage(s.img, -cw / 2, -cw / 2, cw, cw)
        else {
          ctx.fillStyle = INK
          ctx.fillRect(-cw / 2, -cw / 2, cw, cw)
        }
        ctx.restore()
        ctx.fillStyle = RED
        ctx.fillRect(x + 12, y + 12, 84, 46)
        ctx.lineWidth = 3
        ctx.strokeStyle = INK
        ctx.strokeRect(x + 12, y + 12, 84, 46)
        ctx.fillStyle = '#fff'
        ctx.font = HEAD(26)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`#${s.rank}`, x + 54, y + 36)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = INK
        ctx.fillText(fit(ctx, s.name.toUpperCase(), HEAD, cw - 28, V ? 28 : 24, 13), x + 14, y + cw + (V ? 48 : 42))
        ctx.fillStyle = RED
        ctx.fillText(fit(ctx, `▶ ${s.track}`, (z2) => MONO(z2), cw - 28, V ? 24 : 21, 12), x + 14, y + cw + (V ? 92 : 80))
      }, (hash(i, 9) - 0.5) * 0.5)
    })
  } else if (sc.k === 'labels') {
    const l0 = d.labels[0]
    fnHeader(ctx, L, lt, 'LABELS OF THE FORTNIGHT', l0.name, `TOP LABEL · ${l0.tracks} TRACKS`, UV)
    fnBars(ctx, S, d.labels.map((l) => ({ name: l.name, value: l.tracks, note: `${l.tracks} TRACKS` })), lt, t)
  } else if (sc.k === 'sound') {
    const top = [...d.bands].sort((a, b) => b.count - a.count)[0]
    fnHeader(ctx, L, lt, 'SOUND CHECK', `${top.band} BPM RULES`, [d.key ? `${d.key.toUpperCase()} IS THE TOP KEY` : '', d.prevBpm ? `PREVIOUS AVG ${Math.round(d.prevBpm)} BPM` : ''].filter(Boolean).join(' · '), RED)
    const bh = S.h * 0.36
    pop(ctx, ph(lt, 0.3, 0.5), S.x + S.w / 2, S.y + bh / 2, () => {
      box(ctx, S.x, S.y, S.w, bh, YELLOW, INK, 12, 5)
      ctx.fillStyle = INK
      ctx.font = HEAD(bh * 0.55)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      const n = Math.round((d.bpm || 0) * ease(ph(lt, 0.3, 1)))
      ctx.fillText(String(n), S.x + 36, S.y + bh * 0.7)
      ctx.font = MONO(bh * 0.1)
      spaced(ctx, 'AVERAGE BPM', S.x + 40, S.y + bh * 0.88, 5)
      eq(ctx, S.x + S.w - 300, S.y + 40, 260, bh - 80, 10, t)
    })
    const hy = S.y + bh + 50
    const hh = S.h - bh - 50
    const bands = d.bands
    const max = Math.max(1, ...bands.map((b) => b.count))
    const bw = S.w / bands.length
    slide(ctx, ph(lt, 0.6, 0.4), 0, 60, () => box(ctx, S.x, hy, S.w, hh, '#fff', INK, 10, 4))
    bands.forEach((b, i) => {
      const g = ease(ph(lt, 0.8 + i * 0.05, 0.6))
      const h = (hh - 110) * (b.count / max) * g
      const x = S.x + i * bw + 8
      const isTop = b.band === top.band
      ctx.fillStyle = isTop ? RED : INK
      ctx.fillRect(x, hy + hh - 60 - h, bw - 16, h)
      if (g > 0.5) {
        ctx.fillStyle = INK
        ctx.font = MONO(V ? 18 : 16)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(String(b.count), x + (bw - 16) / 2, hy + hh - 68 - h)
        ctx.font = MONO(V ? 14 : 13, 400)
        ctx.fillText(b.band.split('–')[0], x + (bw - 16) / 2, hy + hh - 30)
      }
    })
  } else {
    fnHeader(ctx, L, lt, 'NEW NAMES', `${d.debutTotal} DEBUTS`, d.debut.slice(0, 4).join(' · '), ACID)
    const cols = 4
    const gap = 14
    const cs = (S.w - gap * (cols - 1)) / cols
    d.covers.filter(Boolean).slice(0, 12).forEach((im, i) => {
      const x = S.x + (i % cols) * (cs + gap)
      const y = S.y + Math.floor(i / cols) * (cs + gap)
      pop(ctx, ph(lt, 0.2 + i * 0.07, 0.4), x + cs / 2, y + cs / 2, () => {
        ctx.save()
        const s = 1 + 0.03 * beatPulse(t + i * 0.1)
        ctx.translate(x + cs / 2, y + cs / 2)
        ctx.scale(s, s)
        ctx.translate(-(x + cs / 2), -(y + cs / 2))
        cover(ctx, im, x, y, cs, 3)
        ctx.restore()
      }, (hash(i, 4) - 0.5) * 0.7)
    })
    const by = S.y + 3 * (cs + gap) + 30
    pop(ctx, ph(lt, 1.2, 0.5), S.x + S.w / 2, by + 60, () => {
      const s = 1 + 0.05 * beatPulse(t)
      ctx.save()
      ctx.translate(S.x + S.w / 2, by + 60)
      ctx.scale(s, s)
      ctx.translate(-(S.x + S.w / 2), -(by + 60))
      box(ctx, S.x, by, S.w, 120, RED, INK, 12, 5)
      ctx.fillStyle = '#fff'
      ctx.font = HEAD(V ? 40 : 34)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(V ? 'PLAY THEM ALL · LINK IN BIO' : 'PLAY THEM ALL · LINK IN POST', S.x + S.w / 2, by + 62)
      ctx.restore()
    })
  }
  ctx.restore()

  // barrido rojo entre escenas
  for (const s of scenes.slice(0, -1)) {
    const p = (t - (s.b - 0.3)) / 0.6
    if (p <= 0 || p >= 1) continue
    const x = -W * 0.6 + W * 2.2 * ease(p)
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.moveTo(x, 96)
    ctx.lineTo(x + W * 0.45, 96)
    ctx.lineTo(x + W * 0.25, H)
    ctx.lineTo(x - W * 0.2, H)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = INK
    ctx.fillRect(x + W * 0.45 - 14, 96, 14, 10)
  }

  // progreso por escenas + marca
  const F = L.foot
  const sw = (F.w - 8 * (scenes.length - 1)) / scenes.length
  scenes.forEach((s, i) => {
    const x = F.x + i * (sw + 8)
    ctx.fillStyle = PAPER2
    ctx.fillRect(x, F.y, sw, F.h)
    ctx.fillStyle = i < si ? INK : RED
    ctx.fillRect(x, F.y, sw * (i < si ? 1 : i === si ? clamp((t - s.a) / (s.b - s.a)) : 0), F.h)
    ctx.lineWidth = 2
    ctx.strokeStyle = INK
    ctx.strokeRect(x, F.y, sw, F.h)
  })
  obHeader(ctx, F.x, F.y + (V ? 110 : 80), V ? 46 : 38)
  ctx.font = MONO(V ? 22 : 19)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  spaced(ctx, 'THE BREAKBEAT FORTNIGHT', F.x, F.y + (V ? 156 : 116), 4)
}
