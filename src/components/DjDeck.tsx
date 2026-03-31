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
    <div className="relative z-[2] w-full min-w-0 max-w-[960px] mx-auto bg-[#1a1a1c] rounded-lg p-3 sm:p-5 shadow-[10px_10px_0_rgba(0,0,0,0.3)] border-t-[2px] border-l-[2px] border-white/[0.05] border-b-[4px] border-r-[4px] border-black/[0.8] overflow-hidden">
      {/* Worn noise texture */}
      <div className="absolute inset-0 opacity-[0.15] pointer-events-none mix-blend-overlay z-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
      {/* Scratches/wear simulation */}
      <div className="absolute top-[10%] left-[5%] w-[100px] h-[1px] bg-white/[0.03] rotate-45 pointer-events-none z-0" />
      <div className="absolute bottom-[20%] right-[10%] w-[60px] h-[1px] bg-white/[0.04] -rotate-12 pointer-events-none z-0" />
      <div className="absolute top-[50%] right-[30%] w-[150px] h-[2px] bg-black/[0.2] rotate-3 pointer-events-none z-0" />

      {/* Tape */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-[80px] sm:w-[100px] h-[22px] z-10 shadow-sm" style={{ background: 'var(--tape)', transform: 'rotate(-1deg)' }} />

      {/* Top bar — track selector */}
      <div className="relative z-10 mb-4 bg-[#0a0a0c] border-2 border-[#222] rounded-md p-2 sm:p-3 shadow-inner">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-4">
          <div className="hidden sm:block text-[#444]" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '12px', letterSpacing: '4px' }}>
            {h.deck_brand}
          </div>
          
          <div className="flex items-center justify-between w-full sm:w-auto flex-1 max-w-[400px] bg-[#111] border border-[#333] rounded px-2 py-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
            <button type="button" onClick={() => { initAudio(); switchTrack(-1) }} className="text-[#555] hover:text-[var(--acid)] transition-colors p-1" aria-label="Previous track">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 sm:w-5 sm:h-5"><polygon points="19,4 5,12 19,20" /></svg>
            </button>
            <div className="flex flex-col items-center justify-center flex-1 px-3 min-w-0 overflow-hidden">
              <div className="text-[#333] mb-0.5" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '2px', textTransform: 'uppercase' }}>Now Playing</div>
              <div className="w-full text-center truncate text-[#00ffcc] animate-pulse-slow" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', letterSpacing: '1px', textShadow: '0 0 5px rgba(0,255,204,0.5)' }}>
                {track.title}
              </div>
            </div>
            <button type="button" onClick={() => { initAudio(); switchTrack(1) }} className="text-[#555] hover:text-[var(--acid)] transition-colors p-1" aria-label="Next track">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 sm:w-5 sm:h-5"><polygon points="5,4 19,12 5,20" /></svg>
            </button>
          </div>
          
          <div className="hidden md:block text-[#444]" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '2px' }}>
            {h.deck_model}
          </div>
        </div>

        {/* Progress bar inside the display */}
        <div className="mt-3 relative cursor-pointer group"
          onClick={(e) => {
            if (!duration) return
            const rect = e.currentTarget.getBoundingClientRect()
            seekToRatio((e.clientX - rect.left) / rect.width)
          }}
        >
          <div className="h-[4px] bg-[#111] border border-[#333] rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-[var(--acid)] relative" style={{ width: duration ? `${(progress / duration) * 100}%` : '0%', boxShadow: '0 0 8px var(--acid)' }}>
              <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-white opacity-80 shadow-[0_0_4px_white]" />
            </div>
          </div>
          {/* Hover hit area expansion */}
          <div className="absolute -inset-y-2 inset-x-0" />
          
          <div className="flex justify-between mt-1.5 px-1">
            <span className="text-[#00ffcc]" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', textShadow: '0 0 2px rgba(0,255,204,0.3)' }}>{fmt(progress)}</span>
            <span className="text-[#444]" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px' }}>{duration ? fmt(duration) : '0:00'}</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 hidden md:grid grid-cols-[1fr_170px_1fr] gap-4 items-center">
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
        />
      </div>

      <div className="relative z-10 md:hidden">
        <div className="grid grid-cols-2 gap-3 mb-4">
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
  compact?: boolean
}) {
  return (
    <div>
      <div className={`relative flex items-center justify-center bg-[#131316] rounded-md border-t border-l border-white/[0.08] border-b-2 border-r-2 border-black/[0.6] shadow-inner overflow-hidden ${compact ? 'aspect-square' : 'aspect-square'}`} style={{ touchAction: 'none' }}>
        {/* Technics style strobe dots ring */}
        <div className="absolute w-[94%] aspect-square rounded-full bg-[#222] shadow-[0_0_15px_rgba(0,0,0,0.9)_inset]" />
        <div className="absolute w-[92%] aspect-square rounded-full" style={{ background: 'repeating-conic-gradient(from 0deg, #666 0deg 1.5deg, #111 1.5deg 3deg)', transform: `rotate(${rotation}deg)` }} />
        <div className="absolute w-[88%] aspect-square rounded-full bg-[#0a0a0c] shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />

        <div
          className={`${compact ? 'w-[84%]' : 'w-[81%]'} aspect-square rounded-full relative select-none shadow-[0_0_10px_rgba(0,0,0,0.8)]`}
          style={{
            backgroundImage: `url(/images/${side === 'left' ? 'disco_optimal_breaks_A.webp' : 'disco_optimal_breaks.webp'})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transform: `rotate(${rotation}deg)`,
            cursor: scratching ? 'grabbing' : 'grab',
            touchAction: 'none',
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
          className={`absolute top-[8%] right-[6%] z-[5] w-[3px] sm:w-[4px] rounded-[2px] transition-transform duration-500 shadow-[-2px_2px_4px_rgba(0,0,0,0.5)] ${compact ? 'h-[42%]' : 'h-[52%]'}`}
          style={{
            background: 'linear-gradient(90deg, #999 0%, #ccc 40%, #555 100%)',
            transformOrigin: 'top center',
            transform: playing ? 'rotate(22deg)' : 'rotate(0deg)',
          }}
        >
          {/* Tonearm base */}
          <div className="absolute -top-[10px] -left-[12px] sm:-top-[14px] sm:-left-[16px] w-[26px] h-[26px] sm:w-[36px] sm:h-[36px] rounded-full bg-[#111] border-2 border-[#333] flex items-center justify-center shadow-[0_4px_8px_rgba(0,0,0,0.8)]">
            <div className="w-[12px] h-[12px] sm:w-[16px] sm:h-[16px] rounded-full bg-gradient-to-br from-[#888] to-[#333]" />
          </div>
          {/* Headhead */}
          <div className="absolute -bottom-[4px] -left-[2px] sm:-left-[3px] w-[7px] h-[12px] sm:w-[10px] sm:h-[16px] bg-[#222] rounded-[1px] border-t-2 border-[#555] shadow-[-2px_4px_4px_rgba(0,0,0,0.4)]" style={{ transform: 'rotate(20deg)', transformOrigin: 'top center' }} />
        </div>
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
    <div className={`bg-[#141416] border-t border-l border-white/[0.08] border-b-[3px] border-r-[3px] border-black/[0.8] rounded-md shadow-inner ${isH ? 'p-3 flex flex-wrap items-center justify-center gap-4' : 'p-3 flex flex-col gap-2 sm:gap-3 items-center'}`}>
      <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '3px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
        {dict.mixer}
      </div>

      <div className={`flex gap-[5px] items-end p-[6px] bg-[#070709] rounded-[3px] border border-white/[0.04] ${isH ? 'h-[50px]' : 'h-[56px]'}`}>
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
        className={`relative flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 shadow-[0_6px_12px_rgba(0,0,0,0.6)] active:shadow-[0_2px_4px_rgba(0,0,0,0.8)] active:translate-y-[2px] ${isH ? 'w-16 h-16' : 'w-[72px] h-[72px]'} outline-none [-webkit-tap-highlight-color:transparent]`}
        style={{
          background: 'linear-gradient(135deg, #f7e733 0%, #b8a800 100%)',
          border: '4px solid #080808',
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4), 0 4px 8px rgba(0,0,0,0.5)'
        }}
      >
        <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: isH ? '8px' : '10px', letterSpacing: '1px', color: 'var(--red)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', textShadow: '0 1px 1px rgba(0,0,0,0.2)' }}>
          <span className="transition-all duration-200 flex items-center justify-center" style={{ filter: isPlaying ? 'drop-shadow(0 0 6px var(--red))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: isH ? '16px' : '20px', height: isH ? '16px' : '20px' }}>
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: isH ? '16px' : '20px', height: isH ? '16px' : '20px', marginLeft: '2px' }}>
                <polygon points="6,4 20,12 6,20" />
              </svg>
            )}
          </span>
          {isPlaying ? 'STOP' : 'PLAY'}
        </span>
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
  const colorVar = colorClass.replace('bg-[', '').replace(']', '')
  
  return (
    <div className="text-center">
      <label className="block mb-1 sm:mb-2" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '2px', color: 'rgba(255,255,255,0.4)', textShadow: '0 1px 1px rgba(0,0,0,0.8)' }}>
        {label}
      </label>
      <div
        className={`${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-full border-[2px] border-[#0a0a0c] mx-auto relative cursor-pointer transition-transform duration-200 shadow-[0_4px_6px_rgba(0,0,0,0.6)]`}
        style={{ background: 'conic-gradient(from 220deg, #444, #777, #222, #444)', transform: `rotate(${angle}deg)` }}
        onClick={() => setAngle((a) => (a + 30) % 360)}
      >
        {/* Inner dimple */}
        <div className="absolute inset-[4px] rounded-full bg-gradient-to-br from-[#222] to-[#111] shadow-inner" />
        <div className={`absolute top-[2px] sm:top-[2px] left-1/2 -translate-x-1/2 w-[2px] ${compact ? 'h-[8px]' : 'h-[10px]'} rounded-[1px] ${colorClass}`} style={{ boxShadow: `0 0 4px ${colorVar}` }} />
      </div>
    </div>
  )
}
