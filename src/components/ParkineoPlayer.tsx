'use client'

import { useEffect, useState } from 'react'
import CardThumbnail from '@/components/CardThumbnail'
import { buildSoundCloudVisualPlayerSrc, useSoundCloudExclusivePlayback } from '@/components/SoundCloudVisualEmbed'
import { extractYouTubeId, LazyYouTubeEmbed } from '@/components/YouTubeEmbed'
import {
  registerYouTubeEmbed,
  requestYouTubePlay,
  unregisterYouTubeEmbed,
} from '@/lib/youtube-play-coordinator'

export type ParkineoPlayable = {
  id: string
  title: string
  dj_name: string
  platform: 'youtube' | 'soundcloud' | 'mixcloud'
  embed_url: string | null
  video_url: string | null
  image_url: string | null
}

export default function ParkineoPlayer({ session }: { session: ParkineoPlayable }) {
  const ytId = session.platform === 'youtube' ? extractYouTubeId(session.video_url || session.embed_url) : null
  if (ytId) {
    return (
      <LazyYouTubeEmbed
        videoId={ytId}
        title={`${session.dj_name} — ${session.title}`}
        playSlotId={`parkineo-${session.id}`}
        nowPlaying={{
          title: session.title,
          artist: session.dj_name,
          artworkUrl: session.image_url || undefined,
          album: 'Parkineo',
        }}
      />
    )
  }
  if (session.platform === 'soundcloud' && session.embed_url) {
    return <SoundCloudPoster session={session} trackUrl={session.embed_url} />
  }
  if (session.platform === 'mixcloud' && (session.video_url || session.embed_url)) {
    return <MixcloudPoster session={session} feed={session.video_url || session.embed_url || ''} />
  }
  return <CardThumbnail src={session.image_url} alt={session.title} aspectClass="aspect-video" frameClass="border-0" />
}

function SoundCloudPoster({ session, trackUrl }: { session: ParkineoPlayable; trackUrl: string }) {
  const [mountIframe, setMountIframe] = useState(false)
  const slot = `parkineo-sc-${session.id}`
  const src = buildSoundCloudVisualPlayerSrc(trackUrl).replace('auto_play=false', 'auto_play=true')
  useSoundCloudExclusivePlayback(
    slot,
    slot,
    undefined,
    mountIframe,
    {
      title: session.title,
      artist: session.dj_name,
      artworkUrl: session.image_url || undefined,
      album: 'Parkineo',
    },
  )

  return (
    <div className="relative w-full shrink-0 overflow-hidden bg-[var(--ink)] aspect-video">
      {mountIframe ? (
        <iframe
          id={slot}
          title={session.title}
          src={src}
          allow="autoplay"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setMountIframe(true)}
          aria-label={session.title}
          className="group/pk absolute inset-0 h-full w-full cursor-pointer border-0 p-0 bg-[var(--ink)]"
        >
          <CardThumbnail src={session.image_url} alt="" heightClass="h-full" frameClass="border-0" sizes="(max-width: 640px) 100vw, 33vw" />
          <span className="absolute inset-0 bg-black/20 transition-colors group-hover/pk:bg-black/35" aria-hidden />
          <PlayMark color="#ff5500" />
        </button>
      )}
    </div>
  )
}

function MixcloudPoster({ session, feed }: { session: ParkineoPlayable; feed: string }) {
  const [on, setOn] = useState(false)
  const slot = `parkineo-mc-${session.id}`
  const src = `https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&autoplay=1&feed=${encodeURIComponent(feed)}`

  useEffect(() => {
    if (!on) return
    registerYouTubeEmbed(slot, () => setOn(false))
    return () => unregisterYouTubeEmbed(slot)
  }, [on, slot])

  return (
    <div className="relative w-full shrink-0 overflow-hidden bg-[var(--ink)] aspect-video">
      {on ? (
        <iframe
          title={session.title}
          src={src}
          allow="autoplay"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            requestYouTubePlay(slot)
            setOn(true)
          }}
          aria-label={session.title}
          className="group/pk absolute inset-0 h-full w-full cursor-pointer border-0 p-0 bg-[var(--ink)]"
        >
          <CardThumbnail src={session.image_url} alt="" heightClass="h-full" frameClass="border-0" sizes="(max-width: 640px) 100vw, 33vw" />
          <span className="absolute inset-0 bg-black/20 transition-colors group-hover/pk:bg-black/35" aria-hidden />
          <PlayMark color="#52aad8" />
        </button>
      )}
    </div>
  )
}

function PlayMark({ color }: { color: string }) {
  return (
    <span
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[58px] h-[40px] rounded-[10px] shadow-lg"
      style={{ background: color }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" aria-hidden>
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  )
}
