// ============================================
// OPTIMAL BREAKS — Artículo quincenal del blog
// ----------------------------------------------
// Pinta `blog_posts.digest` (scripts/generar-blog-agente.mjs --quincena):
// mosaico de carátulas, cifras, rankings con carátula y barras, histograma
// de BPM, debutantes, sesiones y adelantos. Los textos son cortos y vienen
// en el propio digest; la estructura la pone este componente.
// Cada tema con `audio_src` lleva ▶: suena en el reproductor global con
// todos los temas del artículo en cola (mismo motor que /charts).
// ============================================

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, type MouseEvent, type ReactNode } from 'react'
import { ArtistNames, LabelName } from '@/components/ArtistNames'
import { useAuth } from '@/components/AuthProvider'
import CardThumbnail, { CoverThirds } from '@/components/CardThumbnail'
import type { PreviewSaveData, PreviewTrack } from '@/components/DeckAudioProvider'
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton, { BeatportLinkButton, SpotifyLinkButton, TidalLinkButton } from '@/components/TrackShareButton'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import { findArtistSlug, splitArtistDisplayLine } from '@/lib/artist-slug-map'
import type { FortnightPlayedArtist } from '@/lib/fortnight-live'
import { digestCoverUrls } from '@/lib/blog-spotlight'
import { formatTrackReleaseDisplay, isAdvanceRelease, proxyCatalogArtworkForDisplay } from '@/lib/share-track'
import type { Locale } from '@/lib/i18n-config'
import type { FortnightDigest as Digest, FortnightDigestTrack } from '@/types/database'

const T = {
  es: {
    fortnight: 'QUINCENA',
    tracks: 'TEMAS',
    artists: 'ARTISTAS',
    labels: 'SELLOS',
    releases: 'DISCOS',
    prev: 'quincena anterior',
    released: 'Los más escuchados',
    heardArtists: 'Artistas más escuchados',
    top100: 'Estrellas del top histórico con temas nuevos',
    played: 'Canciones más escuchadas',
    plays: 'escuchas',
    playOne: 'escucha',
    voted: 'Lo más votado',
    votes: 'votos',
    voteOne: 'voto',
    frozen: (from: string, until: string) => `Recuento del ${from} al ${until}, cerrado al publicar el artículo. En Tracks y en el top histórico los números siguen vivos.`,
    live: (at: string) => `En directo: lo que ha recibido cada tema desde que salió. Actualizado ${at}.`,
    leads: (h: string, title: string, artists: string) => `${h}: «${title}», de ${artists}`,
    leadLine: (title: string, artists: string, n: number, unit: string, rest: string) =>
      `«${title}», de ${artists}, va primero con ${n} ${unit}${rest ? `. Le siguen ${rest}` : ''}.`,
    and: ' y ',
    releasedLine: (list: string) => `Un tema por carátula, solo por escuchas. Abren la lista ${list}.`,
    heardArtistsLine: (name: string, n: number, unit: string) => `${name} es quien más se ha escuchado, con ${n} ${unit}.`,
    artistsTitle: 'Quién más ha publicado',
    tracksShort: 'temas',
    releasesShort: 'discos',
    labelsTitle: 'Sellos de la quincena',
    sound: 'Radiografía sonora',
    avgBpm: 'BPM MEDIO',
    keys: 'TONALIDADES',
    debut: 'Nuevos en el catálogo',
    debutMore: (n: number) => `y ${n} más`,
    playAll: (n: number) => `▶ ESCUCHAR LA QUINCENA · ${n} TEMAS`,
    playAllHint: 'Suenan uno detrás de otro. Pulsa + en los que te gusten y quedan en Mis Tracks.',
    weekCta: 'Cada semana tiene su lista completa en Tracks, con preview de todos los temas.',
    weekBtn: 'VER LA ÚLTIMA SEMANA →',
    releasesCta: 'Cada quincena y cada temporada están en Top novedades, aparte del top histórico.',
    releasesBtn: 'VER TOP NOVEDADES →',
    voteGuest: 'Tu + es tu voto. Crea tu cuenta gratis: guardas los temas en Mis Tracks y cuentan para el top histórico.',
    voteGuestBtn: 'CREAR CUENTA',
    voteUser: 'Cada + que pones cuenta para el top histórico.',
    voteUserBtn: 'MIS TRACKS →',
    top100Cta: 'El ranking de todo lo que la comunidad ha guardado desde el día uno.',
    top100Btn: 'VER EL TOP HISTÓRICO →',
    debutCta: '¿Eres uno de ellos? Crea tu cuenta y reclama tu ficha de artista.',
    debutBtn: 'RECLAMAR MI FICHA',
  },
  en: {
    fortnight: 'FORTNIGHT',
    tracks: 'TRACKS',
    artists: 'ARTISTS',
    labels: 'LABELS',
    releases: 'RELEASES',
    prev: 'previous fortnight',
    released: 'Most played',
    heardArtists: 'Most played artists',
    top100: 'All-time top stars with new music',
    played: 'Most played tracks',
    plays: 'plays',
    playOne: 'play',
    voted: 'Most voted',
    votes: 'votes',
    voteOne: 'vote',
    frozen: (from: string, until: string) => `Count from ${from} to ${until}, closed when the article was published. On Tracks and the all-time top the numbers stay live.`,
    live: (at: string) => `Live: what each track has received since release. Updated ${at}.`,
    leads: (h: string, title: string, artists: string) => `${h}: “${title}” by ${artists}`,
    leadLine: (title: string, artists: string, n: number, unit: string, rest: string) =>
      `“${title}” by ${artists} leads with ${n} ${unit}${rest ? `, ahead of ${rest}` : ''}.`,
    and: ' and ',
    releasedLine: (list: string) => `One track per cover, ranked by plays alone. Leading the list: ${list}.`,
    heardArtistsLine: (name: string, n: number, unit: string) => `${name} is the most played, with ${n} ${unit}.`,
    artistsTitle: 'Who released the most',
    tracksShort: 'tracks',
    releasesShort: 'releases',
    labelsTitle: 'Labels of the fortnight',
    sound: 'Sound check',
    avgBpm: 'AVERAGE BPM',
    keys: 'KEYS',
    debut: 'New to the catalogue',
    debutMore: (n: number) => `and ${n} more`,
    playAll: (n: number) => `▶ PLAY THE FORTNIGHT · ${n} TRACKS`,
    playAllHint: 'They play back to back. Hit + on the ones you like and they land in My Tracks.',
    weekCta: 'Every week has its full list on Tracks, with a preview of every track.',
    weekBtn: 'SEE THE LATEST WEEK →',
    releasesCta: 'Every fortnight and every season lives on Top releases, apart from the all-time top.',
    releasesBtn: 'SEE TOP RELEASES →',
    voteGuest: 'Your + is your vote. Create a free account: tracks go to My Tracks and count towards the all-time top.',
    voteGuestBtn: 'CREATE ACCOUNT',
    voteUser: 'Every + you add counts towards the all-time top.',
    voteUserBtn: 'MY TRACKS →',
    top100Cta: 'The ranking of everything the community has saved since day one.',
    top100Btn: 'SEE THE ALL-TIME TOP →',
    debutCta: 'Are you one of them? Create an account and claim your artist profile.',
    debutBtn: 'CLAIM MY PROFILE',
  },
}

