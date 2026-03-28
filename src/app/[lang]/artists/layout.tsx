// ============================================
// OPTIMAL BREAKS — /artists: siempre datos vivos (Supabase)
// Evita Data Cache de fetch (PostgREST) y alinea con edición en BD.
// ============================================

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default function ArtistsSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
