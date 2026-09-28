'use client'

// ============================================
// OPTIMAL BREAKS — Emergente de aterrizaje de un tema compartido
// ----------------------------------------------
// Llega resuelto desde el servidor (lib/shared-track-landing) y se pinta en
// el HTML inicial, fuera del cargador de /charts: el receptor ve el tema y el
// botón de play desde el primer instante, sin esperar a la lista.
//
// - Audio: al tocar, suena DENTRO del gesto (lib/audio-unlock vía el hook
//   gated). Si ChartView ya cargó la semana, se usa la cola completa; si no,
//   suena el tema solo y ChartView amplía la cola después sin cortarlo.
// - Vinilo: el vídeo de YouTube se reproduce dentro del propio emergente.
// - Sin audio / no disponible: se dice claramente (nunca silencio).
// Regla de producto: los enlaces compartidos NO hacen autoplay; el tap del
// receptor es el que reproduce.
// ============================================

import Image from 'next/image'
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Locale } from '@/lib/i18n-config'
import type { SharedLanding } from '@/lib/shared-track-landing'
import type { PreviewTrack } from '@/components/DeckAudioProvider'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import { catalogLockScreenFields } from '@/lib/now-playing-session'
import { getSharedBundle } from '@/lib/shared-track-bus'
import { LazyYouTubeEmbed } from '@/components/YouTubeEmbed'

/** Si tras tocar no ha empezado a sonar en este tiempo, ofrecemos reintentar. */
const PLAY_TIMEOUT_MS = 12_000

/** true en el cliente, false en el HTML del servidor (sin setState al hidratar). */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

function Artwork({ src, alt }: { src: string | null; alt: string }) {
  // 0 = next/image (evita el bloqueo de hotlink de algunos CDNs)
  // 1 = <img> directa · 2 = placeholder
  const [stage, setStage] = useState<0 | 1 | 2>(src ? 0 : 2)
  return (
    <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 border-[3px] border-[var(--ink)] bg-[var(--paper-dark)] overflow-hidden">
      {stage === 0 && src ? (
        <Image src={src} alt={alt} fill sizes="80px" className="object-cover" onError={() => setStage(1)} />
      ) : stage === 1 && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setStage(2)}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-black text-[var(--ink)]/40" aria-hidden>♪</span>
      )}
    </div>
  )
}

