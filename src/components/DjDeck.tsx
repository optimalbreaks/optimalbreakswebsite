// ============================================
// OPTIMAL BREAKS — DJ Deck with Audio Playback
// Audio engine: DeckAudioProvider (persiste al navegar)
// ============================================

'use client'

import { useState, type CSSProperties } from 'react'
import { useDeckAudio, type DeckDict } from '@/components/DeckAudioProvider'

interface DjDeckProps {
  dict: Record<string, unknown> & {
    deck_brand: string
    deck_model: string
    deck_a: string
    deck_b: string
    mixer: string
    bpm: string
    crossfader: string
  }
}

export default function DjDeck({ dict }: DjDeckProps) {
  const {
    dict: d,
    isPlaying,
    crossfader,
    setCrossfader,
    progress,
    duration,
    scratchingLeft,
    scratchingRight,
    leftRotation,
    rightRotation,
    initAudio,
    togglePlay,
    switchTrack,
    seekToRatio,
    handleScratchStart,
    handleScratchMove,
    handleScratchEnd,
    track,
    fmt,
  } = useDeckAudio()

  const h = dict

  return (
    <div className="relative z-[2] w-full min-w-0 max-w-[880px] mx-auto bg-[var(--ink)] border-4 border-[var(--ink)] p-3 sm:p-5 shadow-[8px_8px_0_rgba(0,0,0,0.15)]">
      {/* Tape */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-[80px] sm:w-[100px] h-[22px] z-10" style={{ background: 'var(--tape)' }} />

      {/* Top bar — track selector */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-dashed border-white/10 gap-2">
        <div className="hidden sm:block" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--yellow)', letterSpacing: '3px' }}>
          {h.deck_brand}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-1 sm:flex-none justify-center min-w-0">
          <button type="button" onClick={() => { initAudio(); switchTrack(-1) }} className="text-white/50 hover:text-[var(--yellow)] transition-colors text-lg px-2 py-1">
            ◄
          </button>
          <div className="text-center truncate flex-1 max-w-[120px] sm:max-w-[200px]" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'var(--yellow)', letterSpacing: '1px' }}>
            {track.title}
          </div>
          <button type="button" onClick={() => { initAudio(); switchTrack(1) }} className="text-white/50 hover:text-[var(--yellow)] transition-colors text-lg px-2 py-1">
            ►
          </button>
        </div>
        <div className="hidden lg:block" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.3)' }}>
          {h.deck_model}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3 px-1">
        <div
          className="h-[3px] bg-white/10 rounded-full relative cursor-pointer"
          onClick={(e) => {
            if (!duration) return
            const rect = e.currentTarget.getBoundingClientRect()
            seekToRatio((e.clientX - rect.left) / rect.width)
          }}
        >
          <div className="h-full bg-[var(--red)] rounded-full transition-all duration-100" style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }} />
        </div>
        <div className="flex justify-between mt-1">
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{fmt(progress)}</span>
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{duration ? fmt(duration) : '0:00'}</span>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-[1fr_170px_1fr] gap-3 items-center">
        <Platter
          side="left"
          rotation={leftRotation}
          playing={isPlaying}
          scratching={scratchingLeft}
          track={track}
          labelColor="red"
          onScratchStart={handleScratchStart}
          onScratchMove={handleScratchMove}
          onScratchEnd={handleScratchEnd}
          deckLabel={h.deck_a}
        />
        <MixerPanel dict={d} isPlaying={isPlaying} crossfader={crossfader} setCrossfader={setCrossfader} togglePlay={togglePlay} layout="vertical" />
        <Platter
          side="right"
          rotation={rightRotation}
          playing={isPlaying}
          scratching={scratchingRight}
          track={track}
          labelColor="yellow"
          onScratchStart={handleScratchStart}
          onScratchMove={handleScratchMove}
          onScratchEnd={handleScratchEnd}
          deckLabel={h.deck_b}
        />
      </div>

      <div className="md:hidden">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Platter
            side="left"
            rotation={leftRotation}
            playing={isPlaying}
            scratching={scratchingLeft}
            track={track}
            labelColor="red"
            onScratchStart={handleScratchStart}
            onScratchMove={handleScratchMove}
            onScratchEnd={handleScratchEnd}
            deckLabel={h.deck_a}
            compact
          />
          <Platter
            side="right"
            rotation={rightRotation}
            playing={isPlaying}
            scratching={scratchingRight}
            track={track}
            labelColor="yellow"
            onScratchStart={handleScratchStart}
            onScratchMove={handleScratchMove}
            onScratchEnd={handleScratchEnd}
            deckLabel={h.deck_b}
            compact
          />
        </div>
        <MixerPanel dict={d} isPlaying={isPlaying} crossfader={crossfader} setCrossfader={setCrossfader} togglePlay={togglePlay} layout="horizontal" />
      </div>
    </div>
  )
}

