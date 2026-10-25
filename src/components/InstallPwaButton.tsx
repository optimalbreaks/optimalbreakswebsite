'use client'

import { useEffect, useState } from 'react'
import { INSTALL_PROMPT_EVENT } from './ServiceWorkerRegistration'

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type State = 'loading' | 'installed' | 'prompt' | 'ios' | 'android' | 'desktop'

function detect(): State {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return 'installed'
  if (window.__obInstallPrompt) return 'prompt'
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

export default function InstallPwaButton({ es }: { es: boolean }) {
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    const update = () => setState(detect())
    update()
    window.addEventListener(INSTALL_PROMPT_EVENT, update)
    return () => window.removeEventListener(INSTALL_PROMPT_EVENT, update)
  }, [])

  const install = async () => {
    const ev = window.__obInstallPrompt as InstallPrompt | null | undefined
    if (!ev) {
      document.getElementById('android')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    try {
      await ev.prompt()
      const choice = await ev.userChoice
      window.__obInstallPrompt = null
      setState(choice?.outcome === 'accepted' ? 'installed' : detect())
    } catch {
      window.__obInstallPrompt = null
      document.getElementById('android')?.scrollIntoView({ behavior: 'smooth' })
      setState(detect())
    }
  }

  const box =
    'border-[3px] border-[var(--ink)] bg-[var(--paper)] px-5 py-4 shadow-[5px_5px_0_var(--red)]'
  const btn =
    'inline-flex min-h-12 items-center justify-center border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-6 text-[var(--ink)] no-underline shadow-[4px_4px_0_var(--ink)] hover:bg-[var(--red)] hover:text-white transition-colors'
  const btnStyle = {
    fontFamily: "'Unbounded', sans-serif",
    fontWeight: 900,
    fontSize: '14px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  }
  const text = { fontFamily: "'Courier Prime', monospace", fontSize: '15px' }

  if (state === 'loading') return <div className={`${box} min-h-[84px]`} aria-hidden />

  if (state === 'installed') {
    return (
      <div className={box} style={text}>
        <strong>✓ {es ? 'Ya la estás usando como app.' : "You're already using it as an app."}</strong>{' '}
        {es
          ? 'Si algo no se actualiza, ciérrala del todo desde la multitarea y vuelve a abrirla.'
          : "If something doesn't update, close it fully from the app switcher and open it again."}
      </div>
    )
  }

  if (state === 'prompt') {
    return (
      <div className={`${box} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <p className="m-0" style={text}>
          {es
            ? 'Tu navegador permite instalarla con un toque.'
            : 'Your browser can install it in one tap.'}
        </p>
        <button type="button" onClick={install} className={btn} style={btnStyle}>
          {es ? '⬇ Instalar ahora' : '⬇ Install now'}
        </button>
      </div>
    )
  }

  const target = state === 'ios' ? '#iphone' : '#android'
  const msg =
    state === 'ios'
      ? es
        ? 'Estás en iPhone o iPad: sigue los pasos de Safari.'
        : "You're on iPhone or iPad: follow the Safari steps."
      : state === 'android'
        ? es
          ? 'Estás en Android: sigue los pasos de Chrome.'
          : "You're on Android: follow the Chrome steps."
        : es
          ? 'Abre esta página en tu móvil (www.optimalbreaks.com/es/install) y sigue los pasos.'
          : 'Open this page on your phone (www.optimalbreaks.com/en/install) and follow the steps.'

  return (
    <div className={`${box} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
      <p className="m-0" style={text}>{msg}</p>
      {state !== 'desktop' ? (
        <a href={target} className={btn} style={btnStyle}>
          {es ? 'Ver pasos ↓' : 'See steps ↓'}
        </a>
      ) : null}
    </div>
  )
}
