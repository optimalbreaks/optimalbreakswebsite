'use client'

import { useEffect } from 'react'
import { openAdminChat } from '@/components/AdminCaptureFab'

/**
 * Ruta legacy / Share Target: abre el widget flotante (el chat vive en el FAB global).
 */
export default function AdminChatCapturePage() {
  useEffect(() => {
    openAdminChat()
  }, [])

  return (
    <div className="max-w-lg space-y-4 text-[var(--ink)]">
      <span className="sec-tag">Chat</span>
      <h1 className="sec-title !mb-2">Chat editorial</h1>
      <p className="admin-muted" style={{ fontFamily: "'Special Elite', monospace" }}>
        El agente se abre en el panel flotante (abajo a la izquierda). Puedes minimizarlo y seguir
        navegando el admin; el hilo se mantiene.
      </p>
      <button type="button" className="admin-btn admin-btn--yellow min-h-12" onClick={() => openAdminChat()}>
        Abrir chat
      </button>
      <p className="text-xs admin-muted">
        Atajo: botón 💬 en cualquier página · Share Target → esta ruta abre el widget
        automáticamente.
      </p>
    </div>
  )
}
