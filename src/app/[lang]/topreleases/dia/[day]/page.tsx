// ============================================
// OPTIMAL BREAKS — Artículo del día
// La lista de temas de esa fecha vive aquí, no en el índice de novedades.
// Las flechas y el calendario cambian el día. Arriba, las que Optimal Breaks
// ha guardado con «+». Debajo, el resto.
// ============================================

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { DayReleaseDate, DigestTrackStrip } from '@/components/FortnightDigest'
import {
  DAY_COPY,
  clampReleaseDay,
  dayReleaseBlurb,
  loadDayReleases,
  longReleaseDay,
  MIN_RELEASE_DAY,
  shiftReleaseDay,
} from '@/lib/fortnight-live'
import type { Locale } from '@/lib/i18n-config'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import { createCachedSupabase } from '@/lib/supabase-server'
import type { FortnightDigestTrack } from '@/types/database'

export const dynamic = 'force-dynamic'

function todayMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function trackLine(t: FortnightDigestTrack): string {
  const mix = t.mix_name && !/^original mix$/i.test(t.mix_name) ? ` (${t.mix_name})` : ''
  return `${t.artists} — ${t.title}${mix}`
}

function joinList(items: string[], lang: Locale): string {
  if (items.length <= 1) return items[0] || ''
  const last = items[items.length - 1]
  return `${items.slice(0, -1).join(', ')} ${lang === 'es' ? 'y' : 'and'} ${last}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale; day: string }>
}): Promise<Metadata> {
  const { lang, day } = await params
  const copy = DAY_COPY[lang === 'en' ? 'en' : 'es']
  const when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? longReleaseDay(day, lang === 'en' ? 'en' : 'es') : day
  return { title: `${copy.title} · ${when}` }
}

export default async function DayReleaseArticlePage({
  params,
}: {
  params: Promise<{ lang: Locale; day: string }>
}) {
  const { lang, day: raw } = await params
  const today = todayMadrid()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) notFound()
  if (raw > today) redirect(`/${lang}/topreleases/dia/${today}`)
  if (raw < MIN_RELEASE_DAY) notFound()
  const day = clampReleaseDay(raw, today)
  const copy = DAY_COPY[lang]
  const supabase = createCachedSupabase(300, [PUBLIC_CATALOG_CACHE_TAG])
  const { picks, rest } = await loadDayReleases(supabase, day)
  const prev = shiftReleaseDay(day, -1)
  const next = shiftReleaseDay(day, 1)
  const back = `/${lang}/topreleases`
  const named = picks.slice(0, 4).map(trackLine)
  const extra = picks.length - named.length
  const pickSentence = extra > 0
    ? `${named.join(', ')}${lang === 'es' ? ` y ${extra} más` : ` and ${extra} more`}`
    : joinList(named, lang)
  const mono = { fontFamily: "'Courier Prime', monospace" } as const
  const display = { fontFamily: "'Unbounded', sans-serif" } as const
  const arrowClass = 'inline-flex h-10 w-10 items-center justify-center border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] text-lg font-black no-underline hover:bg-[var(--red)] hover:text-white'

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        <Link href={back} className="inline-flex mb-4 text-[12px] font-black tracking-wider text-[var(--ink)] no-underline hover:text-[var(--red)]" style={mono}>
          {copy.back}
        </Link>
        <article>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {day === today ? (
              <span className="px-1.5 py-0.5 text-[10px] font-black tracking-[2px] bg-[var(--red)] text-white" style={mono}>
                {copy.today}
              </span>
            ) : null}
            <span className="text-[12px] font-bold uppercase" style={mono}>{longReleaseDay(day, lang)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {prev >= MIN_RELEASE_DAY ? (
              <Link href={`/${lang}/topreleases/dia/${prev}`} aria-label={copy.prev} className={arrowClass} style={mono}>←</Link>
            ) : (
              <span className={`${arrowClass} opacity-30 pointer-events-none`} aria-hidden>←</span>
            )}
            <DayReleaseDate
              lang={lang}
              day={day}
              today={today}
              label={copy.pick}
              articlePath={`/${lang}/topreleases/dia`}
            />
            {day < today ? (
              <Link href={`/${lang}/topreleases/dia/${next}`} aria-label={copy.next} className={arrowClass} style={mono}>→</Link>
            ) : (
              <span className={`${arrowClass} opacity-30 pointer-events-none`} aria-hidden>→</span>
            )}
          </div>
          <h1 className="text-3xl sm:text-5xl font-black leading-[0.95] mb-3" style={display}>{copy.title}</h1>
          <p className="text-[16px] leading-relaxed mb-2" style={{ fontFamily: "'Special Elite', monospace" }}>
            {dayReleaseBlurb(lang, picks.length, rest.length)}
          </p>
          {named.length > 0 ? (
            <p className="text-[15px] leading-relaxed text-[var(--ink)]/80 mb-6" style={{ fontFamily: "'Special Elite', monospace" }}>
              {pickSentence}.
            </p>
          ) : null}

          {picks.length > 0 ? (
            <section className="mt-8 border-[3px] border-[var(--ink)] bg-[var(--yellow)]/40 p-3 sm:p-4">
              <h2 className="text-xl sm:text-2xl font-black leading-tight mb-3" style={display}>{copy.picksTitle}</h2>
              <DigestTrackStrip
                tracks={picks}
                spot={`picks-${day}`}
                groupKey={`topreleases:day-picks:${day}`}
                units={['', '']}
                show={picks.length}
                playAll={copy.playPicks}
                large
                plain
              />
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl sm:text-2xl font-black leading-tight mb-3" style={display}>{copy.restTitle}</h2>
              <DigestTrackStrip
                tracks={rest}
                spot={`rest-${day}`}
                groupKey={`topreleases:day-rest:${day}`}
                units={['', '']}
                show={rest.length}
                playAll={copy.playRest}
                large
                plain
              />
            </section>
          ) : null}
        </article>
      </div>
    </main>
  )
}
