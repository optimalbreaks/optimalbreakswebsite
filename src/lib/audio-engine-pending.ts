import type { MixTrack, PreviewTrack } from '@/components/DeckAudioProvider'

export type AudioPendingAction =
  | { kind: 'deck-toggle'; side: 'A' | 'B' }
  | { kind: 'deck-switch'; side: 'A' | 'B'; direction: -1 | 1 }
  | { kind: 'mix'; track: MixTrack }
  | { kind: 'preview'; items: PreviewTrack[]; startIndex: number; groupKey?: string }

export const AUDIO_SESSION_KEY = 'ob_audio_active'

export function hasActiveAudioSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(AUDIO_SESSION_KEY) === '1'
  } catch {
    return false
  }
}
