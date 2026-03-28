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
      {label && (
        <label className="block text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
        />
        <button
          type="button"
          onClick={handleAuto}
          className="px-3 py-2 rounded-md bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-300 text-sm font-medium transition-colors"
        >
          Auto
        </button>
      </div>
      {value && (
        <p className="text-xs text-gray-500 font-mono">/{value}</p>
      )}
    </div>
  )
}
