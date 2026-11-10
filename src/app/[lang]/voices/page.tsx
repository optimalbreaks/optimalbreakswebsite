import type { Metadata } from 'next'
import Link from 'next/link'
import { LazyYouTubeEmbed } from '@/components/YouTubeEmbed'
import {
  SCENE_VOICES,
  loadPodcastEpisodes,
  loadSceneVoiceVideos,
  loadVoicesAboutUs,
  type SceneVoiceLink,
} from '@/content/channels'
import type { Locale } from '@/lib/i18n-config'
import { staticPageMetadata } from '@/lib/seo'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/voices', 'voices')
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif" } as const

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

function formatDay(iso: string, lang: Locale) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' })
}

export default async function VoicesPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const es = lang === 'es'
  const [aboutUs, blocks] = await Promise.all([
    loadVoicesAboutUs(),
    Promise.all(
      SCENE_VOICES.map(async (voice) => ({
        voice,
        videos: await loadSceneVoiceVideos(voice),
        episodes: voice.podcastFeed ? await loadPodcastEpisodes(voice.podcastFeed) : [],
      })),
    ),
  ])

  const listeners = [
    {
      href: '/topalltimes',
      title: es ? 'Top histórico' : 'All-time top',
      text: es
        ? 'Lo hacen los «+» de quien escucha. Sin votos ni encuestas: lo que la gente guarda de verdad.'
        : 'Built from the listeners’ «+». No votes, no polls: what people really save.',
    },
    {
      href: '/topreleases',
      title: es ? 'Top novedades' : 'Top releases',
      text: es
        ? 'Lo que más se ha escuchado aquí cada mes y cada temporada.'
        : 'What was played most here each month and each season.',
    },
    {
      href: '/mi-cuenta/almas-gemelas',
      title: es ? 'Almas gemelas' : 'Soulmates',
      text: es
        ? 'Quién guarda los mismos temas que tú. Con cuenta.'
        : 'Who saves the same tracks as you. Needs an account.',
    },
    {
      href: '/parkineo',
      title: 'Parkineo',
      text: es
        ? 'Las sesiones de quien empieza a pinchar y aún no tiene ficha.'
        : 'Sessions from people who are starting to DJ and have no profile yet.',
    },
  ]

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-16 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1100px]">
          <div className="sec-tag">{es ? 'Voces · los que cuentan el break' : 'Voices · the people who tell the break'}</div>
          <h1 className="sec-title">
            {es ? 'EL BREAKBEAT NO ES' : 'BREAKBEAT IS NOT'}
            <br />
            <span className="hl">{es ? 'SOLO LA MÚSICA' : 'JUST THE MUSIC'}</span>
          </h1>
          <p
            className="m-0 max-w-[680px]"
            style={{ fontFamily: "'Special Elite', monospace", fontSize: 'clamp(17px, 2.2vw, 20px)', lineHeight: 1.6, color: 'var(--ink)' }}
          >
            {es
              ? 'El breakbeat son sus temas, sí. Pero también son quienes lo escuchan y quienes lo cuentan: los que montan un concurso para que un productor mejore su tema, los que pinchan en directo por Twitch y los que te enseñan las novedades de la semana a cámara. Algunos son artistas; aquí salen por el otro papel.'
              : 'Breakbeat is its tracks, yes. But it is also the people who listen and the people who tell it: those who run a contest so a producer can improve a track, those who DJ live on Twitch and those who show you the week’s releases to camera. Some are artists; here they appear for that other role.'}
          </p>
        </div>
      </section>

      <section className="px-4 sm:px-6 py-10 sm:py-14 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1100px]">
          <div className="sec-tag">{es ? '01 — La música' : '01 — The music'}</div>
          <p className="m-0 mb-4 max-w-[640px] text-[15px] leading-relaxed" style={MONO}>
            {es
              ? 'Los temas están en Tracks: las novedades de cada semana y el archivo por años.'
              : 'The tracks live in Tracks: each week’s new releases and the archive by year.'}
          </p>
          <Link
            href={`/${lang}/charts`}
            className="inline-flex min-h-[44px] items-center border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-4 text-[var(--ink)] no-underline shadow-[4px_4px_0_var(--ink)] hover:bg-[var(--red)] hover:text-white"
            style={{ ...DISPLAY, fontWeight: 900, fontSize: '13px', letterSpacing: '0.5px', textTransform: 'uppercase' }}
          >
            {es ? 'Ir a Tracks' : 'Go to Tracks'}
          </Link>
        </div>
      </section>

      <section className="px-4 sm:px-6 py-10 sm:py-14 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1100px]">
          <div className="sec-tag">{es ? '02 — Los oyentes' : '02 — The listeners'}</div>
          <h2 className="m-0 mb-6 text-3xl sm:text-5xl font-black leading-[0.95] uppercase" style={DISPLAY}>
            {es ? 'LA ESCENA' : 'THE SCENE'}
            <br />
            <span className="hl">{es ? 'ES QUIEN ESCUCHA' : 'IS WHO LISTENS'}</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {listeners.map((item) => (
              <Link
                key={item.href}
                href={`/${lang}${item.href}`}
                className="block border-[3px] border-[var(--ink)] bg-[var(--paper)] p-4 text-[var(--ink)] no-underline shadow-[4px_4px_0_var(--ink)] hover:bg-[var(--yellow)]"
              >
                <span className="block text-[18px] font-black leading-tight" style={DISPLAY}>
                  {item.title}
                </span>
                <span className="mt-2 block text-[13px] leading-relaxed" style={MONO}>
                  {item.text}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 py-10 sm:py-14 border-b-[5px] border-[var(--ink)]">
        <div className="mx-auto max-w-[1100px]">
          <div className="sec-tag">{es ? '03 — Los que lo cuentan' : '03 — The people who tell it'}</div>
          <h2 className="m-0 mb-6 text-3xl sm:text-5xl font-black leading-[0.95] uppercase" style={DISPLAY}>
            {es ? 'COMUNICADORES' : 'BREAKS'}
            <br />
            <span className="hl">{es ? 'DEL BREAK' : 'COMMUNICATORS'}</span>
          </h2>
          <div className="grid gap-8">
            {blocks.map(({ voice, videos, episodes }) => (
              <article
                key={voice.id}
                id={voice.id}
                className="scroll-mt-24 border-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[6px_6px_0_var(--ink)]"
              >
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                  {voice.imageUrl ? (
                    <img
                      src={voice.imageUrl}
                      alt={voice.name}
                      width={120}
                      height={120}
                      className="h-[96px] w-[96px] shrink-0 border-[3px] border-[var(--ink)] object-cover sm:h-[120px] sm:w-[120px]"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[11px] font-black tracking-[2px] uppercase" style={MONO}>
                      {voice.role[lang]}
                    </p>
                    <h3 className="m-0 mt-1 text-3xl sm:text-4xl font-black leading-none" style={DISPLAY}>
                      {voice.name}
                    </h3>
                    <p className="mt-2 mb-0 max-w-[700px] text-[14px] sm:text-[15px] leading-relaxed" style={MONO}>
                      {voice.text[lang]}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {voice.links.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex min-h-[40px] items-center gap-2 border-[3px] border-[var(--ink)] px-3 no-underline shadow-[3px_3px_0_var(--ink)] ${LINK_COLORS[link.kind]}`}
                          style={{ ...MONO, fontWeight: 900, fontSize: '12px' }}
                        >
                          <span className="uppercase tracking-[1px] opacity-80">{LINK_KIND[link.kind]}</span>
                          <span>{link.label}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 border-t-[3px] border-[var(--ink)] p-4 sm:grid-cols-3 sm:p-5">
                  {voice.formats.map((format) => (
                    <div key={format.name} className="border-l-[4px] border-[var(--red)] pl-3">
                      <p className="m-0 text-[15px] font-black" style={DISPLAY}>
                        {format.name}
                      </p>
                      <p className="mt-1 mb-0 text-[13px] leading-relaxed" style={MONO}>
                        {format.text[lang]}
                      </p>
                    </div>
                  ))}
                </div>

                {videos.length > 0 ? (
                  <div className="grid gap-4 border-t-[3px] border-[var(--ink)] p-4 sm:p-5 md:grid-cols-3">
                    {videos.map((video) => (
                      <div key={video.id} className="border-[3px] border-[var(--ink)] bg-[var(--paper)]">
                        <LazyYouTubeEmbed
                          videoId={video.id}
                          title={video.title}
                          playSlotId={`voice-${video.id}`}
                          vertical={video.short}
                        />
                        <p className="m-0 border-t-[3px] border-[var(--ink)] px-3 py-2 text-[12px] leading-snug" style={MONO}>
                          {video.title}
                          {video.published ? <span className="block opacity-60">{formatDay(video.published, lang)}</span> : null}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {episodes.length > 0 ? (
                  <ul className="m-0 list-none border-t-[3px] border-[var(--ink)] p-4 sm:p-5">
                    <li className="mb-2 text-[11px] font-black tracking-[2px]" style={MONO}>
                      {es ? 'ÚLTIMOS EPISODIOS DEL PODCAST' : 'LATEST PODCAST EPISODES'}
                    </li>
                    {episodes.map((episode) => (
                      <li key={episode.href} className="border-b border-dashed border-[var(--ink)] py-2 last:border-b-0">
                        <a
                          href={episode.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] font-black text-[var(--ink)] underline underline-offset-2 hover:text-[var(--red)]"
                          style={MONO}
                        >
                          {episode.title}
                        </a>
                        {episode.published ? (
                          <span className="ml-2 text-[12px] opacity-60" style={MONO}>
                            {formatDay(episode.published, lang)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {voice.artists.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-[var(--ink)] p-4 sm:p-5">
                    <span className="text-[11px] font-black tracking-[2px]" style={MONO}>
                      {es ? 'EN LA WEB' : 'ON THE SITE'}
                    </span>
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
            ))}
          </div>
        </div>
      </section>

      {aboutUs.length > 0 ? (
        <section className="px-4 sm:px-6 py-10 sm:py-14 border-b-[5px] border-[var(--ink)]">
          <div className="mx-auto max-w-[1100px]">
            <div className="sec-tag">{es ? 'Hablan de nosotros' : 'They talk about us'}</div>
            <h2 className="m-0 mb-6 text-3xl sm:text-5xl font-black leading-[0.95] uppercase" style={DISPLAY}>
              OPTIMAL BREAKS
              <br />
              <span className="hl">{es ? 'EN SUS CANALES' : 'ON THEIR CHANNELS'}</span>
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {aboutUs.map((video) => (
                <div key={video.id} className="border-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[4px_4px_0_var(--ink)]">
                  <LazyYouTubeEmbed videoId={video.id} title={video.title} playSlotId={`voice-about-${video.id}`} vertical={video.short} />
                  <p className="m-0 border-t-[3px] border-[var(--ink)] px-3 py-2 text-[12px] leading-snug" style={MONO}>
                    {video.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-4 sm:px-6 py-10 sm:py-14">
        <div className="mx-auto max-w-[1100px]">
          <p className="m-0 max-w-[640px] text-[15px] leading-relaxed" style={MONO}>
            {es
              ? '¿Tienes un programa, un canal o un podcast de breakbeat? Escríbenos por Instagram a @optimal.breaks y te sumamos.'
              : 'Do you run a breakbeat show, channel or podcast? Message us on Instagram at @optimal.breaks and we will add you.'}
          </p>
        </div>
      </section>
    </div>
  )
}
