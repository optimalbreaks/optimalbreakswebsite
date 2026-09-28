// ============================================
// OPTIMAL BREAKS — Elementos de audio compartidos + desbloqueo en el gesto
// ----------------------------------------------
// Problema (iOS Safari / PWA sobre todo): el motor del reproductor
// (DeckAudioProvider) se carga con import() dinámico al pulsar play. Cuando
// por fin llamaba a `audio.play()` / `AudioContext.resume()` ya habían pasado
// cientos de ms (o segundos en 4G) desde el toque y el navegador lo trataba
// como autoplay: NotAllowedError en previews (salía «Toca para escuchar»),
// deck mudo (AudioContext suspendido) y mixes que no arrancaban.
//
// Solución: los <audio> y el AudioContext viven aquí, a nivel de módulo
// (fuera de React). Los hooks "gated" los arrancan SÍNCRONAMENTE dentro del
// click, y el motor, al cargar, adopta esos mismos elementos ya desbloqueados.
// Un elemento que ya ha sonado dentro de un gesto puede cambiar de `src` y
// volver a `play()` después sin gesto (así funciona el auto-avance de pista).
// ============================================

import { DECK_TRACKS } from '@/lib/deck-tracks'

type DeckSide = 'A' | 'B'

let previewEl: HTMLAudioElement | null = null
let mixEl: HTMLAudioElement | null = null
const deckEls: Partial<Record<DeckSide, HTMLAudioElement>> = {}
const deckGains: Partial<Record<DeckSide, GainNode>> = {}
let audioCtx: AudioContext | null = null
let deckInitial: { a: number; b: number } | null = null

function canUseAudio(): boolean {
  return typeof window !== 'undefined' && typeof Audio !== 'undefined'
}

/** <audio> único del reproductor de previews (charts, Top 10, Mis Tracks…). */
export function getSharedPreviewAudio(): HTMLAudioElement {
  if (!previewEl) {
    previewEl = new Audio()
    previewEl.preload = 'auto'
  }
  return previewEl
}

/** <audio> único de los mixes MP3 (exclusivas / mixes alojados). */
export function getSharedMixAudio(): HTMLAudioElement {
  if (!mixEl) {
    mixEl = new Audio()
    mixEl.preload = 'auto'
  }
  return mixEl
}

/** AudioContext único (el deck enruta su audio por aquí para el crossfader). */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      audioCtx = new Ctor()
    } catch {
      return null
    }
  }
  return audioCtx
}

/** Pistas iniciales del deck (aleatorias, pero las MISMAS para la UI previa y el motor). */
export function getInitialDeckIndexes(): { a: number; b: number } {
  if (!deckInitial) {
    const len = DECK_TRACKS.length
    const a = Math.floor(Math.random() * len)
    const b = len > 1 ? (a + 1) % len : a
    deckInitial = { a, b }
  }
  return deckInitial
}

/** <audio> de un lado del deck. `crossOrigin` antes de asignar src (Web Audio). */
export function getSharedDeckAudio(side: DeckSide): HTMLAudioElement {
  let el = deckEls[side]
  if (!el) {
    el = new Audio()
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    deckEls[side] = el
  }
  return el
}

/**
 * Conecta el <audio> del deck al AudioContext a través de un GainNode (una
 * sola vez por elemento: `createMediaElementSource` lanza si se repite).
 */
export function connectDeckAudio(side: DeckSide): GainNode | null {
  if (deckGains[side]) return deckGains[side]!
  const ctx = getSharedAudioContext()
  if (!ctx) return null
  try {
    const source = ctx.createMediaElementSource(getSharedDeckAudio(side))
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(ctx.destination)
    deckGains[side] = gain
    return gain
  } catch {
    return null
  }
}

// ─── Llamar SOLO dentro de un handler de click/tap ───────────────────────

/**
 * Asigna `src` a un `<audio>` de precarga solo si cambia. Vive fuera del
 * componente para que el compilador de React no trate la escritura de
 * `.src` como una mutación de un valor guardado en un ref.
 */
export function assignAudioSrc(audio: HTMLAudioElement, src: string): void {
  if (audio.getAttribute('src') === src) return
  audio.src = src
  try { audio.load() } catch { /* no-op */ }
}

/** Arranca el preview en el mismo gesto; el motor lo adopta al cargar. */
export function primePreviewInGesture(src: string | null | undefined): void {
  if (!canUseAudio() || !src) return
  const a = getSharedPreviewAudio()
  try {
    if (a.getAttribute('src') !== src) a.src = src
    void a.play().catch(() => { /* el motor reintenta / muestra overlay */ })
  } catch { /* no-op */ }
}

/** Arranca un mix MP3 en el mismo gesto (SoundCloud va por iframe: no aplica). */
export function primeMixInGesture(src: string | null | undefined): void {
  if (!canUseAudio() || !src) return
  const a = getSharedMixAudio()
  try {
    if (a.getAttribute('src') !== src) a.src = src
    void a.play().catch(() => { /* no-op */ })
  } catch { /* no-op */ }
}

/** Crea/reanuda el AudioContext y arranca el <audio> del lado pulsado. */
export function primeDeckInGesture(side: DeckSide, play: boolean): void {
  if (!canUseAudio()) return
  const ctx = getSharedAudioContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {})
  const { a, b } = getInitialDeckIndexes()
  const el = getSharedDeckAudio(side)
  try {
    if (!el.getAttribute('src')) el.src = DECK_TRACKS[side === 'A' ? a : b].file
    if (play) void el.play().catch(() => {})
  } catch { /* no-op */ }
}
