import type { MixTrack, PreviewTrack } from '@/components/DeckAudioProvider'

export type AudioPendingAction =
  | { kind: 'deck-toggle'; side: 'A' | 'B' }
  | { kind: 'deck-switch'; side: 'A' | 'B'; direction: -1 | 1 }
  | { kind: 'mix'; track: MixTrack }
  | { kind: 'preview'; items: PreviewTrack[]; startIndex: number; groupKey?: string }

export const AUDIO_SESSION_KEY = 'ob_audio_active'

/** Cola del preview: sobrevive a un refresco de la pestaña (el estado de React no). */
export const PREVIEW_SESSION_KEY = 'ob_preview_session'

export type StoredPreviewSession = {
  items: PreviewTrack[]
  index: number
  groupKey: string | null
  currentTime: number
  playing: boolean
}

export function hasActiveAudioSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(AUDIO_SESSION_KEY) === '1'
      || sessionStorage.getItem(PREVIEW_SESSION_KEY) != null
  } catch {
    return false
  }
}

export function readPreviewSession(): StoredPreviewSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PREVIEW_SESSION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as StoredPreviewSession
    if (!Array.isArray(data?.items) || data.items.length === 0) return null
    const first = data.items[0]
    if (!first || typeof first.src !== 'string' || typeof first.rowKey !== 'string') return null
    const index = Number.isFinite(data.index) ? data.index : 0
    return {
      items: data.items,
      index: Math.max(0, Math.min(data.items.length - 1, index)),
      groupKey: typeof data.groupKey === 'string' ? data.groupKey : null,
      currentTime: Number.isFinite(data.currentTime) ? data.currentTime : 0,
      playing: data.playing === true,
    }
  } catch {
    return null
  }
}

export function writePreviewSession(session: StoredPreviewSession): void {
  try {
    sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(session))
  } catch {
    /* cuota o modo privado */
  }
}

export function clearPreviewSession(): void {
  try {
    sessionStorage.removeItem(PREVIEW_SESSION_KEY)
  } catch {
    /* sessionStorage no disponible */
  }
}
