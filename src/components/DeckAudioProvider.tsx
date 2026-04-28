// ============================================
// OPTIMAL BREAKS — Global deck audio (persists across routes)
// Supports two modes: 'deck' (DJ deck tracks) and 'mix' (SoundCloud / MP3)
// ============================================

'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { DECK_TRACKS, type DeckTrack } from '@/lib/deck-tracks'
import type { Locale } from '@/lib/i18n-config'
import Image from 'next/image'
import Link from 'next/link'
import SoundCloudWidget, { type SoundCloudWidgetHandle } from '@/components/SoundCloudWidget'
import SaveTrackButton from '@/components/SaveTrackButton'
import type { ChartTrackSource } from '@/hooks/useUserData'
import type { SavedChartTrackSnapshot } from '@/types/database'

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
  save?: PreviewSaveData
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

const DeckAudioContext = createContext<DeckAudioContextValue | null>(null)

export function useDeckAudio() {
  const ctx = useContext(DeckAudioContext)
  if (!ctx) throw new Error('useDeckAudio must be used within DeckAudioProvider')
  return ctx
}

/** Acceso tipado a la API del reproductor global de previews. Shortcut
 *  para consumidores (ChartView, BeatportTopTracks, TracksSection…) que
 *  solo necesitan esa porción del contexto. */
