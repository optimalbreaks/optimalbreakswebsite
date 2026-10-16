'use client'

// Reproductor de /comic: vertical en móvil en vertical, horizontal en el resto.
// Al girar el móvil o cambiar idioma/formato sigue por el mismo segundo.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Locale } from '@/lib/i18n-config'
import { COMIC_COPY, COMIC_EPISODES, comicPosterUrl, comicVideoUrl } from '@/content/comic'
import { broadcastPlaybackClaim, stopAllYouTube, subscribeYouTubePlay } from '@/lib/youtube-play-coordinator'

type Fmt = 'auto' | 'h' | 'v'
const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 900px)'

function subscribePortrait(cb: () => void) {
  const mq = window.matchMedia(PORTRAIT_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getPortrait = () => window.matchMedia(PORTRAIT_QUERY).matches
const getPortraitServer = () => false

export default function ComicPlayer({ lang }: { lang: Locale }) {
  const copy = COMIC_COPY[lang]
  const t = copy.player
  const [ep, setEp] = useState(COMIC_EPISODES.length - 1)
  const [videoLang, setVideoLang] = useState<Locale>(lang)
  const [fmt, setFmt] = useState<Fmt>('auto')
  const portrait = useSyncExternalStore(subscribePortrait, getPortrait, getPortraitServer)
  const vertical = fmt === 'v' || (fmt === 'auto' && portrait)

  const e = COMIC_EPISODES[ep]
  const base = e.file[videoLang]
  const src = comicVideoUrl(base, vertical)

  const videoRef = useRef<HTMLVideoElement>(null)

  // Una sola fuente audible: al sonar el episodio se callan charts, mixes y YouTube,
  // y si otra cosa reclama el audio este vídeo se pausa.
  useEffect(() => {
    const pause = () => { videoRef.current?.pause() }
    const onClaim = (e: Event) => {
      const src = (e as CustomEvent<{ source?: string }>).detail?.source
      if (src !== 'comic') pause()
    }
    const unsub = subscribeYouTubePlay((id) => { if (id) pause() })
    window.addEventListener('ob-audio-claim', onClaim)
    window.addEventListener('ob-audio-foreign', pause)
    return () => {
      unsub()
      window.removeEventListener('ob-audio-claim', onClaim)
      window.removeEventListener('ob-audio-foreign', pause)
    }
  }, [])
  // Última posición conocida del vídeo en pantalla (se actualiza con sus eventos).
  const pos = useRef({ time: 0, playing: false })
  const shownEp = useRef(ep)

  // Nueva fuente: si es el mismo episodio (idioma/formato/giro), seguir por el mismo segundo.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const sameEpisode = shownEp.current === ep
    shownEp.current = ep
    const { time, playing } = pos.current
    if (!sameEpisode) {
      pos.current = { time: 0, playing: false }
      v.play().catch(() => {})
      return
    }
    if (!time) return
    const onMeta = () => {
      v.currentTime = time
      if (playing) v.play().catch(() => {})
    }
    v.addEventListener('loadedmetadata', onMeta, { once: true })
    return () => v.removeEventListener('loadedmetadata', onMeta)
  }, [src, ep])

  return (
    <div className="cmc-theatre">
      <div>
        <div className={`cmc-screen${vertical ? ' is-v' : ''}`}>
          <video
            ref={videoRef}
            key={src}
            src={src}
            poster={comicPosterUrl(base, vertical)}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={(ev) => { pos.current.time = ev.currentTarget.currentTime }}
            onPlay={() => {
              pos.current.playing = true
              broadcastPlaybackClaim()
              stopAllYouTube()
              window.dispatchEvent(new CustomEvent('ob-audio-claim', { detail: { source: 'comic' } }))
            }}
            onPause={() => { pos.current.playing = false }}
          />
        </div>
        <div className="cmc-now">
          <h3>{e.title[lang]}</h3>
          <p className="cmc-meta">
            {t.episode} {ep + 1} · {e.duration} · {t.music}: {e.music}
          </p>
          <p>{e.text[lang]}</p>
          <div className="cmc-controls">
            <div className="cmc-seg" role="group" aria-label={t.language}>
              {(['es', 'en'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={videoLang === l} onClick={() => setVideoLang(l)}>
                  {l === 'es' ? 'Español' : 'English'}
                </button>
              ))}
            </div>
            <div className="cmc-seg" role="group" aria-label={t.format}>
              {([['auto', t.auto], ['h', t.horizontal], ['v', t.vertical]] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={fmt === k} onClick={() => setFmt(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="cmc-list" aria-label={t.list}>
        {COMIC_EPISODES.map((x, i) => (
          <button key={x.file.es} type="button" className="cmc-ep" aria-current={i === ep} onClick={() => setEp(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={comicPosterUrl(x.file[lang], false)} alt="" loading="lazy" width={120} height={68} />
            <span>
              <b>{i + 1}. {x.title[lang]}</b>
              <small>{x.duration} · {x.music}</small>
            </span>
          </button>
        ))}
        <div className="cmc-soon">
          <b>{copy.soonTitle}</b>
          {copy.soonText}
        </div>
      </div>
    </div>
  )
}
