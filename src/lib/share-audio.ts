// ============================================
// OPTIMAL BREAKS — Audio de los vídeos de compartir (IG / R / F)
//
// Descarga y decodifica el audio del tema (preview de Beatport/Bandcamp o el
// audio completo alojado por OB, siempre por URL del mismo origen: ver
// `shareAudioSrc` en /api/og/story), propone el tramo con más energía y
// recuerda por tema el fragmento elegido en el selector (`AudioSegmentPicker`),
// para que la Story, el reel y el vídeo de Facebook usen el mismo.
// ============================================

/** Duración del fragmento que se elige en el selector (y de los vídeos). */
export const SHARE_SEGMENT_SEC = 30

/** Frecuencia a la que se decodifica (y se codifica en AAC). */
export const SHARE_AUDIO_RATE = 44100

const FADE_IN_SEC = 0.12
const FADE_OUT_SEC = 1.2

/**
 * Audio decodificado + fragmento elegido: lo que necesita el renderizador.
 * `ctx`: AudioContext creado y desbloqueado DENTRO del toque en «Generar».
 * iOS deja mudo (suspendido) cualquier AudioContext creado después, y la
 * grabación en tiempo real (`MediaRecorder`) depende de él.
 */
export type ShareAudioSegment = { buffer: AudioBuffer; start: number; ctx?: AudioContext | null }

/** Crea y desbloquea un AudioContext: llamar de forma SÍNCRONA en el gesto del usuario. */
export function unlockAudioContext(): AudioContext | null {
  try {
    const ctx = new AudioContext()
    void ctx.resume()
    // iOS: reproducir un buffer vacío dentro del gesto termina de desbloquearlo.
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    src.connect(ctx.destination)
    src.start(0)
    return ctx
  } catch {
    return null
  }
}

/**
 * ¿El vídeo generado suena? Solo `no` cuando el navegador abre la pista y está
 * en silencio. Si no sabe abrir el MP4 (muchos `decodeAudioData` rechazan un
 * vídeo con imagen), `unknown`: no es prueba de que falte el audio.
 */
export async function videoHasAudibleAudio(blob: Blob): Promise<'yes' | 'no' | 'unknown'> {
  try {
    const ctx = new OfflineAudioContext(1, 1, SHARE_AUDIO_RATE)
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (buf.duration < 1 || buf.length < 1) return 'no'
    let peak = 0
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < d.length; i += 32) {
        const v = Math.abs(d[i])
        if (v > peak) peak = v
      }
    }
    return peak > 0.01 ? 'yes' : 'no'
  } catch {
    return 'unknown'
  }
}

const decoded = new Map<string, Promise<AudioBuffer>>()

/** Descarga y decodifica una vez por URL (el selector y los 3 botones la comparten). */
export function loadShareAudio(url: string): Promise<AudioBuffer> {
  let p = decoded.get(url)
  if (!p) {
    p = (async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`audio ${res.status}`)
      const bytes = await res.arrayBuffer()
      // OfflineAudioContext: decodifica sin gesto del usuario y remuestrea a 44,1 kHz.
      const ctx = new OfflineAudioContext(2, 1, SHARE_AUDIO_RATE)
      return await ctx.decodeAudioData(bytes)
    })()
    p.catch(() => decoded.delete(url))
    decoded.set(url, p)
  }
  return p
}

/** Picos por columna (0..1) para dibujar la onda. */
export function computePeaks(buffer: AudioBuffer, columns: number): Float32Array {
  const out = new Float32Array(columns)
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const per = Math.max(1, Math.floor(buffer.length / columns))
  let max = 0
  for (let i = 0; i < columns; i++) {
    const from = i * per
    const to = Math.min(buffer.length, from + per)
    let peak = 0
    // Paso de 8 muestras: sobra para la vista y es 8× más rápido.
    for (let j = from; j < to; j += 8) {
      for (const ch of chans) {
        const v = Math.abs(ch[j])
        if (v > peak) peak = v
      }
    }
    out[i] = peak
    if (peak > max) max = peak
  }
  if (max > 0) for (let i = 0; i < columns; i++) out[i] /= max
  return out
}

