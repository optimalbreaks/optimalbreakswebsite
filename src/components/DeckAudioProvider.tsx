// ============================================
// OPTIMAL BREAKS — Global deck audio (persists across routes)
// Supports two modes: 'deck' (DJ deck tracks) and 'mix' (SoundCloud / MP3)
// ============================================

'use client'

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { DeckAudioContext } from '@/components/deck-audio-context'
import { DECK_TRACKS, type DeckTrack } from '@/lib/deck-tracks'
import { AUDIO_SESSION_KEY } from '@/lib/audio-engine-pending'
import { useViewportBottomOffset } from '@/hooks/useViewportBottomOffset'
import type { Locale } from '@/lib/i18n-config'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SoundCloudWidget, { type SoundCloudWidgetHandle } from '@/components/SoundCloudWidget'
import { canonicalKeyFromTrackPlaySave } from '@/lib/track-canonical-key'
import { logTrackPlay } from '@/lib/track-play-log'
// Coordinador "una sola fuente audible": los YouTube embebidos (vinilos,
// /mixes, Mis Tracks…) y este reproductor global se excluyen mutuamente.
import {
  broadcastPlaybackClaim,
  getActiveYouTubePlayId,
  registerGlobalPlaybackStopper,
  stopAllYouTube,
} from '@/lib/youtube-play-coordinator'
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton from '@/components/TrackShareButton'
import type { ChartTrackSource } from '@/hooks/useUserData'
import type { SavedChartTrackSnapshot } from '@/types/database'
import type { TrackStoryMeta } from '@/lib/share-track'

export interface DeckDict {
  play: string
  stop: string
  deck_brand: string
  deck_model: string
  mixer: string
  bpm: string
  crossfader: string
}

export type PlayerMode = 'idle' | 'deck' | 'mix' | 'preview'

export interface MixTrack {
  id: string
  title: string
  artist: string
  imageUrl?: string | null
  source: 'mp3' | 'soundcloud'
  src: string
}

/**
 * Datos que el productor de la cola adjunta a cada `PreviewTrack` para que
 * el botón "+/✓" del MiniPreviewBar (añadir/quitar de Mis Tracks) sepa
 * sobre qué fila de qué tabla operar. Reproduce las dos variantes que
 * acepta `<SaveTrackButton>`:
 *  - `mode: 'ref'`  → tracks con fila propia en `chart_tracks` /
 *    `chart_featured_tracks` / `chart_vinyl_tracks` (y también las del
 *    propio `saved_chart_tracks` cuando ya están guardadas, p.ej.
 *    `beatport_top` con id estable).
 *  - `mode: 'url'`  → tracks de Beatport Top 10 que solo viven como
 *    JSONB en la respuesta API; el save se deduplica por URL canónica.
 *
 * Cuando `save` no está presente, el botón simplemente no se renderiza
 * (p.ej. el deck o las pistas del DJ que no tienen ficha guardable).
 */
export type PreviewSaveData =
  | {
      mode: 'ref'
      source: ChartTrackSource
      trackId: string
      relatedRefs?: Array<{ source: ChartTrackSource; id: string }>
      relatedIds?: string[]
      canonicalUrl?: string | null
      snapshot?: SavedChartTrackSnapshot | null
    }
  | {
      mode: 'url'
      externalUrl: string
      externalTrackId?: string
      canonicalUrl?: string | null
      snapshot?: SavedChartTrackSnapshot | null
    }

/**
 * Datos opcionales para pintar el botón "🔗 compartir" dentro del mini
 * reproductor, junto al "+/✓" de Mis Tracks. Reflejan los tres modos de
 * `<TrackShareButton>` para que el productor de la cola (ChartView,
 * BeatportTopTracks, TracksSection, CommunityMonthlyTop…) pase exactamente
 * la misma URL canónica que pasa el botón de la fila origen:
 *
 *  - `mode: 'chart'`  → enlace a `/[lang]/charts?week=&play=chart|featured:<id>`.
 *  - `mode: 'path'`   → path relativo ya construido (Beatport Top de
 *                       artista/sello, Retro Vinyl Picks, etc.).
 *  - `mode: 'url'`    → URL absoluta externa (último recurso, p.ej.
 *                       Beatport Top compartido sin contexto OB interno).
 *
 * Si `share` no está presente, el slot del compartir simplemente no se
 * renderiza (p.ej. el deck o las pistas del DJ que no son piezas
 * compartibles individualmente).
 */
export type PreviewShareData =
  | {
      mode: 'chart'
      source: 'chart' | 'featured'
      trackId: string
      weekDate?: string | null
    }
  | { mode: 'path'; path: string; storyMeta?: TrackStoryMeta }
  | { mode: 'url'; externalUrl: string; storyMeta?: TrackStoryMeta }

/**
 * Track del reproductor global de previews (Beatport/Bandcamp de charts,
 * Top 10 de artistas/sellos, Mis Tracks…). El provider mantiene la cola
 * entre navegaciones para que la reproducción siga sonando aunque el
 * componente que originó la cola ya no esté montado en la ruta activa.
 *
 *   - `rowKey`: identidad estable de la fila origen (consumidor la usa
 *     para marcarla como "reproduciéndose" cuando la página la está mostrando).
 *   - `src`:    URL de audio ya proxyficada si hace falta.
 *   - `domId`:  id del DOM dentro de la página origen para hacer
 *               `scrollIntoView` desde la barra global (si la página
 *               actual no lo contiene, no-op silencioso).
 *   - `originPath`: ruta interna (con lang y query, sin hash) de la LISTA
 *               donde el usuario arrancó la cola (p. ej.
 *               `/es/charts?week=2026-08-17`, `/es/top100`,
 *               `/es/mi-cuenta/tracks`, ficha de artista…). El click en el
 *               título del MiniPreviewBar navega a `originPath#domId` cuando
 *               la fila no está en la ruta actual, sin tocar la reproducción.
 *   - `save`:   datos opcionales para pintar el botón "Añadir a Mis
 *               Tracks" en la barra del reproductor; ver `PreviewSaveData`.
 */
export interface PreviewTrack {
  rowKey: string
  src: string
  title: string
  artist: string
  artworkUrl?: string | null
  domId?: string
  originPath?: string
  save?: PreviewSaveData
  /** Datos opcionales para pintar "🔗 compartir" en el mini reproductor.
   *  El productor pasa la misma URL canónica que renderiza en la fila origen
   *  (`<TrackShareButton>`) para que el usuario pueda compartir lo que está
   *  sonando sin tener que volver a la lista. */
  share?: PreviewShareData
}

export interface PreviewAudioApi {
  previewMode: 'idle' | 'active'
  previewQueue: PreviewTrack[]
  previewIndex: number
  previewPlaying: boolean
  previewProgress: number
  previewDuration: number
  previewGroupKey: string | null
  /** true cuando `audio.play()` falló por NotAllowedError (autoplay bloqueado
   *  por el navegador tras un deep-link). La UI usa esto para pintar el
   *  overlay "Toca para escuchar" y recuperar con un gesto del usuario. */
  previewBlocked: boolean
  playPreviewQueue: (items: PreviewTrack[], startIndex?: number, groupKey?: string) => void
  togglePreview: () => void
  stopPreview: () => void
  previewNext: () => void
  previewPrev: () => void
  seekPreviewToRatio: (ratio: number) => void
}

export interface DeckSideState {
  trackIdx: number
  progress: number
  duration: number
  playing: boolean
}

interface DeckAudioContextValue {
  dict: DeckDict
  isPlaying: boolean
  crossfader: number
  setCrossfader: (v: number) => void
  currentTrack: number
  progress: number
  duration: number
  scratchingLeft: boolean
  scratchingRight: boolean
  leftRotation: number
  rightRotation: number
  sessionActive: boolean
  initAudio: () => void
  togglePlay: () => void
  switchTrack: (direction: 1 | -1) => void
  seekToRatio: (ratio: number) => void
  handleScratchStart: (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => void
  handleScratchMove: (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => void
  handleScratchEnd: () => void
  track: DeckTrack
  fmt: (s: number) => string
  // Dual-deck extensions
  deckA: DeckSideState
  deckB: DeckSideState
  activeSide: 'A' | 'B'
  trackA: DeckTrack
  trackB: DeckTrack
  switchTrackOnSide: (side: 'A' | 'B', direction: 1 | -1) => void
  togglePlaySide: (side: 'A' | 'B') => void
  // Mix player extensions
  mode: PlayerMode
  currentMix: MixTrack | null
  mixPlaying: boolean
  mixProgress: number
  mixDuration: number
  playMix: (mix: MixTrack) => void
  toggleMixPlayback: () => void
  stopMix: () => void
  seekMixToRatio: (ratio: number) => void
  // Preview player (chart/beatport-top/my-tracks) — persiste entre rutas
  previewQueue: PreviewTrack[]
  previewIndex: number
  previewPlaying: boolean
  previewProgress: number
  previewDuration: number
  previewGroupKey: string | null
  previewBlocked: boolean
  playPreviewQueue: (items: PreviewTrack[], startIndex?: number, groupKey?: string) => void
  togglePreview: () => void
  stopPreview: () => void
  previewNext: () => void
  previewPrev: () => void
  seekPreviewToRatio: (ratio: number) => void
}

export type DeckAudioShellBind = {
  value: DeckAudioContextValue
  wrapperPb?: string
  overlays: ReactNode
}

export function useDeckAudio() {
  const ctx = useContext(DeckAudioContext) as DeckAudioContextValue | null
  if (!ctx) throw new Error('useDeckAudio must be used within DeckAudioProvider')
  return ctx
}

/** null si el motor de audio aún no se ha cargado (LazyDeckAudioProvider). */
export function useDeckAudioMaybe(): DeckAudioContextValue | null {
  return useContext(DeckAudioContext) as DeckAudioContextValue | null
}

/** Para UI global (BackToTop) cuando el provider aún no ha cargado en rutas ligeras. */
export function useOptionalDeckAudio(): Pick<DeckAudioContextValue, 'sessionActive' | 'mode'> {
  const ctx = useContext(DeckAudioContext) as DeckAudioContextValue | null
  return {
    sessionActive: ctx?.sessionActive ?? false,
    mode: ctx?.mode ?? 'idle',
  }
}

/** Acceso tipado a la API del reproductor global de previews. Shortcut
 *  para consumidores (ChartView, BeatportTopTracks, TracksSection…) que
 *  solo necesitan esa porción del contexto. */
export function usePreviewAudio(): PreviewAudioApi {
  const ctx = useContext(DeckAudioContext) as DeckAudioContextValue | null
  if (!ctx) throw new Error('usePreviewAudio must be used within DeckAudioProvider')
  return {
    previewMode: ctx.previewQueue.length > 0 ? 'active' : 'idle',
    previewQueue: ctx.previewQueue,
    previewIndex: ctx.previewIndex,
    previewPlaying: ctx.previewPlaying,
    previewProgress: ctx.previewProgress,
    previewDuration: ctx.previewDuration,
    previewGroupKey: ctx.previewGroupKey,
    previewBlocked: ctx.previewBlocked,
    playPreviewQueue: ctx.playPreviewQueue,
    togglePreview: ctx.togglePreview,
    stopPreview: ctx.stopPreview,
    previewNext: ctx.previewNext,
    previewPrev: ctx.previewPrev,
    seekPreviewToRatio: ctx.seekPreviewToRatio,
  }
}

/** null si el motor de audio aún no se ha cargado (LazyDeckAudioProvider). */
export function usePreviewAudioMaybe(): PreviewAudioApi | null {
  const ctx = useContext(DeckAudioContext) as DeckAudioContextValue | null
  if (!ctx) return null
  return {
    previewMode: ctx.previewQueue.length > 0 ? 'active' : 'idle',
    previewQueue: ctx.previewQueue,
    previewIndex: ctx.previewIndex,
    previewPlaying: ctx.previewPlaying,
    previewProgress: ctx.previewProgress,
    previewDuration: ctx.previewDuration,
    previewGroupKey: ctx.previewGroupKey,
    previewBlocked: ctx.previewBlocked,
    playPreviewQueue: ctx.playPreviewQueue,
    togglePreview: ctx.togglePreview,
    stopPreview: ctx.stopPreview,
    previewNext: ctx.previewNext,
    previewPrev: ctx.previewPrev,
    seekPreviewToRatio: ctx.seekPreviewToRatio,
  }
}

export type AudioClaimSource =
  | 'deck'
  | 'mix'
  | 'preview'
  // Alias retrocompatibles: scripts externos / hooks antiguos pueden seguir
  // emitiendo estos `source` strings sin que nada se rompa. A efectos del
  // provider global todos se tratan como "preview".
  | 'chart-preview'
  | 'chart-playall'
  | 'beatport-top'
  | 'my-tracks'

export function claimAudio(source: AudioClaimSource) {
  // Avisa a otras pestañas/ventanas PWA (lockscreen, Safari + icono…) de que
  // este cliente pasa a ser la fuente de audio: los demás se silencian.
  broadcastPlaybackClaim()
  window.dispatchEvent(new CustomEvent('ob-audio-claim', { detail: { source } }))
}

/** El provider emite esto al mostrar/ocultar la barra fija de preview
 *  (chart / Top 10 / Mis Tracks) para que `BackToTop` suba el botón por
 *  encima. Se mantiene el nombre histórico (`ob-chart-playall-bar`) por
 *  retro-compatibilidad con consumidores antiguos. */
export const OB_CHART_PLAYALL_BAR_EVENT = 'ob-chart-playall-bar'

// ─── MiniDeckBar ────────────────────────────────────────
/**
 * Overlay que se pinta encima de la página cuando `audio.play()` falla con
 * NotAllowedError (política de autoplay) tras un deep-link compartido. Permite
 * arrancar la reproducción con un único tap del usuario. Se auto-cierra cuando
 * `previewBlocked` vuelve a false (togglePreview/ stopPreview lo limpian).
 */
function PreviewAutoplayOverlay({ lang }: { lang: Locale }) {
  const ctx = useDeckAudio()
  const { previewBlocked, previewQueue, previewIndex, togglePreview } = ctx
  const [artworkFailed, setArtworkFailed] = useState(false)
  const track = previewQueue[previewIndex]
  const artworkUrl = track?.artworkUrl || ''
  // Reset del fallback si cambia la pista actual; así un tema siguiente vuelve
  // a intentar cargar su portada en vez de mostrar para siempre el placeholder.
  useEffect(() => { setArtworkFailed(false) }, [artworkUrl])
  if (!previewBlocked || !track) return null
  const es = lang === 'es'
  const showArtwork = !!artworkUrl && !artworkFailed
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--ink)]/70 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-label={es ? 'Toca para escuchar el track' : 'Tap to play the track'}
    >
      <button
        type="button"
        onClick={togglePreview}
        className="flex items-center gap-3 sm:gap-4 bg-[var(--paper)] border-[4px] border-[var(--ink)] px-3 sm:px-5 py-3 sm:py-4 max-w-[520px] w-full hover:bg-[var(--yellow)] active:bg-[var(--yellow)] transition-colors cursor-pointer touch-manipulation text-left"
        style={{ fontFamily: "'Courier Prime', monospace" }}
      >
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] bg-[var(--paper-dark)] shrink-0 overflow-hidden">
          {showArtwork ? (
            // Sin `unoptimized`: Next proxy (/_next/image) evita el hotlink-block
            // que Beatport aplica a algunas URLs cuando se cargan con <img>
            // directo (403 / Referer). `onError` muestra el placeholder si el
            // dominio no está listado en `next.config.js` → remotePatterns.
            <Image
              src={artworkUrl}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
              onError={() => setArtworkFailed(true)}
            />
          ) : (
            <span
              className="absolute inset-0 flex items-center justify-center text-[var(--ink)]/50 text-xl font-black"
              aria-hidden
            >
              ♪
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] sm:text-xs font-black tracking-widest text-[var(--red)] mb-0.5 sm:mb-1">
            {es ? '▶ TOCA PARA ESCUCHAR' : '▶ TAP TO PLAY'}
          </div>
          <div
            className="text-sm sm:text-base font-black text-[var(--ink)] truncate leading-tight"
            style={{ fontFamily: "'Unbounded', sans-serif" }}
          >
            {track.title}
          </div>
          {track.artist && (
            <div className="text-[11px] sm:text-xs text-[var(--ink)]/70 truncate">{track.artist}</div>
          )}
        </div>
        <span
          className="shrink-0 inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 border-[3px] border-[var(--ink)] bg-[var(--red)] text-white text-lg font-black"
          aria-hidden
        >
          ▶
        </span>
      </button>
    </div>
  )
}

