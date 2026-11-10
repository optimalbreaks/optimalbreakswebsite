import type { Metadata } from 'next'
import Link from 'next/link'
import { LazyYouTubeEmbed, YouTubeClipGrid } from '@/components/YouTubeEmbed'
import {
  SCENE_VOICES,
  loadPodcastEpisodes,
  loadSceneVoiceVideos,
  loadVoicesAboutUs,
  type SceneVoice,
  type SceneVoiceLink,
  type SceneVoiceVideo,
} from '@/content/channels'
import type { Locale } from '@/lib/i18n-config'
import { sectionOgImageAlt, sectionOgImagePath } from '@/lib/og-section-images'
import { staticPageMetadata } from '@/lib/seo'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/voices', 'voices', {
    ogImagePath: sectionOgImagePath('voices', lang),
    ogImageAlt: sectionOgImageAlt('voices', lang),
    extraKeywords: ['ONDE BASS', 'Kultura Breakz', 'Onda Canalla', 'Dirty Kitchen Rave', 'PEPINARDOS'],
  })
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif", fontWeight: 900, letterSpacing: '1px', textTransform: 'uppercase' } as const
const ELITE = { fontFamily: "'Special Elite', monospace" } as const

const BUTTON =
  'inline-block border-[3px] border-[var(--ink)] px-5 py-3 no-underline shadow-[4px_4px_0_var(--ink)] transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_var(--ink)]'

/** Fondo y texto de cada color de tarjeta. Amarillo y ácido llevan tinta; el resto, blanco. */
const ACCENT: Record<SceneVoice['accent'], { bg: string; fg: string; border: string }> = {
  red: { bg: 'bg-[var(--red)]', fg: 'text-white', border: 'border-[var(--red)]' },
  yellow: { bg: 'bg-[var(--yellow)]', fg: 'text-[var(--ink)]', border: 'border-[var(--yellow)]' },
  orange: { bg: 'bg-[var(--orange)]', fg: 'text-white', border: 'border-[var(--orange)]' },
  uv: { bg: 'bg-[var(--uv)]', fg: 'text-white', border: 'border-[var(--uv)]' },
  acid: { bg: 'bg-[var(--acid)]', fg: 'text-[var(--ink)]', border: 'border-[var(--acid)]' },
  cyan: { bg: 'bg-[var(--cyan)]', fg: 'text-white', border: 'border-[var(--cyan)]' },
  pink: { bg: 'bg-[var(--pink)]', fg: 'text-white', border: 'border-[var(--pink)]' },
  blue: { bg: 'bg-[var(--blue)]', fg: 'text-white', border: 'border-[var(--blue)]' },
}

const LINK_COLORS: Record<SceneVoiceLink['kind'], string> = {
  youtube: 'bg-[#f00] text-white',
  twitch: 'bg-[#9146ff] text-white',
  instagram: 'bg-[#e1306c] text-white',
  podcast: 'bg-[var(--yellow)] text-[var(--ink)]',
  web: 'bg-[var(--paper)] text-[var(--ink)]',
}

const LINK_KIND: Record<SceneVoiceLink['kind'], string> = {
  youtube: 'YouTube',
  twitch: 'Twitch',
  instagram: 'Instagram',
  podcast: 'Podcast',
  web: 'Web',
}

const TILT = ['-rotate-[3deg]', 'rotate-[2deg]', '-rotate-[1deg]', 'rotate-[3deg]', '-rotate-[2deg]', 'rotate-[1deg]']

function formatDay(iso: string, lang: Locale) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' })
}

function youTubeThumb(id: string) {
  return `/api/og/image-proxy?src=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}`
}

/** Retrato de la ficha o logo; si no hay, la portada de su último vídeo. */
function coverFor(voice: SceneVoice, videos: SceneVoiceVideo[]) {
  if (voice.imageUrl) return voice.imageUrl
  const first = videos[0]
  return first ? youTubeThumb(first.id) : null
}

