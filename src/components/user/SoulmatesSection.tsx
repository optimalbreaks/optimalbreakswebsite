// ============================================
// OPTIMAL BREAKS — Soulmates section ("Almas Gemelas")
// ----------------------------------------------
// Cruza las pistas guardadas del usuario con las de la comunidad y muestra
// el top 10 de afinidad (Jaccard sobre claves canónicas) más una lista de
// recomendaciones: temas que tienen las almas gemelas y el usuario aún no.
//
// Si la lista del usuario está marcada como privada, ofrece un botón para
// activarla; si tiene pocos saves, le sugiere seguir guardando.
//
// Robustez (sep 2026, aviso de un usuario en móvil): el fetch lleva timeout
// (nunca «cargando infinito»), hay botón de reintento y todo el bloque va
// dentro de un ErrorBoundary propio: un dato raro en una card no puede tirar
// la página entera a la pantalla de error global de Next.
// ============================================

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useProfile } from '@/hooks/useUserData'
import { formatTrackReleaseDisplay } from '@/lib/share-track'
import { ArtistNames, LabelName } from '@/components/ArtistNames'
import {
  buildFullArtistSlugMap,
  buildFullLabelSlugMap,
  filterArtistSlugMapForNames,
  splitArtistDisplayLine,
} from '@/lib/artist-slug-map'
import { createBrowserSupabase } from '@/lib/supabase'

type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'

const FETCH_TIMEOUT_MS = 30_000
const MONO = "'Courier Prime', monospace"
const DISPLAY = "'Unbounded', sans-serif"

interface SoulmateUser {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  country: string | null
}

interface CommonTrack {
  canonical_key: string
  title: string
  mix_name: string | null
  artists: string
  artwork_url: string | null
}

interface SoulmateRow {
  user: SoulmateUser
  common_count: number
  other_count: number
  self_count: number
  union_count: number
  jaccard: number
  overlap_self: number
  overlap_other: number
  sample_common_tracks: (CommonTrack | null)[]
}

interface RecommendedTrack {
  canonical_key: string
  title: string
  mix_name: string | null
  artists: string
  label: string | null
  year: number | null
  release_date: string | null
  artwork_url: string | null
  external_url: string | null
  soulmates_count: number
  soulmate_ids: string[]
  primary: { source: ChartTrackSource; id: string; week_date: string | null }
}

interface ApiResponse {
  disabled: boolean
  reason?: 'private' | 'too_few_saves'
  min_required?: number
  self_count?: number
  self: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
    saved_count?: number
  } | null
  soulmates: SoulmateRow[]
  recommended_tracks: RecommendedTrack[]
}

interface Props {
  lang: string
}

function pct(value: number) {
  const n = Number.isFinite(value) ? value : 0
  return `${(n * 100).toFixed(1)}%`
}

function profileHref(lang: string, u: SoulmateUser) {
  return `/${lang}/u/${u.username || u.id}/tracks`
}

function userLabel(u: SoulmateUser, es: boolean) {
  const name = (u.display_name || u.username || '').trim()
  return name || (es ? 'Breaker anónimo' : 'Anonymous breaker')
}

function avatarInitial(u: SoulmateUser) {
  const name = (u.display_name || u.username || '').trim()
  return (name[0] || 'B').toUpperCase()
}

function isHttpUrl(u: string | null | undefined): u is string {
  return typeof u === 'string' && /^https?:\/\//i.test(u.trim())
}

// ---------- Error boundary local (no tirar toda la página) ----------
type BoundaryProps = { es: boolean; onRetry: () => void; children: ReactNode }
type BoundaryState = { error: Error | null }

class SoulmatesErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[OB] Soulmates render error:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    const { es } = this.props
    return (
      <div className="border-4 border-[var(--red)] bg-[var(--red)]/10 p-5">
        <h3 className="font-black text-base mb-2" style={{ fontFamily: DISPLAY, textTransform: 'uppercase' }}>
          {es ? 'Algo se ha roto al pintar esta sección' : 'Something broke while rendering this section'}
        </h3>
        <p className="text-sm mb-4" style={{ fontFamily: MONO }}>
          {es
            ? 'Tus datos están bien; ha fallado la visualización. Prueba a recargar la sección.'
            : 'Your data is fine; the display failed. Try reloading the section.'}
        </p>
        <button
          type="button"
          onClick={() => { this.setState({ error: null }); this.props.onRetry() }}
          className="cutout red"
          style={{ cursor: 'pointer' }}
        >
          {es ? 'REINTENTAR' : 'RETRY'}
        </button>
      </div>
    )
  }
}

// ---------- Skeleton de carga ----------
function LoadingSkeleton({ es }: { es: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-[3px] border-[var(--ink)] p-3 sm:p-4">
            <div className="h-7 sm:h-9 w-12 bg-[var(--ink)]/10 animate-pulse mb-2" />
            <div className="h-2.5 w-20 bg-[var(--ink)]/10 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-[3px] border-[var(--ink)] p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-[var(--ink)]/10 animate-pulse" />
              <div className="w-12 h-12 bg-[var(--ink)]/10 animate-pulse" />
              <div className="flex-1">
                <div className="h-3.5 w-2/3 bg-[var(--ink)]/10 animate-pulse mb-2" />
                <div className="h-2.5 w-1/3 bg-[var(--ink)]/10 animate-pulse" />
              </div>
            </div>
            <div className="h-2 w-full bg-[var(--ink)]/10 animate-pulse mb-3" />
            <div className="h-2.5 w-5/6 bg-[var(--ink)]/10 animate-pulse mb-1.5" />
            <div className="h-2.5 w-4/6 bg-[var(--ink)]/10 animate-pulse" />
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-[var(--ink)]/60 tracking-wider" style={{ fontFamily: MONO }}>
        {es ? 'CALCULANDO AFINIDADES CON TODA LA COMUNIDAD…' : 'CALCULATING AFFINITIES ACROSS THE COMMUNITY…'}
      </p>
    </div>
  )
}

