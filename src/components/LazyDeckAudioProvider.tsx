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
import type { Locale } from '@/lib/i18n-config'
import type { DeckDict } from '@/components/DeckAudioProvider'
import PendingActionRunner from '@/components/PendingActionRunner'
import {
  type AudioPendingAction,
  AUDIO_SESSION_KEY,
  hasActiveAudioSession,
} from '@/lib/audio-engine-pending'

type DeckProviderComponent = React.ComponentType<{
  children: ReactNode
  lang: Locale
  dict: DeckDict
}>

type AudioEngineGate = {
  ready: boolean
  requestLoad: (action?: AudioPendingAction) => Promise<void>
}

const AudioEngineGateContext = createContext<AudioEngineGate | null>(null)

export function useAudioEngineGate(): AudioEngineGate {
  const ctx = useContext(AudioEngineGateContext)
  if (!ctx) {
    throw new Error('useAudioEngineGate must be used within LazyDeckAudioProvider')
  }
  return ctx
}

export default function LazyDeckAudioProvider({
  children,
  lang,
  dict,
}: {
  children: ReactNode
  lang: Locale
  dict: DeckDict
}) {
  const [DeckProvider, setDeckProvider] = useState<DeckProviderComponent | null>(null)
  const loadPromiseRef = useRef<Promise<void> | null>(null)
  const pendingRef = useRef<AudioPendingAction | null>(null)

  const requestLoad = useCallback(async (action?: AudioPendingAction) => {
    if (action) pendingRef.current = action

    if (DeckProvider) return

    if (!loadPromiseRef.current) {
      loadPromiseRef.current = import('@/components/DeckAudioProvider').then((mod) => {
        setDeckProvider(() => mod.DeckAudioProvider)
      })
    }
    await loadPromiseRef.current
  }, [DeckProvider])

  useEffect(() => {
    if (hasActiveAudioSession()) void requestLoad()
  }, [requestLoad])

  const gate = useMemo<AudioEngineGate>(
    () => ({
      ready: !!DeckProvider,
      requestLoad,
    }),
    [DeckProvider, requestLoad],
  )

  return (
    <AudioEngineGateContext.Provider value={gate}>
      {DeckProvider ? (
        <DeckProvider lang={lang} dict={dict}>
          <PendingActionRunner pendingRef={pendingRef} />
          {children}
        </DeckProvider>
      ) : (
        children
      )}
    </AudioEngineGateContext.Provider>
  )
}
