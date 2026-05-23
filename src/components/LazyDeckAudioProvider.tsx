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
import type { DeckDict, DeckAudioShellBind } from '@/components/DeckAudioProvider'
import PendingActionRunner from '@/components/PendingActionRunner'
import { DeckAudioContext } from '@/components/deck-audio-context'
import {
  type AudioPendingAction,
  hasActiveAudioSession,
} from '@/lib/audio-engine-pending'

type EngineComponent = React.ComponentType<{
  lang: Locale
  dict: DeckDict
  engineOnly: true
  onBind: (bind: DeckAudioShellBind) => void
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
  const [Engine, setEngine] = useState<EngineComponent | null>(null)
  const [shell, setShell] = useState<DeckAudioShellBind | null>(null)
  const loadPromiseRef = useRef<Promise<void> | null>(null)
  const pendingRef = useRef<AudioPendingAction | null>(null)

  const requestLoad = useCallback(async (action?: AudioPendingAction) => {
    if (action) pendingRef.current = action

    if (Engine) return

    if (!loadPromiseRef.current) {
      loadPromiseRef.current = import('@/components/DeckAudioProvider').then((mod) => {
        setEngine(() => mod.DeckAudioProvider as EngineComponent)
      })
    }
    await loadPromiseRef.current
  }, [Engine])

  useEffect(() => {
    if (hasActiveAudioSession()) void requestLoad()
  }, [requestLoad])

  const onBind = useCallback((bind: DeckAudioShellBind) => {
    setShell((prev) => {
      if (
        prev &&
        prev.value === bind.value &&
        prev.wrapperPb === bind.wrapperPb &&
        prev.overlays === bind.overlays
      ) {
        return prev
      }
      return bind
    })
  }, [])

  const gate = useMemo<AudioEngineGate>(
    () => ({
      ready: !!Engine,
      requestLoad,
    }),
    [Engine, requestLoad],
  )

  return (
    <AudioEngineGateContext.Provider value={gate}>
      <DeckAudioContext.Provider value={shell?.value ?? null}>
        <div className={shell?.wrapperPb}>{children}</div>
        {shell?.overlays}
        {shell?.value && <PendingActionRunner pendingRef={pendingRef} />}
      </DeckAudioContext.Provider>
      {Engine && <Engine lang={lang} dict={dict} engineOnly onBind={onBind} />}
    </AudioEngineGateContext.Provider>
  )
}
