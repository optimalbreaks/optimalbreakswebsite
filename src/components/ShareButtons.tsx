// ============================================
// OPTIMAL BREAKS — Share Buttons
// X/Twitter, WhatsApp, Facebook, Copy Link
// Fanzine aesthetic
// ============================================

'use client'

import { useState } from 'react'
import {
  buildAbsoluteShareUrl,
  copyShareLink,
  openFacebookShareDialog,
} from '@/lib/share-track'

interface ShareButtonsProps {
  url: string
  title: string
  lang: string
}

export default function ShareButtons({ url, title, lang }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)
  const es = lang === 'es'
  const fullUrl = buildAbsoluteShareUrl(url)
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
