// ============================================
// OPTIMAL BREAKS — PWA Service Worker Registration
// ============================================

'use client'

import { useEffect } from 'react'

export const INSTALL_PROMPT_EVENT = 'ob-install-prompt'

declare global {
  interface Window {
    __obInstallPrompt?: Event | null
  }
}

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((err) =>
        console.error('[OB] SW registration failed:', err)
      )
    }

    // Chrome lo lanza una sola vez por carga: se guarda aquí para que /install lo use
    // tras una navegación de cliente. Sin preventDefault: el aviso nativo de Chrome sigue igual.
    const onPrompt = (e: Event) => {
      window.__obInstallPrompt = e
      window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT))
    }
    const onInstalled = () => {
      window.__obInstallPrompt = null
      window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT))
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return null
}
