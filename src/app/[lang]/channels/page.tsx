import type { Metadata } from 'next'
import Link from 'next/link'
import { LazyYouTubeEmbed } from '@/components/YouTubeEmbed'
import {
  CHANNEL_ACCOUNTS,
  CHANNEL_PLAYLISTS,
  CHANNEL_SERIES,
  loadYouTubeChannelUploads,
  videosForSeries,
  YOUTUBE_CHANNEL_AVATAR,
  YOUTUBE_CHANNEL_HANDLE,
  YOUTUBE_CHANNEL_URL,
} from '@/content/channels'
import type { Locale } from '@/lib/i18n-config'
import { staticPageMetadata } from '@/lib/seo'
import { GuideList } from '@/components/SectionGuide'
import { SECTION_GUIDES } from '@/content/section-guides'

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
  const uploads = await loadYouTubeChannelUploads()
  const claimed = new Set<string>()
  const seriesBlocks = CHANNEL_SERIES.map((series) => {
    const videos = videosForSeries(series, uploads)
    for (const video of videos) claimed.add(video.id)
    return { series, videos }
  })
  const loose = uploads.filter((video) => !claimed.has(video.id))

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
        <div className="mx-auto max-w-[1100px] grid gap-8">
          {CHANNEL_ACCOUNTS.map((account) => {
            const spotify = account.id === 'spotify'
            const playlist = spotify ? CHANNEL_PLAYLISTS[0] : null
            return (
              <article
                key={account.id}
                className={`border-[3px] border-[var(--ink)] shadow-[6px_6px_0_var(--ink)] overflow-hidden ${spotify ? 'bg-[var(--yellow)]' : 'bg-[var(--paper)]'}`}
              >
                <div className="flex flex-wrap items-end justify-between gap-4 p-4 sm:p-5">
                  <div className="min-w-0 max-w-[640px]">
                    <p className="m-0 text-[11px] font-black tracking-[2px]" style={MONO}>
                      {account.kicker[lang]}
                    </p>
                    <h2 className="m-0 mt-1 text-3xl sm:text-4xl font-black leading-none" style={DISPLAY}>
                      {account.title[lang]}
                    </h2>
                    <p className="mt-2 mb-0 text-[14px] sm:text-[15px] leading-relaxed" style={MONO}>
                      {account.text[lang]}
                    </p>
                  </div>
                  {playlist
                    ? outbound(playlist.href, es ? 'Abrir la lista' : 'Open the playlist')
                    : account.href
                      ? outbound(account.href, account.button[lang])
                      : null}
                </div>
                {playlist ? (
                  <iframe
                    title={playlist.name}
                    src={playlist.embed}
                    width="100%"
                    height={680}
                    className="block w-full border-0 border-t-[3px] border-solid border-[var(--ink)] bg-black"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : (
                  <a
                    href={account.href || YOUTUBE_CHANNEL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-4 border-t-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-5 no-underline sm:flex-row sm:gap-6 sm:px-6 sm:py-6"
                  >
                    <img
                      src={`/api/og/image-proxy?src=${encodeURIComponent(YOUTUBE_CHANNEL_AVATAR)}`}
                      alt=""
                      width={148}
                      height={148}
                      className="h-[112px] w-[112px] shrink-0 rounded-full border-[3px] border-[var(--yellow)] object-cover sm:h-[148px] sm:w-[148px]"
                    />
                    <span className="min-w-0 text-center sm:text-left">
                      <span className="block text-2xl font-black leading-none text-white sm:text-4xl" style={DISPLAY}>
                        OPTIMAL BREAKS
                      </span>
                      <span className="mt-2 block text-[13px] font-black tracking-[1px] text-[var(--yellow)]" style={MONO}>
                        {YOUTUBE_CHANNEL_HANDLE}
                      </span>
                      <span className="mt-3 inline-flex items-center gap-2 text-[12px] font-black tracking-[2px] text-white" style={MONO}>
                        <span className="flex h-8 w-11 items-center justify-center rounded-[8px] bg-[#f00]" aria-hidden>
                          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                        {es ? 'VER EL CANAL' : 'WATCH THE CHANNEL'}
                      </span>
                    </span>
                  </a>
                )}
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
            {seriesBlocks.map(({ series, videos }) => {
              const preview = series.id === 'lechon' ? videos.slice(0, 2) : videos
              const moreOnComic = series.id === 'lechon' && videos.length > preview.length
              return (
              <article key={series.id} className="border-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[4px_4px_0_var(--ink)]">
                {preview.length > 0 ? (
                  preview.map((video) => (
                    <div key={video.id} className="border-b-[3px] border-[var(--ink)]">
                      <LazyYouTubeEmbed
                        videoId={video.id}
                        title={video.title}
                        playSlotId={`channel-${video.id}`}
                        vertical={video.short}
                      />
                      {preview.length > 1 ? (
                        <p className="m-0 px-3 py-2 text-[12px] leading-snug" style={MONO}>
                          {video.title}
                        </p>
                      ) : null}
                    </div>
                  ))
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
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={YOUTUBE_CHANNEL_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-black text-[var(--ink)] underline underline-offset-2"
                      style={MONO}
                    >
                      {YOUTUBE_CHANNEL_HANDLE}
                    </a>
                    {moreOnComic ? (
                      <Link
                        href={`/${lang}/comic#episodios`}
                        className="inline-flex min-h-[44px] items-center border-[3px] border-[var(--ink)] bg-[var(--ink)] px-3 text-[var(--paper)] no-underline shadow-[4px_4px_0_var(--red)] hover:bg-[var(--red)] hover:text-white"
                        style={{ ...DISPLAY, fontWeight: 900, fontSize: '12px', letterSpacing: '0.4px', textTransform: 'uppercase' }}
                      >
                        {es ? 'Más vídeos en el cómic' : 'More videos in the comic'}
                      </Link>
                    ) : series.href ? (
                      <Link href={`/${lang}${series.href}`} className="text-[12px] font-black text-[var(--red)] no-underline hover:underline" style={MONO}>
                        {es ? 'Ver en la web' : 'See on the site'}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
              )
            })}
            {loose.map((video) => (
              <article key={video.id} className="border-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[4px_4px_0_var(--ink)]">
                <div className="border-b-[3px] border-[var(--ink)]">
                  <LazyYouTubeEmbed videoId={video.id} title={video.title} playSlotId={`channel-${video.id}`} vertical={video.short} />
                </div>
                <div className="p-3">
                  <h3 className="m-0 text-[20px] font-black leading-tight" style={DISPLAY}>
                    {video.title}
                  </h3>
                  <a
                    href={YOUTUBE_CHANNEL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-[12px] font-black text-[var(--ink)] underline underline-offset-2"
                    style={MONO}
                  >
                    {YOUTUBE_CHANNEL_HANDLE}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="secciones" className="px-4 sm:px-6 py-10 sm:py-14 scroll-mt-24">
        <div className="mx-auto max-w-[1100px]">
          <div className="sec-tag">{es ? 'Cómo funciona' : 'How it works'}</div>
          <h2 className="m-0 mb-4 text-3xl sm:text-5xl font-black leading-[0.95] uppercase" style={DISPLAY}>
            {es ? 'UN VÍDEO' : 'ONE VIDEO'}
            <br />
            <span className="hl">{es ? 'POR SECCIÓN' : 'PER SECTION'}</span>
          </h2>
          <p className="m-0 mb-6 max-w-[640px] text-[15px] leading-relaxed" style={MONO}>
            {es
              ? 'Cada parte de la web tiene su vídeo: un personaje del cómic te cuenta qué es y cómo se usa, con la página en pantalla. También sale arriba en cada sección. En el móvil en vertical se ve en vertical.'
              : 'Each part of the site has its video: a character from the comic tells you what it is and how to use it, with the page on screen. It also shows at the top of each section. On a phone held upright it plays vertical.'}
          </p>
          <GuideList lang={lang} guides={SECTION_GUIDES} />
        </div>
      </section>
    </div>
  )
}