/** Último arranque posible para que quepa un fragmento de `dur` segundos. */
export function maxSegmentStart(buffer: AudioBuffer, dur = SHARE_SEGMENT_SEC): number {
  return Math.max(0, buffer.duration - dur)
}

/**
 * Arranque sugerido: la ventana de `dur` s con más energía (RMS por bloques
 * de 0,25 s). En breakbeat suele caer en el drop.
 */
export function suggestSegmentStart(buffer: AudioBuffer, dur = SHARE_SEGMENT_SEC): number {
  const sr = buffer.sampleRate
  const block = Math.round(sr * 0.25)
  const blocks = Math.floor(buffer.length / block)
  const win = Math.round(dur / 0.25)
  if (blocks <= win) return 0
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const energy = new Float64Array(blocks)
  for (let b = 0; b < blocks; b++) {
    let sum = 0
    const from = b * block
    for (let j = from; j < from + block; j += 4) {
      for (const ch of chans) sum += ch[j] * ch[j]
    }
    energy[b] = sum
  }
  let acc = 0
  for (let b = 0; b < win; b++) acc += energy[b]
  let best = acc
  let bestAt = 0
  for (let b = win; b < blocks; b++) {
    acc += energy[b] - energy[b - win]
    if (acc > best) {
      best = acc
      bestAt = b - win + 1
    }
  }
  return Math.min(bestAt * 0.25, maxSegmentStart(buffer, dur))
}

/**
 * Muestras estéreo del fragmento, de `durationSec` (la duración del VÍDEO:
 * si es más largo que el fragmento, el audio llega hasta el final). Si no cabe desde
 * `start`, el arranque retrocede; si el audio entero es más corto, el resto
 * va en silencio. Fundido corto de entrada y de salida.
 */
export function segmentChannels(buffer: AudioBuffer, start: number, durationSec: number): Float32Array[] {
  const sr = buffer.sampleRate
  const n = Math.round(durationSec * sr)
  const from = Math.round(Math.max(0, Math.min(start, buffer.duration - durationSec)) * sr)
  const out: Float32Array[] = []
  for (let c = 0; c < 2; c++) {
    const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1))
    const ch = new Float32Array(n)
    ch.set(src.subarray(from, Math.min(src.length, from + n)))
    out.push(ch)
  }
  const real = Math.min(n, buffer.length - from)
  const fadeIn = Math.min(real, Math.round(FADE_IN_SEC * sr))
  const fadeOut = Math.min(real, Math.round(FADE_OUT_SEC * sr))
  for (const ch of out) {
    for (let i = 0; i < fadeIn; i++) ch[i] *= i / fadeIn
    for (let i = 0; i < fadeOut; i++) ch[real - 1 - i] *= i / fadeOut
  }
  return out
}

/**
 * Pega varios fragmentos ya elegidos en un solo audio, cada uno en su segundo
 * `at`. El codificador de R/F solo admite un buffer: esto es ese buffer.
 * El `ctx` que se conserva es el del último toque (el de «Generar»), el mismo
 * que usa el resto de vídeos si hay que grabar en tiempo real.
 */
export function stitchShareSegments(
  totalSec: number,
  slots: { at: number; seconds: number }[],
  segments: (ShareAudioSegment | null)[],
): ShareAudioSegment | null {
  const first = segments.find((s): s is ShareAudioSegment => !!s?.buffer)
  if (!first || !(totalSec > 0)) return null
  const sr = first.buffer.sampleRate
  const length = Math.max(1, Math.round(totalSec * sr))
  const master = new OfflineAudioContext(2, 1, sr).createBuffer(2, length, sr)
  const fadeInN = Math.round(0.05 * sr)
  const fadeOutN = Math.round(0.12 * sr)
  slots.forEach((slot, i) => {
    const seg = segments[i]
    if (!seg?.buffer) return
    const srcSr = seg.buffer.sampleRate
    const from = Math.round(Math.max(0, seg.start) * srcSr)
    const n = Math.round(slot.seconds * sr)
    const at = Math.round(Math.max(0, slot.at) * sr)
    for (let c = 0; c < 2; c++) {
      const src = seg.buffer.getChannelData(Math.min(c, seg.buffer.numberOfChannels - 1))
      const dst = master.getChannelData(c)
      const len = Math.min(n, Math.max(0, dst.length - at))
      for (let j = 0; j < len; j++) {
        const si = srcSr === sr ? from + j : from + Math.floor((j * srcSr) / sr)
        if (si < 0 || si >= src.length) continue
        let g = 1
        if (j < fadeInN) g *= j / Math.max(1, fadeInN)
        const tail = len - 1 - j
        if (tail < fadeOutN) g *= tail / Math.max(1, fadeOutN)
        dst[at + j] = src[si] * g
      }
    }
  })
  const ctx = [...segments].reverse().find((s) => s?.ctx)?.ctx ?? null
  segments.forEach((s) => {
    if (s?.ctx && s.ctx !== ctx) void s.ctx.close().catch(() => undefined)
  })
  return { buffer: master, start: 0, ctx }
}

