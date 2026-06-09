// Banderas inline (mismo enfoque que FlagES/FlagGB en Header).
// Sin dependencia de flagcdn — evita bloqueos de red / adblock.

import type { ComponentType } from 'react'

type FlagProps = { className?: string }

function FlagUS({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fill="#bd3d44" d="M0 0h640v480H0z" />
      <path stroke="#fff" strokeWidth="37" d="M0 55h640M0 137h640M0 219h640M0 301h640M0 383h640" />
      <path fill="#192f5d" d="M0 0h364.8v258.5H0z" />
    </svg>
  )
}

function FlagES({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#c60b1e" />
      <rect width="640" height="240" y="120" fill="#ffc400" />
    </svg>
  )
}

function FlagGB({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#012169" />
      <path d="M75 0l244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0z" fill="#fff" />
      <path d="M424 281l216 159v40L369 281zm-184 20l6 35L54 480H0zM640 0v3L391 191l2-44L590 0zM0 0l239 176h-60L0 42z" fill="#C8102E" />
      <path d="M241 0v480h160V0zM0 160v160h640V160z" fill="#fff" />
      <path d="M0 193v96h640v-96zM273 0v480h96V0z" fill="#C8102E" />
    </svg>
  )
}

function FlagFR({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#ED2939" />
      <rect width="427" height="480" fill="#fff" />
      <rect width="213" height="480" fill="#002395" />
    </svg>
  )
}

function FlagDE({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="160" fill="#000" />
      <rect width="640" height="160" y="160" fill="#D00" />
      <rect width="640" height="160" y="320" fill="#FFCE00" />
    </svg>
  )
}

function FlagRU({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="160" fill="#fff" />
      <rect width="640" height="160" y="160" fill="#0039A6" />
      <rect width="640" height="160" y="320" fill="#D52B1E" />
    </svg>
  )
}

function FlagAU({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#00008B" />
      <rect width="320" height="240" fill="#012169" />
      <path d="M0 0l120 90L0 180V0z" fill="#fff" />
      <path d="M0 0l80 60L0 120V0z" fill="#C8102E" />
      <circle cx="480" cy="120" r="40" fill="#fff" />
      <circle cx="500" cy="200" r="25" fill="#fff" />
      <circle cx="420" cy="280" r="30" fill="#fff" />
    </svg>
  )
}

function FlagNL({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="160" fill="#AE1C28" />
      <rect width="640" height="160" y="160" fill="#fff" />
      <rect width="640" height="160" y="320" fill="#21468B" />
    </svg>
  )
}

function FlagBE({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="213" height="480" fill="#000" />
      <rect width="214" height="480" x="213" fill="#FAE042" />
      <rect width="213" height="480" x="427" fill="#ED2939" />
    </svg>
  )
}

function FlagIT({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="213" height="480" fill="#009246" />
      <rect width="214" height="480" x="213" fill="#fff" />
      <rect width="213" height="480" x="427" fill="#CE2B37" />
    </svg>
  )
}

function FlagPT({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="256" height="480" fill="#006600" />
      <rect width="384" height="480" x="256" fill="#FF0000" />
    </svg>
  )
}

function FlagIE({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="213" height="480" fill="#169B62" />
      <rect width="214" height="480" x="213" fill="#fff" />
      <rect width="213" height="480" x="427" fill="#FF883E" />
    </svg>
  )
}

function FlagCA({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#FF0000" />
      <rect width="160" height="480" fill="#FF0000" />
      <rect width="320" height="480" x="160" fill="#fff" />
      <path fill="#FF0000" d="M320 120l30 90h90l-75 55 30 90-75-55-75 55 30-90-75-55h90z" />
    </svg>
  )
}

function FlagMX({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="213" height="480" fill="#006847" />
      <rect width="214" height="480" x="213" fill="#fff" />
      <rect width="213" height="480" x="427" fill="#CE1126" />
    </svg>
  )
}

function FlagBR({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#009B3A" />
      <path fill="#FEDF00" d="M320 48L592 240 320 432 48 240z" />
      <circle cx="320" cy="240" r="80" fill="#002776" />
    </svg>
  )
}

