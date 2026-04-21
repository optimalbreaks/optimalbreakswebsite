// ============================================
// OPTIMAL BREAKS — Command Palette (⌘K)
// Búsqueda global: artists + labels + events + mixes + scenes + blog + organizations
// Estética fanzine/brutalista; sin dependencias extra.
// ============================================

'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { displayImageUrl } from '@/lib/image-url'
import type { Locale } from '@/lib/i18n-config'

type ResultType = 'artist' | 'label' | 'event' | 'mix' | 'scene' | 'post' | 'organization' | 'track'

interface SearchResult {
  type: ResultType
  id: string
  slug: string
  title: string
  subtitle: string
  image_url: string | null
  href: string
  date_start?: string | null
  is_upcoming?: boolean
}

interface PaletteDict {
  button_short: string
  button_full: string
  placeholder: string
  empty_hint: string
  no_results: string
  searching: string
  hint_kbd: string
  hint_nav: string
  type_artist: string
  type_label: string
  type_event: string
  type_mix: string
  type_scene: string
  type_post: string
  type_organization: string
  type_track: string
  groups_all: string
  shortcut_open: string
  shortcut_close: string
  quick_title: string
  quick_artists: string
  quick_labels: string
  quick_events: string
  quick_mixes: string
  quick_scenes: string
  quick_charts: string
  quick_blog: string
}

interface CommandPaletteProps {
  lang: Locale
  dict: PaletteDict
}

const TYPE_COLOR: Record<ResultType, { bg: string; fg: string }> = {
  artist: { bg: 'var(--red)', fg: 'white' },
  label: { bg: 'var(--ink)', fg: 'var(--paper)' },
  event: { bg: 'var(--uv)', fg: 'white' },
  mix: { bg: 'var(--pink)', fg: 'white' },
  scene: { bg: 'var(--acid)', fg: 'var(--ink)' },
  post: { bg: 'var(--blue)', fg: 'white' },
  organization: { bg: 'var(--orange)', fg: 'white' },
  track: { bg: 'var(--yellow)', fg: 'var(--ink)' },
}

function typeLabel(dict: PaletteDict, t: ResultType): string {
  switch (t) {
    case 'artist':
      return dict.type_artist
    case 'label':
      return dict.type_label
    case 'event':
      return dict.type_event
    case 'mix':
      return dict.type_mix
    case 'scene':
      return dict.type_scene
    case 'post':
      return dict.type_post
    case 'organization':
      return dict.type_organization
    case 'track':
      return dict.type_track
  }
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [deb, setDeb] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDeb(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return deb
}

/**
 * Fecha corta para el chip del palette.
 * - Futuro este año  → "16 MAR"
 * - Futuro otro año  → "16 MAR 27"
 * - Pasado cualquier → "16 MAR 24"
 * Respeta es/en (localización mensual). Sin año si es el año actual.
 */
function formatEventDate(iso: string, lang: Locale): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const day = d.getDate().toString().padStart(2, '0')
  const month = d.toLocaleString(locale, { month: 'short' }).replace('.', '').toUpperCase()
  const yy = d.getFullYear()
  const now = new Date()
  const sameYear = yy === now.getFullYear()
  return sameYear ? `${day} ${month}` : `${day} ${month} ${String(yy).slice(2)}`
}

function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Mac|iPhone|iPad|iPod/i.test(ua)
}

