'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'

interface AdminShellProps {
  lang: string
  children: React.ReactNode
}

export default function AdminShell({ lang, children }: AdminShellProps) {
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen])

  return (
    <div className="admin-shell lined">
      <div
        role="presentation"
        className={`fixed inset-0 z-40 bg-[var(--ink)]/45 transition-opacity duration-200 md:hidden ${
          mobileNavOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileNavOpen(false)}
      />
      <AdminSidebar
        lang={lang}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="admin-main min-w-0">
        <header className="admin-topbar gap-3">
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center border-[3px] border-white bg-transparent text-white md:hidden"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: '18px',
              lineHeight: 1,
            }}
            aria-expanded={mobileNavOpen}
            aria-controls="admin-sidebar-nav"
            aria-label={mobileNavOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            {mobileNavOpen ? '✕' : '☰'}
          </button>
          <span className="min-w-0 truncate">Optimal Breaks // Panel de administración</span>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  )
}
