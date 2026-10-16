// ============================================
// OPTIMAL BREAKS — Artículo quincenal del blog
// ----------------------------------------------
// Pinta `blog_posts.digest` (scripts/generar-blog-agente.mjs --quincena):
// mosaico de carátulas, cifras, rankings con carátula y barras, histograma
// de BPM, debutantes, sesiones y adelantos. Los textos son cortos y vienen
// en el propio digest; la estructura la pone este componente.
// ============================================

import Link from 'next/link'
import type { ReactNode } from 'react'
import CardThumbnail from '@/components/CardThumbnail'
import { buildTrackSharePath } from '@/lib/share-track'
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
    top100: 'Estrellas del Top 100 con temas nuevos',
    played: 'Lo más escuchado',
    plays: 'escuchas',
    voted: 'Lo más votado',
    votes: 'votos',
    votesFoot: (v: number, u: number) => `${v} votos de ${u} usuarios en la quincena, con las mismas reglas que el Top 100.`,
    artistsTitle: 'Quién más ha publicado',
    tracksShort: 'temas',
    releasesShort: 'discos',
    labelsTitle: 'Sellos de la quincena',
    sound: 'Radiografía sonora',
    avgBpm: 'BPM MEDIO',
    keys: 'TONALIDADES',
    debut: 'Debutantes',
    debutMore: (n: number) => `y ${n} más`,
    exclusive: 'EXCLUSIVA — ESCÚCHALO ENTERO GRATIS',
    sessions: 'Sesiones',
    mp3: 'MP3 GRATIS',
    upcoming: 'Lo que se viene',
    out: 'SALE',
    upcomingFoot: (n: number) => `${n} adelantos ya están en /charts.`,
  },
  en: {
    fortnight: 'FORTNIGHT',
    tracks: 'TRACKS',
    artists: 'ARTISTS',
    labels: 'LABELS',
    releases: 'RELEASES',
    prev: 'previous fortnight',
    top100: 'Top 100 stars with new music',
    played: 'Most played',
    plays: 'plays',
    voted: 'Most voted',
    votes: 'votes',
    votesFoot: (v: number, u: number) => `${v} votes from ${u} users this fortnight, same rules as the Top 100.`,
    artistsTitle: 'Who released the most',
    tracksShort: 'tracks',
    releasesShort: 'releases',
    labelsTitle: 'Labels of the fortnight',
    sound: 'Sound check',
    avgBpm: 'AVERAGE BPM',
    keys: 'KEYS',
    debut: 'Debut artists',
    debutMore: (n: number) => `and ${n} more`,
    exclusive: 'EXCLUSIVE — FULL TRACK, FREE',
    sessions: 'Sessions',
    mp3: 'FREE MP3',
    upcoming: 'Coming up',
    out: 'OUT',
    upcomingFoot: (n: number) => `${n} upcoming releases are already on /charts.`,
  },
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

function trackHref(t: FortnightDigestTrack, lang: Locale): string | null {
  if (t.featured_id) return buildTrackSharePath(lang, 'featured', t.featured_id, t.week_date)
  return t.external_url
}

function trackName(t: FortnightDigestTrack): string {
  return t.mix_name && !/^original mix$/i.test(t.mix_name) ? `${t.title} (${t.mix_name})` : t.title
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
      <h2>{title}</h2>
      {copy ? <p className="text-[16px] leading-[1.8] mb-5" style={{ fontFamily: "'Special Elite', monospace" }}>{copy}</p> : null}
      {children}
    </section>
  )
}

function Cover({ src, alt, sizes = '64px' }: { src: string | null; alt: string; sizes?: string }) {
  return <CardThumbnail src={src} alt={alt} aspectClass="aspect-square" frameClass="border-[2px] border-[var(--ink)]" sizes={sizes} />
}

