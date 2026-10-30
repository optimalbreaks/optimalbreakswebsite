// ============================================
// OPTIMAL BREAKS — Share Buttons
// X/Twitter, WhatsApp, Facebook, Copy Link
// Fanzine aesthetic
// ============================================

'use client'

import { useRef, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import VideoShareButtons from '@/components/VideoShareButtons'
import {
  buildAbsoluteShareUrl,
  buildMixVideoCaption,
  copyShareLink,
  openFacebookShareDialog,
} from '@/lib/share-track'
import { aiShareCaption, buildPageVideoCaption, type SharePlatform } from '@/lib/share-caption'
import type { PageReelInput } from '@/lib/page-reel'
import type { ReelData, ReelFormat } from '@/lib/reel-renderer'
import type { ShareAudioSegment } from '@/lib/share-audio'
type BlogReelInput = Extract<PageReelInput, { kind: 'blog' }>
/** JSON de `/api/og/story?play=mix:…&format=json`. */
type SetVideoData = ReelData & { eventName?: string | null; place?: string | null }

interface ShareButtonsProps {
  url: string
  title: string
  lang: string
  /** Path corto (p. ej. `/a/ctrl-z`) para redes que limitan la longitud del enlace (Instagram). */
  shortUrl?: string
  /**
   * Valor `play=` de `/api/og/story` (p. ej. `mix:<slug>`). Admins y artistas
   * con ficha reclamada ven IG (Story), R (reel vertical) y F (vídeo horizontal).
   */
  storyPlay?: string
  /**
   * Artículo del blog: datos del vídeo de página (`page-reel.ts`). Solo admins
   * ven entonces los botones R y F del artículo.
   */
  pageReel?: BlogReelInput
}

export default function ShareButtons({ url, title, lang, shortUrl, storyPlay, pageReel }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)
  const [copiedShort, setCopiedShort] = useState(false)
  const [storyState, setStoryState] = useState<'idle' | 'busy' | 'done'>('idle')
  const { isAdmin, isClaimedArtist } = useAuth()
  const canPromo = isAdmin || isClaimedArtist
  const es = lang === 'es'
  const fullUrl = buildAbsoluteShareUrl(url)
  const fullShortUrl = shortUrl ? buildAbsoluteShareUrl(shortUrl) : null
  const encodedUrl = encodeURIComponent(fullUrl)
  const encodedTitle = encodeURIComponent(title)

  const shareLinks = [
    {
      name: 'X',
      href: `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      icon: '𝕏',
    },
    {
      name: 'WhatsApp',
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
      icon: 'WA',
    },
    {
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: 'FB',
    },
  ]

  const copyLink = async () => {
    const ok = await copyShareLink(fullUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const copyShort = async () => {
    if (!fullShortUrl) return
    const ok = await copyShareLink(fullShortUrl)
    if (ok) {
      setCopiedShort(true)
      setTimeout(() => setCopiedShort(false), 2000)
    }
  }

  const shareStory = async () => {
    if (!storyPlay || storyState === 'busy') return
    setStoryState('busy')
    try {
      await copyShareLink(fullUrl)
      const params = new URLSearchParams({ play: storyPlay, lang })
      const res = await fetch(`/api/og/story?${params.toString()}`)
      if (!res.ok) throw new Error(`story ${res.status}`)
      const blob = await res.blob()
      const file = new File([blob], 'optimal-breaks-story.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title })
        } catch { /* user cancelled */ }
      } else {
        const href = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = href
        a.download = 'optimal-breaks-story.png'
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(href)
      }
      setStoryState('done')
      setTimeout(() => setStoryState('idle'), 1800)
    } catch {
      setStoryState('idle')
    }
  }

  /** Datos de la sesión para los vídeos (en inglés, como los de los temas); una sola petición para R y F. */
  const setDataRef = useRef<Promise<SetVideoData> | null>(null)
  const getSetData = () => {
    if (!setDataRef.current) {
      const params = new URLSearchParams({ play: storyPlay as string, lang: 'en', format: 'json' })
      setDataRef.current = fetch(`/api/og/story?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) throw new Error(`video data ${res.status}`)
          return { ...(await res.json()), lang: 'en' as const } as SetVideoData
        })
        .catch((e) => {
          setDataRef.current = null
          throw e
        })
    }
    return setDataRef.current
  }

  /** R/F: sesión (`storyPlay` mix:…) o artículo del blog (`pageReel`). */
  const makeVideo = async (format: ReelFormat, onProgress: (r: number) => void, audio: ShareAudioSegment | null) => {
    if (pageReel) {
      const { renderPageReel } = await import('@/lib/page-reel')
      return renderPageReel(pageReel, format, onProgress, audio)
    }
    const data = await getSetData()
    const { renderReel } = await import('@/lib/reel-renderer')
    return renderReel(data, { format, onProgress })
  }

  const makeCaption = async (platform: SharePlatform) => {
    if (pageReel?.agenda) {
      const a = pageReel.agenda
      const shown = a.events.length + a.extra
      return aiShareCaption({
        kind: 'events',
        platform,
        lang,
        url: fullUrl,
        fallback: (l) =>
          buildPageVideoCaption(
            'events',
            { count: shown, weekLabel: `${a.from} — ${a.until}`, first: a.events[0]?.name },
            { lang: l, url: fullUrl, platform },
          ),
        context: {
          hook: a.es
            ? 'Eventos de los próximos 14 días, te los vas a perder'
            : "Events for the next 14 days — you're gonna miss them",
          title: pageReel.title,
          from: a.from,
          until: a.until,
          count: shown,
          extra: a.extra,
          events: a.events.slice(0, 18).map((e) => ({
            name: e.name,
            date: e.date,
            place: e.place,
            lineup: e.lineup.slice(0, 6),
          })),
        },
      })
    }
    if (pageReel?.fortnight) {
      const f = pageReel.fortnight
      const name = (t?: { title: string; artists: string }) => (t ? `${t.title} — ${t.artists}` : undefined)
      return aiShareCaption({
        kind: 'digest',
        platform,
        lang,
        url: fullUrl,
        fallback: (l) =>
          buildPageVideoCaption(
            'digest',
            {
              // El título del artículo solo existe en el idioma de la página.
              title: l === lang ? pageReel.title : undefined,
              period: f.period,
              weekLabel: `${f.from} — ${f.until}`,
              count: f.totals.tracks,
              artists: f.totals.artists,
              labels: f.totals.labels,
              topPlayed: name(f.played[0]),
              topSaved: name(f.voted[0]),
              bpm: f.bpm,
            },
            { lang: l, url: fullUrl, platform },
          ),
        context: {
          title: pageReel.title,
          period: f.period ?? 'FORTNIGHT',
          from: f.from,
          until: f.until,
          tracks: f.totals.tracks,
          releases: f.totals.releases,
          artistCount: f.totals.artists,
          labelCount: f.totals.labels,
          previousPeriodTracks: f.totals.prev,
          mostPlayed: f.played.slice(0, 5).map((t) => ({ title: t.title, artists: t.artists, plays: t.value })),
          mostSaved: f.voted.slice(0, 5).map((t) => ({ title: t.title, artists: t.artists, saves: t.value })),
          topArtists: f.artists.slice(0, 5),
          topLabels: f.labels.slice(0, 5),
          communityStars: f.stars.slice(0, 5).map((s) => ({ top100Rank: s.rank, name: s.name, track: s.track })),
          avgBpm: f.bpm,
          prevAvgBpm: f.prevBpm,
          bpmRanges: f.bands,
          topKey: f.key,
          newToCatalogueCount: f.debutTotal,
          newToCatalogue: f.debut.slice(0, 8),
        },
      })
    }
    if (pageReel) {
      return aiShareCaption({
        kind: 'blog',
        platform,
        lang,
        url: fullUrl,
        fallback: (l) => buildPageVideoCaption('blog', { title: pageReel.title, excerpt: pageReel.excerpt }, { lang: l, url: fullUrl, platform }),
        context: {
          title: pageReel.title,
          excerpt: pageReel.excerpt,
          published: pageReel.date,
          tags: pageReel.tags,
          artist: pageReel.artist,
          label: pageReel.label,
          albumTracks: pageReel.tracks.map((t) => t.title),
        },
      })
    }
    const data = await getSetData()
    return aiShareCaption({
      kind: 'set',
      platform,
      lang,
      url: fullUrl,
      fallback: (l) => buildMixVideoCaption(data, { lang: l, url: fullUrl, platform }),
      context: {
        set: data.title,
        artists: data.artists,
        festival: data.festival,
        edition: data.edition,
        eventName: data.eventName,
        place: data.place,
        city: data.city,
        recordedOn: data.releaseDate,
        freeDownload: !!data.downloadable,
      },
    })
  }

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: fullUrl })
      } catch { /* user cancelled */ }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="inline-flex items-center h-9 text-[var(--ink)]/50"
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontSize: '11px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
        }}
      >
        {es ? 'COMPARTIR' : 'SHARE'}:
      </span>

      {shareLinks.map((link) => (
        <a
          key={link.name}
          href={link.href}
          onClick={link.name === 'Facebook' ? (e) => openFacebookShareDialog(fullUrl, e) : undefined}
          {...(link.name === 'Facebook'
            ? {}
            : { target: '_blank', rel: 'noopener noreferrer' })}
          className="inline-flex items-center justify-center w-9 h-9 border-2 border-white/30 bg-[var(--ink)] text-white/80 no-underline transition-all duration-150 hover:scale-110 hover:border-white hover:text-white"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '0px',
          }}
          title={`${es ? 'Compartir en' : 'Share on'} ${link.name}`}
          aria-label={`${es ? 'Compartir en' : 'Share on'} ${link.name}`}
        >
          {link.icon}
        </a>
      ))}

      <button
        type="button"
        onClick={copyLink}
        className={`inline-flex items-center justify-center h-9 px-3 border-2 transition-all duration-150 cursor-pointer ${
          copied
            ? 'bg-[var(--acid)] border-[var(--acid)] text-white'
            : 'border-white/30 bg-[var(--ink)] text-white/80 hover:border-white hover:text-white'
        }`}
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontWeight: 700,
          fontSize: '11px',
          letterSpacing: '1px',
        }}
        title={copied ? (es ? 'Enlace copiado' : 'Link copied') : (es ? 'Copiar enlace' : 'Copy link')}
        aria-label={copied ? (es ? 'Enlace copiado' : 'Link copied') : (es ? 'Copiar enlace' : 'Copy link')}
      >
        {copied ? (es ? '✓ COPIADO' : '✓ COPIED') : (es ? '🔗 LINK' : '🔗 LINK')}
      </button>

      {canPromo && storyPlay && (
        <button
          type="button"
          onClick={shareStory}
          disabled={storyState === 'busy'}
          className={`inline-flex items-center justify-center h-9 px-3 border-2 transition-all duration-150 cursor-pointer ${
            storyState === 'done'
              ? 'bg-[var(--acid)] border-[var(--acid)] text-white'
              : 'border-white/30 bg-[var(--ink)] text-white/80 hover:border-white hover:text-white'
          }`}
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '1px',
          }}
          title={
            storyState === 'done'
              ? (es ? 'Imagen lista · enlace copiado' : 'Image ready · link copied')
              : (es
                  ? 'Story de Instagram: genera la imagen y copia el enlace'
                  : 'Instagram Story: generate image and copy link')
          }
          aria-label={es ? 'Story de Instagram' : 'Instagram Story'}
        >
          {storyState === 'done' ? '✓ IG' : storyState === 'busy' ? '…' : 'IG'}
        </button>
      )}

      {((canPromo && storyPlay) || (isAdmin && pageReel)) && (
        <VideoShareButtons
          lang={lang}
          title={title}
          fileBase={pageReel?.agenda ? 'agenda' : pageReel ? 'blog' : 'set'}
          what={
            pageReel?.agenda
              ? { es: 'de la agenda', en: 'of the agenda' }
              : pageReel
                ? { es: 'del artículo', en: 'of this article' }
                : { es: 'de la sesión', en: 'of this set' }
          }
          makeVideo={makeVideo}
          makeCaption={makeCaption}
          audio={pageReel?.fortnight?.audio ?? pageReel?.albumAudio ?? null}
        />
      )}

      {fullShortUrl && (
        <button
          type="button"
          onClick={copyShort}
          className={`inline-flex items-center justify-center h-9 px-3 border-2 transition-all duration-150 cursor-pointer ${
            copiedShort
              ? 'bg-[var(--acid)] border-[var(--acid)] text-white'
              : 'border-white/30 bg-[var(--ink)] text-white/80 hover:border-white hover:text-white'
          }`}
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '1px',
          }}
          title={
            copiedShort
              ? (es ? 'Enlace corto copiado' : 'Short link copied')
              : (es
                  ? 'Copiar enlace corto (para Instagram y bios)'
                  : 'Copy short link (for Instagram & bios)')
          }
          aria-label={
            copiedShort
              ? (es ? 'Enlace corto copiado' : 'Short link copied')
              : (es ? 'Copiar enlace corto' : 'Copy short link')
          }
        >
          {copiedShort ? (es ? '✓ COPIADO' : '✓ COPIED') : (es ? '✂ CORTO' : '✂ SHORT')}
        </button>
      )}

      {'share' in (typeof navigator !== 'undefined' ? navigator : {}) && (
        <button
          type="button"
          onClick={nativeShare}
          className="inline-flex items-center justify-center w-9 h-9 border-2 border-white/30 bg-[var(--ink)] text-white/80 transition-all duration-150 hover:border-[var(--red)] hover:bg-[var(--red)] hover:text-white cursor-pointer lg:hidden"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '13px',
          }}
          title={es ? 'Compartir' : 'Share'}
          aria-label={es ? 'Compartir' : 'Share'}
        >
          ↗
        </button>
      )}
    </div>
  )
}
