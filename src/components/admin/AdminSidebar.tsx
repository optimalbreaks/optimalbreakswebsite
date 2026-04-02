'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminSidebarProps {
  lang: string
  /** Drawer abierto en móvil (por debajo del breakpoint `md`) */
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '◉', path: '' },
  { key: 'stats', label: 'Estadísticas', icon: '▤', path: '/stats' },
  { key: 'users', label: 'Usuarios', icon: '☻', path: '/users' },
  { key: 'artists', label: 'Artistas', icon: '♫', path: '/artists' },
  { key: 'labels', label: 'Sellos', icon: '◈', path: '/labels' },
  { key: 'events', label: 'Eventos', icon: '⚡', path: '/events' },
  { key: 'blog', label: 'Blog', icon: '✎', path: '/blog' },
  { key: 'scenes', label: 'Escenas', icon: '☰', path: '/scenes' },
  { key: 'mixes', label: 'Mixes', icon: '▶', path: '/mixes' },
  { key: 'history', label: 'Historia', icon: '↻', path: '/history' },
  { key: 'agent', label: 'Agentes IA', icon: '⚙', path: '/agent' },
]

export default function AdminSidebar({
  lang,
  mobileOpen = false,
  onCloseMobile,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const base = `/${lang}/administrator`

  return (
    <aside
      id="admin-sidebar-nav"
      className={`flex w-[13.5rem] shrink-0 min-h-0 flex-col border-r-4 border-[var(--ink)] bg-[var(--paper)] py-5 transition-transform duration-200 ease-out max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:h-full max-md:min-h-0 max-md:overflow-y-auto max-md:shadow-[6px_0_0_var(--ink)] md:relative md:translate-x-0 ${
        mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
      }`}
    >
      <div className="mb-6 flex items-start justify-between gap-2 px-4">
        <Link
          href={base}
          onClick={onCloseMobile}
          className="inline-block no-underline border-[3px] border-[var(--ink)] bg-[var(--red)] text-white px-3 py-2"
          style={{
            fontFamily: "'Darker Grotesque', sans-serif",
            fontWeight: 900,
            fontSize: '17px',
            letterSpacing: '-0.02em',
          }}
        >
          OB // ADMIN
        </Link>
        {onCloseMobile ? (
          <button
            type="button"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border-[3px] border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] md:hidden"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: '14px',
            }}
            aria-label="Cerrar menú"
            onClick={onCloseMobile}
          >
            ✕
          </button>
        ) : null}
      </div>
      <nav className="flex flex-col gap-0.5 px-2" aria-label="Administración">
        {NAV_ITEMS.map((item) => {
          const href = `${base}${item.path}`
          const isExact = item.path === ''
          const isActive = isExact
            ? pathname === href || pathname === `${href}/`
            : pathname === href || pathname.startsWith(`${href}/`)

          return (
            <Link
              key={item.key}
              href={href}
              onClick={onCloseMobile}
              className={`flex items-center gap-2.5 px-3 py-2.5 no-underline border-l-[3px] transition-colors duration-100 ${
                isActive
                  ? 'border-[var(--red)] bg-[var(--red)] text-white'
                  : 'border-transparent text-[var(--ink)] hover:border-[var(--ink)] hover:bg-[var(--yellow)]'
              }`}
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
              }}
            >
              <span className="w-5 text-center text-sm leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
