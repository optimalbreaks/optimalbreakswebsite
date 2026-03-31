// ============================================
// OPTIMAL BREAKS — Share Buttons
// X/Twitter, WhatsApp, Facebook, Copy Link
// Fanzine aesthetic
// ============================================

'use client'

import { useState } from 'react'
import { SITE_URL } from '@/lib/seo'

interface ShareButtonsProps {
  url: string
  title: string
  lang: string
}

/** Facebook espera un popup con tamaño fijo; abrir solo en pestaña nueva suele dar pantalla en blanco o errores en algunos navegadores. */
function openFacebookShare(fullUrl: string, e: React.MouseEvent<HTMLAnchorElement>) {
  const u = encodeURIComponent(fullUrl)
  const href = `https://www.facebook.com/sharer/sharer.php?u=${u}`
  const popup = window.open(
    href,
    'fb_share',
    'width=626,height=436,left=100,top=100,scrollbars=yes,resizable=yes'
  )
  if (popup) {
    popup.opener = null
    e.preventDefault()
  }
}

export default function ShareButtons({ url, title, lang }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)
  const es = lang === 'es'
  const path = url.startsWith('/') ? url : `/${url}`
  const fullUrl = `${SITE_URL.replace(/\/$/, '')}${path}`
  const encodedUrl = encodeURIComponent(fullUrl)
  const encodedTitle = encodeURIComponent(title)

  const shareLinks = [
    {
      name: 'X',
      href: `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      color: 'var(--ink)',
      icon: '𝕏',
    },
    {
      name: 'WhatsApp',
      href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
      color: 'var(--acid)',
      icon: 'WA',
    },
    {
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      color: 'var(--blue)',
      icon: 'FB',
    },
  ]

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = fullUrl
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Native share API (mobile)
  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: fullUrl })
      } catch { /* user cancelled */ }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      <span
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontSize: '9px',
          letterSpacing: '2px',
          color: 'var(--dim)',
          textTransform: 'uppercase',
        }}
      >
        {es ? 'COMPARTIR' : 'SHARE'}:
      </span>

      {shareLinks.map((link) => (
        <a
          key={link.name}
          href={link.href}
          onClick={link.name === 'Facebook' ? (e) => openFacebookShare(fullUrl, e) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-[30px] h-[30px] border-2 no-underline transition-all duration-150 hover:scale-110 hover:rotate-[-3deg]"
          style={{
            borderColor: link.color,
            color: link.color,
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '9px',
            letterSpacing: '0px',
          }}
          title={`${es ? 'Compartir en' : 'Share on'} ${link.name}`}
        >
          {link.icon}
        </a>
      ))}

      {/* Copy link */}
      <button
        onClick={copyLink}
        className={`inline-flex items-center justify-center h-[30px] px-2 border-2 transition-all duration-150 cursor-pointer ${
          copied
            ? 'bg-[var(--acid)] border-[var(--acid)] text-white'
            : 'border-[var(--ink)]/20 text-[var(--ink)]/50 hover:border-[var(--ink)] hover:text-[var(--ink)]'
        }`}
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontWeight: 700,
          fontSize: '9px',
          letterSpacing: '1px',
        }}
      >
        {copied ? (es ? '✓ COPIADO' : '✓ COPIED') : (es ? '🔗 LINK' : '🔗 LINK')}
      </button>

      {/* Native share (mobile only) */}
      {'share' in (typeof navigator !== 'undefined' ? navigator : {}) && (
        <button
          onClick={nativeShare}
          className="inline-flex items-center justify-center w-[30px] h-[30px] border-2 border-[var(--red)] text-[var(--red)] transition-all duration-150 hover:bg-[var(--red)] hover:text-white cursor-pointer lg:hidden"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '12px',
          }}
          title={es ? 'Compartir' : 'Share'}
        >
          ↗
        </button>
      )}
    </div>
  )
}
