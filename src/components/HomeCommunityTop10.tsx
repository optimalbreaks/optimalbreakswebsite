'use client'

// ============================================
// OPTIMAL BREAKS — Top 10 artistas de la comunidad (home)
// ----------------------------------------------
// Sustituye al antiguo ArtistShowcase de la portada: en vez de 6 nombres
// fijos, los 10 artistas más guardados en Mis Tracks por la comunidad (el
// mismo tablero que /[lang]/top100, que enseña 10 de 50).
// Diseño: rejilla de fichas-retrato 5×2 (desktop), número de puesto grande,
// bandera, saves y movimiento semanal (▲/▼/═/NUEVO).
//
// Datos: `/api/public/charts/community-monthly?view=artists&cached=1`.
// `view=artists` devuelve solo el top 10 (mismas reglas de crédito, sin la
// lista de temas). Se pide al montar la home, no al hacer scroll, y `cached=1`
// lo guarda 5 min en CDN. Con menos de MIN_ARTISTS la sección no se pinta.
// ============================================

import Link from 'next/link'
import { useEffect, useState } from 'react'
import CardThumbnail from '@/components/CardThumbnail'
import CountryBadge from '@/components/CountryBadge'

const TOP_N = 10
/** Umbral mínimo de artistas para enseñar la sección en la home. */
const MIN_ARTISTS = 5

interface TopArtist {
  rank: number
  name: string
  save_count: number
  unique_users: number
  unique_tracks: number
  slug: string | null
  image_url?: string | null
  country?: string | null
  previous_rank?: number | null
  weeks_at_1?: number
}

export interface HomeTop10Dict {
  tag: string
  title_1: string
  title_2: string
  subtitle: string
  see_all: string
  saves: string
  fans: string
  new_entry: string
  weeks_at_1: string
}

interface Props {
  lang: string
  t: HomeTop10Dict
}

const MONO = "'Courier Prime', monospace"
const DISPLAY = "'Unbounded', sans-serif"

function Movement({ rank, previous, newLabel }: { rank: number; previous: number | null | undefined; newLabel: string }) {
  const base = 'shrink-0 inline-block px-1.5 py-0.5 text-[10px] font-black tracking-wider border-[2px] border-[var(--ink)]'
  if (previous == null) {
    return <span className={`${base} bg-[var(--acid)] text-[var(--ink)]`} style={{ fontFamily: MONO }}>{newLabel}</span>
  }
  const diff = previous - rank
  if (diff > 0) return <span className={`${base} bg-[var(--ink)] text-[#7ddc4a]`} style={{ fontFamily: MONO }}>▲ {diff}</span>
  if (diff < 0) return <span className={`${base} bg-[var(--ink)] text-[#ff6b6b]`} style={{ fontFamily: MONO }}>▼ {Math.abs(diff)}</span>
  return <span className={`${base} bg-[var(--paper)] text-[var(--ink)]/60`} style={{ fontFamily: MONO }}>═</span>
}

