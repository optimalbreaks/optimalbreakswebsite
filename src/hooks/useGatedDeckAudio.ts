'use client'

import { useAudioEngineGate } from '@/components/LazyDeckAudioProvider'
import {
  useDeckAudioMaybe,
  usePreviewAudioMaybe,
  type MixTrack,
  type PreviewAudioApi,
  type PreviewTrack,
} from '@/components/DeckAudioProvider'

const noop = () => {}

/** Preview: carga el motor solo al primer play. */
export function usePreviewAudioGated(): PreviewAudioApi {
  const gate = useAudioEngineGate()
  const live = usePreviewAudioMaybe()

  if (live) return live

  return {
    previewMode: 'idle',
    previewQueue: [],
    previewIndex: 0,
    previewPlaying: false,
    previewProgress: 0,
    previewDuration: 0,
    previewGroupKey: null,
    previewBlocked: false,
    playPreviewQueue: (items: PreviewTrack[], startIndex = 0, groupKey?: string) => {
      void gate.requestLoad({ kind: 'preview', items, startIndex, groupKey })
    },
    togglePreview: noop,
    stopPreview: noop,
    previewNext: noop,
    previewPrev: noop,
    seekPreviewToRatio: noop,
  }
}

/** Mixes: carga el motor solo al primer play. */
export function useMixAudioGated(): {
  playMix: (track: MixTrack) => void
  currentMix: MixTrack | null
  mixPlaying: boolean
} {
  const gate = useAudioEngineGate()
  const live = useDeckAudioMaybe()

  if (live) {
    return {
      playMix: live.playMix,
      currentMix: live.currentMix,
      mixPlaying: live.mixPlaying,
    }
  }

  return {
    playMix: (track) => {
      void gate.requestLoad({ kind: 'mix', track })
    },
    currentMix: null,
    mixPlaying: false,
  }
}
