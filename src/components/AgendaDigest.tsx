// ============================================
// OPTIMAL BREAKS — Artículo de agenda (próximos 14 días)
// El texto sale del digest. Las citas, los artistas del Top 100 de cada
// cartel y el mapa por provincias se calculan en vivo.
// ============================================

import Link from 'next/link'
import type { ReactNode } from 'react'
import CardThumbnail from '@/components/CardThumbnail'
import type { AgendaNight, AgendaStar } from '@/lib/agenda-nights'
import { buildAgendaMap, CANARY_PROVINCES, normalizePlace, PROVINCE_REGION } from '@/lib/spain-map'
import type { AgendaDigest as AgendaDigestData } from '@/types/database'
import type { Locale } from '@/lib/i18n-config'

const display = { fontFamily: "'Unbounded', sans-serif", fontWeight: 900 } as const
const mono = { fontFamily: "'Courier Prime', monospace" } as const
const elite = { fontFamily: "'Special Elite', monospace" } as const

const PALE = '#fbf3a0'
const COUNTRY_ES: Record<string, string> = {
  'united kingdom': 'Reino Unido', uk: 'Reino Unido', england: 'Inglaterra', france: 'Francia',
  germany: 'Alemania', italy: 'Italia', netherlands: 'Países Bajos', belgium: 'Bélgica',
  'united states': 'Estados Unidos', usa: 'Estados Unidos', ireland: 'Irlanda', switzerland: 'Suiza',
  poland: 'Polonia', 'czech republic': 'República Checa', russia: 'Rusia', mexico: 'México',
}

function day(iso: string) {
  return new Date(`${iso}T12:00:00Z`)
}

function fmt(iso: string, lang: Locale, opts: Intl.DateTimeFormatOptions) {
  return day(iso).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { ...opts, timeZone: 'UTC' })
}

/** «SÁB 17» */
function shortDay(iso: string, lang: Locale) {
  return `${fmt(iso, lang, { weekday: 'short' }).replace('.', '').toUpperCase()} ${day(iso).getUTCDate()}`
}

/** «SÁB 17 OCT» */
function whenLine(iso: string, lang: Locale) {
  return `${shortDay(iso, lang)} ${fmt(iso, lang, { month: 'short' }).replace('.', '').toUpperCase()}`
}

function joinList(items: string[], es: boolean) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${es ? 'y' : 'and'} ${items[items.length - 1]}`
}

function countryLabel(country: string, es: boolean) {
  return es ? COUNTRY_ES[normalizePlace(country)] ?? country : country
}

function anchorId(name: string) {
  return `agenda-prov-${normalizePlace(name).replace(/\s+/g, '-') || 'otros'}`
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

function H2({ children, mark }: { children: ReactNode; mark: string }) {
  return (
    <h2 className="text-[20px] sm:text-[28px] leading-[1.1] uppercase tracking-[-0.02em] mb-1.5" style={display}>
      {children} <span className="bg-[var(--yellow)] px-1">{mark}</span>
    </h2>
  )
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-[1.6] mb-4" style={mono}>{children}</p>
}

function Face({ star }: { star: AgendaStar }) {
  return (
    <span className="relative w-[46px] h-[46px] shrink-0" title={`#${star.rank} ${star.name}`}>
      <CardThumbnail
        src={star.image}
        alt={star.name}
        aspectClass="aspect-square"
        frameClass="rounded-full border-2 border-[var(--ink)]"
        sizes="46px"
      />
      <span className="absolute -bottom-1 -right-1.5 bg-[var(--red)] text-white text-[9px] font-bold px-[3px] border border-[var(--ink)]" style={mono}>
        #{star.rank}
      </span>
    </span>
  )
}

