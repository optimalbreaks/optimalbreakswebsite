// ============================================
// OPTIMAL BREAKS — DJ Deck with Audio Playback
// Plays one track, simulates mixing with
// scratch, stop/play, crossfader control
// ============================================

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface DjDeckProps {
  dict: any
}

// Available tracks
const TRACKS = [
  { file: '/music/breakbeat_odyssey.mp3', title: 'BREAKBEAT ODYSSEY', artist: 'OPTIMAL BREAKS' },
  { file: '/music/epic_breakbeat_odyssey.mp3', title: 'EPIC ODYSSEY', artist: 'OPTIMAL BREAKS' },
  { file: '/music/epic_groove_odyssey.mp3', title: 'GROOVE ODYSSEY', artist: 'OPTIMAL BREAKS' },
  { file: '/music/the_intensity_that_transforms_the_limits.mp3', title: 'INTENSITY', artist: 'OPTIMAL BREAKS' },
  { file: '/music/the_movement_that_ignites_the_limits.mp3', title: 'MOVEMENT', artist: 'OPTIMAL BREAKS' },
  { file: '/music/epic_breakbeat_odyssey (1).mp3', title: 'EPIC ODYSSEY II', artist: 'OPTIMAL BREAKS' },
]

export default function DjDeck({ dict }: DjDeckProps) {
  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [leftActive, setLeftActive] = useState(true)
  const [rightActive, setRightActive] = useState(true)
  const [crossfader, setCrossfader] = useState(50)
  const [currentTrack, setCurrentTrack] = useState(0)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  // Scratch state
  const [scratchingLeft, setScratchingLeft] = useState(false)
  const [scratchingRight, setScratchingRight] = useState(false)
  const scratchStartY = useRef(0)
  const scratchStartTime = useRef(0)
  const [leftRotation, setLeftRotation] = useState(0)
  const [rightRotation, setRightRotation] = useState(0)
  const animFrameRef = useRef<number>(0)

  // Init audio
  const initAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio(TRACKS[currentTrack].file)
      audio.crossOrigin = 'anonymous'
      audio.preload = 'auto'
      audioRef.current = audio

      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
      audio.addEventListener('ended', () => {
        // Auto next track
        const next = (currentTrack + 1) % TRACKS.length
        setCurrentTrack(next)
        audio.src = TRACKS[next].file
        audio.play()
      })
    }

    if (!audioCtxRef.current) {
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const source = ctx.createMediaElementSource(audioRef.current)
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)
      sourceRef.current = source
      gainRef.current = gain
    }
  }, [currentTrack])

  // Update progress
  useEffect(() => {
    const tick = () => {
      if (audioRef.current && isPlaying && !scratchingLeft && !scratchingRight) {
        setProgress(audioRef.current.currentTime)

        // Rotate platters based on playback
        const rpm = 33.33 / 60 // revolutions per frame at ~60fps
        setLeftRotation((r) => r + rpm * 6 * 2)
        setRightRotation((r) => r + rpm * 6 * 2)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isPlaying, scratchingLeft, scratchingRight])

  // Apply crossfader volume
  useEffect(() => {
    if (gainRef.current) {
      // Both decks "play" the same track, crossfader just adjusts volume feel
      // Center = full vol, edges = slightly reduced for effect
      const normalizedCf = crossfader / 100
      const vol = 1 - Math.abs(normalizedCf - 0.5) * 0.4
      gainRef.current.gain.setValueAtTime(vol, audioCtxRef.current?.currentTime || 0)
    }
  }, [crossfader])

  // Play / Pause
  const togglePlay = () => {
    initAudio()
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume()
    }

    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    } else {
      audioRef.current?.play()
      setIsPlaying(true)
    }
  }

  // Toggle individual deck (simulated — stops/resumes platter visually + mutes)
  const toggleDeckLeft = () => {
    if (leftActive && rightActive) {
      setLeftActive(false)
      // Mute if only left was "active"
    } else if (!leftActive) {
      setLeftActive(true)
    }
  }

  const toggleDeckRight = () => {
    if (rightActive && leftActive) {
      setRightActive(false)
    } else if (!rightActive) {
      setRightActive(true)
    }
  }

  // Scratch handlers
  const handleScratchStart = (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => {
    if (!audioRef.current || !isPlaying) return

    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    scratchStartY.current = clientY
    scratchStartTime.current = audioRef.current.currentTime

    if (side === 'left') {
      setScratchingLeft(true)
    } else {
      setScratchingRight(true)
    }

    // Slow down playback rate for scratch feel
    audioRef.current.playbackRate = 0
  }

  const handleScratchMove = (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => {
    if ((side === 'left' && !scratchingLeft) || (side === 'right' && !scratchingRight)) return
    if (!audioRef.current) return

    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const delta = (scratchStartY.current - clientY) * 0.05

    // Move audio position
    const newTime = Math.max(0, Math.min(scratchStartTime.current + delta, duration))
    audioRef.current.currentTime = newTime

    // Rotate platter based on scratch
    const rotationDelta = (scratchStartY.current - clientY) * 2
    if (side === 'left') {
      setLeftRotation((r) => r + rotationDelta * 0.3)
    } else {
      setRightRotation((r) => r + rotationDelta * 0.3)
    }
    scratchStartY.current = clientY
    scratchStartTime.current = newTime
  }

  const handleScratchEnd = () => {
    setScratchingLeft(false)
    setScratchingRight(false)
    if (audioRef.current && isPlaying) {
      audioRef.current.playbackRate = 1
    }
  }

  // Next/prev track
  const switchTrack = (direction: 1 | -1) => {
    const next = (currentTrack + direction + TRACKS.length) % TRACKS.length
    setCurrentTrack(next)
    if (audioRef.current) {
      audioRef.current.src = TRACKS[next].file
      if (isPlaying) audioRef.current.play()
    }
  }

  // Format time
  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const track = TRACKS[currentTrack]

  return (
    <div className="relative z-[2] max-w-[880px] mx-auto bg-[var(--ink)] border-4 border-[var(--ink)] p-5 shadow-[8px_8px_0_rgba(0,0,0,0.15)]">
      {/* Tape on top */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-[100px] h-[22px] z-10" style={{ background: 'var(--tape)' }} />

      {/* Top bar */}
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-dashed border-white/10">
        <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '14px', color: 'var(--yellow)', letterSpacing: '3px' }}>
          {dict.deck_brand}
        </div>
        <div className="flex items-center gap-3">
          {/* Track selector */}
          <button
            onClick={() => switchTrack(-1)}
            className="text-white/30 hover:text-[var(--yellow)] transition-colors"
            style={{ fontFamily: "'Courier Prime', monospace", fontSize: '14px' }}
          >
            ◄
          </button>
          <div className="text-center" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'var(--yellow)', letterSpacing: '1px', maxWidth: '200px' }}>
            {track.title}
          </div>
          <button
            onClick={() => switchTrack(1)}
            className="text-white/30 hover:text-[var(--yellow)] transition-colors"
            style={{ fontFamily: "'Courier Prime', monospace", fontSize: '14px' }}
          >
            ►
          </button>
        </div>
        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)' }}>
          {dict.deck_model}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 px-1">
        <div className="h-[3px] bg-white/10 rounded-full relative cursor-pointer"
          onClick={(e) => {
            if (!audioRef.current) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            audioRef.current.currentTime = pct * duration
          }}
        >
          <div
            className="h-full bg-[var(--red)] rounded-full transition-all duration-100"
            style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>
            {fmt(progress)}
          </span>
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>
            {duration ? fmt(duration) : '0:00'}
          </span>
        </div>
      </div>

      {/* Deck layout */}
      <div className="grid grid-cols-[1fr_170px_1fr] gap-3 items-center max-md:grid-cols-2">
        {/* Deck A */}
        <div style={{ opacity: leftActive ? 1 : 0.4 }}>
          <div className="relative aspect-square flex items-center justify-center bg-[#0e0e12] rounded-md border-2 border-white/[0.06]">
            <div
              className="w-[82%] aspect-square rounded-full relative select-none"
              style={{
                background: 'repeating-radial-gradient(circle at center, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px)',
                border: '2px solid rgba(255,255,255,0.08)',
                transform: `rotate(${leftRotation}deg)`,
                cursor: scratchingLeft ? 'grabbing' : 'grab',
                transition: scratchingLeft ? 'none' : 'transform 0.05s linear',
              }}
              onMouseDown={(e) => handleScratchStart('left', e)}
              onMouseMove={(e) => handleScratchMove('left', e)}
              onMouseUp={handleScratchEnd}
              onMouseLeave={handleScratchEnd}
              onTouchStart={(e) => handleScratchStart('left', e)}
              onTouchMove={(e) => handleScratchMove('left', e)}
              onTouchEnd={handleScratchEnd}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34%] aspect-square rounded-full flex items-center justify-center z-[2]">
                <div className="w-full h-full rounded-full flex flex-col items-center justify-center" style={{ background: 'radial-gradient(circle, var(--red) 0%, #8b0000 100%)', color: 'white' }}>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '7px', letterSpacing: '2px', textTransform: 'uppercase' }}>
                    {track.artist}
                  </div>
                  <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '5.5px', letterSpacing: '1px', marginTop: '2px', opacity: 0.7 }}>
                    {track.title}
                  </div>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full bg-[#0e0e12] border border-white/[0.15]" />
              </div>
              {/* Groove marker for visual rotation reference */}
              <div className="absolute top-[10%] left-1/2 w-[1px] h-[15%] bg-white/10" />
            </div>

            {/* Tonearm */}
            <div
              className="absolute top-[6px] right-[10px] z-[5] w-[3px] h-1/2 rounded-[2px] transition-transform duration-500"
              style={{
                background: 'linear-gradient(180deg, #666, #444)',
                transformOrigin: 'top center',
                transform: isPlaying && leftActive && !scratchingLeft ? 'rotate(8deg)' : 'rotate(-15deg)',
              }}
            >
              <div className="absolute -top-[3px] -left-[3px] w-[9px] h-[9px] rounded-full bg-[#555]" />
              <div className="absolute -bottom-[3px] -left-[2px] w-[7px] h-[10px] bg-[#777] rounded-[1px]" />
            </div>
          </div>

          <div className="text-center mt-2" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)' }}>
            {dict.deck_a}
          </div>
          <div className="flex justify-center mt-2">
            <button
              onClick={toggleDeckLeft}
              className={`border-2 px-[18px] py-[5px] cursor-pointer transition-all duration-100 ${leftActive ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-transparent text-[var(--yellow)] border-white/[0.15] hover:bg-[var(--yellow)] hover:text-[var(--ink)] hover:border-[var(--yellow)]'}`}
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase' }}
            >
              {leftActive ? `▶ ${dict.play}` : `■ ${dict.stop}`}
            </button>
          </div>
        </div>

        {/* ======= MIXER ======= */}
        <div className="bg-[#0a0a0e] border border-white/[0.06] rounded-md p-3 flex flex-col gap-3 items-center max-md:col-span-2 max-md:flex-row max-md:flex-wrap max-md:justify-center max-md:p-4">
          <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '3px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
            {dict.mixer}
          </div>

          {/* VU Meters */}
          <div className="flex gap-[5px] h-[70px] items-end p-[6px] bg-[#070709] rounded-[3px] border border-white/[0.04]">
            {[
              { color: 'var(--acid)', min: 8, max: 50, delay: 0 },
              { color: 'var(--acid)', min: 12, max: 60, delay: 0.1 },
              { color: 'var(--yellow)', min: 6, max: 45, delay: 0.2 },
              { color: 'var(--orange)', min: 10, max: 55, delay: 0.15 },
              { color: 'var(--red)', min: 5, max: 40, delay: 0.25 },
              { color: 'var(--red)', min: 8, max: 35, delay: 0.05 },
            ].map((bar, i) => (
              <div
                key={i}
                className="w-[7px] rounded-[2px]"
                style={{
                  background: bar.color,
                  '--min': `${isPlaying ? bar.min : 4}px`,
                  '--max': `${isPlaying ? bar.max : 6}px`,
                  animation: `vuBounce ${isPlaying ? '0.8' : '2'}s ease-in-out infinite`,
                  animationDelay: `${bar.delay}s`,
                } as React.CSSProperties}
              />
            ))}
          </div>

          {/* Knobs */}
          <div className="grid grid-cols-2 gap-[6px] w-full">
            <Knob label="HI" colorClass="bg-[var(--acid)]" />
            <Knob label="MID" colorClass="bg-[var(--uv)]" />
          </div>
          <div className="grid grid-cols-2 gap-[6px] w-full">
            <Knob label="LOW" colorClass="bg-[var(--pink)]" />
            <Knob label="FX" colorClass="bg-[var(--cyan)]" />
          </div>

          {/* MAIN PLAY BUTTON */}
          <button
            onClick={togglePlay}
            className={`w-full py-3 border-2 cursor-pointer transition-all duration-150 ${isPlaying ? 'bg-[var(--red)] border-[var(--red)] text-white' : 'bg-[var(--yellow)] border-[var(--yellow)] text-[var(--ink)]'}`}
            style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', letterSpacing: '3px', textTransform: 'uppercase' }}
          >
            {isPlaying ? '■ PAUSE' : '▶ PLAY'}
          </button>

          {/* BPM */}
          <div className="bg-[#070709] border border-white/[0.04] rounded-[3px] p-[6px] text-center w-full" style={{ animation: isPlaying ? 'bpmPulse 1s ease-in-out infinite' : 'none' }}>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', textShadow: isPlaying ? '0 0 8px rgba(247,231,51,0.3)' : 'none' }}>
              135
            </div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '3px', color: 'var(--red)' }}>
              {dict.bpm}
            </div>
          </div>

          {/* Crossfader */}
          <div className="w-full p-[6px] bg-[#070709] rounded-[3px] border border-white/[0.04]">
            <div className="mb-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '3px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
              {dict.crossfader}
            </div>
            <input
              type="range" min="0" max="100" value={crossfader}
              onChange={(e) => setCrossfader(Number(e.target.value))}
              className="w-full h-[6px] bg-[#222] rounded-[3px] cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:bg-gradient-to-b [&::-webkit-slider-thumb]:from-[#777] [&::-webkit-slider-thumb]:to-[#444] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#999] [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:cursor-grab"
            />
            <div className="flex justify-between mt-1">
              <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', color: 'rgba(255,255,255,0.2)' }}>A</span>
              <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', color: 'rgba(255,255,255,0.2)' }}>B</span>
            </div>
          </div>
        </div>

        {/* ======= DECK B ======= */}
        <div style={{ opacity: rightActive ? 1 : 0.4 }}>
          <div className="relative aspect-square flex items-center justify-center bg-[#0e0e12] rounded-md border-2 border-white/[0.06]">
            <div
              className="w-[82%] aspect-square rounded-full relative select-none"
              style={{
                background: 'repeating-radial-gradient(circle at center, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 4px)',
                border: '2px solid rgba(255,255,255,0.08)',
                transform: `rotate(${rightRotation}deg)`,
                cursor: scratchingRight ? 'grabbing' : 'grab',
                transition: scratchingRight ? 'none' : 'transform 0.05s linear',
              }}
              onMouseDown={(e) => handleScratchStart('right', e)}
              onMouseMove={(e) => handleScratchMove('right', e)}
              onMouseUp={handleScratchEnd}
              onMouseLeave={handleScratchEnd}
              onTouchStart={(e) => handleScratchStart('right', e)}
              onTouchMove={(e) => handleScratchMove('right', e)}
              onTouchEnd={handleScratchEnd}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[34%] aspect-square rounded-full flex items-center justify-center z-[2]">
                <div className="w-full h-full rounded-full flex flex-col items-center justify-center" style={{ background: 'radial-gradient(circle, var(--yellow) 0%, #b8a800 100%)', color: 'var(--ink)' }}>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '7px', letterSpacing: '2px', textTransform: 'uppercase' }}>
                    {track.artist}
                  </div>
                  <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '5.5px', letterSpacing: '1px', marginTop: '2px', opacity: 0.7 }}>
                    {track.title}
                  </div>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full bg-[#0e0e12] border border-white/[0.15]" />
              </div>
              <div className="absolute top-[10%] left-1/2 w-[1px] h-[15%] bg-white/10" />
            </div>

            <div
              className="absolute top-[6px] right-[10px] z-[5] w-[3px] h-1/2 rounded-[2px] transition-transform duration-500"
              style={{
                background: 'linear-gradient(180deg, #666, #444)',
                transformOrigin: 'top center',
                transform: isPlaying && rightActive && !scratchingRight ? 'rotate(8deg)' : 'rotate(-15deg)',
              }}
            >
              <div className="absolute -top-[3px] -left-[3px] w-[9px] h-[9px] rounded-full bg-[#555]" />
              <div className="absolute -bottom-[3px] -left-[2px] w-[7px] h-[10px] bg-[#777] rounded-[1px]" />
            </div>
          </div>

          <div className="text-center mt-2" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)' }}>
            {dict.deck_b}
          </div>
          <div className="flex justify-center mt-2">
            <button
              onClick={toggleDeckRight}
              className={`border-2 px-[18px] py-[5px] cursor-pointer transition-all duration-100 ${rightActive ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-transparent text-[var(--yellow)] border-white/[0.15] hover:bg-[var(--yellow)] hover:text-[var(--ink)] hover:border-[var(--yellow)]'}`}
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '3px', textTransform: 'uppercase' }}
            >
              {rightActive ? `▶ ${dict.play}` : `■ ${dict.stop}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* --- Knob sub-component --- */
function Knob({ label, colorClass }: { label: string; colorClass: string }) {
  const [angle, setAngle] = useState(0)
  return (
    <div className="text-center">
      <label className="block mb-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)' }}>
        {label}
      </label>
      <div
        className="w-8 h-8 rounded-full border-2 border-[#555] mx-auto relative cursor-pointer transition-transform duration-200"
        style={{ background: 'conic-gradient(from 220deg, #333, #555, #333)', transform: `rotate(${angle}deg)` }}
        onClick={() => setAngle((a) => (a + 30) % 360)}
      >
        <div className={`absolute top-[3px] left-1/2 -translate-x-1/2 w-[2px] h-[8px] rounded-[1px] ${colorClass}`} />
      </div>
    </div>
  )
}
