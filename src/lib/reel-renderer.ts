// ============================================
// OPTIMAL BREAKS — Reel de Instagram por canción (render en el navegador)
//
// Genera un MP4 1080×1920 SIN AUDIO (~15 s) para el botón «R» de
// `TrackShareButton` (solo admins). El audio lo pone el admin en Instagram
// con el sticker/música oficial del tema → menciona al artista.
//
// Todo ocurre en el cliente: Canvas 2D dibuja cada fotograma y WebCodecs
// (VideoEncoder H.264) + `mp4-muxer` lo empaquetan, más rápido que tiempo
// real y sin coste de servidor (Vercel no tiene ffmpeg). Si el navegador no
// tiene WebCodecs, cae a MediaRecorder (tiempo real, 15 s).
//
// Los datos (título, artistas, carátula ya recortada como data URL) los da
// `/api/og/story?…&format=json`, la misma lógica que la imagen de Story.
// Estética fanzine: papel, tinta, rojo, amarillo — igual que la Story IG.
// ============================================

export type ReelData = {
  title: string
  artists: string
  meta: string
  kicker: string
  /** data: URL (o mismo origen) de la carátula cuadrada. */
  artwork: string | null
  lang: 'es' | 'en'
  /** Pulso visual. Sin audio, solo marca el ritmo de la animación. */
  bpm?: number
}

export type ReelOptions = {
  durationSec?: number
  fps?: number
  onProgress?: (ratio: number) => void
}

export type ReelResult = { blob: Blob; mime: string; ext: 'mp4' | 'webm' }

const W = 1080
const H = 1920
const PAPER = '#e8dcc8'
const INK = '#1a1a1a'
const RED = '#d62828'
const YELLOW = '#f4c430'
const HEAD = "900 {s}px Unbounded, 'Arial Black', system-ui, sans-serif"
const MONO = "{w} {s}px 'Courier Prime', 'Courier New', monospace"

// ---------- utilidades de animación ----------
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
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
const font = (tpl: string, size: number, weight = 700) =>
  tpl.replace('{s}', String(Math.round(size))).replace('{w}', String(weight))

/** Parte un texto en líneas que caben en `maxW`, bajando el tamaño si hace falta. */
function fitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  tpl: string,
  maxW: number,
  sizes: number[],
  maxLines: number,
): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean)
  for (const size of sizes) {
    ctx.font = font(tpl, size)
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (ctx.measureText(next).width <= maxW) cur = next
      else {
        if (cur) lines.push(cur)
        cur = w
      }
    }
    if (cur) lines.push(cur)
    const fits = lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)
    if (fits) return { lines, size }
  }
  // Último recurso: el tamaño más pequeño y recorte con «…».
  const size = sizes[sizes.length - 1]
  ctx.font = font(tpl, size)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width <= maxW) cur = next
    else {
      lines.push(cur)
      cur = w
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  let last = lines[maxLines - 1] ?? ''
  while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1)
  if (lines.length >= maxLines) lines[maxLines - 1] = `${last}…`
  return { lines: lines.slice(0, maxLines), size }
}

/** Texto con interletrado manual (Safari no tiene `ctx.letterSpacing` en todas las versiones). */
function spacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1)
  let x = cx - total / 2
  ;[...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y)
    x += widths[i] + spacing
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('artwork load failed'))
    img.src = src
  })
}

function makeGrain(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const d = g.createImageData(256, 256)
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v
    d.data[i + 3] = 255
  }
  g.putImageData(d, 0, 0)
  return c
}

type Assets = {
  art: HTMLImageElement | null
  grain: HTMLCanvasElement
  /** Fondo pre-horneado: carátula desenfocada + semitono + viñeta. */
  bg: HTMLCanvasElement
}

// ---------- layout fijo ----------
const SLEEVE = 660
const SLEEVE_X = 110
const SLEEVE_Y = 330
const SCX = SLEEVE_X + SLEEVE / 2
const SCY = SLEEVE_Y + SLEEVE / 2
const VINYL_R = 312
const VINYL_SLIDE = 236
const TEXT_Y = 1072
const TICKER_TOP_Y = 262
const TICKER_BOTTOM_Y = 1668
const EQ_BASE = 1626
/**
 * Franja del aviso «LINK IN BIO». Los reels no admiten sticker de enlace
 * (solo las historias): el enlace real va en la bio o en el sticker al
 * compartir el reel en la historia.
 */
export const LINK_HINT_ZONE = { top: 1430, bottom: 1580 }

// ---------- piezas de fanzine ----------