const QUARTER = {
  es: {
    fortnight: 'TRIMESTRE',
    prev: 'trimestre anterior',
    labelsTitle: 'Sellos del trimestre',
    playAll: (n: number) => `▶ ESCUCHAR EL TRIMESTRE · ${n} TEMAS`,
  },
  en: {
    fortnight: 'QUARTER',
    prev: 'previous quarter',
    released: 'Most played this quarter',
    labelsTitle: 'Labels of the quarter',
    playAll: (n: number) => `▶ PLAY THE QUARTER · ${n} TRACKS`,
  },
}

/** Lo que sale la semana que viene: todo son adelantos y los números son de antes del lanzamiento. */
const WEEK = {
  es: {
    fortnight: 'PRÓXIMA SEMANA',
    prev: 'esta semana',
    released: 'Lo que ya suena',
    releasedLine: (list: string) => `Adelantos que ya se escuchan en la web, solo por escuchas. Abren la lista ${list}.`,
    played: 'Los adelantos más escuchados',
    voted: 'Lo más votado antes de salir',
    asOf: (at: string) => `Foto fija del ${at}: lo que había recibido cada adelanto al publicar el artículo. En Tracks los números siguen vivos.`,
    artistsTitle: 'Quién más publica',
    labelsTitle: 'Sellos de la semana',
    top100: 'Estrellas del top histórico con temas en camino',
    debut: 'Debutan en el catálogo',
    playAll: (n: number) => `▶ ESCUCHAR LA PRÓXIMA SEMANA · ${n} TEMAS`,
    weekCta: 'La semana entera está en Tracks, con preview de todos los temas.',
    weekBtn: 'VER LA SEMANA →',
    releasesCta: 'Cuando salgan, lo más escuchado de cada quincena pasa a Top novedades.',
  },
  en: {
    fortnight: 'NEXT WEEK',
    prev: 'this week',
    released: 'Already playing',
    releasedLine: (list: string) => `Pre-releases already playing on the site, ranked by plays alone. Leading the list: ${list}.`,
    played: 'Most played pre-releases',
    voted: 'Most voted before release',
    asOf: (at: string) => `Snapshot of ${at}: what each pre-release had received when the article was published. On Tracks the numbers stay live.`,
    artistsTitle: 'Who releases the most',
    labelsTitle: 'Labels of the week',
    top100: 'All-time top stars with music on the way',
    debut: 'Debuting in the catalogue',
    playAll: (n: number) => `▶ PLAY NEXT WEEK · ${n} TRACKS`,
    weekCta: 'The whole week is on Tracks, with a preview of every track.',
    weekBtn: 'SEE THE WEEK →',
    releasesCta: 'Once they are out, the most played of each fortnight moves to Top releases.',
  },
}

const PICKS = {
  es: {
    title: (n: number) => `Los ${n} destacados que vienen`,
    line: (n: number) => `${n} temas de la selección de Optimal Breaks, ordenados por votos y escuchas de los adelantos.`,
  },
  en: {
    title: (n: number) => `The ${n} highlights on the way`,
    line: (n: number) => `${n} tracks from the Optimal Breaks selection, ranked by votes and plays of the pre-releases.`,
  },
}

/** Primer día con escuchas registradas (`track_plays`). */
const PLAYS_SINCE = '2026-10-06'
const PLAYS_SINCE_NOTE = {
  es: 'Las escuchas se cuentan desde el 6 OCT 2026; los votos, desde siempre.',
  en: 'Plays are counted from 6 OCT 2026; votes, from the start.',
}

const mono = { fontFamily: "'Courier Prime', monospace" } as const
const display = { fontFamily: "'Unbounded', sans-serif" } as const

