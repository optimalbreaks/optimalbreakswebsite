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
  copyShareLink,
  openFacebookShareDialog,
} from '@/lib/share-track'

interface ShareButtonsProps {
  url: string
  title: string
  lang: string
  /** Path corto (p. ej. `/a/ctrl-z`) para redes que limitan la longitud del enlace (Instagram). */
  shortUrl?: string
  /** Valor `play=` de `/api/og/story` (p. ej. `mix:<slug>`). Solo admins ven el botón IG. */
  storyPlay?: string
}

export default function ShareButtons({ url, title, lang, shortUrl, storyPlay }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)
  const [copiedShort, setCopiedShort] = useState(false)
  const [storyState, setStoryState] = useState<'idle' | 'busy' | 'done'>('idle')
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
