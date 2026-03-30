import { redirect } from 'next/navigation'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Locale } from '@/lib/i18n-config'
import type { Database } from '@/types/database'
import AdminSidebar from '@/components/admin/AdminSidebar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { lang: Locale }
}) {
  const { lang } = await params

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim()

  if (!url || !key) redirect(`/${lang}/login`)

  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(c: { name: string; value: string; options: CookieOptions }[]) {
        try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${lang}/login`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string } | null }

  if (profile?.role !== 'admin') redirect(`/${lang}`)

  return (
    <div className="admin-shell lined">
      <AdminSidebar lang={lang} />
      <div className="admin-main">
        <header className="admin-topbar">
          <span>Optimal Breaks // Panel de administración</span>
        </header>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  )
}
