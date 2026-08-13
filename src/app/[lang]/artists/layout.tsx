// ============================================
// OPTIMAL BREAKS — /artists
// Antes forzaba `force-no-store` (datos siempre vivos). Eso hacía que cada
// visita golpease Supabase y contribuyó a agotar el Disk IO Budget de la
// instancia (504 en todo el sitio). Ahora el catálogo se sirve desde la Data
// Cache (createCachedSupabase, revalidate 300 s): las ediciones en BD tardan
// como mucho ~5 min en verse en la web pública.
// ============================================

export default function ArtistsSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