function RankedTracks({ tracks, unit, lang }: { tracks: FortnightDigestTrack[]; unit: string; lang: Locale }) {
  const max = Math.max(1, ...tracks.map((t) => t.value))
  return (
    <ol className="list-none !p-0 space-y-2">
      {tracks.map((t, i) => {
        const href = trackHref(t, lang)
        const body = (
          <div className="flex items-center gap-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] p-2 hover:bg-[#f7e733]/30 transition-colors">
            <span className="w-8 shrink-0 text-center text-[22px] font-black" style={display}>{i + 1}</span>
            <div className="w-14 shrink-0"><Cover src={t.artwork_url} alt={`${t.artists} — ${t.title}`} sizes="56px" /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-bold uppercase" style={display}>{trackName(t)}</div>
              <div className="truncate text-[12px] text-[var(--dim)]" style={mono}>{t.artists}{t.label ? ` · ${t.label}` : ''}</div>
              <div className="mt-1 h-2 bg-[var(--ink)]/10">
                <div className="h-2 bg-[var(--red)]" style={{ width: `${Math.max(6, (t.value / max) * 100)}%` }} />
              </div>
            </div>
            <span className="shrink-0 text-right text-[12px]" style={mono}>
              <b className="block text-[18px]" style={display}>{t.value}</b>{unit}
            </span>
          </div>
        )
        return (
          <li key={`${t.title}-${i}`} className="!m-0">
            {href ? <Link href={href} className="!no-underline !text-[var(--ink)]">{body}</Link> : body}
          </li>
        )
      })}
    </ol>
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

export default function FortnightDigest({ digest: d, lang }: { digest: Digest; lang: Locale }) {
  const t = T[lang]
  const copy = d.copy[lang]
  const delta = d.totals.tracks - d.totals.prev_tracks
  const stats: [string, number, string?][] = [
    [t.tracks, d.totals.tracks, `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} · ${t.prev}`],
    [t.artists, d.totals.artists],
    [t.labels, d.totals.labels],
    [t.releases, d.totals.releases],
  ]
  const bandMax = Math.max(1, ...d.sound.bands.map((b) => b.count))

  return (
    <div className="prose-ob">
      {/* Portada: mosaico de carátulas + cifras */}
      <div className="relative -mx-4 sm:mx-0 border-y-[3px] sm:border-[3px] border-[var(--ink)]">
        <div className="grid grid-cols-4 sm:grid-cols-6">
          {d.covers.slice(0, 12).map((src, i) => (
            <CardThumbnail key={`${src}-${i}`} src={src} alt="" aspectClass="aspect-square" frameClass="border-0" sizes="(max-width: 640px) 25vw, 134px" preload={i < 6} />
          ))}
        </div>
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
        <p className="mt-6 text-[17px] leading-[1.8]" style={{ fontFamily: "'Special Elite', monospace" }}>{copy.intro}</p>
      ) : null}

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
                      const href = trackHref(tr, lang)
                      const img = <div className="w-10"><Cover src={tr.artwork_url} alt={tr.title} sizes="40px" /></div>
                      return href ? <Link key={i} href={href} title={trackName(tr)}>{img}</Link> : <span key={i}>{img}</span>
                    })}
                  </div>
                  <div className="text-[11px] text-[var(--dim)] mt-1 line-clamp-2" style={mono}>
                    {a.tracks.map((tr) => tr.title).filter((v, i, arr) => arr.indexOf(v) === i).join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {d.played.length > 0 && (
        <Section title={t.played} copy={copy.played}>
          <RankedTracks tracks={d.played} unit={t.plays} lang={lang} />
        </Section>
      )}

      {d.voted.length > 0 && (
        <Section title={t.voted} copy={copy.voted}>
          <RankedTracks tracks={d.voted} unit={t.votes} lang={lang} />
          <p className="text-[12px] text-[var(--dim)] mt-2" style={mono}>{t.votesFoot(d.votes_total, d.voters_total)}</p>
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

      {d.labels.length > 0 && (
        <Section title={t.labelsTitle} copy={copy.labels}>
          <Bars base="labels" lang={lang} rows={d.labels.map((l) => ({ ...l, value: l.tracks, note: `${l.tracks} ${t.tracksShort}` }))} />
        </Section>
      )}

      {d.sound.bands.length > 0 && (
        <Section title={t.sound} copy={copy.sound}>
          <div className="grid sm:grid-cols-[180px_1fr] gap-4">
            <div className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] p-3 flex flex-col justify-center">
              <div className="text-[44px] leading-none font-black" style={display}>{d.sound.avg_bpm ?? '—'}</div>
              <div className="text-[11px] tracking-[2px] mt-1" style={mono}>{t.avgBpm}</div>
              {d.sound.prev_avg_bpm != null && (
                <div className="text-[11px] mt-1" style={mono}>{t.prev}: {d.sound.prev_avg_bpm}</div>
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
          <div className="flex flex-wrap gap-2">
            {d.debut.map((a) => (
              <span key={a.name} className="cutout">
                <NameLink name={a.name} slug={a.slug} base="artists" lang={lang} />
              </span>
            ))}
            {d.debut_total > d.debut.length && (
              <span className="text-[12px] text-[var(--dim)] self-center" style={mono}>{t.debutMore(d.debut_total - d.debut.length)}</span>
            )}
          </div>
        </Section>
      )}

      {(d.sessions.length > 0 || d.exclusives.length > 0) && (
        <Section title={t.sessions} copy={copy.sessions}>
          {d.exclusives.map((x) => {
            const href = trackHref(x, lang)
            const card = (
              <div className="flex items-center gap-3 border-[3px] border-[var(--ink)] bg-[#f7e733]/40 p-2 mb-3">
                <div className="w-20 shrink-0"><Cover src={x.artwork_url} alt={x.title} sizes="80px" /></div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black text-[var(--red)]" style={display}>{t.exclusive}</div>
                  <div className="text-[15px] font-black uppercase truncate" style={display}>{trackName(x)}</div>
                  <div className="text-[12px]" style={mono}>{x.artists}{x.label ? ` · ${x.label}` : ''}</div>
                </div>
              </div>
            )
            return href ? <Link key={x.title} href={href} className="!no-underline !text-[var(--ink)]">{card}</Link> : <div key={x.title}>{card}</div>
          })}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {d.sessions.map((s) => (
              <Link key={s.slug} href={`/${lang}/mixes/${s.slug}`} className="!no-underline !text-[var(--ink)] border-[3px] border-[var(--ink)] bg-[var(--paper)] block">
                <div className="relative">
                  <CardThumbnail src={s.image_url} alt={s.title} aspectClass="aspect-video" sizes="(max-width: 640px) 50vw, 190px" />
                  {s.download && (
                    <span className="absolute top-1 right-1 bg-[var(--red)] text-white px-1 text-[10px] font-black border-[2px] border-[var(--ink)]" style={display}>⬇ {t.mp3}</span>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-[12px] font-black uppercase line-clamp-2" style={display}>{s.artist}</div>
                  <div className="text-[11px] text-[var(--dim)] line-clamp-2" style={mono}>{s.title}</div>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {d.upcoming.length > 0 && (
        <Section title={t.upcoming} copy={copy.upcoming}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {d.upcoming.map((u, i) => {
              const href = trackHref(u, lang)
              const card = (
                <div className="border-[3px] border-[var(--ink)] bg-[var(--paper)]">
                  <div className="relative">
                    <CardThumbnail src={u.artwork_url} alt={u.title} aspectClass="aspect-square" sizes="(max-width: 640px) 50vw, 190px" />
                    <span className="absolute bottom-1 left-1 bg-[var(--yellow)] border-[2px] border-[var(--ink)] px-1 text-[11px] font-black" style={display}>
                      {t.out} {shortDate(u.release_date, lang)}
                    </span>
                  </div>
                  <div className="p-2">
                    <div className="text-[12px] font-black uppercase truncate" style={display}>{trackName(u)}</div>
                    <div className="text-[11px] text-[var(--dim)] truncate" style={mono}>{u.artists}</div>
                  </div>
                </div>
              )
              return href ? <Link key={i} href={href} className="!no-underline !text-[var(--ink)]">{card}</Link> : <div key={i}>{card}</div>
            })}
          </div>
          <p className="text-[12px] text-[var(--dim)] mt-2" style={mono}>{t.upcomingFoot(d.upcoming_total)}</p>
        </Section>
      )}
    </div>
  )
}