/** Cinta adhesiva semitransparente con extremos dentados. */
function drawTape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rot: number, seed: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.beginPath()
  const teeth = 6
  ctx.moveTo(-w / 2, -h / 2)
  ctx.lineTo(w / 2, -h / 2)
  for (let i = 1; i <= teeth; i++) {
    const yy = -h / 2 + (h * i) / teeth
    ctx.lineTo(w / 2 + (i % 2 ? -7 : 0) * (0.6 + hash(seed, i)), yy)
  }
  ctx.lineTo(-w / 2, h / 2)
  for (let i = teeth - 1; i >= 0; i--) {
    const yy = -h / 2 + (h * i) / teeth
    ctx.lineTo(-w / 2 + (i % 2 ? 7 : 0) * (0.6 + hash(i, seed)), yy)
  }
  ctx.closePath()
  ctx.fillStyle = 'rgba(236,226,206,0.82)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

/** Cinta de texto en bucle (marquesina) inclinada. */
function drawTicker(
  ctx: CanvasRenderingContext2D,
  y: number,
  rot: number,
  text: string,
  bgCol: string,
  fgCol: string,
  offset: number,
  slideIn: number,
) {
  if (slideIn <= 0) return
  ctx.save()
  ctx.translate(W / 2 + (1 - easeOut(slideIn)) * (rot > 0 ? W : -W), y)
  ctx.rotate(rot)
  const h = 66
  ctx.fillStyle = bgCol
  ctx.fillRect(-W, -h / 2, W * 2, h)
  ctx.fillStyle = INK
  ctx.fillRect(-W, -h / 2, W * 2, 4)
  ctx.fillRect(-W, h / 2 - 4, W * 2, 4)
  ctx.font = font(HEAD, 30)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = fgCol
  const unit = `${text}  •  `
  const uw = ctx.measureText(unit).width
  let x = -W - (((offset % uw) + uw) % uw)
  while (x < W) {
    ctx.fillText(unit, x, 2)
    x += uw
  }
  ctx.restore()
}

/** Sello circular con texto alrededor (gira) y BPM en el centro. */
function drawBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, spin: number, ring: string, center: string, sub: string) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = YELLOW
  ctx.beginPath()
  ctx.arc(8, 8, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = PAPER
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(0, 0, r - 12, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2)
  ctx.stroke()
  // texto en círculo
  ctx.save()
  ctx.rotate(spin)
  ctx.font = font(MONO, 22, 700)
  ctx.fillStyle = PAPER
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const chars = [...ring]
  const step = (Math.PI * 2) / chars.length
  chars.forEach((ch, i) => {
    ctx.save()
    ctx.rotate(i * step)
    ctx.translate(0, -(r - 34))
    ctx.fillText(ch, 0, 0)
    ctx.restore()
  })
  ctx.restore()
  ctx.fillStyle = PAPER
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font(HEAD, center.length > 3 ? 40 : 50)
  ctx.fillText(center, 0, -6)
  ctx.font = font(MONO, 20, 700)
  ctx.fillText(sub, 0, 30)
  ctx.restore()
}

