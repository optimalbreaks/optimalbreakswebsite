// ============================================
// OPTIMAL BREAKS — Footer
// ============================================

interface FooterProps {
  dict: any
}

export default function Footer({ dict }: FooterProps) {
  return (
    <footer className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end px-6 py-5 border-t-4 border-[var(--ink)]">
      <div
        className="text-[var(--red)]"
        style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '16px' }}
      >
        OPTIMAL//BREAKS
      </div>
      <div
        className="flex flex-col gap-1 sm:text-right"
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontSize: '10px',
          letterSpacing: '2px',
          color: 'var(--dim)',
        }}
      >
        <span>© 2026 — {dict.footer.copy}</span>
        <span>{dict.footer.funding}</span>
      </div>
    </footer>
  )
}
