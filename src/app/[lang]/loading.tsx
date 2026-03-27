// ============================================
// OPTIMAL BREAKS — Loading State
// ============================================

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div
        className="w-16 h-16 rounded-full border-4 border-[var(--ink)] border-t-[var(--red)]"
        style={{ animation: 'spin 1s linear infinite' }}
      />
      <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '3px', color: 'var(--dim)', textTransform: 'uppercase' }}>
        LOADING BREAKS...
      </div>
    </div>
  )
}
