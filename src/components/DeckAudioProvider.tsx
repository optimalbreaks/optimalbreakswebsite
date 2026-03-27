// ============================================
// OPTIMAL BREAKS — Global deck audio (persists across routes)
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
import Link from 'next/link'

export interface DeckDict {
  play: string
  stop: string
  deck_brand: string
  deck_model: string
  mixer: string
  bpm: string
  crossfader: string
}

interface DeckAudioContextValue {
  dict: DeckDict
  isPlaying: boolean
  leftActive: boolean
  rightActive: boolean
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
  toggleDeckLeft: () => void
  toggleDeckRight: () => void
  switchTrack: (direction: 1 | -1) => void
  seekToRatio: (ratio: number) => void
  handleScratchStart: (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => void
  handleScratchMove: (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => void
  handleScratchEnd: () => void
  track: DeckTrack
  fmt: (s: number) => string
}

const DeckAudioContext = createContext<DeckAudioContextValue | null>(null)

export function useDeckAudio() {
  const ctx = useContext(DeckAudioContext)
  if (!ctx) throw new Error('useDeckAudio must be used within DeckAudioProvider')
  return ctx
}

function MiniDeckBar({ lang }: { lang: Locale }) {
  const ctx = useDeckAudio()
  if (!ctx.sessionActive) return null
  const { isPlaying, togglePlay, initAudio, track, progress, duration, fmt, seekToRatio } = ctx
  const es = lang === 'es'
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[199] border-t-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[0_-6px_24px_rgba(0,0,0,0.12)]"
      role="region"
      aria-label={es ? 'Reproductor del deck' : 'Deck player'}
    >
      <div className="flex items-center gap-2 sm:gap-4 px-3 py-2 sm:px-4 sm:py-2.5 max-w-[1200px] mx-auto">
        <button
          type="button"
          onClick={() => {
            initAudio()
            togglePlay()
          }}
          className={`shrink-0 border-[3px] border-[var(--ink)] px-3 py-1.5 sm:px-4 sm:py-2 transition-colors ${
            isPlaying ? 'bg-[var(--red)] text-white' : 'bg-[var(--yellow)] text-[var(--ink)]'
          }`}
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: '11px',
            letterSpacing: '2px',
          }}
        >
          {isPlaying ? '■' : '▶'}
        </button>
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: '10px',
              letterSpacing: '2px',
              color: 'var(--ink)',
            }}
          >
            OB DECK · {track.title}
          </div>
          <div
            className="h-[2px] bg-[var(--ink)]/10 rounded-full mt-1 overflow-hidden cursor-pointer"
            onClick={(e) => {
              if (!duration) return
              const rect = e.currentTarget.getBoundingClientRect()
              seekToRatio((e.clientX - rect.left) / rect.width)
            }}
          >
            <div
              className="h-full bg-[var(--red)] rounded-full"
              style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '8px', color: 'var(--dim)' }}>
              {fmt(progress)}
            </span>
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '8px', color: 'var(--dim)' }}>
              {duration ? fmt(duration) : '—'}
            </span>
          </div>
        </div>
        <Link
          href={`/${lang}#dj-deck`}
          className="shrink-0 cutout outline no-underline text-[var(--ink)] hover:bg-[var(--yellow)]"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '8px',
            letterSpacing: '1px',
            padding: '6px 10px',
          }}
        >
          {es ? 'AL DECK' : 'FULL DECK'}
        </Link>
      </div>
    </div>
  )
}

