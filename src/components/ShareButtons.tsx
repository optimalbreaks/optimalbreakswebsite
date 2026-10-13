// ============================================
// OPTIMAL BREAKS — Share Buttons
// X/Twitter, WhatsApp, Facebook, Copy Link
// Fanzine aesthetic
// ============================================

'use client'

import { useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import {
  buildAbsoluteShareUrl,
  buildMixVideoCaption,
  copyShareLink,
  openFacebookShareDialog,
} from '@/lib/share-track'
import type { Locale } from '@/lib/i18n-config'

type VideoState = 'idle' | 'busy' | 'ready' | 'done' | 'error'

interface ShareButtonsProps {
  url: string
  title: string
  lang: string
  /** Path corto (p. ej. `/a/ctrl-z`) para redes que limitan la longitud del enlace (Instagram). */
  shortUrl?: string
  /**
   * Valor `play=` de `/api/og/story` (p. ej. `mix:<slug>`). Solo admins ven los
   * botones IG (Story), R (reel vertical) y F (vídeo horizontal para Facebook).
   */
  storyPlay?: string
}

export default function ShareButtons({ url, title, lang, shortUrl, storyPlay }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)
  const [copiedShort, setCopiedShort] = useState(false)
  const [storyState, setStoryState] = useState<'idle' | 'busy' | 'done'>('idle')
  // Vídeos R / F (mismo motor que los temas: `src/lib/reel-renderer.ts`)
  const [reelState, setReelState] = useState<VideoState>('idle')
  const [reelPct, setReelPct] = useState(0)
  const [reelFile, setReelFile] = useState<File | null>(null)
  const [reelCaption, setReelCaption] = useState<string | null>(null)
  const [fbState, setFbState] = useState<VideoState>('idle')
  const [fbPct, setFbPct] = useState(0)
  const videoBusy = reelState === 'busy' || fbState === 'busy'
  const { isAdmin } = useAuth()
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

  /** Datos de la sesión para los vídeos (en inglés, como los de los temas). */
  const fetchVideoData = async () => {
    const params = new URLSearchParams({ play: storyPlay as string, lang: 'en', format: 'json' })
    const res = await fetch(`/api/og/story?${params.toString()}`)
    if (!res.ok) throw new Error(`video data ${res.status}`)
    return { ...(await res.json()), lang: 'en' as const }
  }

  const shareOrDownloadFile = async (file: File, text?: string | null) => {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title, ...(text ? { text } : {}) })
      } catch { /* cancelado */ }
      return
    }
    const href = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = href
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 4000)
  }

  /** «R»: reel vertical 1080×1920 sin audio + texto del post copiado. */
  const shareReel = async () => {
    if (!storyPlay || (videoBusy && reelState !== 'ready')) return
    if (reelState === 'ready' && reelFile) {
      // Toque nuevo (gesto del usuario): copiar y compartir funciona también en iOS.
      if (reelCaption) await copyShareLink(reelCaption)
      await shareOrDownloadFile(reelFile, reelCaption)
      setReelFile(null)
      setReelState('done')
      setTimeout(() => setReelState('idle'), 2200)
      return
    }
    setReelState('busy')
    setReelPct(0)
    try {
      const data = await fetchVideoData()
      const caption = buildMixVideoCaption(data, { lang: lang as Locale, url: fullUrl, platform: 'instagram' })
      setReelCaption(caption)
      const { renderReel } = await import('@/lib/reel-renderer')
      const reel = await renderReel(data, { format: 'vertical', onProgress: (r) => setReelPct(Math.round(r * 100)) })
      const file = new File([reel.blob], `optimal-breaks-set-reel.${reel.ext}`, { type: reel.mime })
      const nav = navigator as Navigator & { userActivation?: { isActive: boolean } }
      if (nav.canShare?.({ files: [file] }) && !nav.userActivation?.isActive) {
        setReelFile(file)
        setReelState('ready')
        return
      }
      await copyShareLink(caption)
      await shareOrDownloadFile(file, caption)
      setReelState('done')
      setTimeout(() => setReelState('idle'), 2200)
    } catch (err) {
      console.error('[set reel]', err)
      setReelState('error')
      setTimeout(() => setReelState('idle'), 2500)
    }
  }

  /** «F»: vídeo horizontal 1920×1080 para Facebook (se descarga) + texto con enlace copiado. */
  const shareFacebookVideo = async () => {
    if (!storyPlay || videoBusy) return
    setFbState('busy')
    setFbPct(0)
    try {
      const data = await fetchVideoData()
      const caption = buildMixVideoCaption(data, { lang: lang as Locale, url: fullUrl, platform: 'facebook' })
      const { renderReel } = await import('@/lib/reel-renderer')
      const video = await renderReel(data, { format: 'horizontal', onProgress: (r) => setFbPct(Math.round(r * 100)) })
      const href = URL.createObjectURL(video.blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `optimal-breaks-set-facebook.${video.ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 4000)
      await copyShareLink(caption)
      setFbState('done')
      setTimeout(() => setFbState('idle'), 2200)
    } catch (err) {
      console.error('[set facebook video]', err)
      setFbState('error')
      setTimeout(() => setFbState('idle'), 2500)
    }
  }

  const videoBtnCls = (st: VideoState) =>
    `inline-flex items-center justify-center h-9 min-w-9 px-3 border-2 transition-all duration-150 cursor-pointer disabled:cursor-wait ${
      st === 'done' || st === 'ready'
        ? 'bg-[var(--acid)] border-[var(--acid)] text-white'
        : st === 'error'
          ? 'bg-[var(--red)] border-[var(--red)] text-white'
          : 'border-white/30 bg-[var(--ink)] text-white/80 hover:border-white hover:text-white'
    }`
  const videoBtnStyle = {
    fontFamily: "'Courier Prime', monospace",
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '1px',
  } as const

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

      {isAdmin && storyPlay && (
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

      {isAdmin && storyPlay && (
        <>
          <button
            type="button"
            onClick={shareReel}
            disabled={reelState === 'busy' || fbState === 'busy'}
            className={videoBtnCls(reelState)}
            style={videoBtnStyle}
            title={
              reelState === 'done'
                ? (es ? 'Reel listo · texto del post copiado: pégalo en Instagram' : 'Reel ready · post text copied: paste it in Instagram')
                : reelState === 'ready'
                  ? (es ? 'Reel listo: toca para compartir (se copia el texto del post)' : 'Reel ready: tap to share (post text gets copied)')
                  : reelState === 'error'
                    ? (es ? 'No se pudo generar el reel' : 'Could not generate the reel')
                    : (es
                        ? 'Reel de Instagram de la sesión (sin audio): genera el vídeo y copia el texto del post'
                        : 'Instagram Reel of this set (no audio): generate video and copy the post text')
            }
            aria-label={es ? 'Reel de Instagram' : 'Instagram Reel'}
          >
            {reelState === 'busy' ? `${reelPct}%` : reelState === 'ready' ? '↗ R' : reelState === 'done' ? '✓ R' : reelState === 'error' ? '✕' : 'R'}
          </button>
          <button
            type="button"
            onClick={shareFacebookVideo}
            disabled={reelState === 'busy' || fbState === 'busy'}
            className={videoBtnCls(fbState)}
            style={videoBtnStyle}
            title={
              fbState === 'done'
                ? (es ? 'Vídeo descargado · texto del post copiado: pégalo en Facebook' : 'Video downloaded · post text copied: paste it in Facebook')
                : fbState === 'error'
                  ? (es ? 'No se pudo generar el vídeo' : 'Could not generate the video')
                  : (es
                      ? 'Vídeo horizontal de la sesión para Facebook (sin audio): descarga el MP4 y copia el texto del post'
                      : 'Horizontal video of this set for Facebook (no audio): download MP4 and copy the post text')
            }
            aria-label={es ? 'Vídeo para Facebook' : 'Facebook video'}
          >
            {fbState === 'busy' ? `${fbPct}%` : fbState === 'done' ? '✓ F' : fbState === 'error' ? '✕' : 'F'}
          </button>
        </>
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
