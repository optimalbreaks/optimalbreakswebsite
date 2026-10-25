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
import { playerDiag } from '@/lib/player-diag'

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

/**
 * Pausa los elementos compartidos al abandonar el documento (refresco, cierre).
 * Sin esto el `<audio>` creado con `new Audio()` —no está en el DOM— puede
 * seguir sonando en la página nueva, ya sin barra.
 * No quita el `src`: quien restaura la sesión lo reutiliza si sigue siendo el mismo.
 */
export function pauseSharedPlayback(): void {
  for (const el of [previewEl, mixEl, deckEls.A, deckEls.B]) {
    try { el?.pause() } catch { /* no-op */ }
  }
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

// ─── Siguiente pista en memoria (Blob) ──────────────────────────────────
//
// Android (Chrome y PWA) con la pantalla bloqueada: mientras el <audio>
// suena, Chrome mantiene un servicio en primer plano y la red del proceso
// viva. En cuanto la pista ACABA ese servicio cae y el SO (Doze, ahorro de
// batería de Samsung / Xiaomi / Huawei…) congela la red. El `play()` de la
// siguiente pista arranca pero se queda esperando bytes que no llegan: la
// lista «no engancha» hasta que el usuario desbloquea (oct 2026, varios
// usuarios Android; en iOS pasa menos pero también). Un `<audio muted
// preload="auto">` oculto no lo evita: Chrome móvil lo degrada a `metadata`
// en datos móviles y la caché HTTP no sirve 206 parciales al <audio>.
//
// Solución: mientras suena la pista N se baja ENTERA la N+1 con fetch() y
// se guarda como Blob. Al llegar `ended`, el src pasa a ser `blob:` y el
// `play()` no toca la red. Si el prefetch no llegó, se usa la URL como antes.
// Todas las URLs de preview son same-origin (/api/audio-proxy,
// /api/bandcamp-preview, /api/audio/<slug>.mp3), así que fetch() las ve.
//
// SOLO fuera de iOS / Safari (25 oct 2026, PWA iPhone de Narciso: «se acaba
// una canción y no pasa a la siguiente»). En iOS la reproducción de una URL
// la hace un proceso del sistema (AVFoundation) que sigue vivo con la
// pantalla bloqueada —por eso allí el problema era leve—, pero un `blob:` lo
// tiene que servir la PÁGINA, y iOS la suspende al bloquear: el siguiente
// tema no arrancaba nunca. Android es lo contrario: la página sigue viva y
// lo que se congela es la red. Cada plataforma usa el camino que le funciona.

let iosDeviceCached: boolean | null = null
let blobPrefetchAllowed: boolean | null = null

/** iPhone, iPad (también con UA de escritorio) o iPod, en cualquier navegador: todos son WebKit. */
export function isIosDevice(): boolean {
  if (iosDeviceCached !== null) return iosDeviceCached
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  iosDeviceCached =
    /iP(hone|ad|od)/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
  return iosDeviceCached
}

/** Android / Chrome / Firefox / Edge → sí. iPhone, iPad y Safari → no. */
export function blobPrefetchSupported(): boolean {
  if (blobPrefetchAllowed !== null) return blobPrefetchAllowed
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const safariDesktop = /AppleWebKit/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua)
  blobPrefetchAllowed = !isIosDevice() && !safariDesktop
  return blobPrefetchAllowed
}

/** Tope del archivo en memoria. Samples 2-5 MB; exclusivas enteras 6-8 MB. */
const PREFETCH_MAX_BYTES = 24 * 1024 * 1024
const PREFETCH_RETRY_MS = 20_000
const PREFETCH_MAX_ATTEMPTS = 3

/** blob: → URL original. Permite comparar «¿ya suena esta pista?» con la URL de la cola. */
const blobOrigin = new Map<string, string>()
let prefetched: { src: string; url: string } | null = null
let inflight: { src: string; ctl: AbortController } | null = null
const prefetchFailures = new Map<string, { attempts: number; nextAt: number }>()
let onPrefetchReady: ((src: string, url: string) => void) | null = null

/**
 * Aviso de «ya está en memoria». El motor lo usa cuando la pista acabó ANTES
 * de que la siguiente terminara de bajar (red lenta): la carga por URL puede
 * quedarse sin bytes con la pantalla bloqueada; al llegar el blob se cambia
 * a él sobre la marcha si el tema aún no ha arrancado.
 */
export function setPrefetchReadyListener(cb: ((src: string, url: string) => void) | null): void {
  onPrefetchReady = cb
}

function revokeBlob(url: string): void {
  blobOrigin.delete(url)
  try { URL.revokeObjectURL(url) } catch { /* no-op */ }
}

/** URL real detrás del `src` del <audio>: si es un blob del prefetch, la de la cola. */
export function previewSrcOrigin(attr: string | null): string | null {
  if (!attr) return null
  return blobOrigin.get(attr) ?? attr
}

