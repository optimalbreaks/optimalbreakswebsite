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
import Link from 'next/link'
import SoundCloudWidget, { type SoundCloudWidgetHandle } from '@/components/SoundCloudWidget'

export interface DeckDict {
  play: string
  stop: string
  deck_brand: string
  deck_model: string
  mixer: string
  bpm: string
  crossfader: string
}

export type PlayerMode = 'idle' | 'deck' | 'mix'

export interface MixTrack {
  id: string
  title: string
  artist: string
  imageUrl?: string | null
  source: 'mp3' | 'soundcloud'
  src: string
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
}

const DeckAudioContext = createContext<DeckAudioContextValue | null>(null)

export function useDeckAudio() {
  const ctx = useContext(DeckAudioContext)
  if (!ctx) throw new Error('useDeckAudio must be used within DeckAudioProvider')
  return ctx
}

// ─── MiniDeckBar ────────────────────────────────────────
function MiniDeckBar({ lang }: { lang: Locale }) {
  const ctx = useDeckAudio()
  const { mode, sessionActive } = ctx
  if (mode === 'idle' && !sessionActive) return null

  if (mode === 'mix') return <MiniMixBar lang={lang} />
  if (sessionActive) return <MiniDeckBarInner lang={lang} />
  return null
}

function MiniDeckBarInner({ lang }: { lang: Locale }) {
  const { isPlaying, togglePlay, initAudio, track, progress, duration, fmt, seekToRatio } = useDeckAudio()
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
          className="relative flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 shadow-[0_4px_8px_rgba(0,0,0,0.6)] active:shadow-[0_1px_2px_rgba(0,0,0,0.8)] active:translate-y-[2px] w-12 h-12 shrink-0 outline-none [-webkit-tap-highlight-color:transparent]"
          style={{
            background: 'linear-gradient(135deg, #f7e733 0%, #b8a800 100%)',
            border: '3px solid #080808',
            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4), 0 4px 8px rgba(0,0,0,0.5)'
          }}
        >
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '6px', letterSpacing: '1px', color: 'var(--red)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', textShadow: '0 1px 1px rgba(0,0,0,0.2)' }}>
            <span className="transition-all duration-200 flex items-center justify-center" style={{ filter: isPlaying ? 'drop-shadow(0 0 6px var(--red))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
              {isPlaying ? (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px' }}>
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px', marginLeft: '1px' }}>
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              )}
            </span>
            {isPlaying ? 'STOP' : 'PLAY'}
          </span>
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

function MiniMixBar({ lang }: { lang: Locale }) {
  const { currentMix, mixPlaying, mixProgress, mixDuration, toggleMixPlayback, stopMix, seekMixToRatio, fmt } = useDeckAudio()
  const es = lang === 'es'
  if (!currentMix) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[199] border-t-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] shadow-[0_-6px_24px_rgba(0,0,0,0.25)]"
      role="region"
      aria-label={es ? 'Reproductor de mix' : 'Mix player'}
    >
      <div className="flex items-center gap-2 sm:gap-4 px-3 py-2 sm:px-4 sm:py-2.5 max-w-[1200px] mx-auto">
        <button
          type="button"
          onClick={toggleMixPlayback}
          className="relative flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 shadow-[0_4px_8px_rgba(0,0,0,0.6)] active:shadow-[0_1px_2px_rgba(0,0,0,0.8)] active:translate-y-[2px] w-12 h-12 shrink-0 outline-none [-webkit-tap-highlight-color:transparent]"
          style={{
            background: mixPlaying ? 'linear-gradient(135deg, var(--red) 0%, #8b0000 100%)' : 'linear-gradient(135deg, #f7e733 0%, #b8a800 100%)',
            border: '3px solid #080808',
            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4), 0 4px 8px rgba(0,0,0,0.5)'
          }}
        >
          <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '6px', letterSpacing: '1px', color: mixPlaying ? '#fff' : 'var(--red)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', textShadow: '0 1px 1px rgba(0,0,0,0.2)' }}>
            <span className="transition-all duration-200 flex items-center justify-center" style={{ filter: mixPlaying ? 'drop-shadow(0 0 6px rgba(255,255,255,0.8))' : 'drop-shadow(0 0 6px var(--red))' }}>
              {mixPlaying ? (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px' }}>
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '12px', height: '12px', marginLeft: '1px' }}>
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              )}
            </span>
            {mixPlaying ? 'STOP' : 'PLAY'}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="shrink-0 bg-[var(--red)] text-white"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '7px', letterSpacing: '1px', padding: '1px 6px', textTransform: 'uppercase' }}
            >
              {currentMix.source === 'soundcloud' ? 'SC' : 'MP3'}
            </span>
            <div
              className="truncate"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', color: 'var(--yellow)' }}
            >
              {currentMix.artist} — {currentMix.title}
            </div>
          </div>
          <div
            className="h-[2px] bg-white/10 rounded-full mt-1 overflow-hidden cursor-pointer"
            onClick={(e) => {
              if (!mixDuration) return
              const rect = e.currentTarget.getBoundingClientRect()
              seekMixToRatio((e.clientX - rect.left) / rect.width)
            }}
          >
            <div
              className="h-full bg-[var(--yellow)] rounded-full"
              style={{ width: mixDuration ? `${(mixProgress / mixDuration) * 100}%` : '0%' }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '8px', color: 'rgba(232,220,200,0.4)' }}>
              {fmt(mixProgress)}
            </span>
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '8px', color: 'rgba(232,220,200,0.4)' }}>
              {mixDuration ? fmt(mixDuration) : '—'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={stopMix}
          className="shrink-0 border-[2px] border-white/20 text-white/60 hover:border-[var(--red)] hover:text-[var(--red)] transition-colors"
          style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '8px', letterSpacing: '1px', padding: '5px 8px' }}
        >
          ✕
        </button>
      </div>
    </div>
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
  const scratchAudioRef = useRef<HTMLAudioElement | null>(null)

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
    if (!scratchAudioRef.current) {
      const scratch = new Audio('/music/scratch.mp3')
      scratch.volume = 0.6
      scratchAudioRef.current = scratch
    }

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

  // === Crossfader sharp cut: A at <50, B at >=50, tiny xfade at boundary ===
  useEffect(() => {
    const ctx = audioCtxRef.current
    const t = ctx?.currentTime ?? 0
    const fade = 0.03 // 30ms micro-fade to avoid click
    if (gainRefA.current) {
      gainRefA.current.gain.cancelScheduledValues(t)
      gainRefA.current.gain.setTargetAtTime(crossfader < 50 ? 1 : 0, t, fade)
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
        setPlayingA(true)
        audio.playbackRate = 1
        void audio.play().catch(() => {})
      }
    } else {
      const audio = audioRefB.current
      if (!audio) return
      if (playingB) {
        setPlayingB(false)
        audio.pause()
      } else {
        setPlayingB(true)
        audio.playbackRate = 1
        void audio.play().catch(() => {})
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
    setIsPlaying(crossfader < 50 ? playingA : playingB)
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

      if (Math.abs(delta) > 0.02 && scratchAudioRef.current) {
        if (scratchAudioRef.current.paused || scratchAudioRef.current.currentTime > 0.08) {
          scratchAudioRef.current.currentTime = 0
          scratchAudioRef.current.playbackRate = 0.8 + Math.random() * 0.6
          void scratchAudioRef.current.play().catch(() => {})
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
    // Pause the deck if it's playing
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.playbackRate = 1
      setIsPlaying(false)
    }

    // Stop any previous mix
    stopMixInternal()

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

      void audio.play().then(() => setMixPlaying(true)).catch(() => {})
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
  }, [isPlaying, stopMixInternal])

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

  // === Media Session action handlers (update when mix state changes) ===
  useEffect(() => {
    if (mode !== 'mix' || !('mediaSession' in navigator)) return

    navigator.mediaSession.setActionHandler('play', () => {
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
  }, [])

  const handleScHandleRef = useCallback((h: SoundCloudWidgetHandle | null) => {
    scHandleRef.current = h
  }, [])

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
    ]
  )

  const showBar = mode !== 'idle' || sessionActive

  return (
    <DeckAudioContext.Provider value={value}>
      <div className={showBar ? 'pb-[4.75rem] sm:pb-[5rem]' : undefined}>{children}</div>
      <MiniDeckBar lang={lang} />
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