function FlagAR({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="160" fill="#74ACDF" />
      <rect width="640" height="160" y="160" fill="#fff" />
      <rect width="640" height="160" y="320" fill="#74ACDF" />
      <circle cx="320" cy="240" r="40" fill="#F6B40E" />
    </svg>
  )
}

function FlagCL({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="240" fill="#fff" />
      <rect width="640" height="240" y="240" fill="#D52B1E" />
      <rect width="240" height="240" fill="#0039A6" />
      <circle cx="120" cy="120" r="50" fill="#fff" />
    </svg>
  )
}

function FlagPL({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="240" fill="#fff" />
      <rect width="640" height="240" y="240" fill="#DC143C" />
    </svg>
  )
}

function FlagCH({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#FF0000" />
      <rect width="120" height="360" x="260" y="60" fill="#fff" />
      <rect width="360" height="120" x="140" y="180" fill="#fff" />
    </svg>
  )
}

function FlagAT({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="160" fill="#ED2939" />
      <rect width="640" height="160" y="160" fill="#fff" />
      <rect width="640" height="160" y="320" fill="#ED2939" />
    </svg>
  )
}

function FlagDK({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#C8102E" />
      <rect width="80" height="480" x="160" fill="#fff" />
      <rect width="640" height="80" y="200" fill="#fff" />
    </svg>
  )
}

function FlagSE({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#006AA7" />
      <rect width="80" height="480" x="160" fill="#FECC00" />
      <rect width="640" height="80" y="200" fill="#FECC00" />
    </svg>
  )
}

function FlagNO({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#BA0C2F" />
      <rect width="80" height="480" x="160" fill="#fff" />
      <rect width="640" height="80" y="200" fill="#fff" />
      <rect width="40" height="480" x="180" fill="#00205B" />
      <rect width="640" height="40" y="220" fill="#00205B" />
    </svg>
  )
}

function FlagFI({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#fff" />
      <rect width="80" height="480" x="160" fill="#003580" />
      <rect width="640" height="80" y="200" fill="#003580" />
    </svg>
  )
}

function FlagJP({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#fff" />
      <circle cx="320" cy="240" r="120" fill="#BC002D" />
    </svg>
  )
}

function FlagNZ({ className }: FlagProps) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="640" height="480" fill="#00247D" />
      <rect width="320" height="240" fill="#012169" />
      <path d="M0 0l120 90L0 180V0z" fill="#fff" />
      <path d="M0 0l80 60L0 120V0z" fill="#C8102E" />
      <circle cx="480" cy="360" r="30" fill="#fff" />
    </svg>
  )
}

const FLAG_MAP: Record<string, ComponentType<FlagProps>> = {
  us: FlagUS,
  gb: FlagGB,
  es: FlagES,
  fr: FlagFR,
  de: FlagDE,
  ru: FlagRU,
  au: FlagAU,
  nl: FlagNL,
  be: FlagBE,
  it: FlagIT,
  pt: FlagPT,
  ie: FlagIE,
  ca: FlagCA,
  mx: FlagMX,
  br: FlagBR,
  ar: FlagAR,
  cl: FlagCL,
  pl: FlagPL,
  ch: FlagCH,
  at: FlagAT,
  dk: FlagDK,
  se: FlagSE,
  no: FlagNO,
  fi: FlagFI,
  jp: FlagJP,
  nz: FlagNZ,
}

const FLAG_DIMS = {
  xs: 'w-4 h-[11px]',
  sm: 'w-6 h-[17px]',
  md: 'w-8 h-[22px]',
} as const

export function CountryFlagSvg({
  iso,
  size = 'sm',
  className = '',
}: {
  iso: string
  size?: keyof typeof FLAG_DIMS
  className?: string
}) {
  const key = iso.toLowerCase()
  const Flag = FLAG_MAP[key]
  if (!Flag) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-[2px] border border-white/30 bg-white/10 font-bold uppercase text-white/80 ${FLAG_DIMS[size]} ${className}`}
        style={{ fontFamily: "'Courier Prime', monospace", fontSize: size === 'xs' ? '7px' : '8px' }}
        aria-hidden
      >
        {key.slice(0, 2)}
      </span>
    )
  }
  return <Flag className={`${FLAG_DIMS[size]} rounded-[2px] shadow-sm shrink-0 ${className}`} />
}