type Group = { key: string; title: string; nights: AgendaNight[]; outside: boolean }

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
  const eventHref = (n: AgendaNight) => `/${lang}/events/${n.slug}`
  const cityShort = (n: AgendaNight) => (n.city || n.place).split(',')[0].trim()
  const range = `${fmt(digest.from, lang, { day: 'numeric', month: 'short' })} — ${fmt(digest.until, lang, { day: 'numeric', month: 'short' })}`.replace(/\./g, '').toUpperCase()

  const byScore = [...nights].sort(
    (a, b) =>
      b.stars.length - a.stars.length ||
      (a.stars[0]?.rank ?? 999) - (b.stars[0]?.rank ?? 999) ||
      a.date.localeCompare(b.date),
  )
  const posters = byScore.map((n) => n.image).filter((u): u is string => !!u).slice(0, 4)
  const musts = byScore.filter((n) => n.stars.length > 0)

  const starMap = new Map<number, { star: AgendaStar; gigs: AgendaNight[] }>()
  for (const n of nights) {
    for (const s of n.stars) {
      const hit = starMap.get(s.rank)
      if (hit) hit.gigs.push(n)
      else starMap.set(s.rank, { star: s, gigs: [n] })
    }
  }
  const starList = Array.from(starMap.values()).sort((a, b) => a.star.rank - b.star.rank)
  const repeaters = starList.filter((s) => s.gigs.length > 1).map((s) => s.star.name)

  const cityCount = new Set(nights.map((n) => normalizePlace(n.city || n.place)).filter(Boolean)).size
  const dateCount = new Set(nights.map((n) => n.date)).size
  const totalNames = nights.reduce((sum, n) => sum + n.lineup.length, 0)

  // Mapa: provincias españolas (sin Canarias) dentro; fuera, el resto.
  const groups = new Map<string, Group>()
  const push = (key: string, title: string, outside: boolean, n: AgendaNight) => {
    const g = groups.get(key)
    if (g) g.nights.push(n)
    else groups.set(key, { key, title, nights: [n], outside })
  }
  for (const n of nights) {
    if (n.abroad) push(`c:${normalizePlace(n.country)}`, countryLabel(n.country, es), true, n)
    else if (n.province && CANARY_PROVINCES.has(n.province)) push('canarias', 'Canarias', true, n)
    else if (n.province) push(n.province, n.province, false, n)
    else push('unknown', es ? 'Sin ubicar' : 'Unplaced', true, n)
  }
  const groupList = Array.from(groups.values()).sort(
    (a, b) => Number(a.outside) - Number(b.outside) || b.nights.length - a.nights.length || a.title.localeCompare(b.title, 'es'),
  )
  const inSpain = groupList.filter((g) => !g.outside)
  const outside = groupList.filter((g) => g.outside && g.key !== 'unknown')
  const abroadCountries = groupList.filter((g) => g.key.startsWith('c:')).length

  const counts = new Map(inSpain.map((g) => [g.key, g.nights.length]))
  const dotMap = new Map<string, { name: string; lat: number; lng: number }>()
  for (const g of inSpain) {
    for (const n of g.nights) {
      if (!n.coords) continue
      const name = cityShort(n)
      if (!dotMap.has(normalizePlace(name))) dotMap.set(normalizePlace(name), { name, ...n.coords })
    }
  }
  const map = buildAgendaMap(counts, Array.from(dotMap.values()))

  const stats: [number, string, string][] = [
    [nights.length, es ? 'CITAS' : 'NIGHTS', es ? `en ${plural(dateCount, 'fecha', 'fechas')}` : `on ${plural(dateCount, 'date', 'dates')}`],
    [
      cityCount,
      es ? 'CIUDADES' : 'CITIES',
      [
        inSpain.length ? (es ? plural(inSpain.length, 'provincia', 'provincias') : plural(inSpain.length, 'province', 'provinces')) : '',
        abroadCountries ? (es ? `+ ${plural(abroadCountries, 'país', 'países')}` : `+ ${plural(abroadCountries, 'country', 'countries')}`) : '',
      ].filter(Boolean).join(' '),
    ],
    [starList.length, es ? 'DEL TOP 100' : 'FROM THE TOP 100', es ? 'en el cartel' : 'on the bills'],
    [totalNames, es ? 'NOMBRES' : 'NAMES', es ? 'en los line-ups' : 'in the line-ups'],
  ]

  // Textos que salen de los números.
  const mustLead = (() => {
    if (!musts.length) return ''
    const top = musts[0]
    const base = es
      ? `Ordenadas por cuántos artistas del Top 100 pinchan en cada una. ${top.name} junta ${top.stars.length} de ${starList.length}.`
      : `Ranked by how many Top 100 artists play each one. ${top.name} brings together ${top.stars.length} of ${starList.length}.`
    const half = musts.length > 1 && top.stars.length * 2 > starList.length
    return half ? `${base} ${es ? 'Más de la mitad de las estrellas de la quincena, la misma noche.' : 'More than half of the fortnight’s stars, on one night.'}` : base
  })()

  const starsLead = (() => {
    if (!starList.length) return ''
    const base = es
      ? `${starList.length === 1 ? 'Un artista del Top 100 tiene' : `${starList.length} artistas del Top 100 tienen`} fecha en estas dos semanas.`
      : `${starList.length === 1 ? 'One Top 100 artist has' : `${starList.length} Top 100 artists have`} a date in these two weeks.`
    if (!repeaters.length) return base
    const who = joinList(repeaters, es)
    return es
      ? `${base} ${who} ${repeaters.length === 1 ? 'repite' : 'repiten'} cartel en la quincena.`
      : `${base} ${who} ${repeaters.length === 1 ? 'plays' : 'play'} more than one bill.`
  })()

  const mapLead = (() => {
    const parts: string[] = []
    const regions = new Map<string, number>()
    for (const g of inSpain) {
      const r = PROVINCE_REGION[g.key] ?? g.key
      regions.set(r, (regions.get(r) ?? 0) + g.nights.length)
    }
    const [region, inRegion] = Array.from(regions.entries()).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
    if (region && inRegion >= 2) {
      parts.push(
        inRegion === nights.length
          ? es ? `Todas las citas son en ${region}.` : `Every night is in ${region}.`
          : es ? `${inRegion} de las ${nights.length} citas son en ${region}.` : `${inRegion} of the ${nights.length} nights are in ${region}.`,
      )
    }
    const [first, second] = inSpain
    if (first && first.nights.length >= 2 && (!second || second.nights.length < first.nights.length)) {
      const pairs = inSpain.filter((g) => g !== first && g.nights.length === 2).map((g) => g.title)
      const tail = pairs.length
        ? es ? `; ${joinList(pairs, true)}, ${pairs.length > 1 ? 'dos cada una' : 'dos'}` : `; ${joinList(pairs, false)}, two ${pairs.length > 1 ? 'each' : ''}`.trimEnd()
        : ''
      parts.push(es ? `${first.title} manda con ${first.nights.length}${tail}.` : `${first.title} leads with ${first.nights.length}${tail}.`)
    }
    const elsewhere = [
      ...inSpain.filter((g) => region && (PROVINCE_REGION[g.key] ?? g.key) !== region).map((g) => g.title),
      ...outside.map((g) => `${joinList(Array.from(new Set(g.nights.map(cityShort))), es)} (${g.title})`),
    ]
    if (region && elsewhere.length) parts.push(es ? `Fuera de ${region}: ${joinList(elsewhere, true)}.` : `Outside ${region}: ${joinList(elsewhere, false)}.`)
    if (map) parts.push(es ? 'Toca una provincia para ver sus noches.' : 'Tap a province to see its nights.')
    return parts.join(' ')
  })()

  const days: string[] = []
  for (let i = 0; i < 14; i++) {
    const d = day(digest.from)
    d.setUTCDate(d.getUTCDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  const onDay = (iso: string) => nights.filter((n) => n.date <= iso && (n.dateEnd || n.date) >= iso)
  const pad = (day(digest.from).getUTCDay() + 6) % 7
  const calLead = (() => {
    if (!nights.length) return ''
    const weekdays = new Set(nights.map((n) => day(n.date).getUTCDay()))
    const busy = days
      .map((iso) => ({ iso, n: onDay(iso).length }))
      .filter((d) => d.n >= 2)
      .sort((a, b) => b.n - a.n || a.iso.localeCompare(b.iso))
      .slice(0, 2)
    const wd = fmt(nights[0].date, lang, { weekday: 'long' })
    const head = weekdays.size === 1 ? (es ? `Todo cae en ${wd}: ` : `Everything falls on a ${wd}: `) : ''
    const label = (iso: string) => (es ? `el ${day(iso).getUTCDate()}` : fmt(iso, lang, { day: 'numeric', month: 'short' }))
    let body = ''
    if (busy.length) {
      body = es
        ? `${label(busy[0].iso)} se juntan ${busy[0].n} citas a la vez${busy[1] ? ` y ${label(busy[1].iso)}, ${busy[1].n}` : ''}.`
        : `${label(busy[0].iso)} brings ${busy[0].n} nights at once${busy[1] ? ` and ${label(busy[1].iso)}, ${busy[1].n}` : ''}.`
    } else {
      body = es ? 'una cita por día como mucho.' : 'one night a day at most.'
    }
    const text = `${head}${body}`
    return text.charAt(0).toUpperCase() + text.slice(1)
  })()

  const agendaDays: { date: string; items: AgendaNight[] }[] = []
  for (const n of [...nights].sort((a, b) => a.date.localeCompare(b.date) || b.stars.length - a.stars.length)) {
    const last = agendaDays[agendaDays.length - 1]
    if (!last || last.date !== n.date) agendaDays.push({ date: n.date, items: [n] })
    else last.items.push(n)
  }

  const fillFor = (count: number) => (count >= 3 ? 'var(--red)' : count === 2 ? 'var(--yellow)' : PALE)
  const placeOfNight = (n: AgendaNight) =>
    [n.venue, n.city, n.abroad ? countryLabel(n.country, es) : ''].filter(Boolean).join(' · ') || n.place
  const shadowLink = 'hover:translate-x-[2px] hover:translate-y-[2px] transition-transform no-underline text-inherit'

  return (
    <div>
      {posters.length > 0 ? (
        <div className="relative -mx-4 sm:mx-0 border-y-[3px] sm:border-[3px] border-[var(--ink)] bg-[var(--paper-dark)]">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {posters.map((src, i) => (
              <div key={src} className={`${i >= 2 ? 'hidden sm:block' : ''} border-r-[3px] border-[var(--ink)] last:border-r-0 ${i === 1 ? 'max-sm:border-r-0' : ''}`}>
                <CardThumbnail
                  src={src}
                  alt=""
                  aspectClass="aspect-[3/4]"
                  fit="contain"
                  frameClass="border-0 bg-[var(--paper-dark)]"
                  sizes="(max-width: 640px) 50vw, 200px"
                  preload={i === 0}
                />
              </div>
            ))}
          </div>
          <div className="absolute left-3 bottom-3 bg-[var(--yellow)] border-[3px] border-[var(--ink)] px-3 py-1 text-[13px] sm:text-[15px]" style={display}>
            {range}
          </div>
        </div>
      ) : (
        <div className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-3 py-2 text-[15px] inline-block" style={display}>
          {range}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {stats.map(([value, label, note]) => (
          <div key={label} className="border-[3px] border-[var(--ink)] bg-[var(--paper)] p-3">
            <div className="text-[30px] sm:text-[34px] leading-none" style={display}>{value}</div>
            <div className="text-[11px] tracking-[2px] mt-1" style={mono}>{label}</div>
            {note ? <div className="text-[10px] mt-1 opacity-70" style={mono}>{note}</div> : null}
          </div>
        ))}
      </div>

      {copy.intro ? <p className="mt-6 text-[17px] leading-[1.8]" style={elite}>{copy.intro}</p> : null}

      {nights.length === 0 ? (
        <p className="mt-8 text-[15px]" style={mono}>
          {es ? 'Esta quincena la agenda está vacía.' : 'The agenda is empty this fortnight.'}
        </p>
      ) : null}

      {musts.length > 0 ? (
        <section className="mt-12">
          <H2 mark={es ? 'no te puedes perder' : "you can't miss"}>{es ? 'Las que' : 'The ones'}</H2>
          <Lead>
            {mustLead.split('Top 100').map((chunk, i, arr) => (
              <span key={i}>
                {chunk}
                {i < arr.length - 1 ? (
                  <Link href={`/${lang}/top100`} className="underline">Top 100</Link>
                ) : null}
              </span>
            ))}
          </Lead>
          {musts.slice(0, 3).map((n, i) => {
            const rest = Math.max(0, n.lineup.length - n.stars.length)
            return (
              <Link
                key={n.slug}
                href={eventHref(n)}
                className={`relative grid grid-cols-[96px_1fr] sm:grid-cols-[150px_1fr] gap-4 border-4 border-[var(--ink)] p-3.5 mb-5 shadow-[6px_6px_0_var(--ink)] ${i === 0 ? 'bg-[var(--yellow)]' : 'bg-[var(--paper)]'} ${shadowLink}`}
              >
                <span className="absolute -top-3.5 -left-2.5 bg-[var(--red)] text-white text-[18px] px-2.5 py-0.5 border-[3px] border-[var(--ink)]" style={display}>
                  #{i + 1}
                </span>
                <CardThumbnail
                  src={n.image}
                  alt=""
                  aspectClass="aspect-[3/4]"
                  fit="contain"
                  frameClass="border-[3px] border-[var(--ink)] bg-[var(--paper-dark)]"
                  sizes="150px"
                />
                <div className="min-w-0">
                  <div className="text-[12px] tracking-[1px] uppercase" style={mono}>
                    {whenLine(n.date, lang)} · {n.city || n.place}
                    {n.abroad ? ` · ${countryLabel(n.country, es)}` : ''}
                  </div>
                  <div className="text-[18px] sm:text-[24px] leading-[1.05] uppercase mt-1 mb-1.5" style={display}>{n.name}</div>
                  {n.venue ? <div className="text-[12px]" style={mono}>{n.venue}</div> : null}
                  <div className="text-[13px] my-2" style={mono}>
                    <b className="bg-[var(--ink)] text-[var(--yellow)] px-1.5">{n.stars.length}</b>{' '}
                    {es
                      ? `${n.stars.length === 1 ? 'estrella' : 'estrellas'} del Top 100`
                      : `${n.stars.length === 1 ? 'star' : 'stars'} from the Top 100`}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {n.stars.map((s) => <Face key={s.rank} star={s} />)}
                  </div>
                  <div className="text-[12px] mt-2 opacity-75" style={mono}>
                    {n.stars.map((s) => s.name).join(', ')}
                    {rest > 0 ? (es ? ` y ${rest} más en el cartel` : ` and ${rest} more on the bill`) : ''}
                  </div>
                </div>
              </Link>
            )
          })}
          <div className="mt-2">
            {musts.map((n) => (
              <div key={n.slug} className="grid grid-cols-[minmax(0,1fr)_34px] gap-2 items-center my-1.5 text-[13px]" style={mono}>
                <div className="relative border-2 border-[var(--ink)] bg-[var(--paper)] h-7 overflow-hidden">
                  <i
                    className="absolute inset-y-0 left-0 bg-[var(--yellow)] border-r-2 border-[var(--ink)]"
                    style={{ width: `${(n.stars.length / musts[0].stars.length) * 100}%` }}
                  />
                  <span className="relative block px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis">
                    {n.name} · {cityShort(n)}
                  </span>
                </div>
                <b className="text-[18px] text-right" style={display}>{n.stars.length}</b>
              </div>
            ))}
          </div>
          {nights.length > musts.length ? (
            <p className="text-[11px] mt-2 opacity-70" style={mono}>
              {es
                ? `Estrellas del Top 100 de artistas en cada cartel. ${nights.length - musts.length === 1 ? 'La otra cita no tiene' : `Las otras ${nights.length - musts.length} citas no tienen`} ninguna: no salen aquí, pero están abajo en la agenda.`
                : `Top 100 artists on each bill. ${nights.length - musts.length === 1 ? 'The other night has' : `The other ${nights.length - musts.length} nights have`} none: they're not here, but they're in the agenda below.`}
            </p>
          ) : null}
          <div className="border-[3px] border-dashed border-[var(--ink)] px-3.5 py-3 mt-5 flex justify-between gap-3 items-center flex-wrap text-[13px]" style={mono}>
            <span>{es ? 'El cartel completo de cada noche, con horarios y entradas.' : 'The full bill of every night, with times and tickets.'}</span>
            <Link href={`/${lang}/events`} className="bg-[var(--ink)] text-[var(--yellow)] px-3 py-2 font-bold tracking-[1px] no-underline">
              {es ? 'VER EVENTOS →' : 'SEE EVENTS →'}
            </Link>
          </div>
        </section>
      ) : null}

      {starList.length > 0 ? (
        <section className="mt-12">
          <H2 mark={es ? 'las estrellas' : 'the stars play'}>{es ? 'Dónde pinchan' : 'Where'}</H2>
          <Lead>{starsLead}</Lead>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
            {starList.map(({ star, gigs }) => {
              const body = (
                <>
                  <div className="relative">
                    <CardThumbnail
                      src={star.image}
                      alt={star.name}
                      aspectClass="aspect-square"
                      frameClass="border-b-[3px] border-[var(--ink)]"
                      sizes="160px"
                    />
                    <span className="absolute top-1.5 left-1.5 bg-[var(--yellow)] border-2 border-[var(--ink)] text-[13px] px-1.5" style={display}>
                      #{star.rank}
                    </span>
                    {gigs.length > 1 ? (
                      <span className="absolute top-1.5 right-1.5 bg-[var(--red)] text-white border-2 border-[var(--ink)] text-[10px] font-bold px-1" style={mono}>
                        ×{gigs.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[13px] px-2 pt-1.5 uppercase leading-[1.1]" style={display}>{star.name}</div>
                  <div className="text-[11px] px-2 pt-0.5 pb-2 leading-[1.35]" style={mono}>
                    {gigs.map((g) => (
                      <div key={g.slug}>{shortDay(g.date, lang)} · {cityShort(g)}</div>
                    ))}
                  </div>
                </>
              )
              return star.slug ? (
                <Link key={star.rank} href={`/${lang}/artists/${star.slug}`} className={`block border-[3px] border-[var(--ink)] bg-[var(--paper)] ${shadowLink}`}>
                  {body}
                </Link>
              ) : (
                <div key={star.rank} className="border-[3px] border-[var(--ink)] bg-[var(--paper)]">{body}</div>
              )
            })}
          </div>
        </section>
      ) : null}

      {groupList.length > 0 ? (
        <section className="mt-12">
          <H2 mark={es ? 'por provincias' : 'by province'}>{es ? 'El mapa' : 'The map'}</H2>
          {mapLead ? <Lead>{mapLead}</Lead> : null}
          {map ? (
            <div className="relative border-[3px] border-[var(--ink)] bg-[var(--paper-dark)]">
              <svg
                viewBox={`0 0 ${map.width} ${map.height}`}
                className="block w-full h-auto"
                role="img"
                aria-label={es ? 'Mapa de las citas por provincia' : 'Map of the nights by province'}
              >
                <rect width={map.width} height={map.height} fill="#c9dbd8" />
                {map.portugal ? (
                  <path d={map.portugal} style={{ fill: '#e3dccb', stroke: '#e3dccb', strokeWidth: 34, strokeLinejoin: 'round' }} />
                ) : null}
                {map.portugalLabel ? (
                  <text
                    x={map.portugalLabel.x}
                    y={map.portugalLabel.y}
                    textAnchor="middle"
                    transform={map.portugalLabel.vertical ? `rotate(-90 ${map.portugalLabel.x} ${map.portugalLabel.y})` : undefined}
                    style={{ ...mono, fontSize: 12, letterSpacing: 4, fill: '#9a927f' }}
                  >
                    PORTUGAL
                  </text>
                ) : null}
                {map.context.map((p) => (
                  <path key={p.name} d={p.d} style={{ fill: '#efe6d3', stroke: '#a89f8c', strokeWidth: 1, strokeLinejoin: 'round' }} />
                ))}
                {map.hot.map((p) => (
                  <a key={p.name} href={`#${anchorId(p.name)}`}>
                    <path
                      d={p.d}
                      className="cursor-pointer hover:[stroke-width:5]"
                      style={{ fill: fillFor(p.count), stroke: 'var(--ink)', strokeWidth: 2.5, strokeLinejoin: 'round' }}
                    >
                      <title>{`${p.name} · ${p.count}`}</title>
                    </path>
                  </a>
                ))}
                {map.hot.map((p) => {
                  const ink = p.count >= 3 ? '#fff' : 'var(--ink)'
                  return (
                    <g key={`l-${p.name}`} style={{ pointerEvents: 'none' }}>
                      <text x={p.label.x} y={p.label.y} textAnchor="middle" fill={ink} style={{ ...display, fontSize: map.font, letterSpacing: -0.5 }}>
                        {p.name.toUpperCase()}
                      </text>
                      <text x={p.label.x} y={p.label.y + map.font * 2} textAnchor="middle" fill={ink} style={{ ...display, fontSize: map.font * 1.73 }}>
                        {p.count}
                      </text>
                    </g>
                  )
                })}
                {map.dots.map((d) => (
                  <g key={`d-${d.name}`} style={{ pointerEvents: 'none' }}>
                    <circle cx={d.x} cy={d.y} r={6} style={{ fill: 'var(--ink)', stroke: '#fff', strokeWidth: 2 }} />
                    <text
                      x={d.end ? d.x - 10 : d.x + 10}
                      y={d.y + 4}
                      textAnchor={d.end ? 'end' : 'start'}
                      style={{ ...mono, fontWeight: 700, fontSize: 13, fill: 'var(--ink)', paintOrder: 'stroke', stroke: '#fffbe8', strokeWidth: 4 }}
                    >
                      {d.name}
                    </text>
                  </g>
                ))}
              </svg>
              {outside.length > 0 ? (
                <div className="absolute right-2.5 top-2.5 max-w-[45%] space-y-1.5">
                  {outside.map((g) => (
                    <a
                      key={g.key}
                      href={`#${anchorId(g.key)}`}
                      className="block bg-[var(--paper)] border-[3px] border-dashed border-[var(--ink)] px-2.5 py-1.5 text-[11px] no-underline text-inherit hover:bg-[var(--yellow)]"
                      style={mono}
                    >
                      <b className="block text-[12px] uppercase" style={display}>
                        {es ? 'Fuera' : 'Away'}: {g.title}
                      </b>
                      {joinList(Array.from(new Set(g.nights.map(cityShort))), es)} · {es ? plural(g.nights.length, 'cita', 'citas') : plural(g.nights.length, 'night', 'nights')}
                    </a>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2.5 items-center text-[10px] px-2.5 py-2 flex-wrap border-t-[3px] border-[var(--ink)]" style={mono}>
                {[
                  [PALE, es ? '1 cita' : '1 night'],
                  ['var(--yellow)', '2'],
                  ['var(--red)', es ? '3 o más' : '3 or more'],
                ].map(([color, text]) => (
                  <span key={text}>
                    <i className="inline-block w-3.5 h-3.5 border-[1.5px] border-[var(--ink)] align-middle mr-1" style={{ background: color }} />
                    {text}
                  </span>
                ))}
                <span>● {es ? 'ciudad con cita' : 'city with a night'}</span>
              </div>
            </div>
          ) : null}
          <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {groupList.map((g) => (
              <div
                key={g.key}
                id={anchorId(g.key)}
                className="scroll-mt-24 border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-2.5 target:bg-[var(--yellow)]"
              >
                <h3 className="m-0 text-[15px] uppercase flex justify-between gap-2" style={display}>
                  <span>{g.title}</span>
                  <span>{g.nights.length}</span>
                </h3>
                <ul className="mt-1.5 pl-4 text-[12px] leading-[1.5] list-disc" style={mono}>
                  {g.nights.map((n) => (
                    <li key={n.slug}>
                      <b>{shortDay(n.date, lang)}</b>{' '}
                      <Link href={eventHref(n)} className="underline">{n.name}</Link>{' '}
                      <span className="opacity-70">({cityShort(n)})</span>
                      {n.stars.length ? <b className="text-[var(--red)]"> · {n.stars.length}★</b> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {nights.length > 0 ? (
        <section className="mt-12">
          <H2 mark={es ? 'de un vistazo' : 'at a glance'}>{es ? 'Las dos semanas' : 'The two weeks'}</H2>
          {calLead ? <Lead>{calLead}</Lead> : null}
          <div className="grid grid-cols-7 gap-[3px] sm:gap-1.5">
            {(es ? ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'] : ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']).map((d) => (
              <div key={d} className="text-[10px] tracking-[1px] text-center" style={mono}>{d}</div>
            ))}
            {Array.from({ length: pad }, (_, i) => <div key={`pad-${i}`} />)}
            {days.map((iso) => {
              const list = onDay(iso)
              const wd = day(iso).getUTCDay()
              const bg = list.length >= 2 ? 'bg-[var(--yellow)]' : wd === 0 || wd === 6 ? 'bg-[var(--paper-dark)]' : 'bg-[var(--paper)]'
              return (
                <div
                  key={iso}
                  title={list.map((n) => n.name).join(' · ')}
                  className={`relative border-[3px] border-[var(--ink)] min-h-[70px] sm:min-h-[86px] p-1 sm:p-1.5 ${bg}`}
                >
                  <div className="text-[10px] tracking-[1px]" style={mono}>
                    {fmt(iso, lang, { month: 'short' }).replace('.', '').toUpperCase()}
                  </div>
                  <div className="text-[16px] sm:text-[22px] leading-none" style={display}>{day(iso).getUTCDate()}</div>
                  <div className="flex flex-wrap gap-[3px] mt-1.5">
                    {list.map((n) => (
                      <i key={n.slug} className={`w-[9px] h-[9px] rounded-full ${n.stars.length ? 'bg-[var(--red)]' : 'bg-[var(--ink)]'}`} />
                    ))}
                  </div>
                  {list.length ? (
                    <span className="absolute right-1.5 bottom-1 text-[10px] font-bold" style={mono}>{list.length}</span>
                  ) : null}
                </div>
              )
            })}
          </div>
          <p className="text-[11px] mt-2 opacity-70" style={mono}>
            {es ? 'Punto rojo: la cita lleva al menos un artista del Top 100.' : 'Red dot: the night has at least one Top 100 artist.'}
          </p>
        </section>
      ) : null}

      {nights.length > 0 ? (
        <section className="mt-12">
          <H2 mark={es ? 'la agenda' : 'agenda'}>{es ? 'Toda' : 'The full'}</H2>
          <Lead>
            {copy.nights ? `${copy.nights} ` : ''}
            {starList.length
              ? es ? 'En amarillo, los nombres del Top 100 con su puesto.' : 'In yellow, the Top 100 names with their rank.'
              : ''}
          </Lead>
          {agendaDays.map((g) => (
            <div key={g.date}>
              <h3 className="text-[13px] tracking-[2px] uppercase mt-7 mb-2.5 border-b-[3px] border-[var(--ink)] pb-1" style={mono}>
                {fmt(g.date, lang, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              {g.items.map((n) => {
                const who = n.lineup.slice(0, 12)
                const more = n.lineup.length - who.length
                return (
                  <Link
                    key={n.slug}
                    href={eventHref(n)}
                    className={`grid grid-cols-[88px_1fr] sm:grid-cols-[96px_1fr] gap-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] p-2.5 mb-2.5 shadow-[4px_4px_0_var(--ink)] ${shadowLink}`}
                  >
                    <CardThumbnail
                      src={n.image}
                      alt=""
                      aspectClass="aspect-[3/4]"
                      fit="contain"
                      frameClass="border-2 border-[var(--ink)] bg-[var(--paper-dark)]"
                      sizes="96px"
                    />
                    <div className="min-w-0">
                      <div className="text-[18px] uppercase leading-[1.05]" style={display}>{n.name}</div>
                      <div className="text-[12px] mt-1" style={mono}>{placeOfNight(n)}</div>
                      {who.length > 0 ? (
                        <div className="text-[13px] mt-2 leading-[1.5]" style={elite}>
                          {who.map((name, i) => {
                            const rank = n.starEntries[name]
                            return (
                              <span key={`${name}-${i}`}>
                                {i > 0 ? ', ' : ''}
                                {rank ? (
                                  <mark className="bg-[var(--yellow)] px-[3px] font-bold text-inherit" style={mono}>
                                    {name}
                                    <sup className="text-[var(--red)] text-[9px] ml-0.5">#{rank}</sup>
                                  </mark>
                                ) : (
                                  name
                                )}
                              </span>
                            )
                          })}
                          {more > 0 ? (es ? ` y ${more} más` : ` and ${more} more`) : ''}
                        </div>
                      ) : null}
                      <div className="text-[10px] tracking-[1px]" style={mono}>
                        {n.postponed ? <span className="inline-block border-2 border-[var(--ink)] bg-[var(--yellow)] px-1.5 mr-1 mt-1.5">{es ? 'APLAZADO' : 'POSTPONED'}</span> : null}
                        {n.festival ? <span className="inline-block border-2 border-[var(--ink)] px-1.5 mr-1 mt-1.5">FESTIVAL</span> : null}
                        {n.vinyl ? <span className="inline-block border-2 border-[var(--ink)] px-1.5 mr-1 mt-1.5">{es ? 'VINILO' : 'VINYL'}</span> : null}
                        {n.stars.length ? (
                          <span className="inline-block border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--yellow)] px-1.5 mr-1 mt-1.5">
                            {n.stars.length} {es ? 'DEL TOP 100' : 'FROM THE TOP 100'}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ))}
        </section>
      ) : null}

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