export function isPrefetchedBlobSrc(attr: string | null): boolean {
  return !!attr && blobOrigin.has(attr)
}

/** Baja la pista en segundo plano. Idempotente: no repite si ya está o está bajando. */
export function prefetchPreviewTrack(src: string | null | undefined): void {
  if (!canUseAudio() || !src) return
  if (!blobPrefetchSupported()) return
  if (typeof fetch !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  if (prefetched?.src === src || inflight?.src === src) return
  const fail = prefetchFailures.get(src)
  if (fail && (fail.attempts >= PREFETCH_MAX_ATTEMPTS || Date.now() < fail.nextAt)) return
  // Solo guardamos UNA «siguiente»: la anterior (otra pista) sobra.
  if (inflight) { inflight.ctl.abort(); inflight = null }
  if (prefetched) { revokeBlob(prefetched.url); prefetched = null }

  const ctl = new AbortController()
  inflight = { src, ctl }
  const startedAt = Date.now()
  playerDiag('prefetch_start', { attempt: (fail?.attempts ?? 0) + 1 })
  void (async () => {
    try {
      const res = await fetch(src, { signal: ctl.signal, credentials: 'same-origin' })
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const type = (res.headers.get('content-type') || '').toLowerCase()
      if (type && !type.startsWith('audio/') && !type.includes('octet-stream') && !type.includes('mpeg')) {
        throw new Error(`type ${type}`)
      }
      const len = Number.parseInt(res.headers.get('content-length') || '', 10)
      if (Number.isFinite(len) && len > PREFETCH_MAX_BYTES) throw new Error('too large')
      const raw = await res.blob()
      if (raw.size === 0 || raw.size > PREFETCH_MAX_BYTES) throw new Error(`size ${raw.size}`)
      if (inflight?.ctl !== ctl) return // mientras bajaba se pidió otra pista
      const blob = raw.type ? raw : new Blob([raw], { type: 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      blobOrigin.set(url, src)
      prefetched = { src, url }
      prefetchFailures.delete(src)
      playerDiag('prefetch_ok', { kb: Math.round(blob.size / 1024), ms: Date.now() - startedAt })
      try { onPrefetchReady?.(src, url) } catch { /* no-op */ }
    } catch (err) {
      if (ctl.signal.aborted) return
      playerDiag('prefetch_fail', {
        ms: Date.now() - startedAt,
        why: err instanceof Error ? err.message.slice(0, 80) : 'error',
      })
      const prev = prefetchFailures.get(src)
      prefetchFailures.set(src, {
        attempts: (prev?.attempts ?? 0) + 1,
        nextAt: Date.now() + PREFETCH_RETRY_MS,
      })
    } finally {
      if (inflight?.ctl === ctl) inflight = null
    }
  })()
}

/**
 * Si la pista ya está en memoria devuelve su `blob:` y deja de ser «la
 * siguiente» (pasa a ser la que suena; la libera `releasePreviewBlob`).
 * Si no, `null`: el <audio> la carga por URL. Una descarga en curso de ESA
 * misma pista se deja terminar: si la carga por URL se queda sin bytes
 * (red congelada), `setPrefetchReadyListener` cambia al blob al llegar.
 */
export function takePrefetchedPreview(src: string): string | null {
  if (prefetched?.src !== src) return null
  const url = prefetched.url
  prefetched = null
  return url
}

/** Libera el blob que ya no suena (cambio de pista, stop). Ignora URLs normales. */
export function releasePreviewBlob(attr: string | null | undefined): void {
  if (attr && blobOrigin.has(attr)) revokeBlob(attr)
}

/** Stop del reproductor: aborta la descarga y suelta la «siguiente». */
export function clearPreviewPrefetch(): void {
  if (inflight) { inflight.ctl.abort(); inflight = null }
  if (prefetched) { revokeBlob(prefetched.url); prefetched = null }
  prefetchFailures.clear()
}

/**
 * Camino de iOS / Safari (sin blob): `<audio>` oculto que precalienta la
 * caché HTTP con la siguiente pista. Asigna `src` solo si cambia. Vive fuera
 * del componente para que el compilador de React no trate la escritura de
 * `.src` como una mutación de un valor guardado en un ref.
 */
export function assignAudioSrc(audio: HTMLAudioElement, src: string): void {
  if (audio.getAttribute('src') === src) return
  audio.src = src
  try { audio.load() } catch { /* no-op */ }
}

// ─── Llamar SOLO dentro de un handler de click/tap ───────────────────────

/** Arranca el preview en el mismo gesto; el motor lo adopta al cargar. */
export function primePreviewInGesture(src: string | null | undefined): void {
  if (!canUseAudio() || !src) return
  const a = getSharedPreviewAudio()
  try {
    // Si ya suena esa misma pista (quizá desde su `blob:`), no la reinicies.
    if (previewSrcOrigin(a.getAttribute('src')) !== src) a.src = src
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
