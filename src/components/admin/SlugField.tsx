'use client'

interface SlugFieldProps {
  value: string
  onChange: (val: string) => void
  nameValue: string
  label?: string
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function SlugField({
  value,
  onChange,
  nameValue,
  label,
}: SlugFieldProps) {
  const handleAuto = () => {
    onChange(generateSlug(nameValue))
  }

  return (
    <div className="space-y-1">
      {label && <label className="admin-label">{label}</label>}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="admin-input flex-1"
        />
        <button type="button" onClick={handleAuto} className="admin-btn admin-btn--yellow admin-btn--sm shrink-0">
          Auto
        </button>
      </div>
      {value && (
        <p className="text-xs font-mono text-[var(--text-muted)]">/{value}</p>
      )}
    </div>
  )
}