function MiniDeckBar({ lang }: { lang: Locale }) {
  const ctx = useDeckAudio()
  const { mode, sessionActive } = ctx
  const hasPreview = ctx.previewQueue.length > 0
  if (mode === 'idle' && !sessionActive && !hasPreview) return null

  // Prioridad: preview > mix > deck. Preview va primero porque es la acción
  // más reciente del usuario (click play en un track); deck se mantiene "en
  // segundo plano" y vuelve a la barra cuando se cierra la preview.
  if (hasPreview) return <MiniPreviewBar lang={lang} />
  if (mode === 'mix') return <MiniMixBar lang={lang} />
  if (sessionActive) return <MiniDeckBarInner lang={lang} />
  return null
}

/**
 * Cabecera común para las tres mini barras (Preview / Deck / Mix).
 *
 * En móvil, cuando el reproductor está pegado al fondo, tocar cerca del borde
 * superior del componente caía a menudo fuera (sobre enlaces de la página que
 * están justo detrás) y la barra de progreso finita también se cruzaba con
 * esos enlaces. Esta cabecera negra actúa como "colchón" visual y como zona
 * segura de click: identifica el reproductor, separa del contenido y deja
 * claro dónde empieza el player.
 */
function MiniBarHeader({ subtitle, live }: { subtitle: string; live?: boolean }) {
  return (
    <>
      <style>{`@keyframes obRadioBlink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }`}</style>
      <div
        className="flex items-center justify-between px-3 sm:px-4 bg-[var(--ink)] text-[var(--yellow)]"
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontSize: '9px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          height: 22,
          lineHeight: '22px',
        }}
        aria-hidden
      >
        <span className="inline-flex items-center gap-2">
          {live && (
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                background: 'var(--red)',
                animation: 'obRadioBlink 1s steps(1,end) infinite',
              }}
            />
          )}
          <span style={{ fontWeight: 700 }}>OPTIMAL BREAKS RADIO</span>
        </span>
        <span style={{ fontWeight: 700, opacity: 0.55 }}>{subtitle}</span>
      </div>
    </>
  )
}

// ─── Estilos compartidos de los mini-botones del reproductor ────────────
// Unificamos tamaños (antes unos eran w-9 y otros w-10) para que los tres
// reproductores se sientan iguales al tacto en móvil.
const MINI_BTN_BASE = 'w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center text-base sm:text-sm border-2 border-[var(--ink)] transition-colors touch-manipulation'
const MINI_BTN_GHOST = `${MINI_BTN_BASE} bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] disabled:opacity-25 disabled:cursor-not-allowed`
const MINI_BTN_PLAY = `${MINI_BTN_BASE} font-black bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white`
const MINI_BTN_PAUSE_YELLOW = `${MINI_BTN_BASE} font-black bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]`
const MINI_BTN_PAUSE_RED = `${MINI_BTN_BASE} font-black bg-[var(--red)] text-white hover:bg-[var(--ink)]`
const MINI_BTN_STOP_RED = `${MINI_BTN_BASE} font-black bg-[var(--red)] text-white hover:bg-[var(--ink)]`
const MINI_BTN_CLOSE = `${MINI_BTN_BASE} font-black bg-transparent text-[var(--ink)] hover:bg-[var(--red)] hover:text-white`

/**
 * Shell común para las tres mini-barras del reproductor global.
 *
 * Unifica el contenedor fixed, la safe-area, la cabecera "OPTIMAL BREAKS
 * RADIO", la barra de progreso seekable con hitbox ampliado y el layout
 * [controles] [título/artista] [tiempo + extra]. Cada barra concreta
 * (Preview / Deck / Mix) es un adapter diminuto que le pasa los datos del
 * contexto y los botones específicos como `controls`.
 */