function ArtistCard({ a, lang, t }: { a: TopArtist; lang: string; t: HomeTop10Dict }) {
  const podium = a.rank <= 3
  const body = (
    <>
      {/* Retrato */}
      <div className="relative">
        <CardThumbnail
          src={a.image_url}
          alt={a.name}
          aspectClass="aspect-[4/5] w-full"
          frameClass="border-b-[3px] border-[var(--ink)]"
          sizes="(max-width: 768px) 50vw, 280px"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

        {/* Puesto */}
        <div
          aria-hidden
          className="absolute top-1 left-2 leading-none select-none"
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 'clamp(44px, 5vw, 72px)',
            color: podium ? 'var(--yellow)' : 'transparent',
            WebkitTextStroke: podium ? '2px var(--ink)' : '2px rgba(255,255,255,0.85)',
            textShadow: podium ? '3px 3px 0 var(--ink)' : 'none',
          }}
        >
          {a.rank}
        </div>

        {a.rank === 1 ? (
          <span
            className="absolute top-3 right-3 bg-[var(--red)] text-white border-[2px] border-[var(--ink)] px-2 py-0.5"
            style={{ fontFamily: MONO, fontWeight: 700, fontSize: '10px', letterSpacing: '2px', transform: 'rotate(4deg)' }}
          >
            {(a.weeks_at_1 ?? 0) > 1 ? t.weeks_at_1.replace('{n}', String(a.weeks_at_1)) : 'Nº 1'}
          </span>
        ) : null}

        {/* Nombre sobre la foto */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3
            className="m-0 text-white break-words line-clamp-2"
            style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(14px, 1.35vw, 19px)', lineHeight: 1.05, textTransform: 'uppercase', textShadow: '2px 2px 0 #000' }}
          >
            {a.name}
          </h3>
        </div>
      </div>

      {/* Pie: bandera · saves · movimiento */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--paper)]">
        {a.country ? (
          <CountryBadge country={a.country} lang={lang} size="xs" variant="accent" showLabel={false} className="shrink-0" />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold tabular-nums text-[var(--ink)]/70" style={{ fontFamily: MONO }}>
          {a.save_count} {t.saves} · {a.unique_users} {t.fans}
        </span>
        <Movement rank={a.rank} previous={a.previous_rank} newLabel={t.new_entry} />
      </div>
    </>
  )

  const cls =
    'group block overflow-hidden border-[3px] border-[var(--ink)] bg-[var(--ink)] no-underline text-[var(--ink)] transition-all duration-150 sm:hover:-rotate-1 sm:hover:shadow-[6px_6px_0_var(--ink)]'
  return a.slug ? (
    <Link href={`/${lang}/artists/${a.slug}`} className={cls}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export default function HomeCommunityTop10({ lang, t }: Props) {
  const [artists, setArtists] = useState<TopArtist[] | null>(null)
  const [failed, setFailed] = useState(false)

  // Arranca con la página: al llegar a la sección los retratos ya están.
  useEffect(() => {
    let cancelled = false
    fetch('/api/public/charts/community-monthly?view=artists&cached=1')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { top_artists?: TopArtist[] }) => {
        if (!cancelled) setArtists((j.top_artists ?? []).slice(0, TOP_N))
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  // Comunidad aún pequeña o error: no ocupamos sitio en la home.
  if (failed || (artists !== null && artists.length < MIN_ARTISTS)) return null

  return (
    <section
      id="home-top10"
      className="px-3 sm:px-6 py-10 sm:py-14 relative z-[1] border-t-[5px] border-[var(--ink)] bg-[var(--paper-dark)]"
    >
      <div className="home-wrap">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="sec-tag">{t.tag}</div>
            <h2 className="sec-title sec-title--compact">
              {t.title_1} <span className="hl">{t.title_2}</span>
            </h2>
            <p className="mt-3 max-w-[640px] text-[13px] sm:text-[14px] text-[var(--text-muted)]" style={{ fontFamily: MONO }}>
              {t.subtitle}
            </p>
          </div>
          <Link
            href={`/${lang}/top100`}
            className="shrink-0 inline-block no-underline border-[3px] border-[var(--ink)] px-4 py-2 bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-colors"
            style={{ fontFamily: MONO, fontWeight: 700, fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' }}
          >
            {t.see_all} →
          </Link>
        </div>

        <ol className="list-none m-0 p-0 mt-6 sm:mt-8 grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          {artists === null
            ? Array.from({ length: TOP_N }).map((_, i) => (
                <li key={i} aria-hidden className="border-[3px] border-[var(--ink)] bg-[var(--paper)]/50 animate-pulse">
                  <div className="aspect-[4/5]" />
                  <div className="h-9" />
                </li>
              ))
            : artists.map((a) => (
                <li key={`${a.rank}-${a.name}`} className="min-w-0">
                  <ArtistCard a={a} lang={lang} t={t} />
                </li>
              ))}
        </ol>
      </div>
    </section>
  )
}
