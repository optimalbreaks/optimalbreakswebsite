// ============================================
// OPTIMAL BREAKS — Página pilar «Qué es el breakbeat» (/[lang]/breakbeat)
// Contenido en `@/content/breakbeat-guide`. El post antiguo del blog sobre
// el mismo tema redirige aquí (301, next.config.js).
// ============================================

import type { Metadata } from 'next'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n-config'
import {
  breadcrumbJsonLd,
  DEFAULT_OG_IMAGE_PATH,
  detailPageMetadata,
  faqPageJsonLd,
  HOME_OG_IMAGE,
  siteNameForLang,
  SITE_URL,
} from '@/lib/seo'
import { breakbeatGuide, GUIDE_PUBLISHED, GUIDE_UPDATED } from '@/content/breakbeat-guide'

type Props = { params: Promise<{ lang: Locale }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  const g = breakbeatGuide(lang)
  const siteName = await siteNameForLang(lang)
  return detailPageMetadata(lang, '/breakbeat', siteName, g.metaTitle, g.metaDescription, 'article', HOME_OG_IMAGE)
}

function linkPattern(): RegExp {
  return /\[([^\]]+)\]\((\/[^)\s]*)\)/g
}

/** Pinta un párrafo con enlaces [texto](/ruta) → <Link href="/{lang}/ruta">. */
function RichText({ text, lang }: { text: string; lang: Locale }) {
  const out: React.ReactNode[] = []
  const linkRe = linkPattern()
  let last = 0
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <Link
        key={`${m.index}-${m[2]}`}
        href={`/${lang}${m[2]}`}
        className="text-[var(--red)] underline underline-offset-[3px] hover:text-[var(--uv)]"
      >
        {m[1]}
      </Link>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

function plain(text: string): string {
  return text.replace(linkPattern(), '$1')
}

const TYPE = "'Special Elite', monospace"

export default async function BreakbeatGuidePage({ params }: Props) {
  const { lang } = await params
  const g = breakbeatGuide(lang)
  const es = lang === 'es'
  const url = `${SITE_URL}/${lang}/breakbeat`
  const faqLd = faqPageJsonLd(g.faq)
  const wordCount = [...g.lead, ...g.sections.flatMap((s) => s.paragraphs), ...g.faq.map((f) => f.answer)]
    .map(plain)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: g.title,
        description: g.metaDescription,
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        inLanguage: es ? 'es-ES' : 'en-US',
        datePublished: GUIDE_PUBLISHED,
        dateModified: GUIDE_UPDATED,
        wordCount,
        image: `${SITE_URL}${HOME_OG_IMAGE}`,
        about: { '@type': 'Thing', name: 'Breakbeat', sameAs: 'https://en.wikipedia.org/wiki/Breakbeat' },
        author: { '@type': 'Organization', name: 'Optimal Breaks', url: SITE_URL },
        publisher: {
          '@type': 'Organization',
          name: 'Optimal Breaks',
          url: SITE_URL,
          logo: { '@type': 'ImageObject', url: `${SITE_URL}${DEFAULT_OG_IMAGE_PATH}`, width: 512, height: 512 },
        },
      },
      breadcrumbJsonLd([
        { name: es ? 'Inicio' : 'Home', url: `${SITE_URL}/${lang}` },
        { name: g.title, url },
      ]),
      ...(faqLd ? [faqLd] : []),
    ],
  }

  const updated = new Date(`${GUIDE_UPDATED}T12:00:00`).toLocaleDateString(es ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <div className="max-w-[860px] mx-auto">
          <div className="sec-tag">{g.kicker}</div>
          <h1 className="sec-title sec-title--compact">
            <span className="hl">{g.title}</span>
          </h1>
          <p className="mt-3 text-[12px] text-[var(--text-muted)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
            Optimal Breaks · {g.updatedLabel} {updated}
          </p>

          {/* Respuesta directa (fragmento destacado / respuestas de IA) */}
          <div className="mt-6 border-4 border-[var(--ink)] bg-[var(--paper)] p-5 sm:p-7 shadow-[6px_6px_0_var(--ink)] space-y-3">
            {g.lead.map((p, i) => (
              <p key={i} style={{ fontFamily: TYPE, fontSize: i === 0 ? '18px' : '16px', lineHeight: 1.75 }}>
                <RichText text={p} lang={lang} />
              </p>
            ))}
          </div>

          {/* Índice */}
          <nav className="mt-8 border-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] p-5" aria-label={g.tocTitle}>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '3px', color: 'var(--yellow)' }}>
              {g.tocTitle.toUpperCase()}
            </div>
            <ol className="mt-3 m-0 pl-5 space-y-1" style={{ fontFamily: TYPE, fontSize: '15px' }}>
              {g.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-[var(--paper)] no-underline hover:text-[var(--yellow)]">{s.title}</a>
                </li>
              ))}
              <li>
                <a href="#faq" className="text-[var(--paper)] no-underline hover:text-[var(--yellow)]">{g.faqTitle}</a>
              </li>
            </ol>
          </nav>

          {g.sections.map((s) => (
            <section key={s.id} id={s.id} className="mt-12 scroll-mt-24">
              <h2
                className="pb-2 border-b-4 border-[var(--ink)]"
                style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(20px, 3.4vw, 30px)', lineHeight: 1.15, textTransform: 'uppercase' }}
              >
                {s.title}
              </h2>
              <div className="mt-4 space-y-4">
                {s.paragraphs.map((p, i) => (
                  <p key={i} style={{ fontFamily: TYPE, fontSize: '16px', lineHeight: 1.85 }}>
                    <RichText text={p} lang={lang} />
                  </p>
                ))}
              </div>
            </section>
          ))}

          <section id="faq" className="mt-14 scroll-mt-24">
            <h2
              className="pb-2 border-b-4 border-[var(--ink)]"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(20px, 3.4vw, 30px)', lineHeight: 1.15, textTransform: 'uppercase' }}
            >
              {g.faqTitle}
            </h2>
            <div className="mt-4 border-4 border-[var(--ink)] divide-y-[3px] divide-[var(--ink)]">
              {g.faq.map((f, i) => (
                <div key={i} className="p-5 bg-[var(--paper)]">
                  <h3 style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '19px', margin: 0 }}>{f.question}</h3>
                  <p className="mt-2" style={{ fontFamily: TYPE, fontSize: '15px', lineHeight: 1.75 }}>{f.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-12 flex flex-wrap gap-3">
            <Link href={`/${lang}/history`} className="btn-back">{es ? 'Historia completa →' : 'Full history →'}</Link>
            <Link href={`/${lang}/artists`} className="btn-back">{es ? 'Artistas →' : 'Artists →'}</Link>
            <Link href={`/${lang}/agenda`} className="btn-back">{es ? 'Agenda →' : 'Listings →'}</Link>
          </div>
        </div>
      </article>
    </>
  )
}
