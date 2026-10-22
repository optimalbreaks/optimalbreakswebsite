import type { Metadata } from 'next'
import Link from 'next/link'
import { LazyYouTubeEmbed } from '@/components/YouTubeEmbed'
import {
  CHANNEL_ACCOUNTS,
  CHANNEL_GUIDES,
  CHANNEL_PLAYLISTS,
  CHANNEL_SERIES,
  YOUTUBE_CHANNEL_URL,
} from '@/content/channels'
import type { Locale } from '@/lib/i18n-config'
import { staticPageMetadata } from '@/lib/seo'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/channels', 'channels')
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif" } as const

function outbound(href: string, label: string) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center border-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 text-[var(--paper)] no-underline shadow-[4px_4px_0_var(--red)] hover:bg-[var(--red)] hover:text-white"
      style={{ ...DISPLAY, fontWeight: 900, fontSize: '13px', letterSpacing: '0.5px', textTransform: 'uppercase' }}
    >
      {label}
    </a>
  )
}

export default async function ChannelsPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const es = lang === 'es'

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-16 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1100px]">
          <div className="sec-tag">{es ? 'Canales · Spotify y YouTube' : 'Channels · Spotify and YouTube'}</div>
          <h1 className="sec-title">
            {es ? 'LA CUENTA,' : 'THE ACCOUNT,'}
            <br />
            <span className="hl">{es ? 'LAS LISTAS Y LOS VÍDEOS' : 'THE PLAYLISTS AND THE VIDEOS'}</span>
          </h1>
          <p
            className="m-0 max-w-[640px]"
            style={{ fontFamily: "'Special Elite', monospace", fontSize: 'clamp(17px, 2.2vw, 20px)', lineHeight: 1.6, color: 'var(--ink)' }}
          >
            {es
              ? 'Aquí está lo que Optimal Breaks tiene fuera de la web: la cuenta de Spotify, las listas, y los canales de YouTube donde van los vídeos de la escena y los de cómo funciona cada sección.'
              : 'This is what Optimal Breaks keeps off the site: the Spotify account, the playlists, and the YouTube channels for scene videos and a walkthrough of each section.'}
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-6 py-10 sm:py-14 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1100px] grid gap-4 md:grid-cols-2">
          {CHANNEL_ACCOUNTS.map((account) => {
            const spotify = account.id === 'spotify'
            return (
              <article
                key={account.id}
                className={`border-[3px] border-[var(--ink)] p-4 sm:p-5 shadow-[6px_6px_0_var(--ink)] ${spotify ? 'bg-[var(--yellow)]' : 'bg-[var(--paper)]'}`}
              >
                <p className="m-0 text-[11px] font-black tracking-[2px]" style={MONO}>
                  {account.kicker[lang]}
                </p>
                <h2 className="m-0 mt-2 text-3xl sm:text-4xl font-black leading-none" style={DISPLAY}>
                  {account.title[lang]}
                </h2>
                <p className="mt-3 mb-0 text-[15px] leading-relaxed" style={MONO}>
                  {account.text[lang]}
                </p>
                {account.href ? <div className="mt-5">{outbound(account.href, account.button[lang])}</div> : null}
                {spotify ? (
                  <ul className="mt-5 mb-0 p-0 list-none grid gap-3">
                    {CHANNEL_PLAYLISTS.map((list) => (
                      <li key={list.id} className="border-[3px] border-[var(--ink)] bg-[var(--paper)] p-3">
                        <h3 className="m-0 text-[18px] font-black" style={DISPLAY}>
                          {list.name}
                        </h3>
                        <p className="mt-2 mb-0 text-[13px] leading-relaxed" style={MONO}>
                          {list.text[lang]}
                        </p>
                        {list.href ? <div className="mt-3">{outbound(list.href, es ? 'Abrir la lista' : 'Open the playlist')}</div> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            )
          })}
        </div>
      </section>

      <section className="px-4 sm:px-6 py-10 sm:py-14 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1100px]">
          <div className="sec-tag">{es ? 'En el canal' : 'On the channel'}</div>
          <h2 className="m-0 mb-6 text-3xl sm:text-5xl font-black leading-[0.95] uppercase" style={DISPLAY}>
            {es ? 'VÍDEOS DE' : 'VIDEOS FROM'}
            <br />
            <span className="hl">{es ? 'LA ESCENA' : 'THE SCENE'}</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {CHANNEL_SERIES.map((series) => (
              <article key={series.id} className="border-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[4px_4px_0_var(--ink)]">
                {series.youtubeId ? (
                  <LazyYouTubeEmbed
                    videoId={series.youtubeId}
                    title={series.title[lang]}
                    playSlotId={`channel-${series.id}`}
                  />
                ) : (
                  <div
                    className="flex aspect-video items-end border-b-[3px] border-[var(--ink)] p-3"
                    style={{ background: 'repeating-linear-gradient(-45deg, var(--ink) 0 10px, #2a2a2a 10px 20px)' }}
                  >
                    <span className="bg-[var(--yellow)] px-2 py-1 text-[11px] font-black tracking-[1px] text-[var(--ink)]" style={MONO}>
                      {es ? 'EN EL CANAL' : 'ON THE CHANNEL'}
                    </span>
                  </div>
                )}
                <div className="p-3">
                  <h3 className="m-0 text-[20px] font-black leading-tight" style={DISPLAY}>
                    {series.title[lang]}
                  </h3>
                  <p className="mt-2 mb-0 text-[13px] leading-relaxed" style={MONO}>
                    {series.text[lang]}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={YOUTUBE_CHANNEL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-black text-[var(--ink)] underline underline-offset-2"
                      style={MONO}
                    >
                      @optimalbreaks
                    </a>
                    {series.href ? (
                      <Link href={`/${lang}${series.href}`} className="text-[12px] font-black text-[var(--red)] no-underline hover:underline" style={MONO}>
                        {es ? 'Ver en la web' : 'See on the site'}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 py-10 sm:py-14">
        <div className="mx-auto max-w-[1100px]">
          <div className="sec-tag">{es ? 'Cómo funciona' : 'How it works'}</div>
          <h2 className="m-0 mb-4 text-3xl sm:text-5xl font-black leading-[0.95] uppercase" style={DISPLAY}>
            {es ? 'UN VÍDEO' : 'ONE VIDEO'}
            <br />
            <span className="hl">{es ? 'POR SECCIÓN' : 'PER SECTION'}</span>
          </h2>
          <p className="m-0 mb-6 max-w-[640px] text-[15px] leading-relaxed" style={MONO}>
            {es
              ? 'Cada parte de la web tendrá su vídeo en el canal: qué es y cómo se usa. Cuando esté grabado, se ve en su fila.'
              : 'Each part of the site gets a video on the channel: what it is and how to use it. Once it is recorded, it plays in its row.'}
          </p>
          <ol className="m-0 p-0 list-none border-[3px] border-[var(--ink)]">
            {CHANNEL_GUIDES.map((guide) => (
              <li key={guide.href} className="border-b-[3px] border-[var(--ink)] last:border-b-0 bg-[var(--paper)]">
                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                  <h3 className="m-0 text-[16px] sm:text-[18px] font-black" style={DISPLAY}>
                    {guide.label[lang]}
                  </h3>
                  <Link
                    href={`/${lang}${guide.href}`}
                    className="text-[12px] font-black tracking-[1px] text-[var(--ink)] no-underline hover:text-[var(--red)]"
                    style={MONO}
                  >
                    {es ? 'IR A LA SECCIÓN →' : 'GO TO THE SECTION →'}
                  </Link>
                </div>
                {guide.youtubeId ? (
                  <div className="border-t-[3px] border-[var(--ink)]">
                    <LazyYouTubeEmbed
                      videoId={guide.youtubeId}
                      title={guide.label[lang]}
                      playSlotId={`channel-guide-${guide.href}`}
                    />
                  </div>
                ) : (
                  <p className="m-0 border-t-[3px] border-[var(--ink)]/20 px-3 py-2 text-[12px] text-[var(--ink)]/60" style={MONO}>
                    {es ? 'El vídeo de esta sección se verá aquí.' : 'This section’s video will play here.'}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  )
}
