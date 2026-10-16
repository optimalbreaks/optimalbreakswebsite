// ============================================
// OPTIMAL BREAKS — /comic: «Las aventuras del Lechón y el Pepino»
// Historia, personajes y episodios (vídeos en Supabase Storage, bucket `comic`).
// ============================================

import type { Metadata } from 'next'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n-config'
import { staticPageMetadata } from '@/lib/seo'
import { COMIC_CHARACTERS, COMIC_COPY, COMIC_IMG } from '@/content/comic'
import ComicPlayer from '@/components/comic/ComicPlayer'
import './comic.css'

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/comic', 'comic', {
    ogImagePath: `${COMIC_IMG}/super_lechon_transformacion.jpg`,
    ogImageAlt: COMIC_COPY[lang].heroAlt,
  })
}

export default async function ComicPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const c = COMIC_COPY[lang]

  return (
    <div className="cmc">
      <section className="cmc-hero">
        <div className="cmc-wrap">
          <div>
            <p className="cmc-cue">{c.kicker}</p>
            <h1 className="cmc-inked">
              {c.heroTitle[0]}
              <br />
              <span className="cmc-mark">{c.heroTitle[1]}</span>
            </h1>
            <p className="cmc-hero-text">{c.heroText}</p>
            <div className="cmc-ctas">
              <a className="cmc-btn" href="#episodios">{c.ctaEpisodes}</a>
              <a className="cmc-btn is-ghost" href="#personajes">{c.ctaCast}</a>
            </div>
          </div>
          <figure className="cmc-strip">
            <span className="cmc-tape" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${COMIC_IMG}/super_lechon_transformacion.jpg`} alt={c.heroAlt} width={1376} height={768} />
            <span className="cmc-zas" aria-hidden="true">{lang === 'es' ? '¡¡ZAS!!' : 'ZAP!!'}</span>
          </figure>
        </div>
      </section>

      <section className="cmc-story" id="historia">
        <div className="cmc-wrap">
          <div>
            <h2>
              {c.storyTitle[0]} <span className="cmc-mark">{c.storyTitle[1]}</span>
            </h2>
            <p className="cmc-lead">{c.storyLead}</p>
            <p className="cmc-story-text">{c.storyText}</p>
          </div>
          <div className="cmc-field">
            <span className="cmc-field-no">{c.fieldNo}</span>
            <h3>{c.fieldTitle}</h3>
            <p className="cmc-latin">{c.fieldLatin}</p>
            <ul>
              {c.fieldYes.map((x) => (
                <li key={x}><i>✓</i>{x}</li>
              ))}
              <li className="is-no"><i>✗</i>{c.fieldNo1}</li>
            </ul>
            <span className="cmc-stamp">{c.stamp}</span>
          </div>
          <ol className="cmc-steps">
            {c.steps.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="cmc-cast" id="personajes">
        <div className="cmc-wrap">
          <div className="cmc-sec-head">
            <h2 className="cmc-inked">{c.castTitle}</h2>
            <p>{c.castText}</p>
          </div>
          <div className="cmc-grid">
            {COMIC_CHARACTERS.map((ch) => (
              <article key={ch.img} className={`cmc-card${ch.big ? ' is-big' : ''}${ch.tone === 'yellow' ? ' is-yellow' : ''}`}>
                <div className={`cmc-pic${ch.fit === 'contain' ? ' is-contain' : ''}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${COMIC_IMG}/${ch.img}`} alt={ch.alt[lang]} loading="lazy" />
                </div>
                <h3>{ch.name[lang]}</h3>
                <p className="cmc-role">{ch.role[lang]}</p>
                <p>{ch.text[lang]}</p>
                {ch.quote && <q>{ch.quote[lang]}</q>}
                {ch.more && (
                  <details>
                    <summary>{ch.more.label[lang]}</summary>
                    <ul>
                      {ch.more.items[lang].map((x) => <li key={x}>{x}</li>)}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cmc-eps" id="episodios">
        <div className="cmc-wrap">
          <div className="cmc-sec-head">
            <h2 className="cmc-inked">{c.epsTitle}</h2>
            <p>{c.epsText}</p>
          </div>
          <ComicPlayer lang={lang} />
        </div>
      </section>

      <section className="cmc-vote">
        <div className="cmc-wrap">
          <div>
            <h2>{c.voteTitle}</h2>
            <p>{c.voteText}</p>
          </div>
          <Link className="cmc-btn" href={`/${lang}/charts`}>{c.voteCta}</Link>
        </div>
      </section>
    </div>
  )
}