export default function SharedTrackLanding({ landing, lang }: { landing: SharedLanding; lang: Locale }) {
  const es = lang === 'es'
  const [dismissed, setDismissed] = useState(false)
  // Hasta hidratar, el botón no puede reproducir: lo mostramos como «cargando»
  // en vez de un play que no responde.
  const hydrated = useHydrated()
  const [tapped, setTapped] = useState(false)
  const [failed, setFailed] = useState(false)

  const { playPreviewQueue, extendPreviewQueue, previewQueue, previewIndex, previewPlaying } = usePreviewAudioGated()

  const item = useMemo<PreviewTrack | null>(() => {
    if (landing.status !== 'audio') return null
    return {
      rowKey: landing.rowKey,
      src: landing.src,
      title: landing.title,
      artist: landing.artists,
      artworkUrl: landing.artworkUrl,
      ...catalogLockScreenFields(landing.mixName, landing.label),
      domId: landing.rowKey,
      originPath: landing.weekDate ? `/${lang}/charts?week=${landing.weekDate}` : `/${lang}/charts`,
      save: {
        mode: 'ref',
        source: landing.source,
        trackId: landing.id,
        canonicalUrl: landing.externalUrl,
      },
      share: {
        mode: 'chart',
        source: landing.source,
        trackId: landing.id,
        weekDate: landing.weekDate,
      },
    }
  }, [landing, lang])

  const ourRowKey = landing.status === 'audio' ? landing.rowKey : null
  const isOursPlaying = !!ourRowKey && previewQueue[previewIndex]?.rowKey === ourRowKey && previewPlaying
  // Ya suena → el emergente se retira PARA SIEMPRE y la barra toma el relevo.
  // Si luego el usuario pausa o cambia de tema, no vuelve a salir (antes
  // reaparecía al pausar y a los 12 s ofrecía «reintentar» sobre un tema que
  // ya había sonado). Si el motor pide su «Toca para escuchar», este sigue
  // encima (z-205) para no dejar un segundo emergente visible.
  // (`played` se fija durante el render: patrón «guardar info de renders
  // anteriores» de React, sin setState en efecto.)
  const [played, setPlayed] = useState(false)
  if (tapped && isOursPlaying && !played) setPlayed(true)
  const open = !dismissed && !played

  // Red lenta / audio caído: tras un tiempo sin sonar, ofrecer reintento.
  useEffect(() => {
    if (!tapped || played || isOursPlaying) return
    const t = window.setTimeout(() => setFailed(true), PLAY_TIMEOUT_MS)
    return () => window.clearTimeout(t)
  }, [tapped, played, isOursPlaying])

  // Carrera tap ↔ llegada de la semana: si ChartView registró la sección
  // mientras el motor aún se montaba (su efecto no vio el tema en la cola), la
  // cola se habría quedado en 1. En cuanto el motor tiene nuestro tema, se
  // amplía aquí SIN tocar el audio (extendPreviewQueue). Idempotente.
  const currentRowKey = previewQueue[previewIndex]?.rowKey ?? null
  useEffect(() => {
    if (!ourRowKey || currentRowKey !== ourRowKey) return
    const reg = getSharedBundle(ourRowKey)
    if (!reg || reg.bundle.length <= previewQueue.length) return
    if (reg.bundle[reg.index]?.rowKey !== ourRowKey) return
    extendPreviewQueue(reg.bundle, reg.index, reg.sectionKey)
  }, [ourRowKey, currentRowKey, previewQueue.length, extendPreviewQueue])

  if (!open) return null

  const onPlay = () => {
    if (!item || landing.status !== 'audio') return
    setTapped(true)
    setFailed(false)
    const reg = getSharedBundle(landing.rowKey)
    if (reg && reg.bundle[reg.index]?.rowKey === landing.rowKey) {
      playPreviewQueue(reg.bundle, reg.index, reg.sectionKey)
    } else {
      playPreviewQueue([item], 0, landing.sectionKey)
    }
  }

  const close = () => setDismissed(true)

  const kicker = es ? 'TE HAN COMPARTIDO ESTE TEMA' : 'SOMEONE SHARED THIS TRACK'
  const closeLabel = es ? 'Cerrar y ver los charts' : 'Close and browse the charts'

  const header = (
    <div className="flex items-center justify-between gap-3 px-3 sm:px-4 h-[26px] bg-[var(--ink)] text-[var(--yellow)]">
      <span className="text-[9px] sm:text-[10px] font-bold tracking-[2px] truncate">{kicker}</span>
      <button
        type="button"
        onClick={close}
        className="shrink-0 -mr-1 w-8 h-[26px] flex items-center justify-center text-[var(--yellow)] hover:text-white text-base leading-none cursor-pointer"
        aria-label={closeLabel}
        title={closeLabel}
      >
        ✕
      </button>
    </div>
  )

  const trackInfo = (title: string, mixName: string | null, artists: string, artworkUrl: string | null) => (
    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
      <Artwork src={artworkUrl} alt={title} />
      <div className="min-w-0 flex-1">
        <div className="text-sm sm:text-lg font-black text-[var(--ink)] leading-tight break-words" style={{ fontFamily: "'Unbounded', sans-serif" }}>
          {title}
          {mixName ? <span className="font-normal text-xs sm:text-sm text-[var(--ink)]/50 ml-1.5">{mixName}</span> : null}
        </div>
        {artists ? <div className="mt-1 text-xs sm:text-sm text-[var(--ink)]/70 break-words">{artists}</div> : null}
      </div>
    </div>
  )

  const externalLink = (url: string | null, label: string) =>
    url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center min-h-[40px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] no-underline transition-colors"
      >
        {label} ↗
      </a>
    ) : null

  const browseBtn = (
    <button
      type="button"
      onClick={close}
      className="inline-flex items-center justify-center min-h-[40px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] transition-colors cursor-pointer"
    >
      {es ? 'VER LOS CHARTS' : 'BROWSE THE CHARTS'}
    </button>
  )

  let body: ReactNode
  if (landing.status === 'audio') {
    const playing = tapped && !failed
    const label = !hydrated
      ? (es ? 'CARGANDO…' : 'LOADING…')
      : failed
        ? (es ? '↻ NO HA SONADO · REINTENTAR' : '↻ DID NOT PLAY · RETRY')
        : playing
          ? (es ? 'CARGANDO AUDIO…' : 'LOADING AUDIO…')
          : landing.isFull
            ? (es ? '▶ TOCA PARA ESCUCHARLO ENTERO' : '▶ TAP TO PLAY THE FULL TRACK')
            : (es ? '▶ TOCA PARA ESCUCHAR' : '▶ TAP TO PLAY')
    body = (
      <>
        {trackInfo(landing.title, landing.mixName, landing.artists, landing.artworkUrl)}
        <button
          type="button"
          onClick={onPlay}
          disabled={!hydrated || (playing && !failed)}
          className="mt-4 w-full min-h-[52px] px-4 text-sm sm:text-base font-black tracking-wider border-[3px] border-[var(--ink)] bg-[var(--red)] text-white hover:bg-[var(--ink)] active:bg-[var(--ink)] disabled:opacity-70 disabled:cursor-wait transition-colors cursor-pointer touch-manipulation"
          style={{ fontFamily: "'Unbounded', sans-serif" }}
        >
          {label}
        </button>
        {failed ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {externalLink(landing.externalUrl, es ? 'ESCUCHAR EN LA TIENDA' : 'LISTEN AT THE STORE')}
            {browseBtn}
          </div>
        ) : null}
      </>
    )
  } else if (landing.status === 'video') {
    body = (
      <>
        {trackInfo(landing.title, landing.mixName, landing.artists, landing.artworkUrl)}
        <div className="mt-4">
          <LazyYouTubeEmbed
            videoId={landing.youtubeId}
            title={`${landing.title}${landing.artists ? ` — ${landing.artists}` : ''}`}
            className="border-[3px] border-[var(--ink)]"
            playSlotId={`shared-vinyl-${landing.id}`}
            nowPlaying={{
              title: landing.title,
              artist: landing.artists,
              mixName: landing.mixName,
              album: landing.label,
              artworkUrl: landing.artworkUrl,
            }}
          />
        </div>
        <p className="mt-2 text-[11px] text-[var(--ink)]/60">
          {es ? 'Toca el vídeo para escucharlo.' : 'Tap the video to listen.'}
        </p>
      </>
    )
  } else if (landing.status === 'no_audio') {
    body = (
      <>
        {trackInfo(landing.title, landing.mixName, landing.artists, landing.artworkUrl)}
        <p className="mt-4 text-xs sm:text-sm text-[var(--ink)]/70">
          {es
            ? 'Este tema no tiene escucha dentro de Optimal Breaks, pero puedes oírlo en su tienda.'
            : 'This track has no preview on Optimal Breaks, but you can listen to it at its store.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {externalLink(landing.externalUrl, es ? 'ESCUCHAR EN LA TIENDA' : 'LISTEN AT THE STORE')}
          {browseBtn}
        </div>
      </>
    )
  } else {
    body = (
      <>
        <p className="text-sm sm:text-base font-black text-[var(--ink)]" style={{ fontFamily: "'Unbounded', sans-serif" }}>
          {es ? 'Este tema ya no está disponible' : 'This track is no longer available'}
        </p>
        <p className="mt-2 text-xs sm:text-sm text-[var(--ink)]/70">
          {es
            ? 'Puede que se haya retirado del chart. Echa un vistazo a las novedades de esta semana.'
            : 'It may have been removed from the chart. Have a look at this week’s new releases.'}
        </p>
        <div className="mt-4">{browseBtn}</div>
      </>
    )
  }

  // En el HTML inicial el diálogo va inline (el receptor lo ve antes del
  // cargador). Tras hidratar se porta a `document.body`: el `<main>` del layout
  // es `relative z-[1]` y atrapa el z-[205], así que el banner de cookies
  // (z-200, hermano del main) tapaba el play en móvil. El banner sigue ahí al
  // cerrar. `data-ob-overlay` hace que otros modales esperen a que este se cierre.
  const overlay = (
    <div
      data-ob-overlay=""
      className="fixed inset-0 z-[205] flex items-center justify-center bg-[var(--ink)]/70 backdrop-blur-sm px-3 sm:px-4 py-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={kicker}
      onClick={() => { if (!(tapped && !failed)) close() }}
    >
      <div
        className="w-full max-w-[520px] my-auto bg-[var(--paper)] border-[4px] border-[var(--ink)] shadow-[6px_6px_0_var(--ink)]"
        style={{ fontFamily: "'Courier Prime', monospace" }}
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        <div className="p-3 sm:p-5">{body}</div>
      </div>
    </div>
  )

  if (hydrated) return createPortal(overlay, document.body)
  return overlay
}