function MiniPlayerShell({
  ariaLabel,
  subtitle,
  progress,
  duration,
  onSeekRatio,
  fmt,
  controls,
  title,
  subtitleBelow,
  onTitleClick,
  titleClickHint,
  counter,
  extraRight,
}: {
  ariaLabel: string
  subtitle: string
  progress: number
  duration: number
  onSeekRatio: (ratio: number) => void
  fmt: (s: number) => string
  controls: ReactNode
  title: string
  subtitleBelow?: ReactNode
  onTitleClick?: () => void
  titleClickHint?: string
  counter?: string
  extraRight?: ReactNode
}) {
  const pct = duration ? (progress / duration) * 100 : 0

  const rootRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  // Publica la altura real de la barra en `--ob-bottom-bar-h` (en <html>).
  // La consumen los botones flotantes (BackToTop, FAB de chat admin) para
  // colocarse justo encima sin constantes mágicas: la altura cambia entre
  // breakpoints (layout de dos filas en móvil) y con la safe-area.
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof document === 'undefined') return
    const sync = () =>
      document.documentElement.style.setProperty('--ob-bottom-bar-h', `${el.offsetHeight}px`)
    sync()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    ro?.observe(el)
    return () => {
      ro?.disconnect()
      document.documentElement.style.removeProperty('--ob-bottom-bar-h')
    }
  }, [])
  const draggingPointerId = useRef<number | null>(null)
  const moveListenerRef = useRef<((e: PointerEvent) => void) | null>(null)
  const upListenerRef = useRef<((e: PointerEvent) => void) | null>(null)

  // iOS PWA standalone: tras lock/unlock, orientación, foco perdido (Web
  // Share / volver de Facebook…) o cambio de barra del sistema, el
  // `visualViewport` puede desincronizarse con `position: fixed; bottom: 0`
  // y dejar la barra "flotando" en mitad de la pantalla. El hook compensa
  // con la diferencia entre `innerHeight` y `visualViewport.height + offsetTop`.
  // Además ignora mediciones transitorias con un overlay nativo encima
  // (share sheet abierto) y, mientras el offset sea > 0, re-mide en un
  // intervalo corto hasta volver a 0 — así la barra recupera el fondo
  // aunque iOS no emita ningún evento al cerrar la hoja de compartir.
  const vvOffset = useViewportBottomOffset()

  const seek = useCallback((clientX: number) => {
    if (!duration) return
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    onSeekRatio(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
  }, [duration, onSeekRatio])

  // Drag con listeners a nivel de `document`. Importante: NO usamos
  // `setPointerCapture` sobre el `<div>` de la barra porque el reproductor es
  // un overlay `position: fixed` que persiste entre rutas. Si la navegación
  // (Next.js Link → cambio de árbol) o un cambio de pestaña interrumpe el
  // gesto antes del `pointerup`, la captura quedaba viva y todos los clics
  // posteriores se enrutaban al seek bar — bloqueando el menú/footer hasta
  // refrescar. Con listeners en `document` no hay captura: si el gesto se
  // interrumpe, el efecto de limpieza (abajo) los desmonta y el resto de la
  // página vuelve a recibir clicks/taps con normalidad.
  const stopDragging = useCallback(() => {
    draggingPointerId.current = null
    if (moveListenerRef.current) {
      document.removeEventListener('pointermove', moveListenerRef.current)
      moveListenerRef.current = null
    }
    if (upListenerRef.current) {
      document.removeEventListener('pointerup', upListenerRef.current)
      document.removeEventListener('pointercancel', upListenerRef.current)
      upListenerRef.current = null
    }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Sólo botón principal del ratón; en touch/pen no hay `button`.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Si quedó algún listener de un gesto anterior (no debería), lo limpiamos.
    stopDragging()
    draggingPointerId.current = e.pointerId
    seek(e.clientX)

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== draggingPointerId.current) return
      seek(ev.clientX)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== draggingPointerId.current) return
      stopDragging()
    }
    moveListenerRef.current = onMove
    upListenerRef.current = onUp
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }, [seek, stopDragging])

  // Red de seguridad: si la pestaña se oculta o el navegador anuncia
  // `pagehide` (p. ej. transición SPA agresiva en iOS), abortamos el drag.
  // Y al desmontar el shell, garantizamos cero listeners colgando.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stopDragging() }
    const onPageHide = () => stopDragging()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('blur', stopDragging)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('blur', stopDragging)
      stopDragging()
    }
  }, [stopDragging])

  const titleInner = (
    <>
      <p className="text-sm font-black text-[var(--ink)] truncate leading-snug" style={{ fontFamily: "'Unbounded', sans-serif" }}>
        {title || '—'}
      </p>
      {subtitleBelow ? (
        <p className="text-xs text-[var(--ink)]/60 truncate leading-snug mt-0.5">{subtitleBelow}</p>
      ) : null}
    </>
  )

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 z-[199] border-t-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[0_-4px_20px_rgba(0,0,0,.15)]"
      role="region"
      aria-label={ariaLabel}
      style={{
        fontFamily: "'Courier Prime', monospace",
        // `bottom` dinámico: en navegador normal y la mayoría de PWAs vale 0;
        // en iOS standalone tras lock/unlock compensamos el desfase del
        // `visualViewport` para que la barra siga pegada al borde visible
        // de la pantalla en lugar de quedar flotando a mitad de página.
        bottom: vvOffset ? `${vvOffset}px` : 0,
        // Safe area para el notch / home-bar iOS y la barra del navegador
        // móvil + 10px extra. En iPhones (sobre todo la home-bar) el
        // `safe-area-inset-bottom` por sí solo deja los botones de
        // transporte casi pegados al borde inferior visible; añadimos un
        // colchón fijo de 10px para que el play/pause y los ⏮ ⏭ no se
        // sientan recortados.
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        // Hint al compositor para evitar reflow del resto al desplazar el
        // bottom durante un resize del visual viewport.
        willChange: 'transform',
      }}
    >
      <MiniBarHeader subtitle={subtitle} live />
      {/* Hitbox vertical extendido para evitar clicks accidentales sobre
          enlaces de la página que quedan justo detrás de la barra fina.
          OJO: NO usamos `setPointerCapture` aquí — el drag se gestiona con
          listeners en `document` (ver `onPointerDown`/`stopDragging` arriba).
          Así, si una navegación (o un cambio de pestaña) interrumpe el
          gesto, no quedan eventos «secuestrados» a este overlay y los
          enlaces del menú/footer siguen respondiendo sin tener que
          refrescar la página. */}
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        className="group relative w-full cursor-pointer touch-manipulation select-none"
        style={{ touchAction: 'none', paddingTop: 10, paddingBottom: 6 }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="relative w-full h-2 sm:h-1.5 bg-[var(--ink)]/10">
          <div className="absolute inset-y-0 left-0 bg-[var(--red)]" style={{ width: `${pct}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 sm:w-3 sm:h-3 rounded-full bg-[var(--red)] border-2 border-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>

      {/* Móvil: dos filas (título a lo ancho / controles + tiempo). Antes los
          controles acotaban el título a ~42% y en pantallas estrechas (p. ej.
          el navegador in-app de Instagram al abrir un link compartido) el
          título quedaba truncado a 2-3 letras. En ≥sm vuelve a una sola fila:
          [controles] [título] [tiempo]. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:gap-3 px-3 sm:px-4 pt-1.5 pb-2.5 sm:py-2.5 max-w-4xl mx-auto">
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className="order-1 basis-full sm:order-2 sm:basis-0 sm:flex-1 min-w-0 overflow-hidden text-left cursor-pointer hover:opacity-70 active:opacity-50 transition-opacity"
            title={titleClickHint}
          >
            {titleInner}
          </button>
        ) : (
          <div className="order-1 basis-full sm:order-2 sm:basis-0 sm:flex-1 min-w-0 overflow-hidden">{titleInner}</div>
        )}

        <div className="order-2 sm:order-1 flex items-center gap-1.5 sm:gap-1 shrink-0 max-w-full overflow-x-auto overflow-y-hidden scrollbar-none">{controls}</div>

        <div className="order-3 shrink-0 flex items-center gap-2 ml-auto sm:ml-0">
          <div className="text-right">
            <span className="block text-xs text-[var(--ink)]/50 font-bold tabular-nums whitespace-nowrap">
              {fmt(progress)} / {duration ? fmt(duration) : '—'}
            </span>
            {counter ? (
              <span className="block text-[10px] sm:text-[9px] text-[var(--ink)]/35 font-bold tabular-nums">
                {counter}
              </span>
            ) : null}
          </div>
          {extraRight}
        </div>
      </div>
    </div>
  )
}

/**
 * Botón "+/✓" para añadir/quitar la pista actualmente sonando de "Mis
 * Tracks" sin tener que volver a la fila de la lista. Lo renderizamos
 * dentro del `MiniPreviewBar` cuando el productor de la cola adjuntó
 * `save` al `PreviewTrack`. Reutiliza exactamente el mismo
 * `SaveTrackButton` (tamaño `sm`, redondo blanco/verde) que aparece en
 * cada fila de los charts, Mis Tracks y los Top 10, así que el estado
 * (verde/blanco) está sincronizado con el resto de la UI vía
 * `useSavedChartTracks()`.
 */
function PreviewSaveSlot({
  save,
  lang,
  size = 'lg',
}: {
  save?: PreviewSaveData
  lang: Locale
  size?: 'sm' | 'lg'
}) {
  if (!save) return null
  if (save.mode === 'url') {
    return (
      <SaveTrackButton
        externalUrl={save.externalUrl}
        externalTrackId={save.externalTrackId}
        canonicalUrl={save.canonicalUrl ?? null}
        snapshot={save.snapshot ?? null}
        lang={lang}
        size={size}
      />
    )
  }
  return (
    <SaveTrackButton
      source={save.source}
      trackId={save.trackId}
      relatedRefs={save.relatedRefs}
      relatedIds={save.relatedIds}
      canonicalUrl={save.canonicalUrl ?? null}
      snapshot={save.snapshot ?? null}
      lang={lang}
      size={size}
    />
  )
}

/**
 * Botón "🔗" para compartir la canción que está sonando ahora mismo desde
 * el mini reproductor. Reutiliza exactamente el mismo `<TrackShareButton>`
 * que pinta cada fila de los charts / Mis Tracks / Top 10, así que el
 * enlace que copia/comparte es idéntico al de la lista origen.
 *
 * Necesario porque la barra del reproductor persiste entre rutas: el
 * usuario puede haber empezado a sonar un tema en una página y, al
 * navegar, ya no tiene la fila a mano para compartirlo. Con esto el
 * "🔗" viaja con la canción.
 */
function PreviewShareSlot({
  share,
  title,
  artist,
  lang,
  size = 'lg',
}: {
  share?: PreviewShareData
  title: string
  artist: string
  lang: Locale
  size?: 'sm' | 'lg'
}) {
  if (!share) return null
  const shareTitle = artist ? `${title} — ${artist}` : title
  if (share.mode === 'chart') {
    return (
      <TrackShareButton
        source={share.source}
        trackId={share.trackId}
        weekDate={share.weekDate ?? ''}
        lang={lang}
        shareTitle={shareTitle}
        size={size}
      />
    )
  }
  if (share.mode === 'path') {
    return (
      <TrackShareButton
        path={share.path}
        lang={lang}
        shareTitle={shareTitle}
        size={size}
        storyMeta={share.storyMeta}
      />
    )
  }
  return (
    <TrackShareButton
      externalUrl={share.externalUrl}
      lang={lang}
      shareTitle={shareTitle}
      size={size}
      storyMeta={share.storyMeta}
    />
  )
}

// ─── Adapter: Preview (charts / Top 10 / Mis Tracks) ─────────────────────

/** Scroll suave + destello amarillo sobre la fila origen del tema sonando. */
function highlightPreviewRow(el: HTMLElement) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('!bg-[var(--yellow)]/25')
  setTimeout(() => el.classList.remove('!bg-[var(--yellow)]/25'), 1500)
}

function MiniPreviewBar({ lang }: { lang: Locale }) {
  const {
    previewQueue, previewIndex, previewPlaying,
    previewProgress, previewDuration,
    togglePreview, stopPreview, previewNext, previewPrev,
    seekPreviewToRatio, fmt,
  } = useDeckAudio()
  const router = useRouter()
  const es = lang === 'es'
  const cur = previewQueue[previewIndex]

  // Reintentos de scroll tras navegar al origen: la lista destino puede
  // tardar en montarse (fetch en cliente del Top 100, acordeón de /charts
  // expandiéndose, paginación de Mis Tracks…). Un click nuevo cancela el
  // bucle anterior.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
  }, [])

  const retryScrollToRow = useCallback((id: string) => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    const tryScroll = (attempt: number) => {
      const el = document.getElementById(id)
      if (el) { highlightPreviewRow(el); return }
      if (attempt >= 40) return
      retryTimerRef.current = setTimeout(() => tryScroll(attempt + 1), 250)
    }
    tryScroll(0)
  }, [])

  // Click en el título de la barra = "llévame al origen de esta canción".
  // 1) Si la fila está montada en la página actual → scroll directo.
  // 2) Si no, navegamos a `originPath#domId` (la lista donde se arrancó la
  //    cola: semana de /charts, Top 100, Mis Tracks, ficha…). La navegación
  //    NO toca el <audio> global: la barra persiste y el tema sigue sonando.
  //    Las páginas con acordeón/paginación escuchan el hash y expanden lo
  //    necesario; este bucle de reintentos hace el scroll cuando la fila
  //    por fin existe.
  // Nota: este callback va ANTES del early-return para no romper el orden
  // de hooks entre renders (en la versión previa estaba después y era un
  // bug latente).
  const goToCurrentRow = useCallback(() => {
    if (!cur || typeof document === 'undefined') return
    const id = cur.domId
    const origin = cur.originPath
    const originPathname = origin ? origin.split(/[?#]/)[0] : null
    // El atajo "la fila ya está en el DOM" solo vale si estamos en la página
    // de origen (o si el track no declara origen, comportamiento histórico).
    // Algunos domId se repiten entre páginas (p. ej. `bp-row-3` existe en
    // TODAS las fichas con Top 10 de Beatport): sin este guard, mirando la
    // ficha C mientras suena el Top 10 de la ficha B, el click haría scroll
    // a la fila equivocada en vez de navegar al origen real.
    const onOriginPage = !originPathname || window.location.pathname === originPathname
    if (id && onOriginPage) {
      const el = document.getElementById(id)
      if (el) { highlightPreviewRow(el); return }
    }
    if (!origin) return
    if (window.location.pathname === originPathname) {
      // Misma ruta pero la fila no está montada (acordeón plegado, página
      // sin cargar…): publicar el hash dispara `hashchange` y la propia
      // página expande lo que haga falta.
      if (id) {
        if (window.location.hash === `#${id}`) {
          window.dispatchEvent(new HashChangeEvent('hashchange'))
        } else {
          window.location.hash = id
        }
      }
    } else {
      router.push(id ? `${origin}#${id}` : origin)
    }
    if (id) retryScrollToRow(id)
  }, [cur, router, retryScrollToRow])

  if (!cur) return null
  const canGoToRow = !!(cur.domId || cur.originPath)

  return (
    <MiniPlayerShell
      ariaLabel={es ? 'Reproductor de preview' : 'Preview player'}
      subtitle="PREVIEW"
      progress={previewProgress}
      duration={previewDuration}
      onSeekRatio={seekPreviewToRatio}
      fmt={fmt}
      title={cur.title || '—'}
      subtitleBelow={cur.artist || ''}
      onTitleClick={canGoToRow ? goToCurrentRow : undefined}
      titleClickHint={canGoToRow ? (es ? 'Ir a la canción en su lista' : 'Go to song in its list') : undefined}
      counter={`${previewIndex + 1} / ${previewQueue.length}`}
      controls={
        <>
          <button
            type="button"
            onClick={previewPrev}
            disabled={previewIndex === 0}
            className={MINI_BTN_GHOST}
            title={es ? 'Anterior' : 'Previous'}
            aria-label={es ? 'Anterior' : 'Previous'}
          >⏮</button>
          <button
            type="button"
            onClick={togglePreview}
            className={previewPlaying ? MINI_BTN_PAUSE_YELLOW : MINI_BTN_PLAY}
            title={previewPlaying ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}
            aria-label={previewPlaying ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}
          >{previewPlaying ? '❚❚' : '▶'}</button>
          <button
            type="button"
            onClick={stopPreview}
            className={MINI_BTN_STOP_RED}
            title={es ? 'Parar' : 'Stop'}
            aria-label={es ? 'Parar' : 'Stop'}
          >■</button>
          <button
            type="button"
            onClick={previewNext}
            disabled={previewIndex >= previewQueue.length - 1}
            className={MINI_BTN_GHOST}
            title={es ? 'Siguiente' : 'Next'}
            aria-label={es ? 'Siguiente' : 'Next'}
          >⏭</button>
          {/* Compartir + Mis Tracks junto al transporte: más visible en
              móvil que pegados al contador de tiempo. */}
          {(cur.share || cur.save) ? (
            <div
              className="flex items-center gap-1.5 ml-0.5 sm:ml-1 pl-1.5 sm:pl-2 border-l-2 border-[var(--ink)]/20 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <PreviewShareSlot
                share={cur.share}
                title={cur.title || ''}
                artist={cur.artist || ''}
                lang={lang}
              />
              <PreviewSaveSlot save={cur.save} lang={lang} />
            </div>
          ) : null}
        </>
      }
    />
  )
}

// ─── Adapter: DJ Deck (home, dual-deck A/B) ──────────────────────────────
function MiniDeckBarInner({ lang }: { lang: Locale }) {
  const { isPlaying, togglePlay, initAudio, switchTrack, track, progress, duration, fmt, seekToRatio } = useDeckAudio()
  const es = lang === 'es'

  return (
    <MiniPlayerShell
      ariaLabel={es ? 'Reproductor del deck' : 'Deck player'}
      subtitle="DECK"
      progress={progress}
      duration={duration}
      onSeekRatio={seekToRatio}
      fmt={fmt}
      title={track.title}
      subtitleBelow="OB DECK"
      extraRight={
        <Link
          href={`/${lang}#dj-deck`}
          className="hidden sm:inline-flex items-center justify-center px-2 py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] transition-colors no-underline touch-manipulation"
        >
          {es ? 'AL DECK' : 'FULL DECK'}
        </Link>
      }
      controls={
        <>
          <button
            type="button"
            onClick={() => { initAudio(); switchTrack(-1) }}
            className={MINI_BTN_GHOST}
            title={es ? 'Pista anterior' : 'Previous track'}
            aria-label={es ? 'Pista anterior' : 'Previous track'}
          >⏮</button>
          <button
            type="button"
            onClick={() => { initAudio(); togglePlay() }}
            className={isPlaying ? MINI_BTN_PAUSE_RED : MINI_BTN_PLAY}
            title={isPlaying ? 'Stop' : 'Play'}
            aria-label={isPlaying ? 'Stop' : 'Play'}
          >{isPlaying ? '■' : '▶'}</button>
          <button
            type="button"
            onClick={() => { initAudio(); switchTrack(1) }}
            className={MINI_BTN_GHOST}
            title={es ? 'Siguiente pista' : 'Next track'}
            aria-label={es ? 'Siguiente pista' : 'Next track'}
          >⏭</button>
        </>
      }
    />
  )
}

// ─── Adapter: Mix (SoundCloud / MP3 largos) ──────────────────────────────
function MiniMixBar({ lang }: { lang: Locale }) {
  const { currentMix, mixPlaying, mixProgress, mixDuration, toggleMixPlayback, stopMix, seekMixToRatio, fmt } = useDeckAudio()
  const es = lang === 'es'
  if (!currentMix) return null

  return (
    <MiniPlayerShell
      ariaLabel={es ? 'Reproductor de mix' : 'Mix player'}
      subtitle="MIX"
      progress={mixProgress}
      duration={mixDuration}
      onSeekRatio={seekMixToRatio}
      fmt={fmt}
      title={currentMix.title}
      subtitleBelow={
        <>
          {currentMix.artist}
          <span className="ml-1.5 text-[var(--ink)]/30">·</span>
          <span className="ml-1.5 text-[9px] font-bold tracking-wider uppercase text-[var(--ink)]/35">
            {currentMix.source === 'soundcloud' ? 'SoundCloud' : 'MP3'}
          </span>
        </>
      }
      controls={
        <>
          <button
            type="button"
            onClick={toggleMixPlayback}
            className={mixPlaying ? MINI_BTN_PAUSE_RED : MINI_BTN_PLAY}
            title={mixPlaying ? 'Pause' : 'Play'}
            aria-label={mixPlaying ? 'Pause' : 'Play'}
          >{mixPlaying ? '❚❚' : '▶'}</button>
          <button
            type="button"
            onClick={stopMix}
            className={MINI_BTN_CLOSE}
            title={es ? 'Cerrar' : 'Close'}
            aria-label={es ? 'Cerrar' : 'Close'}
          >✕</button>
        </>
      }
    />
  )
}

// ─── Provider ───────────────────────────────────────────
export function DeckAudioProvider({
  children,
  lang,
  dict,
  engineOnly,
  onBind,
}: {
  children?: ReactNode
  lang: Locale
  dict: DeckDict
  /** Monta solo el motor (sin envolver children) para LazyDeckAudioProvider. */
  engineOnly?: boolean
  onBind?: (bind: DeckAudioShellBind) => void
}) {
  // === Dual-deck audio refs ===
  const audioRefA = useRef<HTMLAudioElement | null>(null)
  const audioRefB = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const gainRefA = useRef<GainNode | null>(null)
  const gainRefB = useRef<GainNode | null>(null)
  const lastScratchTimeRef = useRef<number>(0)

  // Legacy single-track references (used by context consumers that rely on `track`)
  const audioRef = audioRefA

  const [isPlaying, setIsPlaying] = useState(false)
  const [sessionActive, setSessionActive] = useState(false)
  const [crossfader, setCrossfader] = useState(0) // 0=A, 100=B

  const [trackIdxA, setTrackIdxA] = useState(0)
  const [trackIdxB, setTrackIdxB] = useState(1)
  const trackIdxARef = useRef(0)
  const trackIdxBRef = useRef(1)

  const [currentTrack, setCurrentTrack] = useState(0) // legacy compat

  useEffect(() => {
    const a = Math.floor(Math.random() * DECK_TRACKS.length)
    let b = (a + 1) % DECK_TRACKS.length
    if (b === a) b = (a + 2) % DECK_TRACKS.length
    setTrackIdxA(a); trackIdxARef.current = a
    setTrackIdxB(b); trackIdxBRef.current = b
    setCurrentTrack(a)
  }, [])

  const [progressA, setProgressA] = useState(0)
  const [durationA, setDurationA] = useState(0)
  const [playingA, setPlayingA] = useState(false)
  const [progressB, setProgressB] = useState(0)
  const [durationB, setDurationB] = useState(0)
  const [playingB, setPlayingB] = useState(false)

  // Legacy compat
  const progress = crossfader < 50 ? progressA : progressB
  const duration = crossfader < 50 ? durationA : durationB

  const [scratchingLeft, setScratchingLeft] = useState(false)
  const [scratchingRight, setScratchingRight] = useState(false)
  const scratchStartY = useRef(0)
  const scratchStartTime = useRef(0)
  const brakeAnimRefA = useRef<number>(0)
  const brakeAnimRefB = useRef<number>(0)
  const [leftRotation, setLeftRotation] = useState(0)
  const [rightRotation, setRightRotation] = useState(0)
  const animFrameRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)

  // === Mix player state ===
  const [mode, setMode] = useState<PlayerMode>('idle')
  const [currentMix, setCurrentMix] = useState<MixTrack | null>(null)
  const [mixPlaying, setMixPlaying] = useState(false)
  const [mixProgress, setMixProgress] = useState(0)
  const [mixDuration, setMixDuration] = useState(0)
  const mixAudioRef = useRef<HTMLAudioElement | null>(null)
  const scHandleRef = useRef<SoundCloudWidgetHandle | null>(null)
  const [scTrackUrl, setScTrackUrl] = useState<string | null>(null)

  // === Preview player state (persiste entre rutas) ===
  const [previewQueue, setPreviewQueue] = useState<PreviewTrack[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewProgress, setPreviewProgress] = useState(0)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [previewGroupKey, setPreviewGroupKey] = useState<string | null>(null)
  // true cuando `audio.play()` fue rechazado por NotAllowedError (autoplay
  // bloqueado al aterrizar vía link compartido en pestaña nueva, sin gesto).
  // El overlay `PreviewAutoplayOverlay` lo lee para pedirle al usuario un tap.
  const [previewBlocked, setPreviewBlocked] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const previewRafRef = useRef(0)
  // Refs espejo de la cola y el índice para que los listeners del
  // <audio> (ended/error/timeupdate) tengan SIEMPRE el estado fresco
  // sin depender del closure capturado al añadir el listener. La PWA en
  // iOS, cuando llega `ended` mientras Next.js está en transición de
  // ruta, perdía la cadena con el patrón anterior (`setState` anidados +
  // setTimeout(0)) y se quedaba colgada.
  const previewQueueRef = useRef<PreviewTrack[]>([])
  const previewIndexRef = useRef(0)
  // Garantiza que `ended` + `error` + watchdog de fin no encadenen DOS
  // avances para la misma pista (idempotente por track). Se resetea en
  // cada `loadAndPlayPreviewAt`.
  const previewAdvancedRef = useRef(false)
  // Ref a la función `loadAndPlayPreviewAt` para que el listener `ended`
  // (registrado UNA sola vez al crear el <audio>) llame siempre a la
  // versión más reciente sin depender del closure inicial.
  const loadAndPlayRef = useRef<((q: PreviewTrack[], i: number) => void) | null>(null)
  // ── Robustez en segundo plano (pantalla bloqueada) ──
  // true cuando la pausa fue una decisión del USUARIO (botón, lockscreen…).
  // Si está a false y el audio aparece pausado, fue el SO/navegador quien
  // lo paró (pérdida de foco, throttling) y podemos auto-reanudar.
  const previewUserPausedRef = useRef(false)
  // true cuando detectamos una pausa NO pedida por el usuario mientras la
  // página estaba oculta (pantalla bloqueada / app en background).
  const previewSystemPausedRef = useRef(false)
  // true cuando otra app tomó el FOCO DE AUDIO del SO y nos pausó (WhatsApp,
  // una llamada, otro reproductor…). Como un reproductor de música de verdad,
  // NO peleamos por recuperar el sonido: nos quedamos en pausa y esperamos a
  // que el usuario pulse play. Se pone a true si el SO nos pausa cuando YA
  // estábamos en segundo plano (la canción sonaba, el usuario se fue, y
  // otra app reclama el altavoz). En móvil `play()` SÍ arranca y le quita
  // el audio a WhatsApp: no se puede usar «el reintento funcionó ⇒ era un
  // blip» como señal. El reintento ~1,5 s queda sólo para la pausa al IR
  // a background / lock (throttling del SO).
  const previewInterruptedRef = useRef(false)
  // Timestamp del último `visibilitychange` → hidden. Distingue «el SO
  // nos pausó al pasar a segundo plano» de «otra app nos cortó mientras
  // ya sonábamos en background».
  const previewHiddenAtRef = useRef(0)
  // Espejo de `previewBlocked` para los watchdogs (no pelear contra la
  // política de autoplay: ahí hace falta un gesto, no un reintento).
  const previewBlockedRef = useRef(false)
  // <audio> oculto que precarga la SIGUIENTE pista de la cola mientras
  // suena la actual. Así, al llegar el auto-avance con la pantalla
  // bloqueada, los datos ya están en la caché HTTP y el play() arranca
  // sin depender de una red throttleada por el SO.
  const previewPreloadRef = useRef<HTMLAudioElement | null>(null)
  // Watchdog de arranque de pista: si tras el auto-avance el audio no
  // empieza a sonar (red parada en background), reintenta unas veces y,
  // si no hay manera, salta a la siguiente.
  const previewStartWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewStartAttemptsRef = useRef(0)

  useEffect(() => { trackIdxARef.current = trackIdxA }, [trackIdxA])
  useEffect(() => { trackIdxBRef.current = trackIdxB }, [trackIdxB])

  useEffect(() => {
    try {
      if (sessionActive || mode !== 'idle' || previewQueue.length > 0) {
        sessionStorage.setItem(AUDIO_SESSION_KEY, '1')
      } else {
        sessionStorage.removeItem(AUDIO_SESSION_KEY)
      }
    } catch {
      /* sessionStorage no disponible */
    }
  }, [sessionActive, mode, previewQueue.length])

  // Helper to create and wire an audio element through a GainNode
  const createDeckAudio = useCallback((
    ref: React.MutableRefObject<HTMLAudioElement | null>,
    gainRef: React.MutableRefObject<GainNode | null>,
    file: string,
    onDuration: (d: number) => void,
    onEnded: () => void,
  ) => {
    if (ref.current) return
    const audio = new Audio(file)
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.addEventListener('loadedmetadata', () => onDuration(audio.duration))
    audio.addEventListener('ended', onEnded)
    ref.current = audio

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    const ctx = audioCtxRef.current
    const source = ctx.createMediaElementSource(audio)
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(ctx.destination)
    gainRef.current = gain
  }, [])

  const initAudio = useCallback(() => {
    createDeckAudio(
      audioRefA, gainRefA,
      DECK_TRACKS[trackIdxARef.current].file,
      (d) => setDurationA(d),
      () => {
        const next = (trackIdxARef.current + 1) % DECK_TRACKS.length
        trackIdxARef.current = next; setTrackIdxA(next)
        if (audioRefA.current) {
          audioRefA.current.src = DECK_TRACKS[next].file
          void audioRefA.current.play().catch(() => {})
        }
      },
    )

    createDeckAudio(
      audioRefB, gainRefB,
      DECK_TRACKS[trackIdxBRef.current].file,
      (d) => setDurationB(d),
      () => {
        const next = (trackIdxBRef.current + 1) % DECK_TRACKS.length
        trackIdxBRef.current = next; setTrackIdxB(next)
        if (audioRefB.current) {
          audioRefB.current.src = DECK_TRACKS[next].file
          void audioRefB.current.play().catch(() => {})
        }
      },
    )
  }, [createDeckAudio])

  // === Animation tick: update progress + platter rotation ===
  // OJO con la frecuencia de los `setState` de progreso: cada uno cambia el
  // valor del context (`useMemo` lo incluye en deps) y eso re-renderiza a
  // TODOS los consumidores de `useDeckAudio` (TracksSection, ChartView,
  // BeatportTopTracks, BackToTop…). En React 18 + App Router las
  // navegaciones de `next/link` viven dentro de una transición
  // interrumpible: si llegan `setState` de alta prioridad (como aquí, desde
  // un rAF a 60 fps) más rápido de lo que la transición tarda en commitear
  // el árbol nuevo, la transición se reinicia indefinidamente y la página
  // destino nunca aparece (síntoma reportado: "el menú no funciona, pulso
  // STOP y entonces carga la página"). Por eso el progreso se actualiza
  // throttled cada ~120 ms (≈8 fps, plenty para una barra fina) en lugar
  // de cada frame.
  const lastProgressFlushRef = useRef<{ A: number; B: number }>({ A: 0, B: 0 })
  const PROGRESS_FLUSH_MS = 120
  useEffect(() => {
    const tick = (time: number) => {
      if (!lastTickRef.current) lastTickRef.current = time
      const deltaMs = time - lastTickRef.current
      lastTickRef.current = time

      if (audioRefA.current && playingA && time - lastProgressFlushRef.current.A >= PROGRESS_FLUSH_MS) {
        lastProgressFlushRef.current.A = time
        setProgressA(audioRefA.current.currentTime)
      }
      if (audioRefB.current && playingB && time - lastProgressFlushRef.current.B >= PROGRESS_FLUSH_MS) {
        lastProgressFlushRef.current.B = time
        setProgressB(audioRefB.current.currentTime)
      }

      const rpm = 33.33
      const degreesPerSec = (rpm / 60) * 360
      const deltaDeg = degreesPerSec * (deltaMs / 1000)

      if (playingA && !scratchingLeft) setLeftRotation((r) => r + deltaDeg)
      if (playingB && !scratchingRight) setRightRotation((r) => r + deltaDeg)

      animFrameRef.current = requestAnimationFrame(tick)
    }
    lastTickRef.current = performance.now()
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [playingA, playingB, scratchingLeft, scratchingRight])

  // === Crossfader sharp cut: A at <=50, B at >=50 (at exactly 50 both are audible) ===
  useEffect(() => {
    const ctx = audioCtxRef.current
    const t = ctx?.currentTime ?? 0
    const fade = 0.03 // 30ms micro-fade to avoid click
    if (gainRefA.current) {
      gainRefA.current.gain.cancelScheduledValues(t)
      gainRefA.current.gain.setTargetAtTime(crossfader <= 50 ? 1 : 0, t, fade)
    }
    if (gainRefB.current) {
      gainRefB.current.gain.cancelScheduledValues(t)
      gainRefB.current.gain.setTargetAtTime(crossfader >= 50 ? 1 : 0, t, fade)
    }
  }, [crossfader])

  // Keep legacy `currentTrack` in sync with active side
  useEffect(() => {
    setCurrentTrack(crossfader < 50 ? trackIdxA : trackIdxB)
  }, [crossfader, trackIdxA, trackIdxB])

  // Toggle play for a specific side
  const togglePlaySide = useCallback((side: 'A' | 'B') => {
    initAudio()
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    if (mode === 'mix') stopMixInternal()
    setMode('deck')
    setSessionActive(true)

    if (side === 'A') {
      const audio = audioRefA.current
      if (!audio) return
      if (playingA) {
        setPlayingA(false)
        audio.pause()
      } else {
        claimAudio('deck')
        setPlayingA(true)
        audio.playbackRate = 1
        void audio.play().catch(() => {})
        if (playingB) setCrossfader(50)
        else setCrossfader(0)
      }
    } else {
      const audio = audioRefB.current
      if (!audio) return
      if (playingB) {
        setPlayingB(false)
        audio.pause()
      } else {
        claimAudio('deck')
        setPlayingB(true)
        audio.playbackRate = 1
        void audio.play().catch(() => {})
        if (playingA) setCrossfader(50)
        else setCrossfader(100)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initAudio, playingA, playingB, mode])

  // Legacy togglePlay = toggle the active side
  const togglePlay = useCallback(() => {
    togglePlaySide(crossfader < 50 ? 'A' : 'B')
  }, [togglePlaySide, crossfader])

  // isPlaying = whichever side is audible
  useEffect(() => {
    setIsPlaying((crossfader <= 50 && playingA) || (crossfader >= 50 && playingB))
  }, [crossfader, playingA, playingB])

  // === Scratch handlers (adapted for dual deck) ===
  const handleScratchStart = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => {
      const audio = side === 'left' ? audioRefA.current : audioRefB.current
      const sPlaying = side === 'left' ? playingA : playingB
      const brakeRef = side === 'left' ? brakeAnimRefA : brakeAnimRefB
      if (!audio || !sPlaying) return
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      scratchStartY.current = clientY
      scratchStartTime.current = audio.currentTime
      if (side === 'left') setScratchingLeft(true)
      else setScratchingRight(true)

      cancelAnimationFrame(brakeRef.current)
      let rate = audio.playbackRate
      const step = () => {
        rate = Math.max(0, rate - 0.1)
        audio.playbackRate = rate
        if (rate > 0) brakeRef.current = requestAnimationFrame(step)
      }
      step()
    },
    [playingA, playingB]
  )

  const handleScratchMove = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => {
      if ((side === 'left' && !scratchingLeft) || (side === 'right' && !scratchingRight)) return
      const audio = side === 'left' ? audioRefA.current : audioRefB.current
      if (!audio) return
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const delta = (scratchStartY.current - clientY) * 0.02

      if (Math.abs(delta) > 0.02 && audioCtxRef.current && audioCtxRef.current.state === 'running') {
        const ctx = audioCtxRef.current
        const now = ctx.currentTime
        if (now - lastScratchTimeRef.current > 0.1) {
          lastScratchTimeRef.current = now
          try {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            const filter = ctx.createBiquadFilter()

            osc.type = 'sawtooth'
            const startFreq = delta > 0 ? 800 : 300
            const endFreq = delta > 0 ? 300 : 800
            osc.frequency.setValueAtTime(startFreq, now)
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08)

            filter.type = 'bandpass'
            filter.frequency.value = 1500
            filter.Q.value = 1.5

            gain.gain.setValueAtTime(0, now)
            gain.gain.linearRampToValueAtTime(0.4, now + 0.01)
            gain.gain.linearRampToValueAtTime(0, now + 0.08)

            osc.connect(filter)
            filter.connect(gain)
            gain.connect(ctx.destination)

            osc.start(now)
            osc.stop(now + 0.08)
          } catch (err) {}
        }
      }

      const dur = audio.duration || (side === 'left' ? durationA : durationB)
      const newTime = Math.max(0, Math.min(scratchStartTime.current + delta, dur))
      audio.currentTime = newTime

      const rotDelta = (scratchStartY.current - clientY) * 2
      if (side === 'left') setLeftRotation((r) => r + rotDelta * 0.5)
      else setRightRotation((r) => r + rotDelta * 0.5)

      scratchStartY.current = clientY
      scratchStartTime.current = newTime
    },
    [scratchingLeft, scratchingRight, durationA, durationB]
  )

  const handleScratchEnd = useCallback(() => {
    const wasLeft = scratchingLeft
    const wasRight = scratchingRight
    setScratchingLeft(false)
    setScratchingRight(false)

    const audio = wasLeft ? audioRefA.current : wasRight ? audioRefB.current : null
    const sPlaying = wasLeft ? playingA : wasRight ? playingB : false
    const brakeRef = wasLeft ? brakeAnimRefA : brakeAnimRefB
    if (audio && sPlaying) {
      cancelAnimationFrame(brakeRef.current)
      let rate = audio.playbackRate
      const step = () => {
        rate = Math.min(1, rate + 0.1)
        audio.playbackRate = rate
        if (rate < 1) brakeRef.current = requestAnimationFrame(step)
      }
      step()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scratchingLeft, scratchingRight, playingA, playingB])

  // Switch track on a specific side
  const switchTrackOnSide = useCallback((side: 'A' | 'B', direction: 1 | -1) => {
    if (side === 'A') {
      const next = (trackIdxARef.current + direction + DECK_TRACKS.length) % DECK_TRACKS.length
      trackIdxARef.current = next; setTrackIdxA(next)
      if (audioRefA.current) {
        audioRefA.current.src = DECK_TRACKS[next].file
        if (playingA) void audioRefA.current.play().catch(() => {})
      }
    } else {
      const next = (trackIdxBRef.current + direction + DECK_TRACKS.length) % DECK_TRACKS.length
      trackIdxBRef.current = next; setTrackIdxB(next)
      if (audioRefB.current) {
        audioRefB.current.src = DECK_TRACKS[next].file
        if (playingB) void audioRefB.current.play().catch(() => {})
      }
    }
  }, [playingA, playingB])

  // Legacy switchTrack: affects active side
  const switchTrack = useCallback(
    (direction: 1 | -1) => {
      switchTrackOnSide(crossfader < 50 ? 'A' : 'B', direction)
    },
    [switchTrackOnSide, crossfader]
  )

  const seekToRatio = useCallback(
    (ratio: number) => {
      const audio = crossfader < 50 ? audioRefA.current : audioRefB.current
      const dur = crossfader < 50 ? durationA : durationB
      if (!audio || !dur) return
      audio.currentTime = Math.max(0, Math.min(1, ratio)) * dur
      if (crossfader < 50) setProgressA(audio.currentTime)
      else setProgressB(audio.currentTime)
    },
    [crossfader, durationA, durationB]
  )

  const fmt = useCallback((s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`, [])

  const track = DECK_TRACKS[currentTrack]
  const trackA = DECK_TRACKS[trackIdxA]
  const trackB = DECK_TRACKS[trackIdxB]
  const activeSide: 'A' | 'B' = crossfader < 50 ? 'A' : 'B'

  const deckA: DeckSideState = { trackIdx: trackIdxA, progress: progressA, duration: durationA, playing: playingA }
  const deckB: DeckSideState = { trackIdx: trackIdxB, progress: progressB, duration: durationB, playing: playingB }

  // === Mix player: internal stop helper ===
  const mixPlayLoggedRef = useRef(false)
  const currentMixIdRef = useRef<string | null>(null)

  const logMixPlayOnce = useCallback(() => {
    const id = currentMixIdRef.current
    if (!id || mixPlayLoggedRef.current) return
    mixPlayLoggedRef.current = true
    void fetch('/api/mix-play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mixId: id }),
    }).catch(() => {})
  }, [])

  const stopMixInternal = useCallback(() => {
    if (mixAudioRef.current) {
      mixAudioRef.current.pause()
      mixAudioRef.current.src = ''
    }
    if (scHandleRef.current) {
      scHandleRef.current.pause()
    }
    setScTrackUrl(null)
    scHandleRef.current = null
    setMixPlaying(false)
    setMixProgress(0)
    setMixDuration(0)
    setCurrentMix(null)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('seekbackward', null)
      navigator.mediaSession.setActionHandler('seekforward', null)
    }
  }, [])

  // === Mix player: playMix ===
  const playMix = useCallback((mix: MixTrack) => {
    claimAudio('mix')
    // Pause the deck if it's playing
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.playbackRate = 1
      setIsPlaying(false)
    }

    // Stop any previous mix
    stopMixInternal()

    mixPlayLoggedRef.current = false
    currentMixIdRef.current = mix.id

    setCurrentMix(mix)
    setMode('mix')
    setMixProgress(0)
    setMixDuration(0)

    if (mix.source === 'mp3') {
      if (!mixAudioRef.current) {
        mixAudioRef.current = new Audio()
      }
      const audio = mixAudioRef.current
      audio.src = mix.src
      audio.preload = 'auto'

      const onLoaded = () => setMixDuration(audio.duration)
      const onTimeUpdate = () => setMixProgress(audio.currentTime)
      const onEnded = () => {
        setMixPlaying(false)
        setMode('idle')
      }

      audio.addEventListener('loadedmetadata', onLoaded)
      audio.addEventListener('timeupdate', onTimeUpdate)
      audio.addEventListener('ended', onEnded)

      void audio
        .play()
        .then(() => {
          setMixPlaying(true)
          logMixPlayOnce()
        })
        .catch(() => {})
    } else if (mix.source === 'soundcloud') {
      setScTrackUrl(mix.src)
      // SC widget will auto-play via onReady; state managed by callbacks
    }

    // Media Session
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: mix.title,
        artist: mix.artist,
        artwork: mix.imageUrl ? [{ src: mix.imageUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, stopMixInternal, logMixPlayOnce])

  // === Mix player: toggle pause/resume ===
  const toggleMixPlayback = useCallback(() => {
    if (!currentMix) return

    if (currentMix.source === 'mp3' && mixAudioRef.current) {
      if (mixPlaying) {
        mixAudioRef.current.pause()
        setMixPlaying(false)
      } else {
        broadcastPlaybackClaim()
        void mixAudioRef.current.play().then(() => setMixPlaying(true)).catch(() => {})
      }
    } else if (currentMix.source === 'soundcloud' && scHandleRef.current) {
      if (mixPlaying) {
        scHandleRef.current.pause()
        setMixPlaying(false)
      } else {
        broadcastPlaybackClaim()
        scHandleRef.current.play()
        setMixPlaying(true)
      }
    }
  }, [currentMix, mixPlaying])

  // === Mix player: stop ===
  const stopMix = useCallback(() => {
    stopMixInternal()
    setMode('idle')
  }, [stopMixInternal])

  // === Mix player: seek ===
  const seekMixToRatio = useCallback((ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio))
    if (!currentMix) return

    if (currentMix.source === 'mp3' && mixAudioRef.current && mixDuration) {
      mixAudioRef.current.currentTime = clamped * mixDuration
      setMixProgress(mixAudioRef.current.currentTime)
    } else if (currentMix.source === 'soundcloud' && scHandleRef.current && mixDuration) {
      scHandleRef.current.seekTo(clamped * mixDuration * 1000)
      setMixProgress(clamped * mixDuration)
    }
  }, [currentMix, mixDuration])

  // === Preview player: internos ===
  const stopPreviewInternal = useCallback(() => {
    setPreviewBlocked(false)
    previewBlockedRef.current = false
    previewUserPausedRef.current = false
    previewSystemPausedRef.current = false
    previewInterruptedRef.current = false
    if (previewStartWatchdogRef.current) {
      clearTimeout(previewStartWatchdogRef.current)
      previewStartWatchdogRef.current = null
    }
    cancelAnimationFrame(previewRafRef.current)
    const a = previewAudioRef.current
    if (a) { a.pause(); a.removeAttribute('src'); a.load() }
    const pre = previewPreloadRef.current
    if (pre) { pre.removeAttribute('src'); try { pre.load() } catch { /* no-op */ } }
    setPreviewPlaying(false)
    setPreviewQueue([])
    setPreviewIndex(0)
    setPreviewProgress(0)
    setPreviewDuration(0)
    setPreviewGroupKey(null)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('seekbackward', null)
      navigator.mediaSession.setActionHandler('seekforward', null)
      try { navigator.mediaSession.setActionHandler('seekto', null) } catch { /* no-op */ }
      try { navigator.mediaSession.playbackState = 'none' } catch { /* no-op */ }
    }
  }, [])

  // ── Exclusión con los embeds de YouTube en fila ──
  // Modelo completo en `lib/youtube-play-coordinator.ts`. Aquí cerramos el
  // lado "reproductor global" (preview/mix/deck) cuando un iframe de YouTube
  // (vinilos, /mixes, Mis Tracks, Top 100) toma el relevo. La dirección
  // contraria se cubre llamando `stopAllYouTube()` en cada arranque global.
  const silenceGlobalPlaybackForYouTube = useCallback(() => {
    if (previewQueueRef.current.length > 0 || previewAudioRef.current?.getAttribute('src')) {
      stopPreviewInternal()
      setMode((m) => (m === 'preview' ? 'idle' : m))
    }
    if (currentMix) {
      stopMixInternal()
      setMode((m) => (m === 'mix' ? 'idle' : m))
    }
    if (playingA && audioRefA.current) {
      audioRefA.current.pause()
      setPlayingA(false)
    }
    if (playingB && audioRefB.current) {
      audioRefB.current.pause()
      setPlayingB(false)
    }
    setSessionActive(false)
  }, [currentMix, playingA, playingB, stopPreviewInternal, stopMixInternal])

  // Registra el "stopper" en el coordinador: así un YouTube que arranca puede
  // silenciar este reproductor sin acoplar el coordinador al provider.
  useEffect(() => {
    registerGlobalPlaybackStopper(silenceGlobalPlaybackForYouTube)
    return () => registerGlobalPlaybackStopper(null)
  }, [silenceGlobalPlaybackForYouTube])

  // Avance idempotente al siguiente tema de la cola. Se llama desde
  // `ended`, desde `error` (URL caída / stream cortado) y desde el
  // watchdog de `timeupdate` (red de seguridad por si `ended` no llega
  // en iOS PWA tras un cambio de visibility). El flag
  // `previewAdvancedRef` garantiza que las tres rutas no encadenen
  // dobles avances sobre la misma pista.
  const advanceFromCurrentTrack = useCallback(() => {
    if (previewAdvancedRef.current) return
    previewAdvancedRef.current = true
    const q = previewQueueRef.current
    const cur = previewIndexRef.current
    const next = cur + 1
    if (next >= q.length) {
      stopPreviewInternal()
      return
    }
    setPreviewIndex(next)
    previewIndexRef.current = next
    const fn = loadAndPlayRef.current
    if (fn) fn(q, next)
  }, [stopPreviewInternal])

  // Precarga la siguiente pista de audio de la cola en un <audio> oculto.
  // El proxy de samples responde con Cache-Control público, así que esta
  // descarga deja los datos en la caché HTTP y el auto-avance con la
  // pantalla bloqueada no depende de la red (que el SO throttlea).
  const preloadNextPreview = useCallback((queue: PreviewTrack[], idx: number) => {
    const next = queue[idx + 1]
    if (!next || !next.src) return
    let pre = previewPreloadRef.current
    if (!pre) {
      pre = new Audio()
      pre.preload = 'auto'
      pre.muted = true
      previewPreloadRef.current = pre
    }
    if (pre.getAttribute('src') !== next.src) {
      pre.src = next.src
      try { pre.load() } catch { /* no-op */ }
    }
  }, [])

  // Watchdog de arranque: si tras (auto-)avanzar la pista el <audio> no
  // llega a sonar (p. ej. la red está parada porque la pantalla lleva un
  // rato bloqueada), reintenta `play()` unas veces y, si no hay manera,
  // salta a la siguiente en vez de dejar la lista muerta.
  const armPreviewStartWatchdog = useCallback((idx: number) => {
    if (previewStartWatchdogRef.current) {
      clearTimeout(previewStartWatchdogRef.current)
      previewStartWatchdogRef.current = null
    }
    const schedule = () => {
      previewStartWatchdogRef.current = setTimeout(() => {
        previewStartWatchdogRef.current = null
        if (previewIndexRef.current !== idx) return
        if (previewUserPausedRef.current || previewBlockedRef.current) return
        if (previewInterruptedRef.current) return
        if (getActiveYouTubePlayId()) return // un embed tomó el relevo
        const a = previewAudioRef.current
        if (!a || !a.getAttribute('src')) return
        if (!a.paused && a.currentTime > 0) return // ya suena
        if (a.ended) { advanceFromCurrentTrack(); return }
        if (previewStartAttemptsRef.current >= 3) {
          // Tras varios intentos sin arrancar hay que distinguir la causa:
          //  - `a.error` presente → la URL/medios están caídos (proxy muerto,
          //    formato no soportado): saltamos a la siguiente pista.
          //  - sin error → el `play()` está bloqueado por el SO (autoplay en
          //    segundo plano / pantalla bloqueada). NO quemamos la cola
          //    saltando pistas una a una (era el bug "suenan 4-5 temas y de
          //    repente para"): nos quedamos en la pista actual; se reanuda al
          //    volver a primer plano (visibilitychange) o al pulsar play.
          if (a.error) advanceFromCurrentTrack()
          return
        }
        // Reintento sin `load()`: en iOS PWA `load()` rompe la cadena del
        // user-gesture original y el play() siguiente caería en
        // NotAllowedError (ver nota larga en loadAndPlayPreviewAt).
        previewStartAttemptsRef.current += 1
        void a.play().catch(() => { /* el siguiente intento lo cubre */ })
        schedule()
      }, 4000)
    }
    schedule()
  }, [advanceFromCurrentTrack])

  const loadAndPlayPreviewAt = useCallback((queue: PreviewTrack[], idx: number) => {
    if (!queue[idx]) return
    stopAllYouTube()
    // Refs siempre frescas para los listeners del <audio>.
    previewQueueRef.current = queue
    previewIndexRef.current = idx
    previewAdvancedRef.current = false
    previewUserPausedRef.current = false
    previewSystemPausedRef.current = false
    previewInterruptedRef.current = false
    previewStartAttemptsRef.current = 0
    if (previewStartWatchdogRef.current) {
      clearTimeout(previewStartWatchdogRef.current)
      previewStartWatchdogRef.current = null
    }

    if (!previewAudioRef.current) {
      const a = new Audio()
      a.preload = 'auto'
      a.addEventListener('loadedmetadata', () => {
        if (previewAudioRef.current === a) {
          setPreviewDuration(a.duration || 0)
          // Anuncia la duración al SO para pintar la barra de progreso
          // en la lockscreen (Android Chrome / iOS PWA).
          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            try {
              navigator.mediaSession.setPositionState({
                duration: Number.isFinite(a.duration) ? a.duration : 0,
                playbackRate: 1,
                position: 0,
              })
            } catch { /* setPositionState puede no estar soportado */ }
          }
        }
      })
      // El listener se registra UNA sola vez (al crear el <audio>) y
      // delega en `advanceFromCurrentTrack` (idempotente) que lee la
      // cola/índice por refs. Antes había `setState` anidados con
      // `setTimeout(0)` que se perdían cuando el evento `ended` llegaba
      // en mitad de una transición de Next.js (síntoma reportado: track
      // termina y no salta al siguiente en la PWA).
      // Helper: solo avanzamos si el <audio> tiene una src real. Tras
      // `stopPreviewInternal` quitamos el src y eso dispara un `error`
      // (MEDIA_SRC_NOT_SUPPORTED) que NO debe encadenar un avance.
      // `getAttribute('src')` devuelve null tras `removeAttribute`,
      // mientras que `a.src` (getter) puede resolver a la URL de la
      // página. Por eso usamos el atributo directo.
      const hasRealSrc = () => !!a.getAttribute('src')
      a.addEventListener('ended', () => {
        if (hasRealSrc()) advanceFromCurrentTrack()
      })
      // Si la URL falla (proxy caído, stream cortado, formato no
      // soportado tras un sleep largo del SO), antes el reproductor se
      // quedaba pillado a 0:00 sin avanzar nunca. Ahora salta al
      // siguiente como si hubiera terminado.
      a.addEventListener('error', () => {
        if (hasRealSrc()) advanceFromCurrentTrack()
      })
      // Watchdog de fin de pista. En iOS PWA en background, a veces el
      // evento `ended` no se dispara aunque el flag `audio.ended` se
      // ponga a true (el SO suspende el JS justo en el último packet o
      // el stream del proxy se corta). Si detectamos `audio.ended` en
      // un `timeupdate` sin que `ended` haya disparado todavía,
      // forzamos el avance. Solo confiamos en el flag `ended` (NO en
      // `paused`, porque si el usuario pausa manualmente cerca del
      // final NO queremos saltar). `previewAdvancedRef` impide dobles
      // avances si el evento `ended` sí termina llegando después.
      let lastPosStateFlush = 0
      a.addEventListener('timeupdate', () => {
        if (a.ended && hasRealSrc()) advanceFromCurrentTrack()
        // Refresca la posición en la lockscreen (~1.5 s). El rAF de la UI
        // no corre en background, así que sin esto la barra del SO se
        // quedaba congelada en 0:00 con la pantalla bloqueada.
        const now = Date.now()
        if (now - lastPosStateFlush > 1500 && hasRealSrc() && Number.isFinite(a.duration) && a.duration > 0) {
          lastPosStateFlush = now
          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            try {
              navigator.mediaSession.setPositionState({
                duration: a.duration,
                playbackRate: a.playbackRate || 1,
                position: Math.min(a.currentTime, a.duration),
              })
            } catch { /* no-op */ }
          }
        }
      })
      // Distinguir pausas del SO (pantalla bloqueada, pérdida de foco) de
      // las del usuario: si llega un `pause` con la página oculta y sin que
      // el usuario lo pidiera, lo marcamos para que el keeper/visibility
      // puedan reanudar la lista.
      a.addEventListener('pause', () => {
        if (previewUserPausedRef.current || a.ended || !hasRealSrc()) return
        if (!document.hidden) return
        previewSystemPausedRef.current = true
        if (previewInterruptedRef.current) return

        const hiddenAt = previewHiddenAtRef.current
        const hiddenForMs = hiddenAt > 0 ? Date.now() - hiddenAt : 0
        if (hiddenAt === 0) previewHiddenAtRef.current = Date.now()

        const markInterrupted = () => {
          previewInterruptedRef.current = true
          try {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
          } catch { /* no-op */ }
        }

        // Ya sonábamos en segundo plano (el usuario se fue hace rato) y el
        // SO nos acaba de pausar: otra app ha tomado el altavoz (nota de
        // voz de WhatsApp, llamada…). En móvil `play()` SÍ arranca y le
        // quita el audio a esa app — no reintentar. El umbral evita
        // confundirlo con la pausa inmediata al ir a background / lock.
        if (hiddenForMs > 1000) {
          markInterrupted()
          return
        }

        // Pausa al pasar a segundo plano / bloquear: un único reintento
        // para no morir en la lockscreen por throttling del SO. Si ese
        // `play()` se rechaza, back-off.
        window.setTimeout(() => {
          if (previewUserPausedRef.current || previewBlockedRef.current) return
          if (previewInterruptedRef.current) return
          if (getActiveYouTubePlayId()) return
          const el = previewAudioRef.current
          if (!el || el !== a || !el.getAttribute('src') || el.ended) return
          if (!el.paused) return
          void el.play().catch(() => {
            markInterrupted()
          })
        }, 1500)
      })
      a.addEventListener('play', () => {
        // Cualquier arranque real limpia el estado de interrupción: el foco de
        // audio ha vuelto a ser nuestro.
        previewSystemPausedRef.current = false
        previewInterruptedRef.current = false
      })
      previewAudioRef.current = a
    }
    const audio = previewAudioRef.current
    // Pause antes de cambiar src: en algunos navegadores móviles el
    // siguiente play() ignora el cambio si el elemento sigue en estado
    // "playing" interno. Y NO llamamos a `audio.load()` después: en iOS
    // PWA `load()` rompe la cadena del user-gesture original cuando el
    // tema cambia automáticamente al final del anterior, dejando el
    // siguiente `play()` en NotAllowedError silencioso (el bug que el
    // usuario describía como «termina y no pasa al siguiente»).
    try { audio.pause() } catch { /* no-op */ }
    audio.src = queue[idx].src
    audio.play()
      .then(() => {
        setPreviewPlaying(true)
        setPreviewBlocked(false)
        const playKey = queue[idx].save ? canonicalKeyFromTrackPlaySave(queue[idx].save!) : null
        if (playKey) logTrackPlay(playKey)
        // Con la pista ya sonando, calienta la caché con la siguiente para
        // que el auto-avance funcione aunque el SO tenga la red dormida.
        preloadNextPreview(queue, idx)
      })
      .catch((err: unknown) => {
        setPreviewPlaying(false)
        // NotAllowedError = política de autoplay del navegador (link compartido
        // abierto en pestaña nueva, sin gesto previo). Mantenemos la cola
        // cargada y pedimos al usuario un tap en el overlay para arrancar.
        const name = (err && typeof err === 'object' && 'name' in err) ? (err as { name?: string }).name : ''
        setPreviewBlocked(name === 'NotAllowedError')
      })
    // Watchdog de arranque: reintenta/salta si la pista no llega a sonar
    // (típico en background con la red throttleada al cambiar de tema).
    armPreviewStartWatchdog(idx)

    // mediaSession — titular, artwork y controles.
    if ('mediaSession' in navigator) {
      const m = queue[idx]
      navigator.mediaSession.metadata = new MediaMetadata({
        title: m.title || '',
        artist: m.artist || 'Optimal Breaks',
        artwork: m.artworkUrl
          ? [{ src: m.artworkUrl, sizes: '512x512', type: 'image/jpeg' }]
          : [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
      })
      // Señala al SO que estamos reproduciendo (icono correcto en la
      // lockscreen; también ayuda a iOS a NO inferir ±10 s por sí solo).
      try { navigator.mediaSession.playbackState = 'playing' } catch { /* no-op */ }
    }
  }, [stopPreviewInternal, advanceFromCurrentTrack, preloadNextPreview, armPreviewStartWatchdog])

  // Mantén `loadAndPlayRef` apuntando a la versión más reciente; los
  // listeners del <audio> la usan vía la ref para no quedarse colgados
  // del closure inicial.
  useEffect(() => {
    loadAndPlayRef.current = loadAndPlayPreviewAt
  }, [loadAndPlayPreviewAt])

  // Sincroniza las refs espejo de cola e índice con el estado actual
  // para que `advanceFromCurrentTrack` siempre lea valores frescos.
  useEffect(() => { previewQueueRef.current = previewQueue }, [previewQueue])
  useEffect(() => { previewIndexRef.current = previewIndex }, [previewIndex])

  const playPreviewQueue = useCallback((items: PreviewTrack[], startIndex = 0, groupKey?: string) => {
    if (!items.length) return
    const clampedIdx = Math.max(0, Math.min(items.length - 1, startIndex))

    // Preview excluye deck y mix: claim → el handler global para las
    // otras fuentes, y aquí mismo paramos deck/mix por si acaso.
    claimAudio('preview')
    if (audioRefA.current && playingA) { audioRefA.current.pause(); setPlayingA(false) }
    if (audioRefB.current && playingB) { audioRefB.current.pause(); setPlayingB(false) }
    if (currentMix) stopMixInternal()
    setMode('preview')
    setSessionActive(false)

    setPreviewQueue(items)
    setPreviewIndex(clampedIdx)
    setPreviewGroupKey(groupKey ?? null)
    setPreviewProgress(0)
    setPreviewDuration(0)
    loadAndPlayPreviewAt(items, clampedIdx)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingA, playingB, currentMix, stopMixInternal, loadAndPlayPreviewAt])

  const togglePreview = useCallback(() => {
    if (previewQueue.length === 0) return

    const a = previewAudioRef.current
    if (!a) return
    if (a.paused) {
      stopAllYouTube()
      broadcastPlaybackClaim()
      previewUserPausedRef.current = false
      // Acción explícita del usuario: recupera el foco de audio, olvida la
      // interrupción previa (otra app) para que el keeper vuelva a operar.
      previewInterruptedRef.current = false
      previewSystemPausedRef.current = false
      a.play().then(() => {
        setPreviewPlaying(true)
        setPreviewBlocked(false)
        const m = previewQueueRef.current[previewIndexRef.current]
        const playKey = m?.save ? canonicalKeyFromTrackPlaySave(m.save) : null
        if (playKey) logTrackPlay(playKey)
        if ('mediaSession' in navigator) {
          try { navigator.mediaSession.playbackState = 'playing' } catch { /* no-op */ }
        }
      }).catch(() => {})
    } else {
      previewUserPausedRef.current = true
      a.pause()
      setPreviewPlaying(false)
      if ('mediaSession' in navigator) {
        try { navigator.mediaSession.playbackState = 'paused' } catch { /* no-op */ }
      }
    }
  }, [previewQueue.length])

  const stopPreview = useCallback(() => {
    stopPreviewInternal()
    setMode((m) => (m === 'preview' ? 'idle' : m))
  }, [stopPreviewInternal])

  const previewNext = useCallback(() => {
    setPreviewIndex((prev) => {
      const next = prev + 1
      if (next >= previewQueue.length) return prev
      loadAndPlayPreviewAt(previewQueue, next)
      return next
    })
  }, [previewQueue, loadAndPlayPreviewAt])

  const previewPrev = useCallback(() => {
    setPreviewIndex((prev) => {
      const next = prev - 1
      if (next < 0) return prev
      loadAndPlayPreviewAt(previewQueue, next)
      return next
    })
  }, [previewQueue, loadAndPlayPreviewAt])

  const seekPreviewToRatio = useCallback((ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio))
    const a = previewAudioRef.current
    if (!a || !a.duration) return
    a.currentTime = clamped * a.duration
    setPreviewProgress(a.currentTime)
  }, [])

  // Tick de progreso de la preview (rAF, solo mientras sea el modo activo).
  // Throttled a ~120 ms — ver la nota larga del rAF del deck arriba: si
  // hacemos `setPreviewProgress` cada frame, todos los consumidores del
  // context se re-renderizan a 60 fps y las transiciones de `next/link`
  // no llegan nunca a commitear (el menú "no funciona" hasta pulsar STOP).
  // 8 fps es más que suficiente para una barra de progreso y elimina por
  // completo la avalancha de re-renders contra la transición de Next.
  useEffect(() => {
    if (previewQueue.length === 0) return
    let cancelled = false
    let lastFlush = 0
    const PREVIEW_FLUSH_MS = 120
    const tick = (time: number) => {
      if (cancelled) return
      const a = previewAudioRef.current
      if (a && a.duration && Number.isFinite(a.duration) && time - lastFlush >= PREVIEW_FLUSH_MS) {
        lastFlush = time
        // setState con el mismo valor hace bail-out en React, así que no
        // pasa nada por incluir duration y playing aunque casi nunca cambien.
        setPreviewProgress(a.currentTime)
        setPreviewDuration(a.duration)
        setPreviewPlaying(!a.paused && !a.ended)
      }
      previewRafRef.current = requestAnimationFrame(tick)
    }
    previewRafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(previewRafRef.current) }
  }, [previewQueue.length, previewIndex])

  // Espejo de `previewBlocked` para los watchdogs/keepers (que viven en
  // listeners y timers sin re-suscribirse a cada render).
  useEffect(() => { previewBlockedRef.current = previewBlocked }, [previewBlocked])

  // Keeper de la cola en segundo plano.
  // el SO pausa el <audio> (pérdida de foco transitoria, throttling de red
  // entre pistas) o se pierde el `ended`. Este intervalo de baja frecuencia
  // (el SO lo degrada a ~1/min en background, suficiente) re-arranca la
  // reproducción SOLO cuando la pausa no fue del usuario, para que la lista
  // no se quede muerta hasta que el usuario desbloquee el móvil.
  useEffect(() => {
    if (previewQueue.length === 0) return
    const iv = window.setInterval(() => {
      if (previewUserPausedRef.current || previewBlockedRef.current) return
      // Si hay un embed (YouTube/SoundCloud) sonando, NO re-arrancar el
      // preview por encima: era una de las fuentes del "suenan dos cosas".
      if (getActiveYouTubePlayId()) return
      // Otra app tomó el foco de audio (WhatsApp, llamada…): NO insistir en
      // reanudar; nos quedamos en pausa como haría un reproductor de música.
      if (previewInterruptedRef.current) return
      const a = previewAudioRef.current
      if (!a || !a.getAttribute('src')) return
      if (a.ended) { advanceFromCurrentTrack(); return }
      if (a.paused && previewSystemPausedRef.current) {
        void a.play().catch(() => {
          // El foco es de otra app: back-off (deja de pelear en cada tick).
          previewInterruptedRef.current = true
        })
      }
    }, 10000)
    return () => window.clearInterval(iv)
  }, [previewQueue.length, advanceFromCurrentTrack])

  // Al volver a primer plano (desbloquear pantalla, volver a la pestaña):
  // si la cola debería estar sonando y el SO la dejó pausada o se comió el
  // `ended` final, recupera inmediatamente sin esperar al keeper.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) {
        if (!previewHiddenAtRef.current) previewHiddenAtRef.current = Date.now()
        return
      }
      previewHiddenAtRef.current = 0
      if (previewQueueRef.current.length === 0) return
      if (previewUserPausedRef.current || previewBlockedRef.current) return
      // Un embed activo (YouTube/SoundCloud) tiene prioridad: no auto-reanudar
      // el preview encima al volver del background.
      if (getActiveYouTubePlayId()) return
      const a = previewAudioRef.current
      if (!a || !a.getAttribute('src')) return
      if (a.ended) { advanceFromCurrentTrack(); return }
      // Si otra app nos interrumpió (nota de voz de WhatsApp, una llamada…),
      // NO revivas la música al volver: el usuario decide con play. Sí
      // reanudamos las pausas benignas del SO (throttling / lock sin que
      // otra fuente sonara), que nunca marcan `previewInterruptedRef`.
      if (previewInterruptedRef.current) return
      if (a.paused) void a.play().catch(() => { /* no-op */ })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [advanceFromCurrentTrack])

  // Media Session handlers específicos de preview.
  //
  // IMPORTANTE: en iOS (y en algunos Android) la pantalla de bloqueo
  // muestra `seekbackward`/`seekforward` (±10 s) cuando están registrados,
  // *a costa* de ocultar `previoustrack`/`nexttrack`. Como aquí la cola
  // tiene varias canciones, preferimos prev/next y explícitamente
  // **ponemos a null** los de seek para que el SO muestre los botones
  // de pista.
  useEffect(() => {
    if (previewQueue.length === 0) return
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => togglePreview())
    navigator.mediaSession.setActionHandler('pause', () => togglePreview())
    navigator.mediaSession.setActionHandler('previoustrack', () => previewPrev())
    navigator.mediaSession.setActionHandler('nexttrack', () => previewNext())
    try { navigator.mediaSession.setActionHandler('seekbackward', null) } catch { /* no-op */ }
    try { navigator.mediaSession.setActionHandler('seekforward', null) } catch { /* no-op */ }
    // `seekto` sí lo dejamos activo: permite al usuario arrastrar la
    // chincheta del progress en la lockscreen cuando el navegador la
    // pinta (Android Chrome), sin ocupar uno de los slots de botón.
    try {
      navigator.mediaSession.setActionHandler('seekto', (details: MediaSessionActionDetails) => {
        if (typeof details.seekTime !== 'number') return
        const dur = previewDuration || 1
        seekPreviewToRatio(Math.max(0, Math.min(1, details.seekTime / dur)))
      })
    } catch { /* seekto puede no estar soportado */ }
    return () => {
      // Limpieza al desmontar o al salir del preview: los handlers se
      // re-asignan desde `stopPreviewInternal` si corresponde.
    }
  }, [previewQueue.length, previewIndex, togglePreview, previewPrev, previewNext, seekPreviewToRatio, previewDuration])

  // Emite evento para BackToTop (compat con OB_CHART_PLAYALL_BAR_EVENT).
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent(OB_CHART_PLAYALL_BAR_EVENT, { detail: { visible: previewQueue.length > 0 } }),
    )
  }, [previewQueue.length])

  // === Media Session action handlers (update when mix state changes) ===
  useEffect(() => {
    if (mode !== 'mix' || !('mediaSession' in navigator)) return

    navigator.mediaSession.setActionHandler('play', () => {
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume()
      toggleMixPlayback()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      toggleMixPlayback()
    })
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      seekMixToRatio(Math.max(0, (mixProgress - 10) / (mixDuration || 1)))
    })
    navigator.mediaSession.setActionHandler('seekforward', () => {
      seekMixToRatio(Math.min(1, (mixProgress + 10) / (mixDuration || 1)))
    })
  }, [mode, mixProgress, mixDuration, toggleMixPlayback, seekMixToRatio])

  // === SC Widget callbacks ===
  const handleScReady = useCallback(() => {
    setMixPlaying(true)
  }, [])

  const handleScProgress = useCallback((posMs: number, durMs: number) => {
    setMixProgress(posMs / 1000)
    setMixDuration(durMs / 1000)
  }, [])

  const handleScFinish = useCallback(() => {
    setMixPlaying(false)
    setMode('idle')
    setCurrentMix(null)
  }, [])

  const handleScPause = useCallback(() => {
    setMixPlaying(false)
  }, [])

  const handleScPlay = useCallback(() => {
    setMixPlaying(true)
    logMixPlayOnce()
  }, [logMixPlayOnce])

  const handleScHandleRef = useCallback((h: SoundCloudWidgetHandle | null) => {
    scHandleRef.current = h
  }, [])

  // === Deck Media Session: lockscreen metadata + controls ===
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (mode === 'deck' && sessionActive && (playingA || playingB)) {
      const t = crossfader < 50 ? trackA : trackB
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: 'OB Deck',
        artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
      })
      navigator.mediaSession.setActionHandler('play', () => {
        if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume()
        togglePlay()
      })
      navigator.mediaSession.setActionHandler('pause', () => togglePlay())
      navigator.mediaSession.setActionHandler('previoustrack', () => switchTrack(-1))
      navigator.mediaSession.setActionHandler('nexttrack', () => switchTrack(1))
    } else if (mode !== 'mix' && mode !== 'preview') {
      // OJO: en modo 'preview' la Media Session la gestiona el bloque de
      // preview (metadata en loadAndPlayPreviewAt + handlers en su effect).
      // Antes este else limpiaba metadata/handlers también con mode==='preview'
      // (este effect corre después), dejando la lockscreen de iOS huérfana:
      // sin título, botones muertos o apuntando a otra sesión.
      navigator.mediaSession.metadata = null
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
    }
  }, [mode, sessionActive, playingA, playingB, crossfader, trackA, trackB, togglePlay, switchTrack])

  // === Global audio exclusion: only ONE player audible at a time ===
  // Fuentes reconocidas:
  //  - 'deck' / 'mix'        → parte del provider (DJ deck y mixes).
  //  - 'preview'             → reproductor global de previews.
  //  - 'chart-*', 'beatport-top', 'my-tracks' → aliases retrocompatibles
  //                                              que equivalen a 'preview'.
  useEffect(() => {
    const handler = (e: Event) => {
      stopAllYouTube()
      const src = (e as CustomEvent).detail?.source as AudioClaimSource | undefined
      // El deck y el mix se excluyen mutuamente con preview
      if (src === 'deck' || src === 'mix') {
        // → parar preview
        if (previewQueue.length > 0) stopPreviewInternal()
        setMode((m) => (m === 'preview' ? 'idle' : m))
        return
      }
      // Cualquier otra cosa la tratamos como "preview" (inclusive los alias legacy):
      // → parar deck y mix, mantener preview.
      if (playingA && audioRefA.current) { audioRefA.current.pause(); setPlayingA(false) }
      if (playingB && audioRefB.current) { audioRefB.current.pause(); setPlayingB(false) }
      if (currentMix) stopMixInternal()
      setSessionActive(false)
    }
    window.addEventListener('ob-audio-claim', handler)
    return () => window.removeEventListener('ob-audio-claim', handler)
  }, [playingA, playingB, currentMix, stopMixInternal, previewQueue.length, stopPreviewInternal])

  // === Context value ===
  const value = useMemo<DeckAudioContextValue>(
    () => ({
      dict,
      isPlaying,
      crossfader,
      setCrossfader,
      currentTrack,
      progress,
      duration,
      scratchingLeft,
      scratchingRight,
      leftRotation,
      rightRotation,
      sessionActive,
      initAudio,
      togglePlay,
      switchTrack,
      seekToRatio,
      handleScratchStart,
      handleScratchMove,
      handleScratchEnd,
      track,
      fmt,
      deckA,
      deckB,
      activeSide,
      trackA,
      trackB,
      switchTrackOnSide,
      togglePlaySide,
      mode,
      currentMix,
      mixPlaying,
      mixProgress,
      mixDuration,
      playMix,
      toggleMixPlayback,
      stopMix,
      seekMixToRatio,
      previewQueue,
      previewIndex,
      previewPlaying,
      previewProgress,
      previewDuration,
      previewGroupKey,
      previewBlocked,
      playPreviewQueue,
      togglePreview,
      stopPreview,
      previewNext,
      previewPrev,
      seekPreviewToRatio,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dict,
      isPlaying,
      crossfader,
      currentTrack,
      progress,
      duration,
      scratchingLeft,
      scratchingRight,
      leftRotation,
      rightRotation,
      sessionActive,
      initAudio,
      togglePlay,
      switchTrack,
      seekToRatio,
      handleScratchStart,
      handleScratchMove,
      handleScratchEnd,
      track,
      fmt,
      trackIdxA, progressA, durationA, playingA,
      trackIdxB, progressB, durationB, playingB,
      activeSide,
      trackA,
      trackB,
      switchTrackOnSide,
      togglePlaySide,
      mode,
      currentMix,
      mixPlaying,
      mixProgress,
      mixDuration,
      playMix,
      toggleMixPlayback,
      stopMix,
      seekMixToRatio,
      previewQueue,
      previewIndex,
      previewPlaying,
      previewProgress,
      previewDuration,
      previewGroupKey,
      previewBlocked,
      playPreviewQueue,
      togglePreview,
      stopPreview,
      previewNext,
      previewPrev,
      seekPreviewToRatio,
    ]
  )

  const showBar = mode !== 'idle' || sessionActive || previewQueue.length > 0

  // El wrapper reserva espacio bajo la página para que la última fila no
  // quede tapada por la barra fija. Antes era estático (4.75rem / 5rem) y
  // se quedaba corto en iPhones porque no contaba la `safe-area-inset-bottom`
  // de la home-bar. Con calc() incluimos esa zona segura más los mismos
  // 10px de colchón que añade el reproductor a su `paddingBottom`.
  const wrapperPb = showBar
    ? 'pb-[calc(4.75rem+env(safe-area-inset-bottom,0px)+10px)] sm:pb-[calc(5rem+env(safe-area-inset-bottom,0px)+10px)]'
    : undefined

  const overlays = useMemo(
    () => (
      <>
        <MiniDeckBar lang={lang} />
        <PreviewAutoplayOverlay lang={lang} />
        {scTrackUrl && (
          <SoundCloudWidget
            trackUrl={scTrackUrl}
            onReady={handleScReady}
            onPlay={handleScPlay}
            onPause={handleScPause}
            onFinish={handleScFinish}
            onProgress={handleScProgress}
            handleRef={handleScHandleRef}
          />
        )}
      </>
    ),
    [
      lang,
      scTrackUrl,
      handleScReady,
      handleScPlay,
      handleScPause,
      handleScFinish,
      handleScProgress,
      handleScHandleRef,
    ],
  )

  useLayoutEffect(() => {
    if (!engineOnly || !onBind) return
    onBind({ value, wrapperPb, overlays })
  }, [engineOnly, onBind, value, wrapperPb, overlays])

  if (engineOnly) return null

  return (
    <DeckAudioContext.Provider value={value}>
      <div className={wrapperPb}>{children}</div>
      {overlays}
    </DeckAudioContext.Provider>
  )
}