function shortDate(ymd: string | null, lang: Locale): string {
  if (!ymd) return ''
  return new Date(`${ymd}T12:00:00Z`)
    .toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .toUpperCase()
    .replace('.', '')
}

function trackName(t: FortnightDigestTrack): string {
  return t.mix_name && !/^original mix$/i.test(t.mix_name) ? `${t.title} (${t.mix_name})` : t.title
}

function saveOf(t: FortnightDigestTrack): PreviewSaveData | undefined {
  if (!t.featured_id) return undefined
  return {
    mode: 'ref',
    source: 'featured',
    trackId: t.featured_id,
    canonicalUrl: t.external_url,
    snapshot: {
      title: t.title,
      mix_name: t.mix_name,
      artists: t.artists,
      label: t.label,
      release_date: t.release_date,
      year: t.release_date ? Number(t.release_date.slice(0, 4)) : null,
      artwork_url: t.artwork_url,
      beatport_url: t.external_url && /beatport\.com/i.test(t.external_url) ? t.external_url : null,
    },
  }
}

function SaveButton({ track, lang, className = '' }: { track: FortnightDigestTrack; lang: Locale; className?: string }) {
  const save = saveOf(track)
  if (!save || save.mode !== 'ref') return null
  return (
    <SaveTrackButton
      source={save.source}
      trackId={save.trackId}
      canonicalUrl={save.canonicalUrl ?? null}
      snapshot={save.snapshot ?? null}
      lang={lang}
      size="sm"
      className={className}
    />
  )
}

function rowKeyOf(t: FortnightDigestTrack): string {
  return t.featured_id ? `fq-${t.featured_id}` : `fq-${t.artists}-${t.title}-${t.mix_name ?? ''}`
}

type Spot = 'rel' | 'played' | 'voted' | 'top' | (string & {})

/** Id de la fila en el DOM: el mismo tema sale en varias secciones y el reproductor vuelve a la que se pulsó. */
function spotId(spot: Spot, t: FortnightDigestTrack): string {
  return `fd-${spot}-${rowKeyOf(t).replace(/[^a-zA-Z0-9_-]+/g, '-')}`
}

const PlayCtx = createContext<{ play: (rowKey: string, domId?: string) => void; current: string | null; playing: boolean }>({
  play: () => {},
  current: null,
  playing: false,
})

/** Clic en la tarjeta o la fila = ▶: dentro del artículo un tema nunca saca a /charts. Botones y enlaces van a lo suyo. */
function cardPlayWith(play: (rowKey: string, domId?: string) => void) {
  return (t: FortnightDigestTrack, spot: Spot) => (e: MouseEvent<HTMLElement>) => {
    if (!t.audio_src || (e.target as HTMLElement).closest('button, a')) return
    play(rowKeyOf(t), spotId(spot, t))
  }
}

function PlayButton({ track, spot, className = '' }: { track: FortnightDigestTrack; spot: Spot; className?: string }) {
  const { play, current, playing } = useContext(PlayCtx)
  if (!track.audio_src) return null
  const rowKey = rowKeyOf(track)
  const on = current === rowKey && playing
  return (
    <button
      type="button"
      onClick={() => play(rowKey, spotId(spot, track))}
      aria-label={`${on ? 'Pause' : 'Play'} ${track.artists} — ${trackName(track)}`}
      className={`flex items-center justify-center border-[2px] border-[var(--ink)] font-black transition-colors ${on ? 'bg-[var(--yellow)] text-[var(--ink)]' : 'bg-[var(--red)] text-white hover:bg-[var(--ink)]'} ${className}`}
      style={mono}
    >
      {on ? '❚❚' : '▶'}
    </button>
  )
}

function NameLink({ name, slug, base, lang }: { name: string; slug: string | null; base: 'artists' | 'labels'; lang: Locale }) {
  if (!slug) return <>{name}</>
  return (
    <Link href={`/${lang}/${base}/${slug}`} className="underline decoration-[var(--red)] underline-offset-2 hover:text-[var(--red)]">
      {name}
    </Link>
  )
}

