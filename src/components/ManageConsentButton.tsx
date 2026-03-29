'use client'

import React from 'react'

export default function ManageConsentButton({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event('ob-open-cookie-banner'))}
      className={className}
      style={{ textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
    >
      {label}
    </button>
  )
}