export default function SoulmatesSection({ lang }: Props) {
  const es = lang === 'es'
  const { update } = useProfile()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingFlag, setSavingFlag] = useState(false)
  const [artistSlugMap, setArtistSlugMap] = useState<Record<string, string>>({})
  const [labelSlugMap, setLabelSlugMap] = useState<Record<string, string>>({})
  // `attempt` sube con cada reintento; `settledAttempt` marca el último que
  // terminó (bien o mal). loading = hay un intento en vuelo.
  const [attempt, setAttempt] = useState(0)
  const [settledAttempt, setSettledAttempt] = useState(-1)
  const loading = settledAttempt !== attempt

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    ;(async () => {
      let nextData: ApiResponse | null = null
      let nextError: string | null = null
      try {
        const res = await fetch('/api/breakbeat/soulmates', { cache: 'no-store', signal: controller.signal })
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as { error?: string }))
          throw new Error(j.error || `HTTP ${res.status}`)
        }
        const json = (await res.json()) as ApiResponse
        nextData = {
          ...json,
          soulmates: Array.isArray(json.soulmates) ? json.soulmates : [],
          recommended_tracks: Array.isArray(json.recommended_tracks) ? json.recommended_tracks : [],
        }
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === 'AbortError'
        nextError = aborted
          ? (es ? 'El cálculo ha tardado demasiado.' : 'The calculation took too long.')
          : e instanceof Error ? e.message : String(e)
      } finally {
        clearTimeout(timer)
      }
      if (cancelled) return
      setData(nextData)
      setError(nextError)
      setSettledAttempt(attempt)
    })()
    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [attempt, es])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    const tracks = data?.recommended_tracks
    // Sin recomendaciones no hay nada que enlazar; los mapas viejos no molestan
    // (solo se consultan para nombres presentes en la lista actual).
    if (!tracks?.length) return
    let cancelled = false
    ;(async () => {
      try {
        const artistNames = new Set<string>()
        const labelNames = new Set<string>()
        for (const t of tracks) {
          for (const name of splitArtistDisplayLine(t.artists || '')) artistNames.add(name)
          const label = (t.label || '').trim()
          if (label) labelNames.add(label)
        }
        const supabase = createBrowserSupabase()
        const [{ data: artistRows }, { data: labelRows }] = await Promise.all([
          artistNames.size
            ? supabase.from('artists').select('slug, name, name_display').limit(5000)
            : Promise.resolve({ data: [] as { slug: string; name: string | null; name_display: string | null }[] }),
          labelNames.size
            ? supabase.from('labels').select('slug, name').limit(5000)
            : Promise.resolve({ data: [] as { slug: string; name: string | null }[] }),
        ])
        if (cancelled) return
        setArtistSlugMap(
          filterArtistSlugMapForNames(
            buildFullArtistSlugMap(
              (artistRows as { slug: string; name: string | null; name_display: string | null }[]) || [],
            ),
            artistNames,
          ),
        )
        setLabelSlugMap(
          filterArtistSlugMapForNames(
            buildFullLabelSlugMap(
              ((labelRows as { slug: string; name: string | null }[]) || []).map((r) => ({
                slug: r.slug,
                name: r.name,
                name_display: null,
              })),
            ),
            labelNames,
            { labelSuffixes: true },
          ),
        )
      } catch (e) {
        // Los enlaces a fichas son un extra: si falla, los nombres salen en texto plano.
        console.error('[OB] Soulmates slug maps:', e)
      }
    })()
    return () => { cancelled = true }
  }, [data?.recommended_tracks])

  const enableSharing = async () => {
    setSavingFlag(true)
    try {
      await update({ is_tracks_public: true })
      retry()
    } finally {
      setSavingFlag(false)
    }
  }

  const ready = !loading && !error && data && !data.disabled
  const topJaccard = ready && data.soulmates.length ? Math.max(...data.soulmates.map((s) => s.jaccard || 0), 0) : 0

  return (
    <div>
      <div className="mb-6">
        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: '20px',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}
        >
          {es ? 'ALMAS GEMELAS' : 'SOULMATES'}
        </h2>
        <p className="text-sm text-[var(--ink)]/60 max-w-2xl" style={{ fontFamily: MONO }}>
          {es
            ? 'Cruzamos las canciones guardadas en "Mis Tracks" entre toda la comunidad. Tus almas gemelas son quienes más coinciden contigo: una manera diferente de descubrir música, sabiendo que sus gustos van por donde van los tuyos.'
            : 'We cross-match saved tracks across the whole community. Your soulmates are the people whose lists overlap the most with yours: a different way to find music, knowing their taste lines up with yours.'}
        </p>
      </div>

      {loading && <LoadingSkeleton es={es} />}

      {!loading && error && (
        <div className="border-4 border-[var(--red)] bg-[var(--red)]/10 p-5">
          <h3 className="font-black text-base mb-2" style={{ fontFamily: DISPLAY, textTransform: 'uppercase' }}>
            {es ? 'No hemos podido calcular tus afinidades' : 'We couldn’t calculate your affinities'}
          </h3>
          <p className="text-sm mb-4" style={{ fontFamily: MONO }}>
            {error}
            {' — '}
            {es ? 'suele ser un corte puntual de red o de base de datos.' : 'usually a temporary network or database hiccup.'}
          </p>
          <button type="button" onClick={retry} className="cutout red" style={{ cursor: 'pointer' }}>
            {es ? 'REINTENTAR' : 'RETRY'}
          </button>
        </div>
      )}

      <SoulmatesErrorBoundary es={es} onRetry={retry}>
        {!loading && !error && data?.disabled && data.reason === 'private' && (
          <div className="border-4 border-[var(--ink)] p-6 bg-[var(--paper-dark)]">
            <h3 className="font-black text-base mb-2" style={{ fontFamily: DISPLAY, textTransform: 'uppercase' }}>
              {es ? 'Tu lista está marcada como privada' : 'Your list is marked private'}
            </h3>
            <p className="text-sm mb-4" style={{ fontFamily: MONO }}>
              {es
                ? 'Para descubrir tus almas gemelas necesitamos que tus saves se puedan comparar con los del resto de la comunidad. Tu lista detallada sigue siendo visible solo para ti, pero contaremos las coincidencias en agregado.'
                : 'To find your soulmates we need to compare your saves with the rest of the community. Your detailed list stays visible only to you — we just count overlaps in aggregate.'}
            </p>
            <button
              type="button"
              onClick={enableSharing}
              disabled={savingFlag}
              className="cutout red"
              style={{ cursor: savingFlag ? 'wait' : 'pointer' }}
            >
              {savingFlag
                ? (es ? 'Activando…' : 'Enabling…')
                : (es ? 'ACTIVAR PARA ALMAS GEMELAS' : 'ENABLE FOR SOULMATES')}
            </button>
            <p className="mt-4 text-[11px] text-[var(--ink)]/50" style={{ fontFamily: MONO }}>
              {es
                ? 'Puedes desactivarlo en cualquier momento desde tu perfil.'
                : 'You can switch this off anytime from your profile.'}
            </p>
          </div>
        )}

        {!loading && !error && data?.disabled && data.reason === 'too_few_saves' && (
          <div className="border-4 border-[var(--ink)] p-6">
            <h3 className="font-black text-base mb-2" style={{ fontFamily: DISPLAY, textTransform: 'uppercase' }}>
              {es ? 'Necesitamos más saves' : 'We need more saves'}
            </h3>
            <p className="text-sm mb-4" style={{ fontFamily: MONO }}>
              {es
                ? `Para encontrar afinidades fiables hace falta que guardes al menos ${data.min_required ?? 5} canciones en "Mis Tracks". Llevas ${data.self_count ?? 0}.`
                : `To find reliable affinities you need to save at least ${data.min_required ?? 5} tracks in "My Tracks". You have ${data.self_count ?? 0}.`}
            </p>
            <Link href={`/${lang}/charts`} className="cutout red no-underline" style={{ cursor: 'pointer' }}>
              {es ? 'IR A CHARTS Y GUARDAR' : 'GO TO CHARTS & SAVE'}
            </Link>
          </div>
        )}

        {/* RESUMEN — recuadros informativos (no son botones): un número + qué significa.
            El objetivo es que cada cifra se explique sola: de dónde sale y a qué
            sección de abajo corresponde. */}
        {ready && (
          <>
            <p className="text-[11px] sm:text-xs text-[var(--ink)]/60 mb-3 max-w-2xl leading-snug" style={{ fontFamily: MONO }}>
              {es
                ? 'Resumen de tu radar de afinidad. Cada recuadro se explica solo:'
                : 'Your affinity radar at a glance. Each box explains itself:'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8" role="list">
              {[
                {
                  n: data.self?.saved_count ?? 0,
                  l: es ? 'TUS TRACKS' : 'YOUR TRACKS',
                  d: es
                    ? 'Canciones únicas que has guardado en Mis Tracks. Es la base con la que te comparamos.'
                    : 'Unique tracks you saved in My Tracks. The basis we compare you against.',
                  bg: 'bg-[var(--paper)]',
                },
                {
                  n: data.soulmates.length,
                  l: es ? 'ALMAS GEMELAS' : 'SOULMATES',
                  d: es
                    ? 'Usuarios cuyos gustos más coinciden con los tuyos. Enseñamos como mucho el Top 10 (abajo).'
                    : 'Users whose taste overlaps yours the most. We show the Top 10 at most (below).',
                  bg: 'bg-[var(--yellow)]',
                },
                {
                  n: data.recommended_tracks.length,
                  l: es ? 'PARA DESCUBRIR' : 'TO DISCOVER',
                  d: es
                    ? 'Temas que 2 o más de tus almas gemelas tienen guardados y tú aún no. Es la lista «Lo que te estás perdiendo» (abajo).'
                    : 'Tracks that 2+ of your soulmates saved and you haven’t yet. That’s the “What you’re missing” list (below).',
                  bg: 'bg-[var(--acid)]',
                },
              ].map((s) => (
                <div
                  key={s.l}
                  role="listitem"
                  title={s.d}
                  className={`border-[3px] border-[var(--ink)] p-3 sm:p-4 ${s.bg} flex items-center gap-3 sm:block`}
                >
                  <div className="font-black leading-none tabular-nums shrink-0" style={{ fontFamily: DISPLAY, fontSize: 'clamp(30px, 7vw, 40px)' }}>
                    {s.n}
                  </div>
                  <div className="sm:mt-2">
                    <div className="text-[11px] sm:text-xs tracking-[1.5px] font-black uppercase" style={{ fontFamily: MONO }}>
                      {s.l}
                    </div>
                    <div className="mt-0.5 text-[10px] sm:text-[11px] leading-snug text-[var(--ink)]/70" style={{ fontFamily: MONO }}>
                      {s.d}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {ready && data.soulmates.length === 0 && (
          <div className="border-4 border-[var(--ink)] p-6">
            <p className="text-sm" style={{ fontFamily: MONO }}>
              {es
                ? 'Aún no hemos encontrado almas gemelas suficientemente afines. Cuantos más temas guardes, más fácil será encontrarlas.'
                : 'No solid matches yet. The more tracks you save, the easier it gets.'}
            </p>
          </div>
        )}

        {/* TOP 10 DE ALMAS GEMELAS */}
        {ready && data.soulmates.length > 0 && (
          <section className="mb-10">
            <h3 className="font-black mb-1.5" style={{ fontFamily: DISPLAY, fontSize: '16px', textTransform: 'uppercase' }}>
              {es ? `Tus ${data.soulmates.length} almas gemelas` : `Your ${data.soulmates.length} soulmates`}
            </h3>
            <p className="text-[11px] sm:text-xs text-[var(--ink)]/60 mb-4 max-w-2xl leading-snug" style={{ fontFamily: MONO }}>
              {es
                ? 'Ordenadas por afinidad: el % rojo es cuánto se solapan vuestras dos colecciones. La barra lo compara con tu alma gemela nº1.'
                : 'Sorted by affinity: the red % is how much your two collections overlap. The bar compares it to your #1 soulmate.'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.soulmates.map((sm, i) => {
                const common = (sm.sample_common_tracks || []).filter((t): t is CommonTrack => !!t && !!t.title)
                const rel = topJaccard > 0 ? Math.max(6, Math.round(((sm.jaccard || 0) / topJaccard) * 100)) : 0
                const isFirst = i === 0
                return (
                  <article
                    key={sm.user.id}
                    className={`border-[3px] border-[var(--ink)] p-4 transition-colors ${
                      isFirst ? 'bg-[var(--yellow)]/40 hover:bg-[var(--yellow)]/60' : 'bg-[var(--paper)] hover:bg-[var(--yellow)]/10'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span
                        className={`inline-flex items-center justify-center w-10 h-10 shrink-0 font-black border-[3px] border-[var(--ink)] ${
                          isFirst ? 'bg-[var(--red)] text-white' : 'bg-[var(--ink)] text-[var(--paper)]'
                        }`}
                        style={{ fontFamily: DISPLAY, fontSize: '14px' }}
                      >
                        #{i + 1}
                      </span>
                      <div className="w-12 h-12 shrink-0 border-[3px] border-[var(--ink)] bg-[var(--red)] text-white flex items-center justify-center overflow-hidden">
                        {isHttpUrl(sm.user.avatar_url) ? (
                          <Image src={sm.user.avatar_url} alt="" width={48} height={48} className="object-cover w-full h-full" unoptimized />
                        ) : (
                          <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: '18px' }}>{avatarInitial(sm.user)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-black truncate" style={{ fontFamily: DISPLAY, fontSize: '14px', textTransform: 'uppercase' }}>
                          {userLabel(sm.user, es)}
                        </h4>
                        <p className="text-[11px] text-[var(--ink)]/60 truncate" style={{ fontFamily: MONO }}>
                          {sm.user.username ? `@${sm.user.username}` : ''}
                          {(sm.user.country || '').trim() ? `${sm.user.username ? ' · ' : ''}${(sm.user.country || '').trim()}` : ''}
                        </p>
                      </div>
                      <span
                        className="shrink-0 inline-flex flex-col items-center justify-center px-2 py-1 bg-[var(--red)] text-white border-2 border-[var(--ink)] tabular-nums"
                        style={{ fontFamily: MONO }}
                        title={es
                          ? 'Afinidad: proporción de temas compartidos sobre el total de vuestras dos listas (índice Jaccard).'
                          : 'Affinity: share of tracks in common out of both your lists combined (Jaccard index).'}
                      >
                        <span className="text-[13px] font-black leading-none">{pct(sm.jaccard)}</span>
                        <span className="text-[7px] tracking-[1px] mt-0.5 opacity-80">{es ? 'AFINIDAD' : 'AFFINITY'}</span>
                      </span>
                    </div>

                    {/* Barra de afinidad relativa al #1 */}
                    <div className="h-2 w-full border-2 border-[var(--ink)] bg-[var(--paper)] mb-2 overflow-hidden" aria-hidden>
                      <div className="h-full bg-[var(--red)]" style={{ width: `${rel}%` }} />
                    </div>

                    <p
                      className="text-[11px] text-[var(--ink)]/60 mb-2 tabular-nums"
                      style={{ fontFamily: MONO }}
                      title={es
                        ? 'Temas que ambos habéis guardado, y qué parte suponen de tu lista y de la suya.'
                        : 'Tracks you both saved, and what share they are of your list and of theirs.'}
                    >
                      {(es
                        ? '{n} temas en común · {self_pct} de tu lista · {other_pct} de la suya'
                        : '{n} tracks in common · {self_pct} of your list · {other_pct} of theirs')
                        .replace('{n}', String(sm.common_count ?? 0))
                        .replace('{self_pct}', pct(sm.overlap_self))
                        .replace('{other_pct}', pct(sm.overlap_other))}
                    </p>

                    {common.length > 0 && (
                      <ul className="text-[11px] text-[var(--ink)]/70 mb-3 space-y-0.5" style={{ fontFamily: MONO }}>
                        {common.slice(0, 4).map((t) => (
                          <li key={t.canonical_key} className="truncate">
                            ♪ <span className="text-[var(--ink)]">{t.title}</span>
                            {t.artists && <span className="text-[var(--ink)]/50"> — {t.artists}</span>}
                          </li>
                        ))}
                        {sm.common_count > 4 && (
                          <li className="text-[var(--ink)]/40">
                            {(es ? '+ {n} más en común' : '+ {n} more in common').replace('{n}', String(sm.common_count - 4))}
                          </li>
                        )}
                      </ul>
                    )}

                    <Link
                      href={profileHref(lang, sm.user)}
                      className="inline-flex items-center justify-center px-3 py-1.5 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all no-underline"
                      style={{ fontFamily: MONO }}
                    >
                      {es ? 'VER SU LISTA' : 'VIEW THEIR LIST'}
                    </Link>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {/* RECOMENDACIONES BASADAS EN LAS ALMAS GEMELAS */}
        {ready && data.recommended_tracks.length > 0 && (
          <section>
            <h3 className="font-black mb-2" style={{ fontFamily: DISPLAY, fontSize: '16px', textTransform: 'uppercase' }}>
              {es ? 'Lo que te estás perdiendo' : 'What you’re missing'}
            </h3>
            <p className="text-sm text-[var(--ink)]/60 mb-4 max-w-2xl" style={{ fontFamily: MONO }}>
              {es
                ? 'Canciones que dos o más de tus almas gemelas tienen guardadas y tú aún no. El número amarillo de cada fila indica cuántas de ellas la tienen: si su gusto coincide con el tuyo, seguramente te encaje.'
                : 'Tracks that two or more of your soulmates have saved and you don’t — yet. The yellow number on each row is how many of them saved it: if their taste lines up with yours, it probably fits you too.'}
            </p>
            <ul className="border-[3px] border-[var(--ink)] bg-[var(--paper)] divide-y-[3px] divide-[var(--ink)]/10">
              {data.recommended_tracks.map((t) => {
                const p = t.primary || { source: 'featured' as ChartTrackSource, id: '', week_date: null }
                const internalHref = (() => {
                  if (p.source === 'chart' && p.week_date && p.id) {
                    return `/${lang}/charts?week=${p.week_date}&play=chart:${p.id}`
                  }
                  if (p.source === 'featured' && p.week_date && p.id) {
                    return `/${lang}/charts?week=${p.week_date}&play=featured:${p.id}`
                  }
                  return null
                })()
                const rd = formatTrackReleaseDisplay(t.release_date, t.year)
                return (
                  <li key={t.canonical_key} className="flex items-center gap-3 py-3 px-3 sm:px-4 hover:bg-[var(--yellow)]/10 transition-colors">
                    <span
                      className="inline-flex flex-col items-center justify-center w-11 h-11 shrink-0 font-black border-[3px] border-[var(--ink)] bg-[var(--acid)] text-[var(--ink)]"
                      title={es
                        ? `${t.soulmates_count} de tus almas gemelas tienen guardada esta canción`
                        : `${t.soulmates_count} of your soulmates saved this track`}
                      style={{ fontFamily: DISPLAY }}
                    >
                      <span className="text-base leading-none">{t.soulmates_count}</span>
                      <span className="text-[7px] tracking-[1px] mt-0.5 opacity-80">{es ? 'GEMELAS' : 'MATCHES'}</span>
                    </span>
                    <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative flex items-center justify-center">
                      {isHttpUrl(t.artwork_url) ? (
                        <Image src={t.artwork_url} alt="" fill className="object-cover" sizes="56px" unoptimized />
                      ) : (
                        <span className="text-[var(--ink)]/30 text-lg" aria-hidden>♪</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-sm truncate" style={{ fontFamily: DISPLAY }}>
                        {internalHref ? (
                          <Link href={internalHref} className="hover:text-[var(--red)] transition-colors no-underline">{t.title}</Link>
                        ) : t.title}
                        {t.mix_name && <span className="font-normal text-[10px] text-[var(--ink)]/50 ml-1.5">{t.mix_name}</span>}
                      </h4>
                      <p className="text-[11px] text-[var(--ink)]/60 break-words" style={{ fontFamily: MONO }}>
                        <ArtistNames
                          artists={splitArtistDisplayLine(t.artists || '').map((name) => ({ name }))}
                          mixName={t.mix_name}
                          slugMap={artistSlugMap}
                          lang={lang}
                        />
                        {t.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><LabelName name={t.label} slugMap={labelSlugMap} lang={lang} /></> : null}
                        {rd ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="whitespace-nowrap tabular-nums">{rd}</span></> : null}
                      </p>
                    </div>
                    {isHttpUrl(t.external_url) && (
                      <a
                        href={t.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all no-underline whitespace-nowrap"
                        style={{ fontFamily: MONO }}
                      >
                        {p.source === 'vinyl' ? (/discogs\.com/i.test(t.external_url) ? 'DISCOGS' : 'YOUTUBE') : 'BEATPORT'}
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {ready && (
          <p className="mt-8 text-[11px] text-[var(--ink)]/40 max-w-2xl" style={{ fontFamily: MONO }}>
            {es
              ? `Has guardado ${data.self?.saved_count ?? 0} canciones únicas. Si quieres dejar de aparecer en las búsquedas de afinidad de otros usuarios, desactiva la opción "Lista pública para Almas Gemelas" en tu perfil. Tu colección detallada nunca se comparte aquí: solo el conteo agregado.`
              : `You’ve saved ${data.self?.saved_count ?? 0} unique tracks. If you want to opt out of other people’s affinity searches, switch off "Public list for Soulmates" in your profile. Your detailed collection is never shared here: only aggregate counts.`}
          </p>
        )}
      </SoulmatesErrorBoundary>
    </div>
  )
}
