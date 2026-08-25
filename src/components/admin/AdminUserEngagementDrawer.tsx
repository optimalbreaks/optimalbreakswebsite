// ============================================
// OPTIMAL BREAKS — Drawer admin: detalle de favoritos / mixes / tracks de un usuario
// Se abre desde /[lang]/administrator/users al hacer click en los números
// (favoritos, mixes, tracks) de cada fila.
//
// - Tabs: Favoritos · Mixes · Tracks
// - Cada tab carga sus datos al activarse (lazy)
// - Items enlazan a la ficha pública correspondiente (artistas, sellos, eventos, mixes)
// - ESC y click fuera cierran el drawer
// ============================================

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { displayImageUrl } from '@/lib/image-url'
import {
  buildBeatportTopInternalPath,
  buildTrackSharePath,
  buildVinylSharePath,
  resolveBeatportPlayId,
} from '@/lib/share-track'
import type { Locale } from '@/lib/i18n-config'
import {
  adminGetUserEngagement,
  type AdminFavoriteArtist,
  type AdminFavoriteLabel,
  type AdminFavoriteEvent,
  type AdminSavedMix,
  type AdminSavedTrack,
  type AdminUserEngagement,
} from '@/lib/admin-api'

/** Marca de sitio cuando no hay carátula (igual que en las vistas públicas). */
const MISSING_IMAGE_FALLBACK = '/images/opengraph_OB_punk.png'

type Tab = 'favorites' | 'mixes' | 'tracks'

interface Props {
  userId: string
  userLabel: string
  initialTab: Tab
  lang: string
  onClose: () => void
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return iso
  }
}

const TAB_LABELS: Record<Tab, string> = {
  favorites: 'Favoritos',
  mixes: 'Mixes',
  tracks: 'Tracks',
}

