'use client'

import Link from 'next/link'

interface AdminSidebarProps {
  lang: string
  currentPath: string
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
  { key: 'agent', label: 'Agente IA', icon: '⚙', path: '/agent' },
]

export default function AdminSidebar({ lang, currentPath }: AdminSidebarProps) {
  const base = `/${lang}/administrator`

  return (
    <aside className="w-56 min-h-screen bg-[#12121f] border-r border-[#2a2a4a] flex flex-col py-6">
      <div className="px-5 mb-8">
        <span className="text-lg font-bold tracking-wider text-gray-100">
          OB Admin
        </span>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const href = `${base}${item.path}`
          const isActive =
            currentPath === href ||
            (item.path !== '' && currentPath.startsWith(href))

          return (
            <Link
              key={item.key}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-[#2a2a4a] text-white font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a2e]'
              }`}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
