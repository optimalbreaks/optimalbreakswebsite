// ============================================
// OPTIMAL BREAKS — Public shared user tracks page
// /[lang]/u/[handle]/tracks
// Cualquier visitante (logueado o no) puede ver y reproducir la lista
// "Mis Tracks" de otro usuario. Reutiliza TracksSection en modo compartido.
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getDictionary } from '@/lib/dictionaries'
import { SITE_URL, ogAlternateLocales } from '@/lib/seo'
import TracksSection, { type PublicTracksPayload } from '@/components/user/TracksSection'

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale; handle: string }> }): Promise<Metadata> {
  const { lang, handle } = await params
  const dict = await getDictionary(lang)
  const seo = dict.seo as { site_name: string; default_keywords: string }
  const siteName = seo.site_name
  const defaultKw = seo.default_keywords.split(',').map((k) => k.trim())
  const payload = await fetchPayload(handle)
  const es = lang === 'es'
  const path = `/u/${handle}/tracks`
  const url = `${SITE_URL}/${lang}${path}`

  const name = payload
    ? payload.owner.display_name || payload.owner.username || (es ? 'Breaker' : 'Breaker')
    : null
  const count = payload?.saved.length ?? 0

  const title = payload
    ? es
      ? `Tracks de ${name}`
      : `${name}'s tracks`
    : es
      ? 'Lista de tracks'
      : 'Track list'

  const description = payload
    ? es
      ? `${count} ${count === 1 ? 'track guardado' : 'tracks guardados'} por ${name}. Escucha y añádelos a tu lista.`
      : `${count} ${count === 1 ? 'saved track' : 'saved tracks'} by ${name}. Listen and add them to your list.`
    : es
      ? 'Lista compartida de tracks en Optimal Breaks.'
      : 'Shared track list on Optimal Breaks.'

  // Sin `images` aquí: Next usa `opengraph-image.tsx` / `twitter-image.tsx`
  // de esta ruta (nombre + collage de carátulas). Si los sobreescribiéramos
  // con una URL estática, Meta/WhatsApp ignorarían la OG dinámica.
  return {
    title,
    description,
    keywords: defaultKw,
    alternates: {
      canonical: url,
      languages: {
        es: `${SITE_URL}/es${path}`,
        en: `${SITE_URL}/en${path}`,
        'x-default': `${SITE_URL}/en${path}`,
      },
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName,
      locale: lang === 'es' ? 'es_ES' : 'en_US',
      alternateLocale: ogAlternateLocales(lang),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: { index: false, follow: true },
  }
}

async function fetchPayload(handle: string): Promise<PublicTracksPayload | null> {
  const hdrs = await headers()
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || 'localhost:3000'
  const proto = hdrs.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  const base = `${proto}://${host}`
  const res = await fetch(`${base}/api/public/user-tracks?handle=${encodeURIComponent(handle)}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as PublicTracksPayload
}

export default async function Page({ params }: { params: Promise<{ lang: Locale; handle: string }> }) {
  const { lang, handle } = await params
  const payload = await fetchPayload(handle)
  if (!payload) notFound()
  const es = lang === 'es'

  return (
    <div className="min-h-screen">
      <section className="bg-[var(--ink)] text-[var(--paper)] px-4 sm:px-6 py-8 sm:py-12 border-b-8 border-[var(--red)]">
        <div className="sec-tag" style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)' }}>
          {es ? 'LISTA COMPARTIDA' : 'SHARED LIST'}
        </div>
        <h1
          className="mt-4"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(28px, 6vw, 50px)',
            textTransform: 'uppercase',
            lineHeight: 0.9,
          }}
        >
          <span style={{ color: 'var(--yellow)' }}>
            {payload.owner.display_name || payload.owner.username || (es ? 'Breaker' : 'Breaker')}
          </span>
        </h1>
        <p
          className="mt-2"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '12px',
            color: 'rgba(232,220,200,0.5)',
            letterSpacing: '2px',
          }}
        >
          {es ? 'TRACKS GUARDADOS · EXPLORA Y AÑADE A TU LISTA' : 'SAVED TRACKS · EXPLORE AND ADD TO YOUR LIST'}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/${lang}/mi-cuenta/tracks`}
            className="inline-flex items-center gap-1 px-3 py-2 border-2 border-[var(--yellow)] text-[var(--yellow)] no-underline hover:bg-[var(--yellow)] hover:text-[var(--ink)] transition-colors"
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
          >
            {es ? '♪ MIS TRACKS' : '♪ MY TRACKS'}
          </Link>
          <Link
            href={`/${lang}/charts`}
            className="inline-flex items-center gap-1 px-3 py-2 border-2 border-[var(--paper)]/30 text-[var(--paper)] no-underline hover:border-[var(--yellow)] hover:text-[var(--yellow)] transition-colors"
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
          >
            {es ? '▶ IR A CHARTS' : '▶ GO TO CHARTS'}
          </Link>
        </div>
      </section>

      <div className="lined px-4 sm:px-6 py-8 sm:py-12">
        <TracksSection lang={lang} publicPayload={payload} />
      </div>
    </div>
  )
}
