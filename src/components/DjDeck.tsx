// ============================================
// OPTIMAL BREAKS — DJ Deck with Audio Playback
// Audio engine: DeckAudioProvider (persiste al navegar)
// ============================================

'use client'

import { useState, type CSSProperties } from 'react'
import { useDeckAudio, type DeckDict, type DeckSideState } from '@/components/DeckAudioProvider'

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
    crossfader,
    setCrossfader,
    scratchingLeft,
    scratchingRight,
    leftRotation,
    rightRotation,
    initAudio,
    handleScratchStart,
    handleScratchMove,
    handleScratchEnd,
    fmt,
    deckA,
    deckB,
    activeSide,
    trackA,
    trackB,
    switchTrackOnSide,
    togglePlaySide,
  } = useDeckAudio()

  const h = dict

  return (
    <div className="relative z-[2] w-full min-w-0 max-w-[960px] mx-auto bg-[#1a1a1c] rounded-lg p-3 sm:p-5 shadow-[10px_10px_0_rgba(0,0,0,0.3)] border-t-[2px] border-l-[2px] border-white/[0.05] border-b-[4px] border-r-[4px] border-black/[0.8] overflow-hidden">
      {/* Worn noise texture */}
      <div className="absolute inset-0 opacity-[0.15] pointer-events-none mix-blend-overlay z-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
      <div className="absolute top-[10%] left-[5%] w-[100px] h-[1px] bg-white/[0.03] rotate-45 pointer-events-none z-0" />
      <div className="absolute bottom-[20%] right-[10%] w-[60px] h-[1px] bg-white/[0.04] -rotate-12 pointer-events-none z-0" />
      <div className="absolute top-[50%] right-[30%] w-[150px] h-[2px] bg-black/[0.2] rotate-3 pointer-events-none z-0" />

      {/* Tape */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-[80px] sm:w-[100px] h-[22px] z-10 shadow-sm" style={{ background: 'var(--tape)', transform: 'rotate(-1deg)' }} />

      {/* Top bar — dual track displays */}
      <div className="relative z-10 mb-4 grid grid-cols-2 gap-2">
        <DeckDisplay
          label={h.deck_a}
          track={trackA}
          deck={deckA}
          active={activeSide === 'A'}
          color="var(--red)"
          fmt={fmt}
          onPrev={() => { initAudio(); switchTrackOnSide('A', -1) }}
          onNext={() => { initAudio(); switchTrackOnSide('A', 1) }}
          onToggle={() => { initAudio(); togglePlaySide('A') }}
        />
        <DeckDisplay
          label={h.deck_b}
          track={trackB}
          deck={deckB}
          active={activeSide === 'B'}
          color="var(--yellow)"
          fmt={fmt}
          onPrev={() => { initAudio(); switchTrackOnSide('B', -1) }}
          onNext={() => { initAudio(); switchTrackOnSide('B', 1) }}
          onToggle={() => { initAudio(); togglePlaySide('B') }}
        />
      </div>

      <div className="relative z-10 hidden md:grid grid-cols-[1fr_170px_1fr] gap-4 items-center">
        <Platter
          side="left"
          rotation={leftRotation}
          playing={deckA.playing}
          scratching={scratchingLeft}
          track={trackA}
          labelColor="red"
          onScratchStart={handleScratchStart}
          onScratchMove={handleScratchMove}
          onScratchEnd={handleScratchEnd}
        />
        <MixerPanel dict={d} isPlayingA={deckA.playing} isPlayingB={deckB.playing} crossfader={crossfader} setCrossfader={setCrossfader} togglePlayA={() => { initAudio(); togglePlaySide('A') }} togglePlayB={() => { initAudio(); togglePlaySide('B') }} layout="vertical" />
        <Platter
          side="right"
          rotation={rightRotation}
          playing={deckB.playing}
          scratching={scratchingRight}
          track={trackB}
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
            playing={deckA.playing}
            scratching={scratchingLeft}
            track={trackA}
            labelColor="red"
            onScratchStart={handleScratchStart}
            onScratchMove={handleScratchMove}
            onScratchEnd={handleScratchEnd}
            compact
          />
          <Platter
            side="right"
            rotation={rightRotation}
            playing={deckB.playing}
            scratching={scratchingRight}
            track={trackB}
            labelColor="yellow"
            onScratchStart={handleScratchStart}
            onScratchMove={handleScratchMove}
            onScratchEnd={handleScratchEnd}
            compact
          />
        </div>
        <MixerPanel dict={d} isPlayingA={deckA.playing} isPlayingB={deckB.playing} crossfader={crossfader} setCrossfader={setCrossfader} togglePlayA={() => { initAudio(); togglePlaySide('A') }} togglePlayB={() => { initAudio(); togglePlaySide('B') }} layout="horizontal" />
      </div>
    </div>
  )
}

