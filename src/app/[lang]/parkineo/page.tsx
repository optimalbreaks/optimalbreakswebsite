import type { Metadata } from 'next'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n-config'
import { createCachedSupabase } from '@/lib/supabase-server'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { staticPageMetadata } from '@/lib/seo'
import { PUBLIC_PARKINEO_CACHE_TAG } from '@/lib/revalidate-public'
import { PARKINEO_PUBLIC_COLUMNS } from '@/lib/parkineo'
import { COMIC_IMG } from '@/content/comic'
import ParkineoBoard, { type ParkineoListItem } from '@/components/ParkineoBoard'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/parkineo', 'parkineo')
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif", fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase' } as const

export default async function ParkineoPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const es = lang === 'es'
  const supabase = createCachedSupabase(300, [PUBLIC_PARKINEO_CACHE_TAG])
  const sessions = await fetchAllPages<ParkineoListItem>((from, to) =>
    supabase
      .from('parkineo_sessions')
      .select(PARKINEO_PUBLIC_COLUMNS)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  ).catch(() => [] as ParkineoListItem[])

  const facts = es
    ? ['Gratis', 'Sin ser artista', 'Lista pública']
    : ['Free', 'No artist page needed', 'Public list']

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-16 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1280px] grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
          <div>
            <div className="sec-tag">{es ? 'Parkineo · sesiones abiertas' : 'Parkineo · open sessions'}</div>
            <h1 className="sec-title">
              {es ? 'SESIONES DE' : 'SESSIONS FROM'}
              <br />
              <span className="hl">{es ? 'QUIEN EMPIEZA' : 'PEOPLE STARTING OUT'}</span>
            </h1>
            <p
              className="m-0 max-w-[620px]"
              style={{ fontFamily: "'Special Elite', monospace", fontSize: 'clamp(17px, 2.2vw, 20px)', lineHeight: 1.6, color: 'var(--ink)' }}
            >
              {es
                ? 'Si pinchas break y todavía no estás en la web, aquí suena tu sesión. Como en la puerta de la fiesta, en el grupo o en el parking: gente que empieza y se lo curra.'
                : 'If you play breaks and you are not on the site yet, this is where your session plays. Like at the door of the party, in the group chat or in the car park: people starting out and putting the work in.'}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#mandar"
                className="inline-block border-[3px] border-[var(--ink)] bg-[var(--red)] px-5 py-3 text-white no-underline shadow-[4px_4px_0_var(--ink)] transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_var(--ink)]"
                style={{ ...DISPLAY, fontSize: '14px' }}
              >
                {es ? 'Mandar mi sesión ↓' : 'Send my session ↓'}
              </a>
              <a
                href="#sesiones"
                className="inline-block border-[3px] border-[var(--ink)] bg-[var(--paper)] px-5 py-3 text-[var(--ink)] no-underline shadow-[4px_4px_0_var(--ink)] transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_var(--ink)]"
                style={{ ...DISPLAY, fontSize: '14px' }}
              >
                {es ? 'Escuchar' : 'Listen'}
                {sessions.length > 0 ? ` (${sessions.length})` : ''}
              </a>
            </div>
            <ul className="mt-6 mb-0 p-0 list-none flex flex-wrap gap-2">
              {facts.map((f) => (
                <li
                  key={f}
                  className="border-2 border-[var(--ink)] bg-[var(--yellow)] px-2 py-1"
                  style={{ ...MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}
                >
                  ✓ {f}
                </li>
              ))}
            </ul>
          </div>
          <figure className="m-0 mx-auto w-full max-w-[520px] lg:max-w-none">
            <div className="relative rotate-[1.5deg] border-4 border-[var(--ink)] bg-[var(--ink)] shadow-[8px_8px_0_var(--ink)]">
              <span
                aria-hidden="true"
                className="absolute -top-3 left-1/2 h-6 w-28 -translate-x-1/2 -rotate-3 bg-[var(--tape)]"
              />
              <img
                src={`${COMIC_IMG}/pm_canis.jpg`}
                alt={es ? 'Los canis del cómic con su radiocasete, listos para escuchar sesiones' : 'The comic’s canis with their boombox, ready to listen to sessions'}
                width={960}
                height={716}
                className="block w-full h-auto"
              />
            </div>
            <figcaption className="mt-4 text-center" style={{ ...MONO, fontSize: '13px', color: 'var(--ink)' }}>
              {es ? 'Los del parking ya tienen el radiocasete listo.' : 'The car park crew already has the boombox ready.'}
              <Link href={`/${lang}/comic#canis`} className="mt-2 block font-bold text-[var(--red)] no-underline hover:underline">
                {es ? 'Saber más de los canis del parking →' : 'More about the car park canis →'}
              </Link>
            </figcaption>
          </figure>
        </div>
      </section>
      <ParkineoBoard lang={lang} sessions={sessions} />
    </div>
  )
}