function Platter({
  side,
  rotation,
  playing,
  scratching,
  track,
  labelColor,
  onScratchStart,
  onScratchMove,
  onScratchEnd,
  deckLabel,
  compact = false,
}: {
  side: 'left' | 'right'
  rotation: number
  playing: boolean
  scratching: boolean
  track: { title: string; artist: string }
  labelColor: string
  onScratchStart: (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => void
  onScratchMove: (side: 'left' | 'right', e: React.MouseEvent | React.TouchEvent) => void
  onScratchEnd: () => void
  deckLabel: string
  compact?: boolean
}) {
  return (
    <div>
      <div className={`relative flex items-center justify-center bg-[#0e0e12] rounded-md border-2 border-white/[0.06] ${compact ? 'aspect-square' : 'aspect-square'}`}>
        <div
          className={`${compact ? 'w-[85%]' : 'w-[82%]'} aspect-square rounded-full relative select-none`}
          style={{
            backgroundImage: `url(/images/${side === 'left' ? 'disco_optimal_breaks_A.webp' : 'disco_optimal_breaks.webp'})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '2px solid rgba(255,255,255,0.08)',
            transform: `rotate(${rotation}deg)`,
            cursor: scratching ? 'grabbing' : 'grab',
          }}
          onMouseDown={(e) => onScratchStart(side, e)}
          onMouseMove={(e) => onScratchMove(side, e)}
          onMouseUp={onScratchEnd}
          onMouseLeave={onScratchEnd}
          onTouchStart={(e) => onScratchStart(side, e)}
          onTouchMove={(e) => onScratchMove(side, e)}
          onTouchEnd={onScratchEnd}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[5px] h-[5px] sm:w-[7px] sm:h-[7px] rounded-full bg-[#0e0e12] border border-white/[0.15] z-[2]" />
          <div className="absolute top-[10%] left-1/2 w-[1px] h-[15%] bg-white/10" />
        </div>

        <div
          className={`absolute top-[6px] right-[8px] sm:right-[10px] z-[5] w-[2px] sm:w-[3px] rounded-[2px] transition-transform duration-500 ${compact ? 'h-[40%]' : 'h-1/2'}`}
          style={{
            background: 'linear-gradient(180deg, #666, #444)',
            transformOrigin: 'top center',
            transform: playing && !scratching ? 'rotate(8deg)' : 'rotate(-15deg)',
          }}
        >
          <div className="absolute -top-[3px] -left-[2px] sm:-left-[3px] w-[6px] h-[6px] sm:w-[9px] sm:h-[9px] rounded-full bg-[#555]" />
          <div className="absolute -bottom-[2px] -left-[1px] sm:-left-[2px] w-[5px] h-[7px] sm:w-[7px] sm:h-[10px] bg-[#777] rounded-[1px]" />
        </div>
      </div>

      <div className={`text-center ${compact ? 'mt-1' : 'mt-2'}`} style={{ fontFamily: "'Courier Prime', monospace", fontSize: compact ? '7px' : '9px', letterSpacing: '3px', color: 'rgba(255,255,255,0.3)' }}>
        {deckLabel}
      </div>
    </div>
  )
}

function MixerPanel({
  dict,
  isPlaying,
  crossfader,
  setCrossfader,
  togglePlay,
  layout,
}: {
  dict: MixerDict
  isPlaying: boolean
  crossfader: number
  setCrossfader: (v: number) => void
  togglePlay: () => void
  layout: 'vertical' | 'horizontal'
}) {
  const isH = layout === 'horizontal'

  return (
    <div className={`bg-[#0a0a0e] border border-white/[0.06] rounded-md ${isH ? 'p-3 flex flex-wrap items-center justify-center gap-3' : 'p-3 flex flex-col gap-3 items-center'}`}>
      <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '3px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
        {dict.mixer}
      </div>

      <div className={`flex gap-[5px] items-end p-[6px] bg-[#070709] rounded-[3px] border border-white/[0.04] ${isH ? 'h-[50px]' : 'h-[70px]'}`}>
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
            className={`${isH ? 'w-[5px]' : 'w-[7px]'} rounded-[2px]`}
            style={
              {
                background: bar.color,
                '--min': `${isPlaying ? (isH ? bar.min * 0.6 : bar.min) : 4}px`,
                '--max': `${isPlaying ? (isH ? bar.max * 0.6 : bar.max) : 6}px`,
                animation: `vuBounce ${isPlaying ? '0.8' : '2'}s ease-in-out infinite`,
                animationDelay: `${bar.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className={`${isH ? 'flex gap-3' : 'grid grid-cols-2 gap-[6px] w-full'}`}>
        <Knob label="HI" colorClass="bg-[var(--acid)]" compact={isH} />
        <Knob label="MID" colorClass="bg-[var(--uv)]" compact={isH} />
        {!isH && <Knob label="LOW" colorClass="bg-[var(--pink)]" compact={false} />}
        {!isH && <Knob label="FX" colorClass="bg-[var(--cyan)]" compact={false} />}
      </div>
      {isH && (
        <div className="flex gap-3">
          <Knob label="LOW" colorClass="bg-[var(--pink)]" compact />
          <Knob label="FX" colorClass="bg-[var(--cyan)]" compact />
        </div>
      )}

      <button
        type="button"
        onClick={togglePlay}
        className={`border-2 cursor-pointer transition-all duration-150 ${isH ? 'px-6 py-2' : 'w-full py-3'} ${isPlaying ? 'bg-[var(--red)] border-[var(--red)] text-white' : 'bg-[var(--yellow)] border-[var(--yellow)] text-[var(--ink)]'}`}
        style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: isH ? '12px' : '14px', letterSpacing: '3px', textTransform: 'uppercase' }}
      >
        {isPlaying ? '■ PAUSE' : '▶ PLAY'}
      </button>

      <div className={`bg-[#070709] border border-white/[0.04] rounded-[3px] text-center ${isH ? 'px-4 py-2' : 'p-[6px] w-full'}`} style={{ animation: isPlaying ? 'bpmPulse 1s ease-in-out infinite' : 'none' }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: isH ? '18px' : '24px', color: 'var(--yellow)', textShadow: isPlaying ? '0 0 8px rgba(247,231,51,0.3)' : 'none' }}>
          135
        </div>
        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '3px', color: 'var(--red)' }}>{dict.bpm}</div>
      </div>

      <div className={`bg-[#070709] rounded-[3px] border border-white/[0.04] ${isH ? 'px-3 py-2 flex-1 min-w-[120px] max-w-[200px]' : 'w-full p-[6px]'}`}>
        <div className="mb-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '3px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
          {dict.crossfader}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={crossfader}
          onChange={(e) => setCrossfader(Number(e.target.value))}
          className="w-full h-[6px] bg-[#222] rounded-[3px] cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:bg-gradient-to-b [&::-webkit-slider-thumb]:from-[#777] [&::-webkit-slider-thumb]:to-[#444] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#999] [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:cursor-grab"
        />
        <div className="flex justify-between mt-1">
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', color: 'rgba(255,255,255,0.2)' }}>A</span>
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', color: 'rgba(255,255,255,0.2)' }}>B</span>
        </div>
      </div>
    </div>
  )
}

type MixerDict = Pick<DeckDict, 'mixer' | 'bpm' | 'crossfader'>

function Knob({ label, colorClass, compact = false }: { label: string; colorClass: string; compact?: boolean }) {
  const [angle, setAngle] = useState(0)
  return (
    <div className="text-center">
      <label className="block mb-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '2px', color: 'rgba(255,255,255,0.25)' }}>
        {label}
      </label>
      <div
        className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full border-2 border-[#555] mx-auto relative cursor-pointer transition-transform duration-200`}
        style={{ background: 'conic-gradient(from 220deg, #333, #555, #333)', transform: `rotate(${angle}deg)` }}
        onClick={() => setAngle((a) => (a + 30) % 360)}
      >
        <div className={`absolute top-[2px] sm:top-[3px] left-1/2 -translate-x-1/2 w-[2px] ${compact ? 'h-[6px]' : 'h-[8px]'} rounded-[1px] ${colorClass}`} />
      </div>
    </div>
  )
}
