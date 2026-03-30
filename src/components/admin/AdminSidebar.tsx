'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminSidebarProps {
  lang: string
}

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '◉', path: '' },
  { key: 'artists', label: 'Artistas', icon: '♫', path: '/artists' },
  { key: 'labels', label: 'Sellos', icon: '◈', path: '/labels' },
  { key: 'events', label: 'Eventos', icon: '⚡', path: '/events' },
  { key: 'blog', label: 'Blog', icon: '✎', path: '/blog' },
  { key: 'scenes', label: 'Escenas', icon: '☰', path: '/scenes' },
  { key: 'mixes', label: 'Mixes', icon: '▶', path: '/mixes' },
  { key: 'history', label: 'Historia', icon: '↻', path: '/history' },
  { key: 'agent', label: 'Agentes IA', icon: '⚙', path: '/agent' },
]

export default function AdminSidebar({ lang }: AdminSidebarProps) {
  const pathname = usePathname()
  const base = `/${lang}/administrator`

  return (
    <aside className="w-[13.5rem] shrink-0 min-h-0 border-r-4 border-[var(--ink)] bg-[var(--paper)] flex flex-col py-5">
      <div className="px-4 mb-6">
        <Link
          href={base}
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
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
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