function floatToI16(x: number): number {
  const s = x < -1 ? -1 : x > 1 ? 1 : x
  return s < 0 ? Math.round(s * 32768) : Math.round(s * 32767)
}

/**
 * WAV PCM del fragmento (estéreo 16 bit). Lo reproduce un `<audio>`, no Web
 * Audio: en el iPhone el Web Audio queda mudo con el interruptor de silencio
 * y un segundo AudioContext no arranca. El diálogo está en primer plano, así
 * que el `blob:` lo sirve la página mientras eligen (no es el cambio de pista
 * con la pantalla bloqueada).
 */
export function segmentToWavBlob(buffer: AudioBuffer, start: number, dur: number): Blob {
  const channels = segmentChannels(buffer, start, dur)
  const sr = buffer.sampleRate || SHARE_AUDIO_RATE
  const n = channels[0]?.length ?? 0
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  const pcm = new Int16Array(Math.max(1, n) * 2)
  const left = channels[0]
  const right = channels[1] ?? left
  for (let i = 0; i < n; i++) {
    pcm[i * 2] = floatToI16(left[i] ?? 0)
    pcm[i * 2 + 1] = floatToI16(right?.[i] ?? 0)
  }
  const dataSize = pcm.byteLength
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 2, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 4, true)
  v.setUint16(32, 4, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, dataSize, true)
  return new Blob([header, pcm], { type: 'audio/wav' })
}

// ---------- fragmento recordado por tema ----------

const STORE_PREFIX = 'ob.shareSegment.'
const memory = new Map<string, number>()

/** Arranque guardado para este tema (`play=`), o null si aún no se eligió. */
export function getSavedSegmentStart(key: string): number | null {
  if (memory.has(key)) return memory.get(key)!
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + key)
    const v = raw == null ? NaN : Number(raw)
    return Number.isFinite(v) && v >= 0 ? v : null
  } catch {
    return null
  }
}

function rememberLocal(key: string, v: number) {
  memory.set(key, v)
  try {
    window.localStorage.setItem(STORE_PREFIX + key, String(v))
  } catch {
    /* sin almacenamiento: queda en memoria mientras dure la página */
  }
}

/**
 * Trae de la web los arranques guardados (`/api/admin/share-segment`) y
 * pisan los del navegador: el iPhone y el PC usan el mismo trozo. Si falla
 * (sin sesión de admin, sin red), se queda lo de este navegador.
 */
export async function loadRemoteSegmentStarts(keys: string[]): Promise<void> {
  const list = [...new Set(keys.filter(Boolean))]
  if (!list.length) return
  try {
    const res = await fetch(`/api/admin/share-segment?keys=${list.map(encodeURIComponent).join(',')}`, { cache: 'no-store' })
    if (!res.ok) return
    const { starts } = (await res.json()) as { starts?: Record<string, number> }
    for (const [k, v] of Object.entries(starts ?? {})) {
      if (Number.isFinite(v) && v >= 0) rememberLocal(k, v)
    }
  } catch {
    /* sin red: vale lo de este navegador */
  }
}

export function saveSegmentStart(key: string, start: number) {
  const v = Math.round(start * 100) / 100
  rememberLocal(key, v)
  void fetch('/api/admin/share-segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, start: v }),
  }).catch(() => undefined)
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