function Section({ title, copy, children }: { title: string; copy?: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      {/* prose-ob solo en el texto: si envuelve la fila, pinta los botones de rojo. */}
      <div className="prose-ob">
        <h2>{title}</h2>
        {copy ? <p className="text-[16px] leading-[1.8] mb-5" style={{ fontFamily: "'Special Elite', monospace" }}>{copy}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Cta({ text, label, href }: { text: string; label: string; href: string }) {
  return (
    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 border-[3px] border-[var(--ink)] bg-[var(--yellow)] p-3 sm:p-4 shadow-[4px_4px_0_var(--ink)]">
      <p className="flex-1 text-[13px] leading-snug m-0" style={mono}>{text}</p>
      <Link
        href={href}
        className="shrink-0 self-start sm:self-auto inline-block bg-[var(--red)] !text-white border-[3px] border-[var(--ink)] px-4 py-2 text-[12px] font-black tracking-wider !no-underline hover:bg-[var(--ink)] transition-colors"
        style={display}
      >
        {label}
      </Link>
    </div>
  )
}

function Cover({ src, alt, sizes = '64px', frameClass = 'border-[2px] border-[var(--ink)]' }: { src: string | null; alt: string; sizes?: string; frameClass?: string }) {
  return <CardThumbnail src={src} alt={alt} aspectClass="aspect-square" frameClass={frameClass} sizes={sizes} />
}

function RankedTracks({
  tracks, spot, unit, lang, artistSlugMap, labelSlugMap,
}: {
  tracks: FortnightDigestTrack[]
  spot: Spot
  unit: string
  lang: Locale
  artistSlugMap?: Record<string, string>
  labelSlugMap?: Record<string, string>
}) {
  const max = Math.max(1, ...tracks.map((t) => t.value))
  const { play, current, playing } = useContext(PlayCtx)
  const cardPlay = cardPlayWith(play)
  const chip = 'inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5'
  return (
    <div className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden">
      {tracks.map((t, i) => {
        const on = current === rowKeyOf(t) && playing
        const mix = t.mix_name && !/^original mix$/i.test(t.mix_name) ? t.mix_name : ''
        const release = formatTrackReleaseDisplay(t.release_date, null)
        const advance = isAdvanceRelease(t.release_date)
        const beatport = !!(t.external_url && /beatport\.com/i.test(t.external_url))
        return (
          <div
            key={`${t.title}-${i}`}
            id={spotId(spot, t)}
            onClick={cardPlay(t, spot)}
            className={`${t.audio_src ? 'cursor-pointer ' : ''}flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] last:border-b-0 transition-colors ${on ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-14 sm:w-16 shrink-0">
                  <Cover src={t.artwork_url} alt={`${t.artists} — ${t.title}`} sizes="64px" frameClass="border-[3px] border-[var(--ink)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="inline-block px-1.5 py-0.5 mb-0.5 text-[9px] font-black tracking-widest bg-[var(--ink)] text-[var(--paper)] border-2 border-[var(--ink)]" style={mono}>
                    #{i + 1}
                  </span>
                  <div className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate" style={display}>
                    {t.title}
                    {mix ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{mix}</span> : null}
                  </div>
                  <div className="text-xs sm:text-sm mt-0.5 break-words" style={mono}>
                    <ArtistNames artists={splitArtistDisplayLine(t.artists).map((name) => ({ name }))} mixName={t.mix_name} slugMap={artistSlugMap} lang={lang} />
                    {t.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><LabelName name={t.label} slugMap={labelSlugMap} lang={lang} /></> : null}
                    {release ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap">{release}</span></> : null}
                  </div>
                </div>
              </div>
              <div className="track-action-bar sm:!justify-start sm:!self-start sm:pl-[76px]">
                {t.audio_src ? (
                  <PlayButton
                    track={t}
                    spot={spot}
                    className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 ${on ? '' : '!bg-transparent !text-[var(--ink)] hover:!bg-[var(--yellow)]'}`}
                  />
                ) : null}
                {t.bpm != null && t.bpm > 0 ? <span className={`${chip} bg-[var(--uv)]`} style={mono}>{Math.round(t.bpm)}</span> : null}
                {(t.music_key || '').trim() ? <span className={`${chip} bg-[var(--cyan)] whitespace-nowrap`} style={mono}>{(t.music_key || '').trim()}</span> : null}
                <SaveButton track={t} lang={lang} />
                {t.featured_id ? (
                  <TrackShareButton source="featured" trackId={t.featured_id} weekDate={t.week_date || ''} lang={lang} shareTitle={`${t.title} — ${t.artists}`} />
                ) : null}
                {advance ? null : <SpotifyLinkButton url={t.spotify_url} title={t.title} artists={splitArtistDisplayLine(t.artists)} lang={lang} />}
                {advance ? null : <TidalLinkButton url={t.tidal_url} lang={lang} />}
                {beatport && t.external_url ? <BeatportLinkButton url={t.external_url} lang={lang} /> : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-3 flex-1 border-2 border-[var(--ink)] bg-[var(--paper-dark)]">
                <div className="h-full bg-[var(--red)]" style={{ width: `${Math.max(3, (t.value / max) * 100)}%` }} />
              </div>
              <span className="shrink-0 min-w-[96px] text-right text-[11px] whitespace-nowrap" style={mono}>
                <b className="text-[16px]" style={display}>{t.value}</b> {unit}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Bars({ rows, lang, base }: { rows: { name: string; slug: string | null; value: number; note: string }[]; lang: Locale; base: 'artists' | 'labels' }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex justify-between gap-3 text-[13px]" style={mono}>
            <span className="truncate font-bold"><NameLink name={r.name} slug={r.slug} base={base} lang={lang} /></span>
            <span className="shrink-0 text-[var(--dim)]">{r.note}</span>
          </div>
          <div className="h-4 border-[2px] border-[var(--ink)] bg-[var(--paper)]">
            <div className="h-full bg-[var(--ink)]" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Carátula limpia y botones en su fila: encima de la portada se apelotonaban en móvil. */
function CoverGrid({ tracks, spot, lang, showDate = false }: { tracks: FortnightDigestTrack[]; spot: Spot; lang: Locale; showDate?: boolean }) {
  const { play } = useContext(PlayCtx)
  const cardPlay = cardPlayWith(play)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
      {tracks.map((r, i) => {
        const advance = isAdvanceRelease(r.release_date)
        return (
          <div
            key={i}
            id={spotId(spot, r)}
            onClick={cardPlay(r, spot)}
            className={`flex flex-col border-[3px] border-[var(--ink)] bg-[var(--paper)] ${r.audio_src ? 'cursor-pointer' : ''}`}
          >
            <CardThumbnail src={r.artwork_url} alt={`${r.artists} — ${r.title}`} aspectClass="aspect-square" sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 190px" />
            <div className="flex items-center gap-1.5 px-2 pt-2">
              <PlayButton track={r} spot={spot} className="h-[34px] w-[34px] sm:h-[30px] sm:w-[30px] shrink-0 rounded-full text-[12px]" />
              <SaveButton track={r} lang={lang} className="!h-[34px] !w-[34px] sm:!h-[30px] sm:!w-[30px]" />
              {advance ? null : (
                <SpotifyLinkButton url={r.spotify_url} title={r.title} artists={splitArtistDisplayLine(r.artists)} lang={lang} />
              )}
            </div>
            <div className="p-2 pt-1.5 min-w-0">
              {showDate && r.release_date ? (
                <div className="text-[10px] font-black tracking-[1px] text-[var(--red)]" style={mono}>{shortDate(r.release_date, lang)}</div>
              ) : null}
              <div className="text-[11px] sm:text-[12px] font-black uppercase leading-tight line-clamp-2" style={display}>{r.artists}</div>
              <div className="mt-0.5 text-[11px] truncate" style={mono}>{trackName(r)}</div>
              {r.label ? <div className="text-[10px] text-[var(--dim)] truncate" style={mono}>{r.label}</div> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function queueItem(t: FortnightDigestTrack, spot: Spot, pathname: string | null): PreviewTrack {
  return {
    rowKey: rowKeyOf(t),
    domId: spotId(spot, t),
    src: t.audio_src!,
    title: t.title,
    mixName: t.mix_name,
    artist: t.artists,
    artworkUrl: t.artwork_url,
    album: t.label,
    originPath: pathname || undefined,
    share: t.featured_id ? { mode: 'chart', source: 'featured', trackId: t.featured_id, weekDate: t.week_date } : undefined,
    save: saveOf(t),
  }
}

/**
 * Carátulas de un periodo en /topreleases: suenan ahí mismo, con todo el periodo en cola.
 * `spot` distingue la misma canción en dos tarjetas de la página (quincena y su temporada).
 */
export function DigestTrackStrip({
  tracks, spot, groupKey, units, show = 8, playAll, large = false, dateLang,
}: {
  tracks: FortnightDigestTrack[]
  spot: string
  groupKey: string
  /** [singular, plural] del valor de cada tema (escuchas o votos). */
  units: readonly [string, string]
  show?: number
  /** Texto del botón; `{n}` = temas en cola. */
  playAll?: string
  large?: boolean
  /** Temas que aún no han salido: la fecha de salida en lugar del valor. */
  dateLang?: Locale
}) {
  const pathname = usePathname()
  const { previewQueue, previewIndex, previewGroupKey, previewPlaying, playPreviewQueue, togglePreview } = usePreviewAudioGated()
  const queue = useMemo(() => {
    const seen = new Set<string>()
    const out: PreviewTrack[] = []
    for (const t of tracks) {
      const key = rowKeyOf(t)
      if (!t.audio_src || seen.has(key)) continue
      seen.add(key)
      out.push(queueItem(t, spot, pathname))
    }
    return out
  }, [tracks, spot, pathname])
  const current = previewGroupKey === groupKey ? previewQueue[previewIndex]?.rowKey ?? null : null
  const play = useCallback(
    (rowKey: string) => {
      if (current === rowKey) {
        togglePreview()
        return
      }
      const idx = queue.findIndex((q) => q.rowKey === rowKey)
      if (idx >= 0) playPreviewQueue(queue, idx, groupKey)
    },
    [current, queue, groupKey, playPreviewQueue, togglePreview],
  )
  const playCtx = useMemo(() => ({ play, current, playing: previewPlaying }), [play, current, previewPlaying])
  const cardPlay = cardPlayWith(play)
  const shown = tracks.slice(0, show)
  if (shown.length === 0) return null

  return (
    <PlayCtx.Provider value={playCtx}>
      {playAll && queue.length > 0 ? (
        <button
          type="button"
          onClick={() => (current ? togglePreview() : playPreviewQueue(queue, 0, groupKey))}
          className={`w-full mb-3 bg-[var(--red)] text-white border-[3px] border-[var(--ink)] font-black tracking-wider hover:bg-[var(--ink)] transition-colors ${large ? 'shadow-[4px_4px_0_var(--ink)] px-4 py-3 text-[14px] sm:text-[16px]' : 'px-3 py-2 text-[11px] sm:text-[12px]'}`}
          style={display}
        >
          {current && previewPlaying ? '❚❚' : playAll.replace('{n}', String(queue.length))}
        </button>
      ) : null}
      <ol className={`list-none m-0 p-0 grid gap-1.5 sm:gap-2 ${large ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-8'}`}>
        {shown.map((t, n) => {
          const on = current === rowKeyOf(t) && previewPlaying
          return (
            <li
              key={`${spot}-${rowKeyOf(t)}`}
              id={spotId(spot, t)}
              onClick={cardPlay(t, spot)}
              className={t.audio_src ? 'cursor-pointer' : ''}
              title={`${t.artists} — ${trackName(t)}`}
            >
              <div className={`relative ${on ? 'outline outline-[3px] outline-[var(--red)]' : ''}`}>
                <Cover src={t.artwork_url} alt={`${t.artists} — ${t.title}`} sizes={large ? '(max-width: 640px) 25vw, 200px' : '80px'} />
                <PlayButton
                  track={t}
                  spot={spot}
                  className={`absolute rounded-full shadow-[2px_2px_0_var(--ink)] ${large ? 'top-1.5 right-1.5 h-9 w-9 sm:h-10 sm:w-10 text-[14px]' : 'top-1 right-1 h-7 w-7 text-[11px]'}`}
                />
              </div>
              <span className={`mt-1 block font-black truncate ${large ? 'text-[10px] sm:text-[12px]' : 'text-[9px]'}`} style={mono}>
                #{n + 1} {t.artists}
              </span>
              {large ? (
                <>
                  <span className="block text-[10px] sm:text-[11px] truncate" style={mono}>{trackName(t)}</span>
                  {dateLang ? (
                    <span className="block text-[9px] sm:text-[10px] font-black text-[var(--red)]" style={mono}>{shortDate(t.release_date, dateLang)}</span>
                  ) : (
                    <span className="block text-[9px] sm:text-[10px] text-[var(--dim)]" style={mono}>{t.value} {t.value === 1 ? units[0] : units[1]}</span>
                  )}
                </>
              ) : null}
            </li>
          )
        })}
      </ol>
    </PlayCtx.Provider>
  )
}

export default function FortnightDigest({
  digest: d, lang, artistSlugMap, labelSlugMap, liveAt = null, heroFocus, playedArtists = [],
}: {
  digest: Digest
  lang: Locale
  artistSlugMap?: Record<string, string>
  labelSlugMap?: Record<string, string>
  /** Rankings recalculados en el servidor (fortnight-live): títulos y textos salen de los datos. */
  liveAt?: string | null
  /** `object-position` de cada tercio. El motivo de una carátula blanca cae en su lado. */
  heroFocus?: { x: number; y: number }[]
  /** Artistas ordenados por escuchas de los temas del periodo. */
  playedArtists?: FortnightPlayedArtist[]
}) {
  const week = d.kind === 'semana'
  const t = d.kind === 'trimestre' ? { ...T[lang], ...QUARTER[lang] } : week ? { ...T[lang], ...WEEK[lang] } : T[lang]
  const copy = d.copy[lang]
  const picks = d.picks ?? []
  const delta = d.totals.tracks - d.totals.prev_tracks
  const stats: [string, number, string?][] = [
    [t.tracks, d.totals.tracks, week ? undefined : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} · ${t.prev}`],
    [t.artists, d.totals.artists],
    [t.labels, d.totals.labels],
    [t.releases, d.totals.releases],
  ]
  const bandMax = Math.max(1, ...d.sound.bands.map((b) => b.count))

  const pathname = usePathname()
  const { previewQueue, previewIndex, previewGroupKey, previewPlaying, playPreviewQueue, togglePreview } = usePreviewAudioGated()
  const groupKey = `blog-quincena:${d.from}:${d.until}`
  const queue = useMemo((): PreviewTrack[] => {
    const seen = new Set<string>()
    const out: PreviewTrack[] = []
    const all: [Spot, FortnightDigestTrack][] = [
      ...(d.picks ?? []).map((t): [Spot, FortnightDigestTrack] => ['pick', t]),
      ...(d.released ?? []).map((t): [Spot, FortnightDigestTrack] => ['rel', t]),
      ...d.played.map((t): [Spot, FortnightDigestTrack] => ['played', t]),
      ...d.voted.map((t): [Spot, FortnightDigestTrack] => ['voted', t]),
      ...d.top100.flatMap((a) => a.tracks.map((t): [Spot, FortnightDigestTrack] => ['top', t])),
    ]
    for (const [spot, t] of all) {
      const rowKey = rowKeyOf(t)
      if (!t.audio_src || seen.has(rowKey)) continue
      seen.add(rowKey)
      out.push(queueItem(t, spot, pathname))
    }
    return out
  }, [d, pathname])
  const current = previewGroupKey === groupKey ? previewQueue[previewIndex]?.rowKey ?? null : null
  const play = useCallback(
    (rowKey: string, domId?: string) => {
      if (current === rowKey) {
        togglePreview()
        return
      }
      const idx = queue.findIndex((q) => q.rowKey === rowKey)
      if (idx < 0) return
      const q = domId ? queue.map((item, i) => (i === idx ? { ...item, domId } : item)) : queue
      playPreviewQueue(q, idx, groupKey)
    },
    [current, queue, groupKey, playPreviewQueue, togglePreview],
  )
  const playCtx = useMemo(() => ({ play, current, playing: previewPlaying }), [play, current, previewPlaying])
  const { user } = useAuth()
  const lastWeek = (d.released ?? []).map((r) => r.week_date || '').sort().pop() || ''
  const accountHref = (path: string) => (user ? `/${lang}${path}` : `/${lang}/login`)
  // Semana: foto fija del generador (`as_of`); las frases salen de esos números igual que en directo.
  const stampAt = liveAt ?? (week ? d.as_of ?? null : null)
  const liveLabel = (() => {
    if (!stampAt) return ''
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(stampAt))
        .map((x) => [x.type, x.value]),
    )
    return `${shortDate(`${p.year}-${p.month}-${p.day}`, lang)} · ${p.hour}:${p.minute}`
  })()
  const frozenNote = (
    <p className="mt-2 text-[11px] text-[var(--dim)]" style={mono}>
      {liveAt ? t.live(liveLabel) : stampAt ? WEEK[lang].asOf(liveLabel) : t.frozen(shortDate(d.from, lang), shortDate(d.until, lang))}
      {liveAt && d.from < PLAYS_SINCE ? ` ${PLAYS_SINCE_NOTE[lang]}` : null}
    </p>
  )
  const heading = (h: string, list: FortnightDigestTrack[]) =>
    stampAt && list[0] ? t.leads(h, list[0].title, list[0].artists) : h
  const names = (list: FortnightDigestTrack[]) => {
    const items = list.map((x) => (lang === 'es' ? `«${x.title}» (${x.artists})` : `“${x.title}” (${x.artists})`))
    return items.length > 1 ? `${items.slice(0, -1).join(', ')}${t.and}${items[items.length - 1]}` : items[0] || ''
  }
  const leadCopy = (list: FortnightDigestTrack[], one: string, many: string, stored: string) => {
    if (!stampAt) return stored
    const [first, ...others] = list
    if (!first) return ''
    return t.leadLine(first.title, first.artists, first.value, first.value === 1 ? one : many, names(others.slice(0, 2)))
  }

  return (
    <PlayCtx.Provider value={playCtx}>
    <div className="ob-digest">
      {/* Portada: mosaico de carátulas + cifras */}
      <div className="relative -mx-4 sm:mx-0 border-y-[3px] sm:border-[3px] border-[var(--ink)]">
        <CoverThirds
          srcs={digestCoverUrls(d.covers).map((u) => proxyCatalogArtworkForDisplay(u) || u)}
          focus={heroFocus}
          alt=""
          aspectClass="aspect-[3/1]"
          frameClass="border-0"
          sizes="(max-width: 640px) 34vw, 270px"
        />
        <div className="absolute left-3 bottom-3 bg-[var(--yellow)] border-[3px] border-[var(--ink)] px-3 py-1 text-[13px] sm:text-[15px] font-black" style={display}>
          {t.fortnight} {shortDate(d.from, lang)} — {shortDate(d.until, lang)}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {stats.map(([label, value, note]) => (
          <div key={label} className="border-[3px] border-[var(--ink)] bg-[var(--paper)] p-3">
            <div className="text-[30px] sm:text-[36px] leading-none font-black" style={display}>{value}</div>
            <div className="text-[11px] tracking-[2px] mt-1" style={mono}>{label}</div>
            {note ? <div className="text-[10px] text-[var(--dim)] mt-1" style={mono}>{note}</div> : null}
          </div>
        ))}
      </div>

      {copy.intro ? (
        <div className="prose-ob">
          <p className="mt-6 text-[17px] leading-[1.8]" style={{ fontFamily: "'Special Elite', monospace" }}>{copy.intro}</p>
        </div>
      ) : null}

      {queue.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => (current ? togglePreview() : playPreviewQueue(queue, 0, groupKey))}
            className="w-full bg-[var(--red)] text-white border-[3px] border-[var(--ink)] shadow-[4px_4px_0_var(--ink)] px-4 py-3 text-[14px] sm:text-[16px] font-black tracking-wider hover:bg-[var(--ink)] transition-colors"
            style={display}
          >
            {current && previewPlaying ? '❚❚' : t.playAll(queue.length)}
          </button>
          <p className="mt-2 text-[12px] text-[var(--dim)]" style={mono}>{t.playAllHint}</p>
        </div>
      )}

      {picks.length > 0 && (
        <Section title={PICKS[lang].title(picks.length)} copy={copy.picks || PICKS[lang].line(picks.length)}>
          <CoverGrid tracks={picks} spot="pick" lang={lang} showDate />
          <Cta text={t.weekCta} label={t.weekBtn} href={`/${lang}/charts?week=${d.from}`} />
        </Section>
      )}

      {d.released?.length > 0 && (
        <Section title={t.released} copy={stampAt ? t.releasedLine(names(d.released.slice(0, 3))) : copy.released}>
          <CoverGrid tracks={d.released} spot="rel" lang={lang} showDate={week} />
          {week ? null : <Cta text={t.weekCta} label={t.weekBtn} href={lastWeek ? `/${lang}/charts?week=${lastWeek}` : `/${lang}/charts`} />}
          <Cta text={t.releasesCta} label={t.releasesBtn} href={`/${lang}/topreleases`} />
        </Section>
      )}

      {playedArtists.length > 0 && (
        <Section
          title={t.heardArtists}
          copy={t.heardArtistsLine(playedArtists[0].name, playedArtists[0].plays, playedArtists[0].plays === 1 ? t.playOne : t.plays)}
        >
          <Bars
            base="artists"
            lang={lang}
            rows={playedArtists.map((a) => ({
              name: a.name,
              slug: findArtistSlug(a.name, artistSlugMap),
              value: a.plays,
              note: `${a.plays} ${a.plays === 1 ? t.playOne : t.plays} · ${a.tracks} ${t.tracksShort}`,
            }))}
          />
          {frozenNote}
        </Section>
      )}

      {d.played.length > 0 && (
        <Section title={heading(t.played, d.played)} copy={leadCopy(d.played, t.playOne, t.plays, copy.played)}>
          <RankedTracks tracks={d.played} spot="played" unit={t.plays} lang={lang} artistSlugMap={artistSlugMap} labelSlugMap={labelSlugMap} />
          {frozenNote}
        </Section>
      )}

      {d.voted.length > 0 && (
        <Section title={heading(t.voted, d.voted)} copy={leadCopy(d.voted, t.voteOne, t.votes, copy.voted)}>
          <RankedTracks tracks={d.voted} spot="voted" unit={t.votes} lang={lang} artistSlugMap={artistSlugMap} labelSlugMap={labelSlugMap} />
          {frozenNote}
          <Cta
            text={user ? t.voteUser : t.voteGuest}
            label={user ? t.voteUserBtn : t.voteGuestBtn}
            href={accountHref('/mi-cuenta/tracks')}
          />
        </Section>
      )}

      {d.artists.length > 0 && (
        <Section title={t.artistsTitle} copy={copy.artists}>
          <Bars
            base="artists"
            lang={lang}
            rows={d.artists.map((a) => ({ ...a, value: a.tracks, note: `${a.tracks} ${t.tracksShort} · ${a.releases} ${t.releasesShort}` }))}
          />
        </Section>
      )}

      {d.top100.length > 0 && (
        <Section title={t.top100} copy={copy.top100}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {d.top100.map((a) => (
              <div key={a.name} className="border-[3px] border-[var(--ink)] bg-[var(--paper)]">
                <div className="relative">
                  <CardThumbnail src={a.image_url} alt={a.name} aspectClass="aspect-square" sizes="(max-width: 640px) 50vw, 190px" />
                  <span className="absolute top-2 left-2 bg-[var(--red)] text-white border-[2px] border-[var(--ink)] px-2 text-[14px] font-black" style={display}>#{a.rank}</span>
                </div>
                <div className="p-2">
                  <div className="text-[13px] font-black uppercase truncate" style={display}>
                    <NameLink name={a.name} slug={a.slug} base="artists" lang={lang} />
                  </div>
                  <div className="flex gap-1 mt-2">
                    {a.tracks.slice(0, 3).map((tr, i) => {
                      const img = <div className="w-10"><Cover src={tr.artwork_url} alt={tr.title} sizes="40px" /></div>
                      if (tr.audio_src) {
                        return (
                          <span key={i} id={spotId('top', tr)} className="relative block" title={trackName(tr)}>
                            {img}
                            <PlayButton track={tr} spot="top" className="absolute inset-0 !border-0 !bg-black/40 hover:!bg-[var(--red)] !text-white text-[13px]" />
                          </span>
                        )
                      }
                      return <span key={i} title={trackName(tr)}>{img}</span>
                    })}
                  </div>
                  <div className="text-[11px] text-[var(--dim)] mt-1 line-clamp-2" style={mono}>
                    {a.tracks.map((tr) => tr.title).filter((v, i, arr) => arr.indexOf(v) === i).join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Cta text={t.top100Cta} label={t.top100Btn} href={`/${lang}/topalltimes`} />
        </Section>
      )}

      {d.labels.length > 0 && (
        <Section title={t.labelsTitle} copy={copy.labels}>
          <Bars base="labels" lang={lang} rows={d.labels.map((l) => ({ ...l, value: l.tracks, note: `${l.tracks} ${t.tracksShort}` }))} />
        </Section>
      )}

      {d.sound.bands.length > 0 && (
        <Section title={t.sound} copy={copy.sound}>
          <div className="grid sm:grid-cols-[180px_1fr] gap-4">
            <div className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] p-3 flex flex-col justify-center">
              <div className="text-[44px] leading-none font-black" style={display}>{d.sound.avg_bpm != null ? Math.round(d.sound.avg_bpm) : '—'}</div>
              <div className="text-[11px] tracking-[2px] mt-1" style={mono}>{t.avgBpm}</div>
              {d.sound.prev_avg_bpm != null && (
                <div className="text-[11px] mt-1" style={mono}>{t.prev}: {Math.round(d.sound.prev_avg_bpm)}</div>
              )}
            </div>
            <div className="border-[3px] border-[var(--ink)] bg-[var(--paper)] p-3">
              <div className="flex items-end gap-1 h-36">
                {d.sound.bands.map((b) => (
                  <div key={b.band} className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-[10px]" style={mono}>{b.count}</span>
                    <div className="w-full bg-[var(--red)] border-[2px] border-[var(--ink)]" style={{ height: `${Math.max(4, (b.count / bandMax) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mt-1">
                {d.sound.bands.map((b) => (
                  <span key={b.band} className="flex-1 text-center text-[9px] sm:text-[10px]" style={mono}>{b.band}</span>
                ))}
              </div>
            </div>
          </div>
          {d.sound.keys.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-[11px] tracking-[2px]" style={mono}>{t.keys}</span>
              {d.sound.keys.map((k) => (
                <span key={k.key} className="cutout fill">{k.key} · {k.count}</span>
              ))}
            </div>
          )}
        </Section>
      )}

      {d.debut.length > 0 && (
        <Section title={`${t.debut} (${d.debut_total})`} copy={copy.debut}>
          <div className="flex flex-wrap gap-1.5 items-center">
            {d.debut.map((a) =>
              a.slug ? (
                <Link
                  key={a.name}
                  href={`/${lang}/artists/${a.slug}`}
                  className="cutout fill !m-0 !text-[11px] border-2 border-[var(--ink)] no-underline hover:!bg-[var(--red)] hover:!text-white"
                >
                  {a.name}
                </Link>
              ) : (
                <span key={a.name} className="cutout outline !m-0 !text-[11px] bg-[var(--paper)] text-[var(--ink)]">
                  {a.name}
                </span>
              ),
            )}
            {d.debut_total > d.debut.length && (
              <span className="text-[12px] text-[var(--dim)] self-center" style={mono}>{t.debutMore(d.debut_total - d.debut.length)}</span>
            )}
          </div>
          <Cta text={t.debutCta} label={t.debutBtn} href={accountHref('/mi-cuenta/artista')} />
        </Section>
      )}

    </div>
    </PlayCtx.Provider>
  )
}
