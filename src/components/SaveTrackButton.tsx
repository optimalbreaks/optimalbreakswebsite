// ============================================
// OPTIMAL BREAKS — Save Track Button
// "+" toggle for chart/featured/vinyl tracks → saved_chart_tracks
// Always visible (guests → signup modal, like FavoriteButton)
// ============================================

'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSavedChartTracks, type ChartTrackSource } from '@/hooks/useUserData'
import { useAuth } from '@/components/AuthProvider'
import { i18n } from '@/lib/i18n-config'
import type { SavedChartTrackSnapshot } from '@/types/database'

interface SaveTrackButtonPropsBase {
  size?: 'sm' | 'md' | 'lg'
  lang?: string
  className?: string
  /**
   * URL canónica (Beatport/Bandcamp/YouTube/Discogs) de la canción. Si se
   * proporciona, el botón aparece en verde cuando el usuario ya tiene
   * guardada una canción con la misma URL, aunque proceda de otra fuente.
   */
  canonicalUrl?: string | null
  /**
   * Snapshot inmutable con los metadatos esenciales de la canción. Si se
   * proporciona, se persiste con el save y permite renderizar la fila en
   * "Mis Tracks" aunque la canción desaparezca de las tablas chart_*_tracks.
   */
  snapshot?: SavedChartTrackSnapshot | null
}

type SaveTrackButtonRefMode = SaveTrackButtonPropsBase & {
  source: ChartTrackSource
  trackId: string
  /**
   * IDs de otras filas (misma fuente) que representan la MISMA canción —
   * distintas semanas del chart con la misma URL canónica. Si se
   * proporciona, el botón considera el track guardado cuando cualquiera
   * del grupo lo está, y al desmarcar borra todo el grupo.
   */
  relatedIds?: string[]
  /**
   * Variante polimórfica: grupo de refs `{source, id}` mezclando varias
   * fuentes (p.ej. misma canción como fila chart y fila featured). Si se
   * proporciona tiene prioridad sobre `relatedIds`.
   */
  relatedRefs?: Array<{ source: ChartTrackSource; id: string }>
  externalUrl?: never
}

type SaveTrackButtonUrlMode = SaveTrackButtonPropsBase & {
  /**
   * Modo "URL" — para entradas sin fila propia en ninguna tabla de charts
   * (p.ej. Beatport Top 10 de artistas/sellos, almacenado como JSONB).
   * El save se guarda como `beatport_top` + snapshot y se deduplica
   * cross-source por `canonicalUrl`.
   */
  externalUrl: string
  /** Id estable opcional (p.ej. beatport_id). Por defecto usa la URL normalizada. */
  externalTrackId?: string
  source?: never
  trackId?: never
  relatedIds?: never
  relatedRefs?: never
}

type SaveTrackButtonProps = SaveTrackButtonRefMode | SaveTrackButtonUrlMode

function getLang(pathname: string) {
  const seg = pathname.split('/')[1]
  return i18n.locales.includes(seg as any) ? seg : i18n.defaultLocale
}

