/** Split stored bio text into paragraphs (double newlines). Falls back to a single block if none. */
export function splitBioParagraphs(bio: string | null | undefined): string[] {
  const t = bio?.trim()
  if (!t) return []
  const parts = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts : [t]
}
