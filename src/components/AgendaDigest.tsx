// ============================================
// OPTIMAL BREAKS — Artículo de agenda (próximos 14 días)
// El texto sale del digest. Las citas se leen en vivo.
// ============================================

import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import type { AgendaNight } from '@/lib/agenda-nights'
import type { AgendaDigest as AgendaDigestData } from '@/types/database'
import type { Locale } from '@/lib/i18n-config'

const display = { fontFamily: "'Unbounded', sans-serif", fontWeight: 900 } as const
const mono = { fontFamily: "'Courier Prime', monospace" } as const

function shortDate(iso: string, lang: Locale) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function longDay(iso: string, lang: Locale) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

function uniqueCount(values: string[]) {
  const seen = new Set<string>()
  for (const v of values) {
    const k = v.trim().toLowerCase()
    if (k) seen.add(k)
  }
  return seen.size
}

export default function AgendaDigest({
  digest,
  nights,
  lang,
}: {
  digest: AgendaDigestData
  nights: AgendaNight[]
  lang: Locale
}) {
  const es = lang === 'es'
  const copy = es ? digest.copy.es : digest.copy.en
  const posters = nights.map((n) => n.image).filter((u): u is string => !!u).slice(0, 4)
  const cities = uniqueCount(nights.map((n) => n.city))
  const countries = uniqueCount(nights.map((n) => n.country))
  const stats: [string, number][] = [
    [es ? 'CITAS' : 'NIGHTS', nights.length],
    [es ? 'CIUDADES' : 'CITIES', cities],
    [es ? 'PAÍSES' : 'COUNTRIES', countries],
  ]
  const groups: { date: string; items: AgendaNight[] }[] = []
  for (const night of nights) {
    const last = groups[groups.length - 1]
    if (!last || last.date !== night.date) groups.push({ date: night.date, items: [night] })
    else last.items.push(night)
  }

  return (
    <div>
      {posters.length > 0 ? (
        <div className="relative -mx-4 sm:mx-0 border-y-[3px] sm:border-[3px] border-[var(--ink)]">
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${posters.length}, minmax(0, 1fr))` }}
          >
            {posters.map((src) => (
              <CardThumbnail
                key={src}
                src={src}
                alt=""
                aspectClass="aspect-[3/4]"
                fit="contain"
                frameClass="border-0 bg-[var(--paper-dark)]"
                sizes="(max-width: 640px) 25vw, 200px"
              />
            ))}
          </div>
          <div
            className="absolute left-3 bottom-3 bg-[var(--yellow)] border-[3px] border-[var(--ink)] px-3 py-1 text-[13px] sm:text-[15px] font-black"
            style={display}
          >
            {shortDate(digest.from, lang)} — {shortDate(digest.until, lang)}
          </div>
        </div>
      ) : (
        <div className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-3 py-2 text-[15px] font-black inline-block" style={display}>
          {shortDate(digest.from, lang)} — {shortDate(digest.until, lang)}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-4">
        {stats.map(([label, value]) => (
          <div key={label} className="border-[3px] border-[var(--ink)] bg-[var(--paper)] p-3">
            <div className="text-[30px] sm:text-[36px] leading-none font-black" style={display}>{value}</div>
            <div className="text-[11px] tracking-[2px] mt-1" style={mono}>{label}</div>
          </div>
        ))}
      </div>

      {copy.intro ? (
        <p className="mt-6 text-[17px] leading-[1.8]" style={{ fontFamily: "'Special Elite', monospace" }}>{copy.intro}</p>
      ) : null}
      {copy.nights ? (
        <p className="mt-3 text-[15px] leading-[1.7]" style={{ fontFamily: "'Special Elite', monospace" }}>{copy.nights}</p>
      ) : null}

      {nights.length === 0 ? (
        <p className="mt-8 text-[15px]" style={mono}>
          {es ? 'Esta quincena la agenda está vacía.' : 'The agenda is empty this fortnight.'}
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((g) => (
            <section key={g.date}>
              <h2 className="text-[13px] tracking-[2px] uppercase mb-3" style={mono}>
                {longDay(g.date, lang)}
              </h2>
              <div className="space-y-3">
                {g.items.map((n) => {
                  const who = n.lineup.slice(0, 8)
                  const more = n.lineup.length - who.length
                  return (
                    <Link
                      key={n.slug}
                      href={`/${lang}/events/${n.slug}`}
                      className="flex gap-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] p-3 no-underline text-inherit shadow-[4px_4px_0_var(--ink)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_var(--ink)] transition-transform"
                    >
                      <div className="w-[88px] sm:w-[104px] shrink-0">
                        <CardThumbnail
                          src={n.image}
                          alt=""
                          aspectClass="aspect-[3/4]"
                          fit="contain"
                          frameClass="border-[3px] border-[var(--ink)] bg-[var(--paper-dark)]"
                          sizes="104px"
                        />
                      </div>
                      <div className="min-w-0">
                        {n.postponed ? (
                          <span className="inline-block mb-1 bg-[var(--yellow)] border-2 border-[var(--ink)] px-1.5 py-0.5 text-[10px] tracking-wider" style={mono}>
                            {es ? 'APLAZADO' : 'POSTPONED'}
                          </span>
                        ) : null}
                        <div className="text-[18px] sm:text-[22px] leading-none uppercase" style={display}>{n.name}</div>
                        {n.place ? (
                          <p className="mt-1 text-[12px] tracking-wide" style={mono}>{n.place}</p>
                        ) : null}
                        {who.length > 0 ? (
                          <p className="mt-2 text-[13px] leading-snug" style={{ fontFamily: "'Special Elite', monospace" }}>
                            {who.join(', ')}
                            {more > 0 ? (es ? ` y ${more} más` : ` and ${more} more`) : ''}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-8 border-4 border-[var(--ink)] bg-[var(--yellow)] p-5 sm:p-6 shadow-[6px_6px_0_var(--ink)]">
        <p className="text-[22px] sm:text-[28px] leading-none uppercase" style={display}>
          {es ? '¿Te los vas a perder?' : "You're gonna miss them"}
        </p>
        <p className="text-[14px] leading-snug mt-2 mb-4" style={mono}>
          {es ? 'El resto de la agenda, con cartel y ficha, está en Eventos.' : 'The rest of the agenda, poster and page, is on Events.'}
        </p>
        <Link
          href={`/${lang}/events`}
          className="inline-block bg-[var(--red)] text-white border-4 border-[var(--ink)] px-5 py-3 text-[15px] tracking-wider shadow-[4px_4px_0_var(--ink)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_var(--ink)] transition-transform"
          style={{ ...mono, fontWeight: 700 }}
        >
          {es ? 'VER TODA LA AGENDA' : 'SEE THE FULL AGENDA'}
        </Link>
      </div>
    </div>
  )
}