export default function CommandPalette({ lang, dict }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const [mac, setMac] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const router = useRouter()
  const listboxId = useId()

  const debouncedQuery = useDebouncedValue(query.trim(), 160)

  useEffect(() => {
    setMac(isMacLike())
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setActive(0)
    setLoading(false)
    if (abortRef.current) abortRef.current.abort()
  }, [])

  const openPalette = useCallback(() => {
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target?.isContentEditable ?? false)

      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        if (open) close()
        else openPalette()
        return
      }
      if (!open && !typing && e.key === '/') {
        e.preventDefault()
        openPalette()
        return
      }
      if (open && e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, openPalette, close])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    function onClick(e: Event) {
      const target = e.target as HTMLElement | null
      if (!target) return
      const trigger = target.closest('[data-open-command-palette]')
      if (trigger) {
        e.preventDefault()
        openPalette()
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [openPalette])

  useEffect(() => {
    if (!open) return
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([])
      setLoading(false)
      setActive(0)
      return
    }
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    const url = `/api/search?q=${encodeURIComponent(debouncedQuery)}&lang=${lang}`
    fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data: { results?: SearchResult[] }) => {
        if (ctrl.signal.aborted) return
        setResults(Array.isArray(data.results) ? data.results : [])
        setActive(0)
      })
      .catch(() => {
        /* aborted or network */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [debouncedQuery, lang, open])

  const grouped = useMemo(() => {
    const map = new Map<ResultType, SearchResult[]>()
    for (const r of results) {
      const arr = map.get(r.type) || []
      arr.push(r)
      map.set(r.type, arr)
    }
    // Orden intencionalmente orientado a "favorecer escuchar música":
    // artistas → tracks → mixes van primero (todo lo sonoro). Después
    // eventos (upcoming, con fecha amarilla), sellos y contexto.
    const order: ResultType[] = ['artist', 'track', 'mix', 'event', 'label', 'scene', 'post', 'organization']
    const out: { type: ResultType; items: SearchResult[] }[] = []
    for (const t of order) {
      const items = map.get(t)
      if (items && items.length) out.push({ type: t, items })
    }
    return out
  }, [results])

  const flat = results
  const hasResults = flat.length > 0

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (flat.length === 0) return
      setActive((i) => (i + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (flat.length === 0) return
      setActive((i) => (i - 1 + flat.length) % flat.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      if (flat.length) setActive(flat.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[active]
      if (item) {
        router.push(item.href)
        close()
      }
    }
  }

  useEffect(() => {
    if (!open || !hasResults) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [active, open, hasResults])

  const quickLinks = [
    { href: `/${lang}/artists`, label: dict.quick_artists },
    { href: `/${lang}/labels`, label: dict.quick_labels },
    { href: `/${lang}/events`, label: dict.quick_events },
    { href: `/${lang}/mixes`, label: dict.quick_mixes },
    { href: `/${lang}/scenes`, label: dict.quick_scenes },
    { href: `/${lang}/charts`, label: dict.quick_charts },
    { href: `/${lang}/blog`, label: dict.quick_blog },
  ]

  const kbd = mac ? '⌘K' : 'Ctrl K'

  return (
    <>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={dict.button_full}
          className="fixed inset-0 z-[300] flex items-start justify-center px-3 sm:px-6 pt-[10vh]"
        >
          <div
            className="absolute inset-0 bg-[var(--ink)]/75"
            onClick={close}
            aria-hidden
          />
          <div
            className="relative w-full max-w-[680px] border-[4px] border-[var(--ink)] bg-[var(--paper)] shadow-[10px_10px_0_var(--ink)] animate-[palette-in_.15s_ease-out]"
          >
            <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b-[3px] border-[var(--ink)] bg-[var(--paper)]">
              <SearchIcon className="w-5 h-5 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={dict.placeholder}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-controls={listboxId}
                aria-activedescendant={hasResults ? `${listboxId}-item-${active}` : undefined}
                aria-autocomplete="list"
                role="combobox"
                aria-expanded={hasResults}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] sm:text-[16px] placeholder:text-[var(--dim)]"
                style={{ fontFamily: "'Courier Prime', monospace", color: 'var(--ink)' }}
              />
              <kbd
                className="hidden sm:inline-flex items-center px-1.5 py-[1px] border-2 border-[var(--ink)] bg-white text-[10px] leading-none"
                style={{ fontFamily: "'Courier Prime', monospace", letterSpacing: '1px' }}
              >
                ESC
              </kbd>
            </div>

            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              className="max-h-[60vh] overflow-y-auto overscroll-contain"
            >
              {!query.trim() ? (
                <div className="p-4 sm:p-5">
                  <div
                    className="mb-3"
                    style={{
                      fontFamily: "'Courier Prime', monospace",
                      fontSize: '10px',
                      letterSpacing: '3px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {dict.quick_title}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickLinks.map((q) => (
                      <Link
                        key={q.href}
                        href={q.href}
                        onClick={close}
                        className="cutout outline no-underline"
                        style={{ color: 'var(--ink)' }}
                      >
                        {q.label}
                      </Link>
                    ))}
                  </div>
                  <p
                    className="mt-4 text-[12px] leading-[1.6]"
                    style={{ fontFamily: "'Special Elite', monospace", color: 'var(--text-muted)' }}
                  >
                    {dict.empty_hint}
                  </p>
                </div>
              ) : loading && !hasResults ? (
                <div
                  className="px-5 py-8 text-center"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '2px', color: 'var(--text-muted)' }}
                >
                  {dict.searching}
                </div>
              ) : !hasResults ? (
                <div
                  className="px-5 py-8 text-center"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '2px', color: 'var(--text-muted)' }}
                >
                  {dict.no_results}
                </div>
              ) : (
                <div>
                  {grouped.map((group) => (
                    <div key={group.type}>
                      <div
                        className="px-3 sm:px-4 py-2 sticky top-0 bg-[var(--paper)] border-b-[2px] border-[var(--ink)]/10"
                        style={{
                          fontFamily: "'Courier Prime', monospace",
                          fontSize: '10px',
                          letterSpacing: '3px',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {typeLabel(dict, group.type)}
                      </div>
                      {group.items.map((r) => {
                        const idx = flat.indexOf(r)
                        const isActive = idx === active
                        const chip = TYPE_COLOR[r.type]
                        const img = displayImageUrl(r.image_url) || null
                        return (
                          <Link
                            key={`${r.type}-${r.slug}`}
                            id={`${listboxId}-item-${idx}`}
                            data-idx={idx}
                            role="option"
                            aria-selected={isActive}
                            href={r.href}
                            onMouseEnter={() => setActive(idx)}
                            onClick={close}
                            className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b-[2px] border-[var(--ink)]/10 no-underline ${
                              isActive ? 'bg-[var(--yellow)]' : 'hover:bg-[var(--paper-dark)]/60'
                            }`}
                            style={{ color: 'var(--ink)' }}
                          >
                            <div className="relative w-10 h-10 shrink-0 border-2 border-[var(--ink)] bg-[var(--paper-dark)] overflow-hidden">
                              {img ? (
                                // next/image en vez de <img>: el proxy /_next/image
                                // sirve la imagen desde el mismo origin y respeta CSP.
                                // Con <img> directo el artwork de Beatport se bloqueaba
                                // cross-origin, aunque el CDN respondiera 200.
                                <Image
                                  src={img}
                                  alt=""
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                  unoptimized={false}
                                />
                              ) : (
                                // Fallback: disco de vinilo con logo OB. Lo usan
                                // mixes/tracks sin portada ni artista resoluble.
                                // Mantiene coherencia visual con el resto del sitio.
                                <Image
                                  src="/images/disco_optimal_breaks.webp"
                                  alt=""
                                  fill
                                  sizes="40px"
                                  className="object-cover"
                                  aria-hidden
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate"
                                style={{
                                  fontFamily: "'Unbounded', sans-serif",
                                  fontWeight: 800,
                                  fontSize: '13px',
                                  letterSpacing: '-0.2px',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {r.title}
                              </div>
                              {r.subtitle ? (
                                <div
                                  className="truncate"
                                  style={{
                                    fontFamily: "'Courier Prime', monospace",
                                    fontSize: '11px',
                                    color: 'var(--text-muted)',
                                    letterSpacing: '0.3px',
                                  }}
                                >
                                  {r.subtitle}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {r.type === 'event' && r.date_start ? (
                                <span
                                  className="px-1.5 py-[2px] border-[2px] border-[var(--ink)]"
                                  style={{
                                    background: r.is_upcoming ? 'var(--yellow)' : 'var(--red)',
                                    color: r.is_upcoming ? 'var(--ink)' : 'white',
                                    fontFamily: "'Courier Prime', monospace",
                                    fontSize: '10px',
                                    letterSpacing: '1px',
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={r.is_upcoming ? (lang === 'es' ? 'Próximo' : 'Upcoming') : (lang === 'es' ? 'Pasado' : 'Past')}
                                >
                                  {formatEventDate(r.date_start, lang)}
                                </span>
                              ) : null}
                              <span
                                className="px-2 py-[2px]"
                                style={{
                                  background: chip.bg,
                                  color: chip.fg,
                                  fontFamily: "'Courier Prime', monospace",
                                  fontSize: '9px',
                                  letterSpacing: '2px',
                                  textTransform: 'uppercase',
                                  fontWeight: 700,
                                }}
                              >
                                {typeLabel(dict, r.type)}
                              </span>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-t-[3px] border-[var(--ink)] bg-[var(--paper-dark)]/50"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: '10px',
                letterSpacing: '2px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              <span className="truncate">{dict.hint_nav}</span>
              <span className="shrink-0">{dict.hint_kbd}: {kbd}</span>
            </div>
          </div>

          <style jsx>{`
            @keyframes palette-in {
              from {
                opacity: 0;
                transform: translateY(-6px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
        </div>
      ) : null}
    </>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20L16 16" />
    </svg>
  )
}