export default function SaveTrackButton(props: SaveTrackButtonProps) {
  const {
    size = 'sm',
    lang,
    className = '',
    canonicalUrl,
    snapshot: refSnapshot,
  } = props
  const isUrlMode = 'externalUrl' in props && !!props.externalUrl
  const source = isUrlMode ? undefined : (props as SaveTrackButtonRefMode).source
  const trackId = isUrlMode ? undefined : (props as SaveTrackButtonRefMode).trackId
  const relatedIds = isUrlMode ? undefined : (props as SaveTrackButtonRefMode).relatedIds
  const relatedRefs = isUrlMode ? undefined : (props as SaveTrackButtonRefMode).relatedRefs
  const externalUrl = isUrlMode ? (props as SaveTrackButtonUrlMode).externalUrl : undefined
  const snapshot = isUrlMode ? (props as SaveTrackButtonUrlMode).snapshot : undefined
  const externalTrackId = isUrlMode ? (props as SaveTrackButtonUrlMode).externalTrackId : undefined

  const pathname = usePathname()
  const resolvedLang = lang || getLang(pathname)
  const { user } = useAuth()
  const {
    isSaved: isSavedFn,
    isSavedByIdentity,
    isAnySaved,
    isAnySavedRefs,
    toggleGroup,
    toggleGroupRefs,
    toggleByUrl,
  } = useSavedChartTracks()

  const hasRefs = !isUrlMode && !!(relatedRefs && relatedRefs.length > 0)
  const hasIds = !isUrlMode && !!(relatedIds && relatedIds.length > 0)
  const groupIds = hasIds ? (relatedIds as string[]) : (trackId ? [trackId] : [])

  // URL match cross-source: si el usuario ya tiene la misma canción (por URL
  // canónica) guardada desde OTRA lista, el botón aparece en verde aunque
  // aquí sea una fila/ref que no está en su lista.
  const matchByUrl = isSavedByIdentity({
    url: isUrlMode ? (externalUrl as string) : canonicalUrl,
    snapshot: isUrlMode ? snapshot : refSnapshot,
  })

  const isSaved = isUrlMode
    ? matchByUrl
    : (hasRefs
      ? isAnySavedRefs(relatedRefs as Array<{ source: ChartTrackSource; id: string }>)
      : hasIds
        ? isAnySaved(source as ChartTrackSource, groupIds)
        : (trackId ? isSavedFn(source as ChartTrackSource, trackId) : false)) || matchByUrl
  const [showGuest, setShowGuest] = useState(false)
  const [mounted, setMounted] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!showGuest) return
    const h = (e: MouseEvent | TouchEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) setShowGuest(false)
    }
    document.addEventListener('mousedown', h)
    document.addEventListener('touchstart', h)
    const t = setTimeout(() => setShowGuest(false), 4000)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('touchstart', h)
      clearTimeout(t)
    }
  }, [showGuest])

  const es = resolvedLang === 'es'
  const isLoggedIn = !!user

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isLoggedIn) { setShowGuest(true); return }
    if (isUrlMode) {
      toggleByUrl(externalUrl as string, {
        trackId: externalTrackId,
        snapshot: snapshot ?? undefined,
      })
      return
    }
    // Si el toggle lo dispara una coincidencia por URL canónica (p.ej. este
    // botón de chart estaba verde sólo porque otra instancia lo guardó), al
    // hacer click queremos borrar TODAS las coincidencias por URL para que
    // el botón quede blanco. Usamos toggleByUrl como desempate.
    if (matchByUrl && canonicalUrl && !(hasRefs ? isAnySavedRefs(relatedRefs as Array<{ source: ChartTrackSource; id: string }>) : (hasIds ? isAnySaved(source as ChartTrackSource, groupIds) : isSavedFn(source as ChartTrackSource, trackId as string)))) {
      toggleByUrl(canonicalUrl, { snapshot: refSnapshot ?? undefined })
      return
    }
    if (hasRefs) {
      toggleGroupRefs(
        { source: source as ChartTrackSource, id: trackId as string },
        relatedRefs as Array<{ source: ChartTrackSource; id: string }>,
        canonicalUrl ?? null,
        refSnapshot ?? null,
      )
    } else {
      toggleGroup(source as ChartTrackSource, trackId as string, groupIds)
    }
  }

  const iconSvg = (w: number) => (
    isSaved ? (
      <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ) : (
      <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    )
  )

  const guestModal =
    mounted &&
    showGuest &&
    !isLoggedIn &&
    createPortal(
      <>
        <div className="fixed inset-0 z-[1100] bg-black/50" onClick={() => setShowGuest(false)} aria-hidden />
        <div className="fixed inset-0 z-[1101] flex items-center justify-center p-4 pointer-events-none" role="dialog" aria-modal="true">
          <div
            ref={modalRef}
            className="pointer-events-auto relative w-full max-w-[280px] bg-[var(--red)] text-[var(--yellow)] border-[4px] border-[var(--ink)] p-5 shadow-[6px_6px_0_var(--ink)]"
            style={{ animation: 'fadeIn 0.15s ease-out', transform: 'rotate(-1deg)' }}
          >
            <button
              type="button"
              onClick={() => setShowGuest(false)}
              className="absolute top-2 right-3 text-[var(--yellow)] hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '18px', lineHeight: 1 }}
              aria-label="Close"
            >
              ✕
            </button>
            <p style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', lineHeight: 1.4, margin: 0, textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
              {es ? '¡Regístrate para guardar tracks!' : 'Sign up to save tracks!'}
            </p>
            <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', lineHeight: 1.5, margin: '8px 0 0', color: 'rgba(255,255,255,0.8)' }}>
              {es
                ? 'Guarda tracks de los charts y reprodúcelos todos desde Mis Tracks.'
                : 'Save tracks from the charts and replay them all from My Tracks.'}
            </p>
            <Link
              href={`/${resolvedLang}/login`}
              className="mt-4 block text-center bg-[var(--yellow)] text-[var(--ink)] no-underline hover:bg-white transition-colors"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '13px', letterSpacing: '2px', padding: '10px 14px' }}
            >
              {es ? '¡ENTRA YA!' : 'JOIN NOW!'}
            </Link>
          </div>
        </div>
      </>,
      document.body
    )

  const ariaLabel = isSaved
    ? (es ? 'Quitar de Mis Tracks' : 'Remove from My Tracks')
    : (es ? 'Guardar en Mis Tracks' : 'Save to My Tracks')

  if (size === 'sm' || size === 'lg') {
    const dim = size === 'lg' ? 'w-10 h-10 sm:w-9 sm:h-9' : 'w-8 h-8'
    const icon = size === 'lg' ? 18 : 15
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className={`${dim} flex items-center justify-center rounded-full border-2 border-[var(--ink)] transition-all duration-200 shrink-0 ${
            isSaved
              ? 'bg-[var(--acid)] text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]'
              : 'bg-white text-[var(--ink)] hover:bg-[var(--acid)] hover:text-[var(--ink)] shadow-[1px_1px_0_var(--ink)]'
          } ${className}`}
          aria-label={ariaLabel}
          title={ariaLabel}
        >
          {iconSvg(icon)}
        </button>
        {guestModal}
      </>
    )
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-2 h-9 px-3.5 border-2 transition-all duration-200 ${
          isSaved
            ? 'border-[var(--acid)] bg-[var(--acid)] text-[var(--ink)]'
            : 'border-white/30 bg-[var(--ink)] text-white/80 hover:border-[var(--acid)] hover:bg-[var(--acid)] hover:text-[var(--ink)]'
        }`}
        aria-label={ariaLabel}
      >
        {iconSvg(14)}
        <span style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>
          {isSaved ? (es ? 'GUARDADO' : 'SAVED') : (es ? 'GUARDAR' : 'SAVE')}
        </span>
      </button>
      {guestModal}
    </div>
  )
}