export function DeckAudioProvider({
  children,
  lang,
  dict,
}: {
  children: ReactNode
  lang: Locale
  dict: DeckDict
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const scratchAudioRef = useRef<HTMLAudioElement | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [sessionActive, setSessionActive] = useState(false)
  const [leftActive, setLeftActive] = useState(true)
  const [rightActive, setRightActive] = useState(true)
  const [crossfader, setCrossfader] = useState(50)
  const [currentTrack, setCurrentTrack] = useState(0)
  const currentTrackRef = useRef(0)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  const [scratchingLeft, setScratchingLeft] = useState(false)
  const [scratchingRight, setScratchingRight] = useState(false)
  const scratchStartY = useRef(0)
  const scratchStartTime = useRef(0)
  const brakeAnimRef = useRef<number>(0)
  const [leftRotation, setLeftRotation] = useState(0)
  const [rightRotation, setRightRotation] = useState(0)
  const animFrameRef = useRef<number>(0)

  useEffect(() => {
    currentTrackRef.current = currentTrack
  }, [currentTrack])

  const initAudio = useCallback(() => {
    if (!scratchAudioRef.current) {
      const scratch = new Audio('/music/scratch.mp3')
      scratch.volume = 0.6
      scratchAudioRef.current = scratch
    }

    if (!audioRef.current) {
      const audio = new Audio(DECK_TRACKS[currentTrackRef.current].file)
      audio.crossOrigin = 'anonymous'
      audio.preload = 'auto'
      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
      audio.addEventListener('ended', () => {
        const idx = currentTrackRef.current
        const next = (idx + 1) % DECK_TRACKS.length
        currentTrackRef.current = next
        setCurrentTrack(next)
        audio.src = DECK_TRACKS[next].file
        void audio.play().catch(() => {})
      })
      audioRef.current = audio
    }

    if (!audioCtxRef.current && audioRef.current) {
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const source = ctx.createMediaElementSource(audioRef.current)
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)
      sourceRef.current = source
      gainRef.current = gain
    }
  }, [])

  useEffect(() => {
    const tick = () => {
      if (audioRef.current && isPlaying && !scratchingLeft && !scratchingRight) {
        setProgress(audioRef.current.currentTime)
        const rpm = 33.33 / 60
        setLeftRotation((r) => r + rpm * 6 * 2)
        setRightRotation((r) => r + rpm * 6 * 2)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isPlaying, scratchingLeft, scratchingRight])

  useEffect(() => {
    if (gainRef.current) {
      const normalizedCf = crossfader / 100
      const vol = 1 - Math.abs(normalizedCf - 0.5) * 0.4
      gainRef.current.gain.setValueAtTime(vol, audioCtxRef.current?.currentTime || 0)
    }
  }, [crossfader])

  const togglePlay = useCallback(() => {
    initAudio()
    if (audioCtxRef.current?.state === 'suspended') void audioCtxRef.current.resume()
    if (isPlaying) {
      if (brakeAnimRef.current) cancelAnimationFrame(brakeAnimRef.current)
      const audio = audioRef.current
      if (audio) {
        let rate = audio.playbackRate
        const step = () => {
          rate = Math.max(0, rate - 0.06)
          audio.playbackRate = rate
          if (rate > 0) {
            brakeAnimRef.current = requestAnimationFrame(step)
          } else {
            audio.pause()
            setIsPlaying(false)
          }
        }
        step()
      } else {
        setIsPlaying(false)
      }
    } else {
      setSessionActive(true)
      setIsPlaying(true)
      const audio = audioRef.current
      if (audio) {
        audio.playbackRate = 0
        void audio.play()
        if (brakeAnimRef.current) cancelAnimationFrame(brakeAnimRef.current)
        let rate = 0
        const step = () => {
          rate = Math.min(1, rate + 0.06)
          audio.playbackRate = rate
          if (rate < 1) {
            brakeAnimRef.current = requestAnimationFrame(step)
          }
        }
        step()
      }
    }
  }, [initAudio, isPlaying])

  const toggleDeckLeft = useCallback(() => setLeftActive((v) => !v), [])
  const toggleDeckRight = useCallback(() => setRightActive((v) => !v), [])

  const handleScratchStart = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => {
      if (!audioRef.current || !isPlaying) return
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      scratchStartY.current = clientY
      scratchStartTime.current = audioRef.current.currentTime
      if (side === 'left') setScratchingLeft(true)
      else setScratchingRight(true)

      if (brakeAnimRef.current) cancelAnimationFrame(brakeAnimRef.current)
      const audio = audioRef.current
      let rate = audio.playbackRate
      const step = () => {
        rate = Math.max(0, rate - 0.1)
        if (audio) audio.playbackRate = rate
        if (rate > 0) {
          brakeAnimRef.current = requestAnimationFrame(step)
        }
      }
      step()
    },
    [isPlaying]
  )

  const handleScratchMove = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => {
      if ((side === 'left' && !scratchingLeft) || (side === 'right' && !scratchingRight)) return
      if (!audioRef.current) return
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const delta = (scratchStartY.current - clientY) * 0.02

      if (Math.abs(delta) > 0.02 && scratchAudioRef.current) {
        if (scratchAudioRef.current.paused || scratchAudioRef.current.currentTime > 0.08) {
          scratchAudioRef.current.currentTime = 0
          scratchAudioRef.current.playbackRate = 0.8 + Math.random() * 0.6
          void scratchAudioRef.current.play().catch(() => {})
        }
      }

      const dur = audioRef.current.duration || duration
      const newTime = Math.max(0, Math.min(scratchStartTime.current + delta, dur))
      audioRef.current.currentTime = newTime

      const rotDelta = (scratchStartY.current - clientY) * 2
      if (side === 'left') setLeftRotation((r) => r + rotDelta * 0.5)
      else setRightRotation((r) => r + rotDelta * 0.5)

      scratchStartY.current = clientY
      scratchStartTime.current = newTime
    },
    [scratchingLeft, scratchingRight, duration]
  )

  const handleScratchEnd = useCallback(() => {
    setScratchingLeft(false)
    setScratchingRight(false)

    if (audioRef.current && isPlaying) {
      if (brakeAnimRef.current) cancelAnimationFrame(brakeAnimRef.current)
      const audio = audioRef.current
      let rate = audio.playbackRate
      const step = () => {
        rate = Math.min(1, rate + 0.1)
        if (audio) audio.playbackRate = rate
        if (rate < 1) {
          brakeAnimRef.current = requestAnimationFrame(step)
        }
      }
      step()
    }
  }, [isPlaying])

  const switchTrack = useCallback(
    (direction: 1 | -1) => {
      const next = (currentTrackRef.current + direction + DECK_TRACKS.length) % DECK_TRACKS.length
      currentTrackRef.current = next
      setCurrentTrack(next)
      if (audioRef.current) {
        audioRef.current.src = DECK_TRACKS[next].file
        if (isPlaying) void audioRef.current.play()
      }
    },
    [isPlaying]
  )

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (!audioRef.current || !duration) return
      audioRef.current.currentTime = Math.max(0, Math.min(1, ratio)) * duration
      setProgress(audioRef.current.currentTime)
    },
    [duration]
  )

  const fmt = useCallback((s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`, [])

  const track = DECK_TRACKS[currentTrack]

  const value = useMemo<DeckAudioContextValue>(
    () => ({
      dict,
      isPlaying,
      leftActive,
      rightActive,
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
      toggleDeckLeft,
      toggleDeckRight,
      switchTrack,
      seekToRatio,
      handleScratchStart,
      handleScratchMove,
      handleScratchEnd,
      track,
      fmt,
    }),
    [
      dict,
      isPlaying,
      leftActive,
      rightActive,
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
    ]
  )

  return (
    <DeckAudioContext.Provider value={value}>
      <div className={sessionActive ? 'pb-[4.75rem] sm:pb-[5rem]' : undefined}>{children}</div>
      <MiniDeckBar lang={lang} />
    </DeckAudioContext.Provider>
  )
}
