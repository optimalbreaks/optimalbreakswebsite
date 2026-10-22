/** Artista reclamado cuya cuenta tiene `profiles.role = collaborator`. */

export default function CatalogCollaboratorBadge({
  lang,
  compact = false,
}: {
  lang: string
  compact?: boolean
}) {
  const label =
    lang === 'es'
      ? 'Artista colaborador de Optimal Breaks'
      : 'Optimal Breaks collaborator artist'
  return (
    <span
      className="inline-flex max-w-full items-center border-2 border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)]"
      style={{
        fontFamily: "'Courier Prime', monospace",
        fontWeight: 900,
        fontSize: compact ? '7px' : '11px',
        letterSpacing: compact ? '0.3px' : '0.4px',
        textTransform: 'uppercase',
        padding: compact ? '2px 5px' : '4px 8px',
        lineHeight: 1.25,
      }}
      title={label}
    >
      {label}
    </span>
  )
}