export default function AdminUserEngagementDrawer({
  userId,
  userLabel,
  initialTab,
  lang,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Extract<AdminUserEngagement, { type: 'favorites' }> | null>(null)
  const [mixes, setMixes] = useState<Extract<AdminUserEngagement, { type: 'mixes' }> | null>(null)
  const [tracks, setTracks] = useState<Extract<AdminUserEngagement, { type: 'tracks' }> | null>(null)
  /** El layout `[lang]` envuelve todo en `<main className="relative z-[1]">` y el `<Footer>` también lleva `z-[1]`; eso atrapa cualquier `z-index` interno y el footer dibuja por encima del drawer. Renderizar con un portal a `document.body` escapa ese contexto de apilamiento. */
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const load = useCallback(
    async (which: Tab) => {
      setLoading(true)
      setError(null)
      try {
        const data = await adminGetUserEngagement(userId, which)
        if (data.type === 'favorites') setFavorites(data)
        else if (data.type === 'mixes') setMixes(data)
        else if (data.type === 'tracks') setTracks(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error cargando datos')
      } finally {
        setLoading(false)
      }
    },
    [userId],
  )

  useEffect(() => {
    if (tab === 'favorites' && !favorites) void load('favorites')
    if (tab === 'mixes' && !mixes) void load('mixes')
    if (tab === 'tracks' && !tracks) void load('tracks')
  }, [tab, favorites, mixes, tracks, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const counts = useMemo(() => {
    return {
      favorites: favorites?.counts.total ?? null,
      mixes: mixes?.counts.total ?? null,
      tracks: tracks?.counts.total ?? null,
    }
  }, [favorites, mixes, tracks])

  if (!mounted) return null

  const node = (
    <div
      className="fixed inset-0 z-[1000] flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de actividad de ${userLabel}`}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 cursor-default"
      />
      <div
        className="relative h-full w-full sm:max-w-2xl lg:max-w-3xl flex flex-col bg-[var(--paper)] border-l-[3px] border-[var(--ink)] shadow-[-8px_0_0_rgba(26,26,26,0.18)] animate-[slideInRight_.18s_ease-out]"
        style={{ animationFillMode: 'both' }}
      >
        <header className="sticky top-0 z-10 bg-[var(--yellow)] border-b-[3px] border-[var(--ink)] px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]/70"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              Actividad de usuario
            </div>
            <h2
              className="m-0 truncate text-[18px] sm:text-[20px]"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, letterSpacing: '-0.5px' }}
            >
              {userLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 admin-btn admin-btn--ghost admin-btn--sm"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <nav
          className="sticky top-[78px] z-10 bg-[var(--paper)] border-b-[3px] border-[var(--ink)] px-2 flex gap-0"
          aria-label="Categorías"
        >
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
            const active = tab === t
            const c = counts[t]
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-3 border-r-[2px] border-[var(--ink)] uppercase transition-colors ${
                  active ? 'bg-[var(--ink)] text-[var(--yellow)]' : 'hover:bg-[var(--yellow)]/40 text-[var(--ink)]'
                }`}
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '12px', letterSpacing: '1px' }}
              >
                {TAB_LABELS[t]}
                {c !== null ? (
                  <span className="ml-2 opacity-80" style={{ fontWeight: 400 }}>
                    ({c})
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-6">
          {loading ? <p className="admin-muted">Cargando…</p> : null}
          {error ? <p className="text-[var(--red)] text-sm m-0">{error}</p> : null}

          {tab === 'favorites' && favorites ? (
            <FavoritesView data={favorites} lang={lang} />
          ) : null}

          {tab === 'mixes' && mixes ? <MixesView data={mixes} lang={lang} /> : null}

          {tab === 'tracks' && tracks ? <TracksView data={tracks} lang={lang} /> : null}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(16px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )

  return createPortal(node, document.body)
}

/* ---------- Subvistas ---------- */

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2 border-b-2 border-[var(--ink)] pb-1">
      <h3
        className="m-0 uppercase"
        style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', letterSpacing: '0.5px' }}
      >
        {children}
      </h3>
      <span
        className="text-[var(--text-muted)]"
        style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', fontWeight: 700 }}
      >
        {count}
      </span>
    </div>
  )
}

/**
 * Carátula pequeña para listados del drawer admin.
 *
 * Pasa por `next/image` (mismo proxy que usa la sección pública de Tracks):
 *  - resuelve hotlink-protection de `geo-media.beatport.com` y similares,
 *  - mantiene el aspect ratio del marco aunque la URL falle,
 *  - cae al fallback de marca (`opengraph_OB_punk.png`) si no hay `src`
 *    o si la carga da error.
 */
function Thumb({
  src,
  alt,
  fit = 'cover',
}: {
  src: string | null
  alt: string
  fit?: 'cover' | 'contain'
}) {
  const url = displayImageUrl(src)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setBroken(false)
  }, [url])

  const showFallback = !url || broken
  const finalSrc = showFallback ? MISSING_IMAGE_FALLBACK : (url as string)
  const objectFit = fit === 'contain' ? 'object-contain' : 'object-cover'

  return (
    <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 overflow-hidden border-[2px] border-[var(--ink)] bg-[var(--paper-dark)]">
      <Image
        src={finalSrc}
        alt={showFallback ? '' : alt}
        fill
        sizes="(max-width: 640px) 56px, 64px"
        className={`${objectFit} object-center`}
        onError={() => setBroken(true)}
        unoptimized={false}
      />
      {showFallback ? (
        <div className="absolute inset-0 bg-[var(--paper-dark)]/40 pointer-events-none" aria-hidden />
      ) : null}
    </div>
  )
}

function ItemRow({
  href,
  external,
  thumb,
  primary,
  secondary,
  meta,
}: {
  href?: string | null
  external?: boolean
  thumb: React.ReactNode
  primary: React.ReactNode
  secondary?: React.ReactNode
  meta?: React.ReactNode
}) {
  const inner = (
    <>
      {thumb}
      <div className="flex-grow min-w-0">
        <div
          className="truncate"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: '13px',
            textTransform: 'uppercase',
            letterSpacing: '-0.2px',
          }}
        >
          {primary}
        </div>
        {secondary ? (
          <div
            className="truncate"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            {secondary}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div
          className="shrink-0 text-right"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', color: 'var(--dim)' }}
        >
          {meta}
        </div>
      ) : null}
    </>
  )

  if (href) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 border-b border-[var(--ink)]/30 hover:bg-[var(--yellow)]/40 transition-colors no-underline text-[var(--ink)]"
        >
          {inner}
        </a>
      )
    }
    return (
      <Link
        href={href}
        className="flex items-center gap-3 px-3 py-2 border-b border-[var(--ink)]/30 hover:bg-[var(--yellow)]/40 transition-colors no-underline text-[var(--ink)]"
      >
        {inner}
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--ink)]/30">{inner}</div>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="admin-muted m-0 px-3 py-3 border-b border-[var(--ink)]/20"
      style={{ fontStyle: 'italic' }}
    >
      {children}
    </p>
  )
}

function FavoritesView({
  data,
  lang,
}: {
  data: Extract<AdminUserEngagement, { type: 'favorites' }>
  lang: string
}) {
  const { artists, labels, events } = data
  return (
    <div className="space-y-7">
      <section>
        <SectionTitle count={artists.length}>Artistas favoritos</SectionTitle>
        {artists.length === 0 ? (
          <EmptyHint>Sin artistas marcados.</EmptyHint>
        ) : (
          <div className="border-[2px] border-[var(--ink)] bg-[var(--paper)]">
            {artists.map((a: AdminFavoriteArtist) => (
              <ItemRow
                key={a.id}
                href={`/${lang}/artists/${a.slug}`}
                thumb={<Thumb src={a.image_url} alt={a.name_display || a.name} />}
                primary={a.name_display || a.name}
                secondary={[a.country, a.era].filter(Boolean).join(' · ') || null}
                meta={fmtDateShort(a.saved_at)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle count={labels.length}>Sellos favoritos</SectionTitle>
        {labels.length === 0 ? (
          <EmptyHint>Sin sellos marcados.</EmptyHint>
        ) : (
          <div className="border-[2px] border-[var(--ink)] bg-[var(--paper)]">
            {labels.map((l: AdminFavoriteLabel) => (
              <ItemRow
                key={l.id}
                href={`/${lang}/labels/${l.slug}`}
                thumb={<Thumb src={l.image_url} alt={l.name} />}
                primary={l.name}
                secondary={[l.country, l.founded_year ? `Est. ${l.founded_year}` : null].filter(Boolean).join(' · ') || null}
                meta={fmtDateShort(l.saved_at)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle count={events.length}>Eventos favoritos</SectionTitle>
        {events.length === 0 ? (
          <EmptyHint>Sin eventos marcados.</EmptyHint>
        ) : (
          <div className="border-[2px] border-[var(--ink)] bg-[var(--paper)]">
            {events.map((e: AdminFavoriteEvent) => (
              <ItemRow
                key={e.id}
                href={`/${lang}/events/${e.slug}`}
                thumb={<Thumb src={e.image_url} alt={e.name} fit="contain" />}
                primary={e.name}
                secondary={[fmtDate(e.date_start), [e.city, e.country].filter(Boolean).join(', ')]
                  .filter(Boolean)
                  .join(' · ')}
                meta={fmtDateShort(e.saved_at)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function MixesView({
  data,
  lang,
}: {
  data: Extract<AdminUserEngagement, { type: 'mixes' }>
  lang: string
}) {
  if (data.mixes.length === 0) {
    return <EmptyHint>Este usuario no ha guardado ningún mix.</EmptyHint>
  }
  return (
    <section>
      <SectionTitle count={data.mixes.length}>Mixes guardados</SectionTitle>
      <div className="border-[2px] border-[var(--ink)] bg-[var(--paper)]">
        {data.mixes.map((m: AdminSavedMix) => (
          <ItemRow
            key={m.id}
            href={m.slug ? `/${lang}/mixes/${m.slug}` : undefined}
            thumb={<Thumb src={m.image_url} alt={m.title} />}
            primary={m.title}
            secondary={
              <span>
                <strong>{m.artist_name || '—'}</strong>
                {m.mix_type ? ` · ${m.mix_type.replace('_', ' ')}` : ''}
                {m.year ? ` · ${m.year}` : ''}
                {m.duration_minutes ? ` · ${m.duration_minutes} min` : ''}
              </span>
            }
            meta={fmtDateShort(m.saved_at)}
          />
        ))}
      </div>
    </section>
  )
}

function trackSourceLabel(src: AdminSavedTrack['track_source']): string {
  switch (src) {
    case 'chart':
      return '40 BREAKS'
    case 'featured':
      return 'NEW RELEASE'
    case 'vinyl':
      return 'VINYL'
    case 'beatport_top':
      return 'BEATPORT TOP'
    default:
      return src
  }
}

function trackSourceClass(src: AdminSavedTrack['track_source']): string {
  switch (src) {
    case 'chart':
      return 'bg-[var(--red)] text-white'
    case 'featured':
      return 'bg-[var(--ink)] text-[var(--yellow)]'
    case 'vinyl':
      return 'bg-[var(--paper-dark)] text-[var(--ink)] border border-[var(--ink)]'
    case 'beatport_top':
      return 'bg-[var(--yellow)] text-[var(--ink)] border border-[var(--ink)]'
    default:
      return 'bg-[var(--paper-dark)] text-[var(--ink)]'
  }
}

/**
 * Devuelve el link al que debe llevar la pista, priorizando rutas internas
 * de Optimal Breaks (la página real donde vive la canción) sobre el enlace
 * externo a Beatport / Discogs / YouTube. Solo cae a `canonical_url` si la
 * pista es huérfana sin contexto suficiente para reconstruir el deep-link.
 *
 *  - chart    → `/[lang]/charts?week=YYYY-MM-DD&play=chart:<id>`
 *  - featured → `/[lang]/charts?week=YYYY-MM-DD&play=featured:<id>`
 *  - vinyl    → `/[lang]/charts?play=vinyl:<id>`
 *  - beatport_top → ficha artista/sello `?play=beatport:<id>` (Top 10).
 *    Nunca Beatport: el tema vive en nuestra ficha, igual que el reproductor.
 */
function trackInternalHref(
  t: AdminSavedTrack,
  lang: Locale,
): { href: string; external: boolean } | null {
  if (t.is_live && (t.track_source === 'chart' || t.track_source === 'featured')) {
    return {
      href: buildTrackSharePath(lang, t.track_source, t.track_id, t.week_date),
      external: false,
    }
  }
  if (t.is_live && t.track_source === 'vinyl') {
    return { href: buildVinylSharePath(lang, t.track_id), external: false }
  }
  if (t.track_source === 'beatport_top') {
    const bpId = resolveBeatportPlayId(t.beatport_url || t.canonical_url, t.track_id)
    if (t.origin && bpId) {
      return {
        href: buildBeatportTopInternalPath(lang, t.origin, bpId),
        external: false,
      }
    }
    return null
  }
  if (t.canonical_url) {
    return { href: t.canonical_url, external: true }
  }
  return null
}

function TracksView({
  data,
  lang,
}: {
  data: Extract<AdminUserEngagement, { type: 'tracks' }>
  lang: string
}) {
  if (data.tracks.length === 0) {
    return <EmptyHint>Este usuario no ha guardado ninguna pista.</EmptyHint>
  }
  return (
    <section>
      <SectionTitle count={data.counts.total}>
        Mis Tracks
        <span
          className="ml-2 text-[var(--text-muted)]"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', fontWeight: 700, letterSpacing: 0 }}
        >
          ({data.counts.chart} 40·{data.counts.featured} NR·{data.counts.vinyl} vinyl
          {data.counts.beatport_top ? `·${data.counts.beatport_top} BP` : ''})
        </span>
      </SectionTitle>
      <div className="border-[2px] border-[var(--ink)] bg-[var(--paper)]">
        {data.tracks.map((t: AdminSavedTrack) => {
          const link = trackInternalHref(t, lang as Locale)
          return (
            <ItemRow
              key={`${t.track_source}-${t.track_id}`}
              href={link?.href}
              external={link?.external}
              thumb={<Thumb src={t.artwork_url} alt={t.title} />}
              primary={
                <span>
                  <span
                    className={`mr-2 inline-block px-1.5 py-[1px] align-middle ${trackSourceClass(t.track_source)}`}
                    style={{
                      fontFamily: "'Courier Prime', monospace",
                      fontSize: '8px',
                      fontWeight: 700,
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {trackSourceLabel(t.track_source)}
                  </span>
                  {t.title}
                  {t.mix_name ? <span className="opacity-70"> ({t.mix_name})</span> : null}
                </span>
              }
              secondary={
                <span>
                  <strong>{t.artists || '—'}</strong>
                  {t.label ? ` · ${t.label}` : ''}
                  {t.year ? ` · ${t.year}` : ''}
                  {!t.is_live ? <span className="text-[var(--red)]"> · snapshot</span> : null}
                </span>
              }
              meta={fmtDateShort(t.saved_at)}
            />
          )
        })}
      </div>
    </section>
  )
}