function DeckDisplay({
  label, track, deck, active, color, fmt, onPrev, onNext, onToggle,
}: {
  label: string
  track: { title: string; artist: string }
  deck: DeckSideState
  active: boolean
  color: string
  fmt: (s: number) => string
  onPrev: () => void
  onNext: () => void
  onToggle: () => void
}) {
  const pct = deck.duration ? (deck.progress / deck.duration) * 100 : 0
  return (
    <div className={`bg-[#0a0a0c] border-2 rounded-md p-2 shadow-inner transition-colors ${active ? 'border-[color:var(--c)]' : 'border-[#222]'}`} style={{ '--c': color } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-1 mb-1">
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', letterSpacing: '2px', color: active ? color : '#444', textTransform: 'uppercase' }}>{label}</span>
        <button type="button" onClick={onToggle} className="px-1.5 py-0.5 text-[8px] font-black tracking-wider border rounded transition-colors" style={{ fontFamily: "'Courier Prime', monospace", borderColor: deck.playing ? color : '#333', color: deck.playing ? color : '#555' }}>
          {deck.playing ? '■ STOP' : '▶ PLAY'}
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onPrev} className="text-[#444] hover:text-white transition-colors p-0.5" aria-label="Prev">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><polygon points="19,4 5,12 19,20" /></svg>
        </button>
        <div className="flex-1 min-w-0 text-center truncate" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '1px', color: active ? color : '#666', textShadow: active ? `0 0 5px ${color}40` : 'none' }}>
          {track.title}
        </div>
        <button type="button" onClick={onNext} className="text-[#444] hover:text-white transition-colors p-0.5" aria-label="Next">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><polygon points="5,4 19,12 5,20" /></svg>
        </button>
      </div>
      <div className="mt-1.5 h-[3px] bg-[#111] border border-[#222] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, boxShadow: deck.playing ? `0 0 6px ${color}` : 'none' }} />
      </div>
      <div className="flex justify-between mt-0.5 px-0.5">
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '8px', color: active ? color : '#333' }}>{fmt(deck.progress)}</span>
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '8px', color: '#333' }}>{deck.duration ? fmt(deck.duration) : '0:00'}</span>
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
  isPlayingA,
  isPlayingB,
  crossfader,
  setCrossfader,
  togglePlayA,
  togglePlayB,
  layout,
}: {
  dict: MixerDict
  isPlayingA: boolean
  isPlayingB: boolean
  crossfader: number
  setCrossfader: (v: number) => void
  togglePlayA: () => void
  togglePlayB: () => void
  layout: 'vertical' | 'horizontal'
}) {
  const isH = layout === 'horizontal'
  const anyPlaying = isPlayingA || isPlayingB

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
                '--min': `${anyPlaying ? (isH ? bar.min * 0.6 : bar.min) : 4}px`,
                '--max': `${anyPlaying ? (isH ? bar.max * 0.6 : bar.max) : 6}px`,
                animation: `vuBounce ${anyPlaying ? '0.8' : '2'}s ease-in-out infinite`,
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

      {/* Dual play buttons */}
      <div className={`flex ${isH ? 'gap-3' : 'gap-2 w-full justify-center'}`}>
        <PlayButton label="A" playing={isPlayingA} onClick={togglePlayA} color="var(--red)" compact={isH} />
        <PlayButton label="B" playing={isPlayingB} onClick={togglePlayB} color="var(--yellow)" compact={isH} />
      </div>

      <div className={`bg-[#070709] border border-white/[0.04] rounded-[3px] text-center ${isH ? 'px-4 py-2' : 'p-[6px] w-full'}`} style={{ animation: anyPlaying ? 'bpmPulse 1s ease-in-out infinite' : 'none' }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: isH ? '18px' : '24px', color: 'var(--yellow)', textShadow: anyPlaying ? '0 0 8px rgba(247,231,51,0.3)' : 'none' }}>
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
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', color: crossfader < 50 ? 'var(--red)' : 'rgba(255,255,255,0.15)' }}>A</span>
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', color: crossfader >= 50 ? 'var(--yellow)' : 'rgba(255,255,255,0.15)' }}>B</span>
        </div>
      </div>
    </div>
  )
}

function PlayButton({ label, playing, onClick, color, compact }: { label: string; playing: boolean; onClick: () => void; color: string; compact: boolean }) {
  const size = compact ? 'w-12 h-12' : 'w-14 h-14'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 shadow-[0_6px_12px_rgba(0,0,0,0.6)] active:shadow-[0_2px_4px_rgba(0,0,0,0.8)] active:translate-y-[2px] ${size} outline-none [-webkit-tap-highlight-color:transparent]`}
      style={{
        background: playing ? `linear-gradient(135deg, ${color} 0%, #222 100%)` : 'linear-gradient(135deg, #333 0%, #111 100%)',
        border: `3px solid ${playing ? color : '#080808'}`,
        boxShadow: playing ? `inset 0 2px 4px rgba(255,255,255,0.2), 0 0 12px ${color}40` : 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: compact ? '7px' : '8px', letterSpacing: '1px', color: playing ? '#fff' : '#555', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <span className="flex items-center justify-center">
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: compact ? '14px' : '16px', height: compact ? '14px' : '16px' }}><rect x="6" y="6" width="12" height="12" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: compact ? '14px' : '16px', height: compact ? '14px' : '16px', marginLeft: '2px' }}><polygon points="6,4 20,12 6,20" /></svg>
          )}
        </span>
        {label}
      </span>
    </button>
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