/** Brazo del tocadiscos (pivote arriba a la derecha del vinilo). */
function drawTonearm(ctx: CanvasRenderingContext2D, px: number, py: number, angle: number) {
  ctx.save()
  ctx.translate(px, py)
  // base
  ctx.fillStyle = '#2b2b2b'
  ctx.beginPath()
  ctx.arc(0, 0, 38, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = PAPER
  ctx.beginPath()
  ctx.arc(0, 0, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.rotate(angle)
  ctx.strokeStyle = PAPER
  ctx.lineCap = 'round'
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 300)
  ctx.lineTo(-40, 360)
  ctx.stroke()
  // cápsula
  ctx.translate(-40, 360)
  ctx.rotate(0.6)
  ctx.fillStyle = RED
  ctx.fillRect(-18, -6, 36, 52)
  ctx.restore()
}

/** Manchas de tinta alrededor de un punto (sello final). */
function drawSplatter(ctx: CanvasRenderingContext2D, cx: number, cy: number, spread: number, seed: number, color: string, p: number) {
  ctx.fillStyle = color
  for (let i = 0; i < 26; i++) {
    const a = hash(seed, i) * Math.PI * 2
    const d = spread * (0.55 + hash(i, seed) * 0.7) * easeOut(p)
    const r = 3 + hash(i + 7, seed) * 13
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.2, r * p, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Dibuja el fotograma del instante `t` (segundos). Determinista salvo el grano. */
export function drawReelFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  data: ReelData,
  assets: Assets,
  durationSec: number,
) {
  const es = data.lang === 'es'
  const bpm = data.bpm && data.bpm > 60 && data.bpm < 200 ? data.bpm : 132
  const beat = 60 / bpm
  const beatsIn = Math.max(0, t - 2.8) / beat
  const beatPhase = (beatsIn % 1) * beat
  const pulsing = t >= 2.8 && t < durationSec - 3.2
  const kick = pulsing ? Math.exp(-beatPhase / 0.09) : 0
  const bar = Math.floor(beatsIn / 4)
  const endT = durationSec - 3.6

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  // ----- Fondo: carátula difuminada + semitono, deriva lenta -----
  const bgIn = prog(t, 0.1, 1.1)
  if (bgIn > 0) {
    const z = 1.08 + 0.1 * (t / durationSec) + 0.015 * kick
    ctx.save()
    ctx.globalAlpha = bgIn
    ctx.translate(W / 2, H / 2)
    ctx.scale(z, z)
    ctx.rotate(Math.sin(t * 0.4) * 0.015)
    ctx.drawImage(assets.bg, -W / 2, -H / 2, W, H)
    ctx.restore()
  }

  // Letras gigantes fantasma («BREAKS») que suben despacio
  ctx.save()
  ctx.globalAlpha = 0.07 * bgIn
  ctx.font = font(HEAD, 300)
  ctx.textAlign = 'center'
  ctx.strokeStyle = PAPER
  ctx.lineWidth = 4
  ctx.translate(W / 2, 0)
  for (let i = 0; i < 4; i++) {
    const yy = ((i * 520 - t * 40) % 2080 + 2080) % 2080
    ctx.strokeText('BREAKS', 0, yy)
  }
  ctx.textAlign = 'start'
  ctx.restore()

  // ----- Golpe de cámara en cada beat (todo menos el marco) -----
  ctx.save()
  const camZ = 1 + 0.01 * kick
  ctx.translate(W / 2, H / 2)
  ctx.scale(camZ, camZ)
  ctx.translate(-W / 2, -H / 2)

  // Cabecera OPTIMAL BREAKS (sello)
  {
    const p = prog(t, 0.15, 0.5)
    if (p > 0) {
      const s = 1 + 0.6 * (1 - easeOut(p))
      ctx.save()
      ctx.globalAlpha = p
      ctx.translate(W / 2, 128)
      ctx.scale(s, s)
      ctx.font = font(HEAD, 54)
      ctx.textBaseline = 'middle'
      const a = 'OPTIMAL '
      const b = 'BREAKS'
      const wa = ctx.measureText(a).width
      const wb = ctx.measureText(b).width
      const x0 = -(wa + wb) / 2
      ctx.fillStyle = RED
      ctx.fillText(a, x0 + 4, 4)
      ctx.fillStyle = PAPER
      ctx.fillText(a, x0, 0)
      ctx.fillStyle = YELLOW
      ctx.fillText(b, x0 + wa + 4, 4)
      ctx.fillStyle = RED
      ctx.fillText(b, x0 + wa, 0)
      ctx.restore()
    }
  }

  // Kicker en cinta roja recortada
  {
    const p = prog(t, 0.45, 0.8)
    if (p > 0) {
      ctx.save()
      ctx.font = font(MONO, 30, 700)
      const n = Math.max(1, Math.floor(data.kicker.length * prog(t, 0.6, 1.2)))
      const label = data.kicker.slice(0, n)
      const full = ctx.measureText(data.kicker).width + data.kicker.length * 7
      ctx.translate(W / 2 - (1 - easeOut(p)) * W, 194)
      ctx.rotate(-0.02)
      ctx.fillStyle = INK
      ctx.fillRect(-full / 2 - 28 + 6, -26 + 6, full + 56, 52)
      ctx.fillStyle = RED
      ctx.fillRect(-full / 2 - 28, -26, full + 56, 52)
      ctx.fillStyle = PAPER
      ctx.textBaseline = 'middle'
      spacedText(ctx, label.padEnd(data.kicker.length, ' '), 0, 2, 7)
      ctx.restore()
    }
  }

  // Cinta superior (marquesina)
  drawTicker(
    ctx,
    TICKER_TOP_Y,
    -0.035,
    `OPTIMAL BREAKS  •  ${data.kicker}  •  BREAKBEAT`,
    YELLOW,
    INK,
    t * 160,
    prog(t, 0.6, 1.1),
  )

  // ----- Funda + vinilo + brazo -----
  const enter = prog(t, 0.8, 1.55)
  if (enter > 0) {
    const dropY = (1 - easeBack(enter)) * -1300
    const jolt = pulsing && Math.floor(beatsIn) % 4 === 0 ? Math.exp(-beatPhase / 0.12) : 0
    const rot = ((-5 * (1 - easeOut(prog(t, 0.8, 2.0))) + (bar % 2 ? 1.2 : -1.2) * jolt) * Math.PI) / 180
    const slide = VINYL_SLIDE * easeOut(prog(t, 1.9, 2.8))
    const spin = t * 0.62 * Math.PI * 2
    const pulse = 0.012 * kick

    ctx.save()
    ctx.translate(SCX, SCY + dropY)
    ctx.rotate(rot)
    ctx.scale(1 + pulse, 1 + pulse)

    if (slide > 1) {
      ctx.save()
      ctx.translate(slide, 0)
      ctx.rotate(spin)
      ctx.fillStyle = '#0b0b0b'
      ctx.beginPath()
      ctx.arc(0, 0, VINYL_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 2
      for (let r = 132; r < VINYL_R - 8; r += 8) {
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.rotate(-spin)
      const sheen = ctx.createLinearGradient(-VINYL_R, -VINYL_R, VINYL_R, VINYL_R)
      sheen.addColorStop(0.35, 'rgba(255,255,255,0)')
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.16)')
      sheen.addColorStop(0.65, 'rgba(255,255,255,0)')
      ctx.fillStyle = sheen
      ctx.beginPath()
      ctx.arc(0, 0, VINYL_R - 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.rotate(spin)
      ctx.save()
      ctx.beginPath()
      ctx.arc(0, 0, 120, 0, Math.PI * 2)
      ctx.clip()
      if (assets.art) ctx.drawImage(assets.art, -120, -120, 240, 240)
      else {
        ctx.fillStyle = RED
        ctx.fillRect(-120, -120, 240, 240)
      }
      ctx.restore()
      ctx.fillStyle = PAPER
      ctx.beginPath()
      ctx.arc(0, 0, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const half = SLEEVE / 2
    ctx.fillStyle = YELLOW
    ctx.fillRect(-half + 18, -half + 18, SLEEVE, SLEEVE)
    ctx.fillStyle = PAPER
    ctx.fillRect(-half, -half, SLEEVE, SLEEVE)
    const inset = 12
    if (assets.art) {
      ctx.drawImage(assets.art, -half + inset, -half + inset, SLEEVE - inset * 2, SLEEVE - inset * 2)
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(-half + inset, -half + inset, SLEEVE - inset * 2, SLEEVE - inset * 2)
      ctx.fillStyle = PAPER
      ctx.font = font(HEAD, 200)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('OB', 0, 0)
      ctx.textAlign = 'start'
    }

    // Cintas adhesivas que «pegan» la funda
    const tp1 = prog(t, 1.55, 1.7)
    const tp2 = prog(t, 1.68, 1.83)
    if (tp1 > 0) {
      const s = 1 + 0.5 * (1 - easeOut(tp1))
      ctx.save()
      ctx.globalAlpha = tp1
      ctx.translate(-half + 30, -half + 10)
      ctx.scale(s, s)
      drawTape(ctx, 0, 0, 200, 54, -0.72, 1)
      ctx.restore()
    }
    if (tp2 > 0) {
      const s = 1 + 0.5 * (1 - easeOut(tp2))
      ctx.save()
      ctx.globalAlpha = tp2
      ctx.translate(half - 40, half - 4)
      ctx.scale(s, s)
      drawTape(ctx, 0, 0, 200, 54, -0.72, 2)
      ctx.restore()
    }
    ctx.restore()

    // Brazo del tocadiscos sobre el vinilo
    const armP = prog(t, 2.5, 3.0)
    if (armP > 0) {
      const ang = 0.9 - 0.62 * easeOut(armP) + (pulsing ? Math.sin(t * 2.4) * 0.008 : 0)
      drawTonearm(ctx, SCX + VINYL_SLIDE + 250, SCY - 330 + dropY, ang)
    }
  }

  // «● SONANDO» parpadeando al ritmo
  if (t >= 2.9 && t < endT) {
    const on = !pulsing || beatPhase < beat * 0.6
    ctx.save()
    ctx.globalAlpha = prog(t, 2.9, 3.1)
    ctx.font = font(MONO, 22, 700)
    ctx.textBaseline = 'middle'
    const label = es ? 'SONANDO' : 'NOW PLAYING'
    const lw = ctx.measureText(label).width + label.length * 4 + 56
    const lx = W - 42 - lw
    const ly = SCY + VINYL_R - 40
    ctx.fillStyle = INK
    ctx.fillRect(lx, ly - 24, lw, 48)
    ctx.strokeStyle = PAPER
    ctx.lineWidth = 3
    ctx.strokeRect(lx, ly - 24, lw, 48)
    ctx.fillStyle = on ? RED : '#5a1010'
    ctx.beginPath()
    ctx.arc(lx + 26, ly, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = PAPER
    let x = lx + 46
    for (const ch of label) {
      ctx.fillText(ch, x, ly + 1)
      x += ctx.measureText(ch).width + 4
    }
    ctx.restore()
  }

  // ----- Título en tiras de papel recortadas (una por golpe) -----
  // Al final se desvanece: el sello «LISTEN NOW» cae en su sitio y así el
  // hueco del sticker de enlace sigue libre.
  const textFade = 1 - prog(t, endT - 0.1, endT + 0.15)
  ctx.globalAlpha = textFade
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const { lines, size } = fitLines(ctx, data.title.toUpperCase(), HEAD, 820, [64, 58, 52, 46, 40], 3)
  const lineH = size * 1.42
  const titleStart = 3.0
  lines.forEach((line, i) => {
    const t0 = titleStart + i * beat
    const p = prog(t, t0, t0 + 0.2)
    if (p <= 0) return
    const s = 1 + 0.4 * (1 - easeOut(p))
    ctx.save()
    ctx.translate(W / 2, TEXT_Y + i * lineH + size * 0.6)
    ctx.rotate((i % 2 ? 1.3 : -1.1) * (Math.PI / 180))
    ctx.scale(s, s)
    ctx.font = font(HEAD, size)
    const tw = ctx.measureText(line).width
    const padX = 22
    const hh = size * 1.18
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(-tw / 2 - padX + 9, -hh / 2 + 9, tw + padX * 2, hh)
    ctx.fillStyle = PAPER
    ctx.fillRect(-tw / 2 - padX, -hh / 2, tw + padX * 2, hh)
    ctx.fillStyle = RED
    ctx.fillText(line, 4, 5)
    ctx.fillStyle = INK
    ctx.fillText(line, 0, 2)
    ctx.restore()
  })
  let y = TEXT_Y + (lines.length - 1) * lineH + size * 1.2

  // Artistas (máquina de escribir, con cursor)
  if (data.artists) {
    const t0 = titleStart + lines.length * beat + 0.1
    const fit = fitLines(ctx, data.artists, MONO.replace('{w}', '700'), 860, [42, 38, 34, 30], 2)
    const total = fit.lines.join(' ').length
    const p = prog(t, t0, t0 + Math.min(1.2, total * 0.035))
    const shown = Math.floor(total * p)
    let left = shown
    ctx.textBaseline = 'alphabetic'
    fit.lines.forEach((ln, i) => {
      const part = ln.slice(0, Math.max(0, left))
      left -= ln.length + 1
      ctx.font = font(MONO, fit.size, 700)
      const yy = y + 62 + i * fit.size * 1.2
      if (part) {
        ctx.fillStyle = YELLOW
        ctx.fillText(part, W / 2, yy)
      }
      const isCursorLine = p > 0 && (left < 0 || i === fit.lines.length - 1) && left + ln.length + 1 >= 0
      if (isCursorLine && Math.floor(t * 3) % 2 === 0 && p > 0) {
        const fullW = ctx.measureText(ln).width
        const partW = ctx.measureText(part).width
        ctx.fillStyle = YELLOW
        ctx.fillRect(W / 2 - fullW / 2 + partW + 6, yy - fit.size * 0.8, fit.size * 0.5, fit.size * 0.9)
      }
    })
    y += 62 + (fit.lines.length - 1) * fit.size * 1.2
  }

  // Sello · año · BPM
  if (data.meta) {
    const p = prog(t, titleStart + (lines.length + 2) * beat, titleStart + (lines.length + 3) * beat)
    if (p > 0) {
      ctx.globalAlpha = 0.75 * p * textFade
      ctx.font = font(MONO, 28, 400)
      ctx.fillStyle = PAPER
      ctx.textBaseline = 'alphabetic'
      spacedText(ctx, data.meta.toUpperCase(), W / 2, y + 54, 3)
    }
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'start'

  // ----- Sello circular con BPM (gira), sobre la esquina de la funda -----
  {
    const t0 = titleStart + lines.length * beat
    const p = prog(t, t0, t0 + 0.22)
    if (p > 0 && t < endT + 0.3) {
      const s = (1 + 0.8 * (1 - easeOut(p))) * (1 + 0.03 * kick)
      ctx.save()
      ctx.globalAlpha = p * (1 - prog(t, endT, endT + 0.3))
      ctx.translate(SLEEVE_X + 40, SLEEVE_Y + SLEEVE - 30)
      ctx.rotate(-0.18)
      ctx.scale(s, s)
      const ring = es ? '• BREAKBEAT • OPTIMAL BREAKS • ESCÚCHALO ' : '• BREAKBEAT • OPTIMAL BREAKS • LISTEN NOW '
      drawBadge(ctx, 0, 0, 118, t * 0.9, ring, data.bpm ? String(Math.round(bpm)) : 'OB', data.bpm ? 'BPM' : 'BREAKS')
      ctx.restore()
    }
  }

  // ----- Ecualizador con picos -----
  if (t >= 2.8) {
    const a = prog(t, 2.8, 3.3)
    if (a > 0) {
      const bars = 30
      const bw = 22
      const gap = (880 - bars * bw) / (bars - 1)
      const bi = Math.floor(beatsIn)
      const env = Math.exp(-beatPhase / (beat * 0.55))
      ctx.globalAlpha = a
      for (let i = 0; i < bars; i++) {
        const center = 1 - Math.abs(i - (bars - 1) / 2) / (bars / 2)
        const hgt = 6 + 30 * (0.25 + 0.75 * hash(i, bi)) * (0.35 + 0.65 * env) * (0.45 + 0.55 * center)
        const peak = 6 + 30 * (0.25 + 0.75 * hash(i, bi)) * (0.45 + 0.55 * center)
        const x = 100 + i * (bw + gap)
        // segmentos tipo LED
        for (let yy = 0; yy < hgt; yy += 8) {
          ctx.fillStyle = yy > 24 ? RED : i % 4 === 0 ? RED : YELLOW
          ctx.fillRect(x, EQ_BASE - yy - 6, bw, 6)
        }
        ctx.fillStyle = PAPER
        ctx.fillRect(x, EQ_BASE - peak - 10, bw, 3)
      }
      ctx.globalAlpha = 1
    }
  }

  // ----- Aviso «LINK IN BIO» (en la franja reservada) -----
  {
    const t0 = titleStart + (lines.length + 3) * beat + 0.2
    const p = prog(t, t0, t0 + 0.25)
    if (p > 0) {
      const cy = (LINK_HINT_ZONE.top + LINK_HINT_ZONE.bottom) / 2
      const s = (1 + 0.6 * (1 - easeOut(p))) * (1 + 0.02 * kick)
      ctx.save()
      ctx.globalAlpha = p
      ctx.translate(W / 2, cy)
      ctx.rotate((2 * Math.PI) / 180)
      ctx.scale(s, s)
      const big = 'LINK IN BIO'
      const small = 'OPTIMALBREAKS.COM'
      ctx.font = font(HEAD, 44)
      const bw = ctx.measureText(big).width
      const iconW = 70
      const boxW = bw + iconW + 70
      const boxH = 116
      ctx.fillStyle = RED
      ctx.fillRect(-boxW / 2 + 10, -boxH / 2 + 10, boxW, boxH)
      ctx.fillStyle = INK
      ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH)
      ctx.strokeStyle = YELLOW
      ctx.lineWidth = 5
      ctx.strokeRect(-boxW / 2 + 8, -boxH / 2 + 8, boxW - 16, boxH - 16)
      // icono de eslabón (cadena)
      const ix = -boxW / 2 + 32 + iconW / 2
      ctx.save()
      ctx.translate(ix, -2)
      ctx.rotate(-Math.PI / 4)
      ctx.strokeStyle = YELLOW
      ctx.lineWidth = 7
      const link = (ox: number) => {
        ctx.beginPath()
        const rw = 34
        const rh = 20
        const r = 10
        const x = ox - rw / 2
        const y = -rh / 2
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + rw, y, x + rw, y + rh, r)
        ctx.arcTo(x + rw, y + rh, x, y + rh, r)
        ctx.arcTo(x, y + rh, x, y, r)
        ctx.arcTo(x, y, x + rw, y, r)
        ctx.stroke()
      }
      link(-12)
      link(12)
      ctx.restore()
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      const tx = -boxW / 2 + 32 + iconW + 8
      ctx.fillStyle = PAPER
      ctx.fillText(big, tx, -14)
      ctx.font = font(MONO, 22, 700)
      ctx.fillStyle = YELLOW
      let x = tx + 2
      for (const ch of small) {
        ctx.fillText(ch, x, 28)
        x += ctx.measureText(ch).width + 3
      }
      ctx.textAlign = 'start'
      ctx.restore()
    }
  }

  // Cinta inferior (marquesina, sentido contrario)
  drawTicker(
    ctx,
    TICKER_BOTTOM_Y,
    0.03,
    `${data.artists ? data.artists.toUpperCase() : 'OPTIMAL BREAKS'}  •  ${data.title.toUpperCase()}`,
    RED,
    PAPER,
    -t * 140,
    prog(t, 2.8, 3.3),
  )

  // ----- Sello final: «ESCÚCHALO» con salpicadura de tinta -----
  {
    const p = prog(t, endT, endT + 0.28)
    if (p > 0) {
      const s = 1 + 0.9 * (1 - easeOut(p))
      ctx.save()
      ctx.translate(W / 2, 1215)
      drawSplatter(ctx, 0, 30, 500, 9, 'rgba(214,40,40,0.9)', prog(t, endT + 0.15, endT + 0.4))
      ctx.globalAlpha = p
      ctx.rotate((-5 * Math.PI) / 180)
      ctx.scale(s, s)
      const big = es ? 'ESCÚCHALO' : 'LISTEN NOW'
      ctx.font = font(HEAD, 96)
      const bw = Math.min(900, ctx.measureText(big).width)
      ctx.fillStyle = INK
      ctx.fillRect(-bw / 2 - 34 + 14, -78 + 14, bw + 68, 156)
      ctx.fillStyle = YELLOW
      ctx.fillRect(-bw / 2 - 34, -78, bw + 68, 156)
      ctx.strokeStyle = INK
      ctx.lineWidth = 6
      ctx.strokeRect(-bw / 2 - 22, -66, bw + 44, 132)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = RED
      ctx.fillText(big, 5, 6, 900)
      ctx.fillStyle = INK
      ctx.fillText(big, 0, 2, 900)
      ctx.restore()
      const p2 = prog(t, endT + 0.4, endT + 0.7)
      if (p2 > 0) {
        ctx.save()
        ctx.globalAlpha = p2
        ctx.textBaseline = 'middle'
        ctx.font = font(MONO, 32, 700)
        ctx.fillStyle = PAPER
        spacedText(ctx, 'OPTIMALBREAKS.COM', W / 2, 1335 - (1 - easeOut(p2)) * 20, 6)
        ctx.restore()
      }
    }
  }

  ctx.restore() // fin golpe de cámara

  // Flash blanco al caer el sello final
  {
    const f = prog(t, endT, endT + 0.12)
    if (f > 0 && f < 1) {
      ctx.globalAlpha = 0.35 * (1 - f)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }
  }

  // ----- Glitch de franjas cada 8 golpes -----
  if (pulsing && Math.floor(beatsIn) % 8 === 7 && beatPhase > beat * 0.5 && beatPhase < beat * 0.5 + 0.1) {
    const seed = Math.floor(beatsIn)
    for (let k = 0; k < 6; k++) {
      const sy = Math.floor(hash(seed, k) * (H - 120))
      const sh = 20 + Math.floor(hash(k, seed) * 90)
      const dx = (hash(seed + k, 3) - 0.5) * 60
      ctx.drawImage(ctx.canvas, 0, sy, W, sh, dx, sy, W, sh)
    }
  }

  // Grano de papel
  ctx.save()
  ctx.globalAlpha = 0.07
  ctx.globalCompositeOperation = 'overlay'
  const pat = ctx.createPattern(assets.grain, 'repeat')!
  ctx.translate(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256))
  ctx.fillStyle = pat
  ctx.fillRect(-256, -256, W + 512, H + 512)
  ctx.restore()

  // Marco papel (como la Story) + barra roja
  ctx.strokeStyle = PAPER
  ctx.lineWidth = 36
  ctx.strokeRect(0, 0, W, H)
  ctx.fillStyle = RED
  ctx.fillRect(0, 0, W * easeOut(prog(t, 0, 0.45)), 14)
}

/**
 * Fondo pre-horneado una sola vez (carátula difuminada + semitono + viñeta):
 * por fotograma solo se copia una imagen, clave para renderizar rápido en móvil.
 */
function makeBackground(art: HTMLImageElement | null, dots: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const o = out.getContext('2d')!
  o.fillStyle = INK
  o.fillRect(0, 0, W, H)
  if (art) paintBlurredArt(o, art)
  o.globalAlpha = 0.5
  o.fillStyle = o.createPattern(dots, 'repeat')!
  o.fillRect(0, 0, W, H)
  o.globalAlpha = 1
  const vg = o.createRadialGradient(W / 2, H * 0.42, 300, W / 2, H * 0.5, 1150)
  vg.addColorStop(0, 'rgba(26,26,26,0)')
  vg.addColorStop(1, 'rgba(10,10,10,0.85)')
  o.fillStyle = vg
  o.fillRect(0, 0, W, H)
  return out
}

function paintBlurredArt(o: CanvasRenderingContext2D, art: HTMLImageElement) {
  // Desenfoque barato y compatible con Safari: reducir mucho y volver a escalar.
  const tiny = document.createElement('canvas')
  tiny.width = 27
  tiny.height = 48
  const g = tiny.getContext('2d')!
  const s = Math.max(27 / art.width, 48 / art.height)
  g.drawImage(art, (27 - art.width * s) / 2, (48 - art.height * s) / 2, art.width * s, art.height * s)
  const mid = document.createElement('canvas')
  mid.width = 135
  mid.height = 240
  const m = mid.getContext('2d')!
  m.imageSmoothingQuality = 'high'
  m.drawImage(tiny, 0, 0, 135, 240)
  o.imageSmoothingQuality = 'high'
  o.drawImage(mid, 0, 0, W, H)
  o.fillStyle = 'rgba(16,16,16,0.58)'
  o.fillRect(0, 0, W, H)
}

function makeDots(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 24
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(0,0,0,0.55)'
  g.beginPath()
  g.arc(6, 6, 3.4, 0, Math.PI * 2)
  g.arc(18, 18, 3.4, 0, Math.PI * 2)
  g.fill()
  return c
}

async function prepare(data: ReelData): Promise<Assets> {
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.all([
      document.fonts.load(font(HEAD, 60)),
      document.fonts.load(font(MONO, 30, 700)),
      document.fonts.load(font(MONO, 30, 400)),
    ]).catch(() => undefined)
  }
  let art: HTMLImageElement | null = null
  if (data.artwork) art = await loadImage(data.artwork).catch(() => null)
  const dots = makeDots()
  return { art, grain: makeGrain(), bg: makeBackground(art, dots) }
}

const AVC_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']

async function pickEncoderConfig(fps: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null
  const candidates: VideoEncoderConfig[] = [
    ...AVC_CODECS.map((codec) => ({
      codec,
      width: W,
      height: H,
      bitrate: 8_000_000,
      framerate: fps,
      avc: { format: 'avc' as const },
    })),
    // Solo para entornos sin H.264 (p. ej. Chromium de pruebas): VP9 en MP4.
    { codec: 'vp09.00.40.08', width: W, height: H, bitrate: 8_000_000, framerate: fps },
  ]
  for (const cfg of candidates) {
    try {
      const r = await VideoEncoder.isConfigSupported(cfg)
      if (r.supported) return cfg
    } catch {
      /* siguiente */
    }
  }
  return null
}

/** Renderiza el reel completo y devuelve el vídeo. */
export async function renderReel(data: ReelData, opts: ReelOptions = {}): Promise<ReelResult> {
  const fps = opts.fps ?? 30
  const durationSec = opts.durationSec ?? 15
  const total = Math.round(durationSec * fps)
  const assets = await prepare(data)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!

  const cfg = await pickEncoderConfig(fps)
  if (cfg) {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: cfg.codec.startsWith('avc') ? 'avc' : 'vp9', width: W, height: H, frameRate: fps },
      fastStart: 'in-memory',
    })
    let failure: unknown = null
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        failure = e
      },
    })
    encoder.configure(cfg)
    for (let i = 0; i < total; i++) {
      if (failure) throw failure
      drawReelFrame(ctx, i / fps, data, assets, durationSec)
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) })
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
      frame.close()
      while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 4))
      if (i % 10 === 0) {
        opts.onProgress?.(i / total)
        await new Promise((r) => setTimeout(r, 0)) // deja respirar a la UI
      }
    }
    await encoder.flush()
    encoder.close()
    if (failure) throw failure
    muxer.finalize()
    opts.onProgress?.(1)
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), mime: 'video/mp4', ext: 'mp4' }
  }

  // ----- Plan B: MediaRecorder (tiempo real) -----
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(
    (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
  )
  if (!mime) throw new Error('Este navegador no puede generar vídeo')
  const stream = canvas.captureStream(fps)
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  rec.start(250)
  const t0 = performance.now()
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      if (t >= durationSec) return resolve()
      drawReelFrame(ctx, t, data, assets, durationSec)
      opts.onProgress?.(t / durationSec)
      requestAnimationFrame(tick)
    }
    tick()
  })
  rec.stop()
  await done
  const type = mime.split(';')[0]
  return { blob: new Blob(chunks, { type }), mime: type, ext: type === 'video/mp4' ? 'mp4' : 'webm' }
}