export function usePreviewAudio(): PreviewAudioApi {
  const ctx = useDeckAudio()
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

  const barRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const seek = useCallback((clientX: number) => {
    if (!duration) return
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    onSeekRatio(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
  }, [duration, onSeekRatio])

  /** Libera captura explícitamente: si el navegador no envía pointerup (touch
   *  roto, cambio de pestaña, etc.), los clics siguen yendo al seek y los
   *  enlaces del sitio «no responden» hasta desmontar el player (p. ej. Stop). */
  const endSeekPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    const el = e.currentTarget
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      /* no estaba capturando este pointerId */
    }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seek(e.clientX)
  }, [seek])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) seek(e.clientX)
  }, [seek])

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
      className="fixed bottom-0 inset-x-0 z-[199] border-t-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[0_-4px_20px_rgba(0,0,0,.15)]"
      role="region"
      aria-label={ariaLabel}
      style={{
        fontFamily: "'Courier Prime', monospace",
        // Safe area para el notch / home-bar iOS y la barra del navegador
        // móvil + 10px extra. En iPhones (sobre todo la home-bar) el
        // `safe-area-inset-bottom` por sí solo deja los botones de
        // transporte casi pegados al borde inferior visible; añadimos un
        // colchón fijo de 10px para que el play/pause y los ⏮ ⏭ no se
        // sientan recortados.
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
      }}
    >
      <MiniBarHeader subtitle={subtitle} live />
      {/* Hitbox vertical extendido para evitar clicks accidentales sobre
          enlaces de la página que quedan justo detrás de la barra fina. */}
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endSeekPointer}
        onPointerCancel={endSeekPointer}
        onLostPointerCapture={() => { dragging.current = false }}
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

      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-2.5 max-w-4xl mx-auto">
        <div className="flex items-center gap-1.5 sm:gap-1 shrink-0">{controls}</div>

        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className="flex-1 min-w-0 overflow-hidden text-left cursor-pointer hover:opacity-70 active:opacity-50 transition-opacity"
            title={titleClickHint}
          >
            {titleInner}
          </button>
        ) : (
          <div className="flex-1 min-w-0 overflow-hidden">{titleInner}</div>
        )}

        <div className="shrink-0 flex items-center gap-2">
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
function PreviewSaveSlot({ save, lang }: { save?: PreviewSaveData; lang: Locale }) {
  if (!save) return null
  if (save.mode === 'url') {
    return (
      <SaveTrackButton
        externalUrl={save.externalUrl}
        externalTrackId={save.externalTrackId}
        canonicalUrl={save.canonicalUrl ?? null}
        snapshot={save.snapshot ?? null}
        lang={lang}
        size="sm"
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
      size="sm"
    />
  )
}

// ─── Adapter: Preview (charts / Top 10 / Mis Tracks) ─────────────────────
function MiniPreviewBar({ lang }: { lang: Locale }) {
  const {
    previewQueue, previewIndex, previewPlaying,
    previewProgress, previewDuration,
    togglePreview, stopPreview, previewNext, previewPrev,
    seekPreviewToRatio, fmt,
  } = useDeckAudio()
  const es = lang === 'es'
  const cur = previewQueue[previewIndex]

  // Nota: este callback va ANTES del early-return para no romper el orden
  // de hooks entre renders (en la versión previa estaba después y era un
  // bug latente).
  const scrollToCurrentRow = useCallback(() => {
    const id = cur?.domId
    if (!id) return
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('!bg-[var(--yellow)]/25')
    setTimeout(() => el.classList.remove('!bg-[var(--yellow)]/25'), 1500)
  }, [cur])

  if (!cur) return null

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
      onTitleClick={cur.domId ? scrollToCurrentRow : undefined}
      titleClickHint={cur.domId ? (es ? 'Ir a la canción' : 'Go to song') : undefined}
      counter={`${previewIndex + 1} / ${previewQueue.length}`}
      extraRight={<PreviewSaveSlot save={cur.save} lang={lang} />}
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
}: {
  children: ReactNode
  lang: Locale
  dict: DeckDict
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

  useEffect(() => { trackIdxARef.current = trackIdxA }, [trackIdxA])
  useEffect(() => { trackIdxBRef.current = trackIdxB }, [trackIdxB])

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
  useEffect(() => {
    const tick = (time: number) => {
      if (!lastTickRef.current) lastTickRef.current = time
      const deltaMs = time - lastTickRef.current
      lastTickRef.current = time

      if (audioRefA.current && playingA) setProgressA(audioRefA.current.currentTime)
      if (audioRefB.current && playingB) setProgressB(audioRefB.current.currentTime)

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
        void mixAudioRef.current.play().then(() => setMixPlaying(true)).catch(() => {})
      }
    } else if (currentMix.source === 'soundcloud' && scHandleRef.current) {
      if (mixPlaying) {
        scHandleRef.current.pause()
        setMixPlaying(false)
      } else {
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
    cancelAnimationFrame(previewRafRef.current)
    const a = previewAudioRef.current
    if (a) { a.pause(); a.removeAttribute('src'); a.load() }
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

  const loadAndPlayPreviewAt = useCallback((queue: PreviewTrack[], idx: number) => {
    if (!queue[idx]) return
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
      a.addEventListener('ended', () => {
        // Avance a la siguiente pista de la cola; si se acaba, cerrar.
        setPreviewIndex((prev) => {
          const next = prev + 1
          setPreviewQueue((q) => {
            if (next >= q.length) {
              // fin de cola
              setTimeout(() => stopPreviewInternal(), 0)
              return q
            }
            setTimeout(() => loadAndPlayPreviewAt(q, next), 0)
            return q
          })
          return next
        })
      })
      previewAudioRef.current = a
    }
    const audio = previewAudioRef.current
    audio.src = queue[idx].src
    audio.load()
    audio.play()
      .then(() => {
        setPreviewPlaying(true)
        setPreviewBlocked(false)
      })
      .catch((err: unknown) => {
        setPreviewPlaying(false)
        // NotAllowedError = política de autoplay del navegador (link compartido
        // abierto en pestaña nueva, sin gesto previo). Mantenemos la cola
        // cargada y pedimos al usuario un tap en el overlay para arrancar.
        const name = (err && typeof err === 'object' && 'name' in err) ? (err as { name?: string }).name : ''
        setPreviewBlocked(name === 'NotAllowedError')
      })

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
  }, [stopPreviewInternal])

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
    const a = previewAudioRef.current
    if (!a || previewQueue.length === 0) return
    if (a.paused) {
      a.play().then(() => {
        setPreviewPlaying(true)
        setPreviewBlocked(false)
        if ('mediaSession' in navigator) {
          try { navigator.mediaSession.playbackState = 'playing' } catch { /* no-op */ }
        }
      }).catch(() => {})
    } else {
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
    const a = previewAudioRef.current
    if (!a || !a.duration) return
    a.currentTime = Math.max(0, Math.min(1, ratio)) * a.duration
    setPreviewProgress(a.currentTime)
  }, [])

  // Tick de progreso de la preview (rAF, solo mientras sea el modo activo).
  useEffect(() => {
    if (previewQueue.length === 0) return
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const a = previewAudioRef.current
      if (a && a.duration && Number.isFinite(a.duration)) {
        setPreviewProgress(a.currentTime)
        setPreviewDuration(a.duration)
        // Sincroniza el flag playing con el estado real del <audio>
        setPreviewPlaying(!a.paused && !a.ended)
      }
      previewRafRef.current = requestAnimationFrame(tick)
    }
    previewRafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(previewRafRef.current) }
  }, [previewQueue.length, previewIndex])

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
    } else if (mode !== 'mix') {
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

  return (
    <DeckAudioContext.Provider value={value}>
      <div className={wrapperPb}>{children}</div>
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
    </DeckAudioContext.Provider>
  )
}
