// ============================================
// OPTIMAL BREAKS — Soulmates section ("Almas Gemelas")
// ----------------------------------------------
// Cruza las pistas guardadas del usuario con las de la comunidad y muestra
// el top 10 de afinidad (Jaccard sobre claves canónicas) más una lista de
// recomendaciones: temas que tienen las almas gemelas y el usuario aún no.
//
// Si la lista del usuario está marcada como privada, ofrece un botón para
// activarla; si tiene pocos saves, le sugiere seguir guardando.
// ============================================

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useProfile } from '@/hooks/useUserData'
import { formatTrackReleaseDisplay } from '@/lib/share-track'

type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'

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
  sample_common_tracks: CommonTrack[]
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
  return `${(value * 100).toFixed(1)}%`
}

function profileHref(lang: string, u: SoulmateUser) {
  return `/${lang}/u/${u.username || u.id}/tracks`
}

function avatarInitial(u: SoulmateUser) {
  return ((u.display_name || u.username || 'B')[0] || 'B').toUpperCase()
}

export default function SoulmatesSection({ lang }: Props) {
  const es = lang === 'es'
  const { profile, update } = useProfile()
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingFlag, setSavingFlag] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/breakbeat/soulmates', { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as ApiResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const enableSharing = async () => {
    setSavingFlag(true)
    try {
      await update({ is_tracks_public: true })
      await fetchData()
    } finally {
      setSavingFlag(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: '20px',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}
        >
          {es ? 'ALMAS GEMELAS' : 'SOULMATES'}
        </h2>
        <p
          className="text-sm text-[var(--ink)]/60 max-w-2xl"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {es
            ? 'Cruzamos las canciones guardadas en "Mis Tracks" entre toda la comunidad. Tus almas gemelas son quienes más coinciden contigo: una manera diferente de descubrir música, sabiendo que sus gustos van por donde van los tuyos.'
            : 'We cross-match saved tracks across the whole community. Your soulmates are the people whose lists overlap the most with yours: a different way to find music, knowing their taste lines up with yours.'}
        </p>
      </div>

      {loading && (
        <div className="border-4 border-[var(--ink)] p-8 text-center">
          <p className="text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {es ? 'Calculando afinidades…' : 'Calculating affinities…'}
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="border-4 border-[var(--red)] bg-[var(--red)]/10 p-4">
          <p className="text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {(es ? 'Error: ' : 'Error: ') + error}
          </p>
        </div>
      )}

      {!loading && !error && data?.disabled && data.reason === 'private' && (
        <div className="border-4 border-[var(--ink)] p-6 bg-[var(--paper-dark)]">
          <h3 className="font-black text-base mb-2" style={{ fontFamily: "'Unbounded', sans-serif", textTransform: 'uppercase' }}>
            {es ? 'Tu lista está marcada como privada' : 'Your list is marked private'}
          </h3>
          <p className="text-sm mb-4" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {es
              ? 'Para descubrir tus almas gemelas necesitamos que tus saves se puedan comparar con los del resto de la comunidad. Tu lista detallada sigue siendo visible solo para ti, pero contaremos las coincidencias en agregado.'
              : 'To find your soulmates we need to compare your saves with the rest of the community. Your detailed list stays visible only to you — we just count overlaps in aggregate.'}
          </p>
          <button
            onClick={enableSharing}
            disabled={savingFlag}
            className="cutout red"
            style={{ cursor: savingFlag ? 'wait' : 'pointer' }}
          >
            {savingFlag
              ? (es ? 'Activando…' : 'Enabling…')
              : (es ? 'ACTIVAR PARA ALMAS GEMELAS' : 'ENABLE FOR SOULMATES')}
          </button>
          <p className="mt-4 text-[11px] text-[var(--ink)]/50" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {es
              ? 'Puedes desactivarlo en cualquier momento desde tu perfil.'
              : 'You can switch this off anytime from your profile.'}
          </p>
        </div>
      )}

      {!loading && !error && data?.disabled && data.reason === 'too_few_saves' && (
        <div className="border-4 border-[var(--ink)] p-6">
          <h3 className="font-black text-base mb-2" style={{ fontFamily: "'Unbounded', sans-serif", textTransform: 'uppercase' }}>
            {es ? 'Necesitamos más saves' : 'We need more saves'}
          </h3>
          <p className="text-sm mb-4" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {es
              ? `Para encontrar afinidades fiables hace falta que guardes al menos ${data.min_required ?? 5} canciones en "Mis Tracks". Llevas ${data.self_count ?? 0}.`
              : `To find reliable affinities you need to save at least ${data.min_required ?? 5} tracks in "My Tracks". You have ${data.self_count ?? 0}.`}
          </p>
          <Link href={`/${lang}/charts`} className="cutout red no-underline" style={{ cursor: 'pointer' }}>
            {es ? 'IR A CHARTS Y GUARDAR' : 'GO TO CHARTS & SAVE'}
          </Link>
        </div>
      )}

      {!loading && !error && data && !data.disabled && data.soulmates.length === 0 && (
        <div className="border-4 border-[var(--ink)] p-6">
          <p className="text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {es
              ? 'Aún no hemos encontrado almas gemelas suficientemente afines. Cuantos más temas guardes, más fácil será encontrarlas.'
              : 'No solid matches yet. The more tracks you save, the easier it gets.'}
          </p>
        </div>
      )}

      {/* TOP 10 DE ALMAS GEMELAS */}
      {!loading && !error && data && !data.disabled && data.soulmates.length > 0 && (
        <section className="mb-10">
          <h3
            className="font-black mb-4"
            style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '16px', textTransform: 'uppercase' }}
          >
            {es ? `Top ${data.soulmates.length}` : `Top ${data.soulmates.length}`}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.soulmates.map((sm, i) => (
              <article
                key={sm.user.id}
                className="border-[3px] border-[var(--ink)] bg-[var(--paper)] p-4 hover:bg-[var(--yellow)]/10 transition-colors"
              >
                <div className="flex items-start gap-3 mb-3">
                  <span
                    className="inline-flex items-center justify-center w-10 h-10 shrink-0 font-black border-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                    style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '14px' }}
                  >
                    #{i + 1}
                  </span>
                  <div className="w-12 h-12 shrink-0 border-[3px] border-[var(--ink)] bg-[var(--red)] text-white flex items-center justify-center overflow-hidden">
                    {sm.user.avatar_url ? (
                      <Image src={sm.user.avatar_url} alt="" width={48} height={48} className="object-cover w-full h-full" unoptimized />
                    ) : (
                      <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '18px' }}>{avatarInitial(sm.user)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4
                      className="font-black truncate"
                      style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '14px', textTransform: 'uppercase' }}
                    >
                      {sm.user.display_name || sm.user.username || (es ? 'Breaker anónimo' : 'Anonymous breaker')}
                    </h4>
                    <p className="text-[11px] text-[var(--ink)]/60 truncate" style={{ fontFamily: "'Courier Prime', monospace" }}>
                      {sm.user.username ? `@${sm.user.username}` : ''}
                      {sm.user.country ? `${sm.user.username ? ' · ' : ''}${sm.user.country}` : ''}
                    </p>
                  </div>
                  <span
                    className="shrink-0 inline-block px-2 py-1 text-[11px] font-black tracking-wider bg-[var(--red)] text-white border-2 border-[var(--ink)] tabular-nums"
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                    title={es ? 'Similitud Jaccard' : 'Jaccard similarity'}
                  >
                    {pct(sm.jaccard)}
                  </span>
                </div>

                <p
                  className="text-[11px] text-[var(--ink)]/60 mb-2 tabular-nums"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  {(es
                    ? '{n} en común · {self_pct} de las tuyas · {other_pct} de las suyas'
                    : '{n} in common · {self_pct} of yours · {other_pct} of theirs')
                    .replace('{n}', String(sm.common_count))
                    .replace('{self_pct}', pct(sm.overlap_self))
                    .replace('{other_pct}', pct(sm.overlap_other))}
                </p>

                {sm.sample_common_tracks.length > 0 && (
                  <ul className="text-[11px] text-[var(--ink)]/70 mb-3 space-y-0.5" style={{ fontFamily: "'Courier Prime', monospace" }}>
                    {sm.sample_common_tracks.slice(0, 4).map((t) => (
                      <li key={t.canonical_key} className="truncate">
                        ♪ <span className="text-[var(--ink)]">{t.title}</span>
                        {t.artists && <span className="text-[var(--ink)]/50"> — {t.artists}</span>}
                      </li>
                    ))}
                    {sm.sample_common_tracks.length > 4 && (
                      <li className="text-[var(--ink)]/40">
                        {(es ? '+ {n} más' : '+ {n} more').replace('{n}', String(sm.sample_common_tracks.length - 4))}
                      </li>
                    )}
                  </ul>
                )}

                <Link
                  href={profileHref(lang, sm.user)}
                  className="inline-flex items-center justify-center px-3 py-1.5 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all no-underline"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  {es ? 'VER SU LISTA' : 'VIEW THEIR LIST'}
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* RECOMENDACIONES BASADAS EN LAS ALMAS GEMELAS */}
      {!loading && !error && data && !data.disabled && data.recommended_tracks.length > 0 && (
        <section>
          <h3
            className="font-black mb-2"
            style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '16px', textTransform: 'uppercase' }}
          >
            {es ? 'Lo que te estás perdiendo' : 'What you’re missing'}
          </h3>
          <p
            className="text-sm text-[var(--ink)]/60 mb-4 max-w-2xl"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {es
              ? 'Canciones que dos o más almas gemelas tienen guardadas y tú aún no. Lógica del 90/10 de FilmAffinity: si su gusto coincide con el tuyo, este 10% que les falta a tus listas seguramente te encaje.'
              : 'Tracks that two or more soulmates have saved and you don’t — yet. Same logic as FilmAffinity’s 90/10: if their taste lines up with yours, the bits you’re missing probably fit you too.'}
          </p>
          <ul className="border-[3px] border-[var(--ink)] bg-[var(--paper)] divide-y-[3px] divide-[var(--ink)]/10">
            {data.recommended_tracks.map((t) => {
              const internalHref = (() => {
                if (t.primary.source === 'chart' && t.primary.week_date) {
                  return `/${lang}/charts?week=${t.primary.week_date}&play=chart:${t.primary.id}`
                }
                if (t.primary.source === 'featured' && t.primary.week_date) {
                  return `/${lang}/charts?week=${t.primary.week_date}&play=featured:${t.primary.id}`
                }
                return null
              })()
              return (
                <li key={t.canonical_key} className="flex items-center gap-3 py-3 px-3 sm:px-4 hover:bg-[var(--yellow)]/10 transition-colors">
                  <span
                    className="inline-flex flex-col items-center justify-center w-11 h-11 shrink-0 font-black border-[3px] border-[var(--ink)] bg-[var(--acid)] text-[var(--ink)]"
                    title={es ? 'Almas gemelas que la tienen' : 'Soulmates with this track'}
                    style={{ fontFamily: "'Unbounded', sans-serif" }}
                  >
                    <span className="text-base leading-none">{t.soulmates_count}</span>
                    <span className="text-[7px] tracking-[1px] mt-0.5 opacity-80">{es ? 'AFINES' : 'FANS'}</span>
                  </span>
                  {t.artwork_url && (
                    <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
                      <Image src={t.artwork_url} alt="" fill className="object-cover" sizes="56px" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-sm truncate" style={{ fontFamily: "'Unbounded', sans-serif" }}>
                      {internalHref ? (
                        <Link href={internalHref} className="hover:text-[var(--red)] transition-colors no-underline">{t.title}</Link>
                      ) : t.title}
                      {t.mix_name && <span className="font-normal text-[10px] text-[var(--ink)]/50 ml-1.5">{t.mix_name}</span>}
                    </h4>
                    <p className="text-[11px] text-[var(--ink)]/60 sm:break-words break-words" style={{ fontFamily: "'Courier Prime', monospace" }}>
                      {t.artists || '—'}
                      {t.label && <><span className="mx-1.5 text-[var(--ink)]/30">|</span>{t.label}</>}
                      {(() => {
                        const rd = formatTrackReleaseDisplay(t.release_date, t.year)
                        return rd ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="whitespace-nowrap tabular-nums">{rd}</span></> : null
                      })()}
                    </p>
                  </div>
                  {t.external_url && (
                    <a
                      href={t.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all no-underline whitespace-nowrap"
                      style={{ fontFamily: "'Courier Prime', monospace" }}
                    >
                      {t.primary.source === 'vinyl' ? 'YOUTUBE' : 'BEATPORT'}
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!loading && !error && data && !data.disabled && (
        <p className="mt-8 text-[11px] text-[var(--ink)]/40 max-w-2xl" style={{ fontFamily: "'Courier Prime', monospace" }}>
          {es
            ? `Has guardado ${data.self?.saved_count ?? 0} canciones únicas. Si quieres dejar de aparecer en las búsquedas de afinidad de otros usuarios, desactiva la opción "Lista pública para Almas Gemelas" en tu perfil. Tu colección detallada nunca se comparte aquí: solo el conteo agregado.`
            : `You’ve saved ${data.self?.saved_count ?? 0} unique tracks. If you want to opt out of other people’s affinity searches, switch off "Public list for Soulmates" in your profile. Your detailed collection is never shared here: only aggregate counts.`}
        </p>
      )}
    </div>
  )
}
