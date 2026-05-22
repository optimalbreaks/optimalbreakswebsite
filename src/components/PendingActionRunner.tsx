'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import { useDeckAudio } from '@/components/DeckAudioProvider'
import type { AudioPendingAction } from '@/lib/audio-engine-pending'

export default function PendingActionRunner({
  pendingRef,
}: {
  pendingRef: MutableRefObject<AudioPendingAction | null>
}) {
  const audio = useDeckAudio()
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    const action = pendingRef.current
    if (!action) return
    pendingRef.current = null
    ranRef.current = true

    switch (action.kind) {
      case 'deck-toggle':
        audio.initAudio()
        audio.togglePlaySide(action.side)
        break
      case 'deck-switch':
        audio.initAudio()
        audio.switchTrackOnSide(action.side, action.direction)
        break
      case 'mix':
        audio.playMix(action.track)
        break
      case 'preview':
        audio.playPreviewQueue(action.items, action.startIndex, action.groupKey)
        break
      default:
        break
    }
  }, [audio, pendingRef])

  return null
}
