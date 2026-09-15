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
import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useProfile } from '@/hooks/useUserData'
import TracksSection, { type PublicTracksPayload } from '@/components/user/TracksSection'

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
  // Campos ricos (para pintar cada fila como en /tracks).
  bpm?: number | null
  music_key?: string | null
  sample_url?: string | null
  full_audio_url?: string | null
  spotify_url?: string | null
  tidal_url?: string | null
  platform?: string | null
  link_label?: string | null
  beatport_url?: string | null
  youtube_url?: string | null
  note_en?: string | null
  note_es?: string | null
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

  // Convierte las recomendaciones en un PublicTracksPayload para reutilizar
  // TracksSection (mismo motor de /tracks: play global, guardar, compartir,
  // Spotify/TIDAL/Beatport, vídeo YouTube). Así cada fila se comporta igual
  // que en Mis Tracks sin duplicar la lógica del reproductor.
  const recoPayload = useMemo((): PublicTracksPayload | null => {
    const recs = data?.recommended_tracks
    if (!recs?.length || !data?.self) return null
    const base = Date.now()
    const isYt = (u: string | null) => !!u && /(?:youtu\.be|youtube\.com)/i.test(u)
    const chart: PublicTracksPayload['tracks']['chart'] = []
    const featured: PublicTracksPayload['tracks']['featured'] = []
    const vinyl: PublicTracksPayload['tracks']['vinyl'] = []
    const saved: PublicTracksPayload['saved'] = []

    recs.forEach((t, i) => {
      const src = t.primary.source
      const id = t.primary.id
      const snapshot: Record<string, any> = {
        title: t.title,
        mix_name: t.mix_name,
        artists: t.artists,
        label: t.label,
        year: t.year,
        release_date: t.release_date,
        artwork_url: t.artwork_url,
        beatport_url: t.beatport_url ?? t.external_url,
        sample_url: t.sample_url,
        full_audio_url: t.full_audio_url,
        spotify_url: t.spotify_url,
        tidal_url: t.tidal_url,
        bpm: t.bpm,
        music_key: t.music_key,
        platform: t.platform,
        youtube_url: t.youtube_url,
      }
      saved.push({
        track_source: src,
        track_id: id,
        canonical_url: t.external_url ?? t.beatport_url ?? null,
        snapshot,
        // Orden descendente sintético → conserva el orden del API (por nº de
        // almas gemelas) bajo el sort por defecto "AÑADIDO".
        created_at: new Date(base - i * 60_000).toISOString(),
      })
      if (src === 'chart') {
        chart.push({
          id, title: t.title, mix_name: t.mix_name, artists: t.artists, label: t.label,
          year: t.year, release_date: t.release_date, bpm: t.bpm ?? null, music_key: t.music_key ?? null,
          artwork_url: t.artwork_url, beatport_url: t.beatport_url ?? t.external_url,
          spotify_url: t.spotify_url ?? null, tidal_url: t.tidal_url ?? null,
          sample_url: t.sample_url ?? null, week_date: t.primary.week_date,
        })
      } else if (src === 'featured') {
        featured.push({
          id, title: t.title, mix_name: t.mix_name, artists: t.artists, label: t.label,
          year: t.year, release_date: t.release_date, bpm: t.bpm ?? null, music_key: t.music_key ?? null,
          artwork_url: t.artwork_url, link_url: t.external_url, link_label: t.link_label ?? null,
          platform: t.platform ?? null, spotify_url: t.spotify_url ?? null, tidal_url: t.tidal_url ?? null,
          sample_url: t.sample_url ?? null, full_audio_url: t.full_audio_url ?? null,
          note_en: t.note_en ?? null, note_es: t.note_es ?? null, week_date: t.primary.week_date,
        })
      } else if (src === 'vinyl') {
        vinyl.push({
          id, title: t.title, mix_name: t.mix_name, artists: t.artists, label: t.label,
          year: t.year, artwork_url: t.artwork_url,
          discogs_url: t.external_url && !isYt(t.external_url) ? t.external_url : null,
          youtube_url: t.youtube_url ?? (isYt(t.external_url) ? t.external_url : null),
          note_en: t.note_en ?? null, note_es: t.note_es ?? null,
        })
      }
      // beatport_top: sin fila viva; TracksSection lo reconstruye del snapshot.
    })

    return {
      owner: {
        id: data.self.id,
        username: data.self.username,
        display_name: data.self.display_name,
        avatar_url: data.self.avatar_url,
        country: null,
      },
      saved,
      tracks: { chart, featured, vinyl },
    }
  }, [data])

  // rowKey (`${source}:${id}`) → nº de almas gemelas que tienen el tema.
  const recoBadges = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of data?.recommended_tracks ?? []) {
      m[`${t.primary.source}:${t.primary.id}`] = t.soulmates_count
    }
    return m
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
                  to: data.soulmates.length > 0 ? 'soulmates-top' : null,
                },
                {
                  n: data.recommended_tracks.length,
                  l: es ? 'PARA DESCUBRIR' : 'TO DISCOVER',
                  d: es
                    ? 'Temas que 2 o más de tus almas gemelas tienen guardados y tú aún no. Es la lista «Lo que te estás perdiendo» (abajo).'
                    : 'Tracks that 2+ of your soulmates saved and you haven’t yet. That’s the “What you’re missing” list (below).',
                  bg: 'bg-[var(--acid)]',
                  to: data.recommended_tracks.length > 0 ? 'soulmates-recos' : null,
                },
              ].map((s) => {
                const clickable = !!s.to
                const scrollTo = () => {
                  if (!s.to) return
                  document.getElementById(s.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                const inner = (
                  <>
                    <div className="font-black leading-none tabular-nums shrink-0" style={{ fontFamily: DISPLAY, fontSize: 'clamp(30px, 7vw, 40px)' }}>
                      {s.n}
                    </div>
                    <div className="sm:mt-2 text-left">
                      <div className="text-[11px] sm:text-xs tracking-[1.5px] font-black uppercase flex items-center gap-1" style={{ fontFamily: MONO }}>
                        {s.l}
                        {clickable && <span aria-hidden className="text-[var(--ink)]/50">↓</span>}
                      </div>
                      <div className="mt-0.5 text-[10px] sm:text-[11px] leading-snug text-[var(--ink)]/70" style={{ fontFamily: MONO }}>
                        {s.d}
                      </div>
                    </div>
                  </>
                )
                const cls = `border-[3px] border-[var(--ink)] p-3 sm:p-4 ${s.bg} flex items-center gap-3 sm:block w-full`
                return clickable ? (
                  <button
                    key={s.l}
                    type="button"
                    role="listitem"
                    onClick={scrollTo}
                    title={es ? `${s.d} · Pulsa para ir a la lista` : `${s.d} · Click to jump to the list`}
                    className={`${cls} text-left cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--ink)]`}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={s.l} role="listitem" title={s.d} className={cls}>
                    {inner}
                  </div>
                )
              })}
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
          <section id="soulmates-top" className="mb-10 scroll-mt-24">
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

        {/* RECOMENDACIONES BASADAS EN LAS ALMAS GEMELAS
            Reutiliza TracksSection (mismo motor que /tracks) en modo embebido:
            cada fila trae play, BPM/tonalidad, guardar (+), compartir y
            enlaces a Spotify/TIDAL/Beatport, más el vídeo de los vinilos. */}
        {ready && recoPayload && (
          <section id="soulmates-recos" className="scroll-mt-24">
            <h3 className="font-black mb-2" style={{ fontFamily: DISPLAY, fontSize: '16px', textTransform: 'uppercase' }}>
              {es ? 'Lo que te estás perdiendo' : 'What you’re missing'}
            </h3>
            <p className="text-sm text-[var(--ink)]/60 mb-4 max-w-2xl" style={{ fontFamily: MONO }}>
              {es
                ? 'Canciones que 2 o más de tus almas gemelas tienen guardadas y tú aún no. El recuadro verde indica cuántas almas gemelas la tienen: si alguna tiene 3, 4 o más, sube arriba. Puedes escucharlas, guardarlas (+) y abrirlas en Beatport/Spotify/TIDAL, igual que en Mis Tracks.'
                : 'Tracks that 2+ of your soulmates have saved and you don’t yet. The green badge shows how many soulmates saved it: if a track has 3, 4 or more, it rises to the top. You can play, save (+) and open them on Beatport/Spotify/TIDAL, just like in My Tracks.'}
            </p>
            <TracksSection
              lang={lang}
              publicPayload={recoPayload}
              embedded
              rowBadges={recoBadges}
              rowBadgeLabel={es ? 'GEM.' : 'MATES'}
            />
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
