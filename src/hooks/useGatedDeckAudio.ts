'use client'

import { useAudioEngineGate } from '@/components/LazyDeckAudioProvider'
import {
  useDeckAudioMaybe,
  usePreviewAudioMaybe,
  type MixTrack,
  type PreviewAudioApi,
  type PreviewTrack,
} from '@/components/DeckAudioProvider'
import { primeMixInGesture, primePreviewInGesture } from '@/lib/audio-unlock'
import { stopAllYouTube } from '@/lib/youtube-play-coordinator'

const noop = () => {}

/**
 * Preview: carga el motor solo al primer play.
 *
 * IMPORTANTE: `primePreviewInGesture` arranca el <audio> compartido DENTRO
 * del click (síncrono). Sin esto, en iOS el `play()` llegaba cuando el chunk
 * del motor terminaba de descargarse — fuera del gesto — y el navegador lo
 * bloqueaba (primer toque = modal «Toca para escuchar»).
 */
export function usePreviewAudioGated(): PreviewAudioApi {
  const gate = useAudioEngineGate()
  const live = usePreviewAudioMaybe()

  if (live) return live

  return {
    previewMode: 'idle',
    previewQueue: [],
    previewIndex: 0,
    previewPlaying: false,
    previewGroupKey: null,
    previewBlocked: false,
    playPreviewQueue: (items: PreviewTrack[], startIndex = 0, groupKey?: string) => {
      if (!items.length) return
      const idx = Math.max(0, Math.min(items.length - 1, startIndex))
      stopAllYouTube()
      primePreviewInGesture(items[idx]?.src)
      void gate.requestLoad({ kind: 'preview', items, startIndex: idx, groupKey })
    },
    // Sin motor no hay cola que ampliar (el aterrizaje vuelve a intentarlo
    // cuando el motor ya tiene el tema sonando).
    extendPreviewQueue: noop,
    togglePreview: noop,
    stopPreview: noop,
    previewNext: noop,
    previewPrev: noop,
    seekPreviewToRatio: noop,
  }
}

/** Mixes: carga el motor solo al primer play (MP3 arrancado dentro del gesto). */
export function useMixAudioGated(): {
  playMix: (track: MixTrack) => void
  toggleMixPlayback: () => void
  stopMix: () => void
  currentMix: MixTrack | null
  mixPlaying: boolean
} {
  const gate = useAudioEngineGate()
  const live = useDeckAudioMaybe()

  if (live) {
    return {
      playMix: live.playMix,
      toggleMixPlayback: live.toggleMixPlayback,
      stopMix: live.stopMix,
      currentMix: live.currentMix,
      mixPlaying: live.mixPlaying,
    }
  }

  return {
    playMix: (track) => {
      stopAllYouTube()
      if (track.source === 'mp3') primeMixInGesture(track.src)
      void gate.requestLoad({ kind: 'mix', track })
    },
    // Motor aún no cargado ⇒ nada suena ⇒ parar/toggle son no-ops.
    toggleMixPlayback: noop,
    stopMix: noop,
    currentMix: null,
    mixPlaying: false,
  }
}
