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
export const SHARE_SEGMENT_SEC = 15

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
 * si es más largo que 15 s, el audio llega hasta el final). Si no cabe desde
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

export function saveSegmentStart(key: string, start: number) {
  const v = Math.round(start * 100) / 100
  memory.set(key, v)
  try {
    window.localStorage.setItem(STORE_PREFIX + key, String(v))
  } catch {
    /* sin almacenamiento: queda en memoria mientras dure la página */
  }
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