export default async function VoicesPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const es = lang === 'es'
  const [aboutUs, blocks] = await Promise.all([
    loadVoicesAboutUs(),
    Promise.all(
      SCENE_VOICES.map(async (voice) => {
        const videos = await loadSceneVoiceVideos(voice)
        return {
          voice,
          videos,
          episodes: voice.podcastFeed ? await loadPodcastEpisodes(voice.podcastFeed) : [],
          cover: coverFor(voice, videos),
        }
      }),
    ),
  ])

  const facts = es
    ? [`${SCENE_VOICES.length} voces`, 'Vídeos al día', 'YouTube · Twitch · Instagram · Podcast']
    : [`${SCENE_VOICES.length} voices`, 'Videos kept up to date', 'YouTube · Twitch · Instagram · Podcast']

  const listeners = [
    { href: '/topalltimes', label: es ? 'Top histórico' : 'All-time top' },
    { href: '/topreleases', label: es ? 'Top novedades' : 'Top releases' },
    { href: '/mi-cuenta/almas-gemelas', label: es ? 'Almas gemelas' : 'Soulmates' },
    { href: '/parkineo', label: 'Parkineo' },
  ]

  const pillars = [
    {
      n: '01',
      title: es ? 'La música' : 'The music',
      text: es
        ? 'Los temas: las novedades de cada semana y el archivo por años. Es donde empieza todo.'
        : 'The tracks: each week’s new releases and the archive by year. That is where it all starts.',
      links: [{ href: `/${lang}/charts`, label: es ? 'Ir a Tracks →' : 'Go to Tracks →' }],
    },
    {
      n: '02',
      title: es ? 'Los oyentes' : 'The listeners',
      text: es
        ? 'Los rankings los hacen los «+» y las escuchas de quien entra. Sin votos ni encuestas: lo que la gente guarda de verdad.'
        : 'The rankings come from the «+» and the plays of whoever comes in. No votes, no polls: what people really save.',
      links: listeners.map((item) => ({ href: `/${lang}${item.href}`, label: item.label })),
    },
    {
      n: '03',
      title: es ? 'Los que lo cuentan' : 'The people who tell it',
      text: es
        ? 'Programas, concursos, directos y reels. Algunos son artistas; aquí salen por el otro papel: el de contarlo.'
        : 'Shows, contests, live streams and reels. Some are artists; here they appear for that other role: telling it.',
      links: [{ href: '#comunicadores', label: es ? 'Ver las voces ↓' : 'See the voices ↓' }],
    },
  ]

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-16 border-b-[5px] border-[var(--ink)] overflow-hidden">
        <div className="mx-auto max-w-[1280px] grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
          <div>
            <div className="sec-tag">{es ? 'Voces · los que cuentan el break' : 'Voices · the people who tell the break'}</div>
            <h1 className="sec-title">
              {es ? 'EL BREAKBEAT NO ES' : 'BREAKBEAT IS NOT'}
              <br />
              <span className="hl">{es ? 'SOLO LA MÚSICA' : 'JUST THE MUSIC'}</span>
            </h1>
            <p className="m-0 max-w-[620px]" style={{ ...ELITE, fontSize: 'clamp(17px, 2.2vw, 20px)', lineHeight: 1.6, color: 'var(--ink)' }}>
              {es
                ? 'Son sus temas, sí. Pero también quienes lo escuchan y quienes lo cuentan: el que monta un concurso para que un productor mejore su tema, el que pincha en directo por Twitch y el que te enseña las novedades de la semana a cámara.'
                : 'It is the tracks, yes. But it is also the people who listen and the people who tell it: whoever runs a contest so a producer can improve a track, whoever DJs live on Twitch and whoever shows you the week’s releases to camera.'}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#comunicadores" className={`${BUTTON} bg-[var(--red)] text-white`} style={{ ...DISPLAY, fontSize: '14px' }}>
                {es ? 'Ver las voces ↓' : 'See the voices ↓'}
              </a>
              {aboutUs.length > 0 ? (
                <a href="#hablan-de-nosotros" className={`${BUTTON} bg-[var(--yellow)] text-[var(--ink)]`} style={{ ...DISPLAY, fontSize: '14px' }}>
                  {es ? 'Hablan de nosotros ↓' : 'They talk about us ↓'}
                </a>
              ) : null}
              <a href="#sumate" className={`${BUTTON} bg-[var(--paper)] text-[var(--ink)]`} style={{ ...DISPLAY, fontSize: '14px' }}>
                {es ? 'Sumar mi canal ↓' : 'Add my channel ↓'}
              </a>
            </div>
            <ul className="mt-6 mb-0 p-0 list-none flex flex-wrap gap-2">
              {facts.map((fact) => (
                <li
                  key={fact}
                  className="border-2 border-[var(--ink)] bg-[var(--yellow)] px-2 py-1"
                  style={{ ...MONO, fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}
                >
                  ✓ {fact}
                </li>
              ))}
            </ul>
          </div>

          <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 sm:gap-5">
            {blocks.map(({ voice, cover }, index) => {
              const accent = ACCENT[voice.accent]
              return (
                <li key={voice.id} className={`${TILT[index % TILT.length]} transition-transform hover:rotate-0 hover:scale-[1.04]`}>
                  <a href={`#${voice.id}`} className="relative block border-[3px] border-[var(--ink)] bg-white p-2 pb-1 text-[var(--ink)] no-underline shadow-[5px_5px_0_var(--ink)]">
                    {index % 2 === 0 ? (
                      <span aria-hidden="true" className="absolute -top-3 left-1/2 z-[1] h-5 w-16 -translate-x-1/2 -rotate-3 bg-[var(--tape)]" />
                    ) : null}
                    <span className={`block aspect-square overflow-hidden border-2 border-[var(--ink)] ${accent.bg}`}>
                      {cover ? (
                        <img src={cover} alt="" width={240} height={240} loading="lazy" className="block h-full w-full object-cover" />
                      ) : (
                        <span className={`flex h-full w-full items-center justify-center ${accent.fg}`} style={{ ...DISPLAY, fontSize: '28px' }}>
                          {voice.name.slice(0, 2)}
                        </span>
                      )}
                    </span>
                    <span className="block truncate pt-1 text-center" style={{ ...DISPLAY, fontSize: '12px' }}>
                      {voice.name}
                    </span>
                    <span className="block truncate text-center text-[10px] opacity-70" style={MONO}>
                      {voice.badge[lang]}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="bg-[var(--ink)] px-4 sm:px-6 py-12 sm:py-16 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1280px]">
          <h2 className="m-0 mb-8 text-[var(--yellow)]" style={{ ...DISPLAY, fontSize: 'clamp(30px, 5vw, 52px)', lineHeight: 0.95 }}>
            {es ? 'El break son tres cosas' : 'Breaks are three things'}
          </h2>
          <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
            {pillars.map((pillar) => (
              <li key={pillar.n} className="flex flex-col border-[3px] border-[var(--paper)] p-4 sm:p-5">
                <div className="flex items-baseline gap-3">
                  <span className="text-[var(--red)]" style={{ ...DISPLAY, fontSize: '34px', lineHeight: 1 }}>
                    {pillar.n}
                  </span>
                  <span className="text-[var(--paper)]" style={{ ...DISPLAY, fontSize: '17px' }}>
                    {pillar.title}
                  </span>
                </div>
                <p className="mt-3 mb-4 flex-1 text-[14px] leading-relaxed text-[var(--paper)]" style={MONO}>
                  {pillar.text}
                </p>
                <div className="flex flex-wrap gap-2">
                  {pillar.links.map((link) =>
                    link.href.startsWith('#') ? (
                      <a
                        key={link.href}
                        href={link.href}
                        className="border-2 border-[var(--yellow)] bg-[var(--yellow)] px-2 py-1 text-[var(--ink)] no-underline hover:bg-[var(--red)] hover:text-white"
                        style={{ ...MONO, fontSize: '12px', fontWeight: 700 }}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="border-2 border-[var(--paper)] px-2 py-1 text-[var(--paper)] no-underline hover:bg-[var(--yellow)] hover:text-[var(--ink)]"
                        style={{ ...MONO, fontSize: '12px', fontWeight: 700 }}
                      >
                        {link.label}
                      </Link>
                    ),
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="comunicadores" className="scroll-mt-24 px-4 sm:px-6 py-12 sm:py-16 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1280px]">
          <div className="sec-tag">{es ? 'Los que lo cuentan' : 'The people who tell it'}</div>
          <h2 className="sec-title">
            {es ? 'COMUNICADORES' : 'BREAKS'}
            <br />
            <span className="hl">{es ? 'DEL BREAK' : 'COMMUNICATORS'}</span>
          </h2>
          <nav aria-label={es ? 'Voces' : 'Voices'} className="mb-10 flex flex-wrap gap-2">
            {SCENE_VOICES.map((voice) => {
              const accent = ACCENT[voice.accent]
              return (
                <a
                  key={voice.id}
                  href={`#${voice.id}`}
                  className={`border-[3px] border-[var(--ink)] px-3 py-2 no-underline shadow-[3px_3px_0_var(--ink)] hover:-translate-y-[1px] ${accent.bg} ${accent.fg}`}
                  style={{ ...DISPLAY, fontSize: '12px' }}
                >
                  {voice.name}
                </a>
              )
            })}
          </nav>

          <div className="grid gap-12">
            {blocks.map(({ voice, videos, episodes, cover }) => {
              const accent = ACCENT[voice.accent]
              return (
                <article key={voice.id} id={voice.id} className="scroll-mt-24 border-4 border-[var(--ink)] bg-[var(--paper)] shadow-[8px_8px_0_var(--ink)]">
                  <header className={`relative flex flex-col gap-4 border-b-4 border-[var(--ink)] p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6 ${accent.bg} ${accent.fg}`}>
                    <span
                      className="absolute -top-4 right-4 rotate-[4deg] border-[3px] border-[var(--ink)] bg-[var(--ink)] px-3 py-1 text-[var(--yellow)] shadow-[3px_3px_0_var(--paper)]"
                      style={{ ...DISPLAY, fontSize: '11px' }}
                    >
                      {voice.badge[lang]}
                    </span>
                    {cover ? (
                      <img
                        src={cover}
                        alt={voice.name}
                        width={140}
                        height={140}
                        loading="lazy"
                        className="h-[104px] w-[104px] shrink-0 border-4 border-[var(--ink)] bg-[var(--ink)] object-cover shadow-[4px_4px_0_var(--ink)] sm:h-[140px] sm:w-[140px]"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="m-0 text-[11px] font-black tracking-[2px] uppercase opacity-90" style={MONO}>
                        {voice.role[lang]}
                      </p>
                      <h3 className="m-0 mt-1 break-words" style={{ ...DISPLAY, fontSize: 'clamp(30px, 6vw, 56px)', lineHeight: 0.95, letterSpacing: '0' }}>
                        {voice.name}
                      </h3>
                    </div>
                  </header>

                  <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <p className="m-0 text-[15px] sm:text-[16px] leading-relaxed" style={MONO}>
                        {voice.text[lang]}
                      </p>
                      {voice.quote ? (
                        <blockquote className={`relative mx-0 mt-5 mb-0 border-l-[6px] bg-[var(--paper-dark)] py-4 pr-4 pl-12 ${accent.border}`}>
                          <span aria-hidden="true" className="absolute top-1 left-3 text-[var(--red)]" style={{ ...DISPLAY, fontSize: '44px', lineHeight: 1 }}>
                            “
                          </span>
                          <p className="m-0 text-[16px] sm:text-[18px] leading-snug" style={ELITE}>
                            {voice.quote.text}
                          </p>
                          <footer className="mt-2 text-[11px] font-black tracking-[1.5px] uppercase opacity-70" style={MONO}>
                            — {voice.quote.source}
                          </footer>
                        </blockquote>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <ol className="m-0 grid list-none gap-3 p-0">
                        {voice.formats.map((format, index) => (
                          <li key={format.name} className="flex gap-3 border-[3px] border-[var(--ink)] bg-white p-3">
                            <span className="text-[var(--red)]" style={{ ...DISPLAY, fontSize: '22px', lineHeight: 1 }}>
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="min-w-0">
                              <span className="block" style={{ ...DISPLAY, fontSize: '14px' }}>
                                {format.name}
                              </span>
                              <span className="mt-1 block text-[13px] leading-relaxed" style={MONO}>
                                {format.text[lang]}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {voice.links.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex min-h-[40px] items-center gap-2 border-[3px] border-[var(--ink)] px-3 no-underline shadow-[3px_3px_0_var(--ink)] transition-transform hover:-translate-y-[2px] ${LINK_COLORS[link.kind]}`}
                            style={{ ...MONO, fontWeight: 900, fontSize: '12px' }}
                          >
                            <span className="uppercase tracking-[1px] opacity-80">{LINK_KIND[link.kind]}</span>
                            <span>{link.label}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>

                  {videos.length > 0 ? (
                    <div className="border-t-4 border-[var(--ink)] bg-[var(--ink)] p-4 sm:p-6">
                      <p className="m-0 mb-3 text-[11px] font-black tracking-[2px] text-[var(--yellow)]" style={MONO}>
                        {voice.videosKicker
                          ? `▶ ${voice.videosKicker[lang]}`
                          : es
                            ? '▶ LO ÚLTIMO EN SU CANAL'
                            : '▶ LATEST ON THE CHANNEL'}
                      </p>
                      {voice.youtubePlaylistId ? (
                        <YouTubeClipGrid
                          lang={lang}
                          clips={videos.map((video) => ({
                            id: video.id,
                            title: video.title,
                            when: video.published ? formatDay(video.published, lang) : '',
                          }))}
                        />
                      ) : (
                        <div className="grid gap-4 md:grid-cols-3">
                          {videos.map((video) => (
                            <div key={video.id} className="border-[3px] border-[var(--paper)] bg-[var(--paper)]">
                              <LazyYouTubeEmbed videoId={video.id} title={video.title} playSlotId={`voice-${video.id}`} />
                              <p className="m-0 border-t-[3px] border-[var(--ink)] px-3 py-2 text-[12px] leading-snug" style={MONO}>
                                <span className="line-clamp-2">{video.title}</span>
                                {video.published ? <span className="mt-1 block font-bold opacity-60">{formatDay(video.published, lang)}</span> : null}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {episodes.length > 0 ? (
                    <div className="border-t-4 border-[var(--ink)] bg-[var(--ink)] p-4 sm:p-6">
                      <p className="m-0 mb-3 text-[11px] font-black tracking-[2px] text-[var(--yellow)]" style={MONO}>
                        {es ? '🎧 ÚLTIMOS EPISODIOS DEL PODCAST' : '🎧 LATEST PODCAST EPISODES'}
                      </p>
                      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
                        {episodes.map((episode) => (
                          <li key={episode.href}>
                            <a
                              href={episode.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-full items-start gap-3 border-[3px] border-[var(--paper)] p-3 text-[var(--paper)] no-underline hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--red)] text-white" aria-hidden="true">
                                ▶
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[13px] font-bold leading-snug" style={MONO}>
                                  {episode.title}
                                </span>
                                {episode.published ? (
                                  <span className="mt-1 block text-[11px] opacity-70" style={MONO}>
                                    {formatDay(episode.published, lang)}
                                  </span>
                                ) : null}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {voice.artists.length > 0 || voice.label ? (
                    <div className="flex flex-wrap items-center gap-2 border-t-4 border-[var(--ink)] p-4 sm:p-6">
                      <span className="mr-1 text-[11px] font-black tracking-[2px]" style={MONO}>
                        {es ? 'EN LA WEB' : 'ON THE SITE'}
                      </span>
                      {voice.label ? (
                        <Link
                          href={`/${lang}/labels/${voice.label.slug}`}
                          className="inline-flex min-h-[36px] items-center gap-2 border-[2px] border-[var(--ink)] bg-[var(--ink)] px-2 text-[var(--paper)] no-underline hover:bg-[var(--red)]"
                          style={{ ...MONO, fontSize: '12px' }}
                        >
                          <strong>{voice.label.name}</strong>
                          <span className="opacity-75">· {es ? 'sello' : 'label'}</span>
                        </Link>
                      ) : null}
                      {voice.artists.map((artist) => (
                        <Link
                          key={artist.slug}
                          href={`/${lang}/artists/${artist.slug}`}
                          className="inline-flex min-h-[36px] items-center gap-2 border-[2px] border-[var(--ink)] bg-[var(--yellow)] px-2 text-[var(--ink)] no-underline hover:bg-[var(--red)] hover:text-white"
                          style={{ ...MONO, fontSize: '12px' }}
                        >
                          <strong>{artist.name}</strong>
                          {artist.note ? <span className="opacity-75">· {artist.note[lang]}</span> : null}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {aboutUs.length > 0 ? (
        <section id="hablan-de-nosotros" className="scroll-mt-24 px-4 sm:px-6 py-12 sm:py-16 border-b-[5px] border-[var(--ink)]">
          <div className="mx-auto max-w-[1280px]">
            <div className="sec-tag">{es ? 'Hablan de nosotros' : 'They talk about us'}</div>
            <h2 className="sec-title">
              OPTIMAL BREAKS
              <br />
              <span className="hl">{es ? 'EN SUS CANALES' : 'ON THEIR CHANNELS'}</span>
            </h2>
            <div className="grid gap-5 md:grid-cols-3">
              {aboutUs.map((video) => (
                <div key={video.id} className="border-4 border-[var(--ink)] bg-[var(--paper)] shadow-[6px_6px_0_var(--ink)]">
                  <LazyYouTubeEmbed videoId={video.id} title={video.title} playSlotId={`voice-about-${video.id}`} />
                  <p className="m-0 border-t-[3px] border-[var(--ink)] px-3 py-2 text-[12px] leading-snug" style={MONO}>
                    {video.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="sumate" className="scroll-mt-24 px-4 sm:px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-[1280px]">
          <div className="relative border-4 border-[var(--ink)] bg-[var(--yellow)] p-6 shadow-[8px_8px_0_var(--ink)] sm:p-10">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-3" style={{ background: 'var(--warn-stripe)' }} />
            <h2 className="m-0 mt-2" style={{ ...DISPLAY, fontSize: 'clamp(26px, 4.5vw, 46px)', lineHeight: 0.95 }}>
              {es ? '¿Tú también lo cuentas?' : 'Do you tell it too?'}
            </h2>
            <p className="mt-4 mb-6 max-w-[640px] text-[15px] sm:text-[16px] leading-relaxed" style={MONO}>
              {es
                ? 'Si tienes un programa, un canal, un podcast o una serie de reels de breakbeat, escríbenos y te sumamos. Tus vídeos salen aquí solos en cuanto los subes.'
                : 'If you run a breakbeat show, channel, podcast or reel series, message us and we will add you. Your videos show up here on their own as soon as you post them.'}
            </p>
            <a
              href="https://www.instagram.com/optimal.breaks/"
              target="_blank"
              rel="noopener noreferrer"
              className={`${BUTTON} bg-[#e1306c] text-white`}
              style={{ ...DISPLAY, fontSize: '14px' }}
            >
              {es ? 'Escríbenos a @optimal.breaks' : 'Message @optimal.breaks'}
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
