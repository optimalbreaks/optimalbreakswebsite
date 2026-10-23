import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Locale } from '@/lib/i18n-config'
import { createCachedSupabase } from '@/lib/supabase-server'
import { detailPageMetadata, siteNameForLang } from '@/lib/seo'
import { PUBLIC_PARKINEO_CACHE_TAG } from '@/lib/revalidate-public'
import { PARKINEO_PUBLIC_COLUMNS, formatParkineoPublished, parkineoOpenHref } from '@/lib/parkineo'
import ParkineoPlayer, { type ParkineoPlayable } from '@/components/ParkineoPlayer'
import type { ParkineoListItem } from '@/components/ParkineoBoard'

export const revalidate = 300

async function loadSession(slug: string): Promise<ParkineoListItem | null> {
  const supabase = createCachedSupabase(300, [PUBLIC_PARKINEO_CACHE_TAG])
  const { data } = await supabase
    .from('parkineo_sessions')
    .select(PARKINEO_PUBLIC_COLUMNS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  return (data as ParkineoListItem | null) ?? null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale; slug: string }>
}): Promise<Metadata> {
  const { lang, slug } = await params
  const session = await loadSession(slug)
  if (!session) return { title: 'Parkineo' }
  const es = lang === 'es'
  return detailPageMetadata(
    lang,
    `/parkineo/${session.slug}`,
    await siteNameForLang(lang),
    `${session.title} — ${session.dj_name}`,
    es
      ? `Sesión de ${session.dj_name} (${session.city}) en Parkineo, Optimal Breaks.`
      : `Session by ${session.dj_name} (${session.city}) on Parkineo, Optimal Breaks.`,
    'website',
    session.image_url,
  )
}

export default async function ParkineoSessionPage({
  params,
}: {
  params: Promise<{ lang: Locale; slug: string }>
}) {
  const { lang, slug } = await params
  const session = await loadSession(slug)
  if (!session) notFound()
  const es = lang === 'es'
  const open = parkineoOpenHref(session)
  const published = formatParkineoPublished(session.published_at, lang)
  const playable: ParkineoPlayable = session

  return (
    <div className="lined min-h-screen">
      <article className="px-4 sm:px-6 py-10 sm:py-14 max-w-[920px] mx-auto">
        <Link
          href={`/${lang}/parkineo`}
          className="no-underline text-[var(--red)]"
          style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}
        >
          ← Parkineo
        </Link>
        <h1 className="mt-4 mb-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 5vw, 48px)', lineHeight: 0.95, textTransform: 'uppercase' }}>
          {session.title}
        </h1>
        <p className="mt-0 mb-6" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '14px', letterSpacing: '0.5px' }}>
          {session.dj_name} · {session.city}
          {published ? ` · ${published}` : ''}
          {' · '}
          {session.duration_minutes} min · {session.platform.toUpperCase()}
          {open ? (
            <>
              {' · '}
              <a href={open} target="_blank" rel="noopener noreferrer" className="text-[var(--red)]">
                {es ? 'Abrir' : 'Open'} ↗
              </a>
            </>
          ) : null}
        </p>
        <div className="border-4 border-[var(--ink)] shadow-[6px_6px_0_var(--ink)] overflow-hidden">
          <ParkineoPlayer session={playable} />
        </div>
      </article>
    </div>
  )
}
