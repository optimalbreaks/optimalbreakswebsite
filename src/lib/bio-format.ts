/** Split stored bio text into paragraphs (double newlines). Falls back to a single block if none. */
export function splitBioParagraphs(bio: string | null | undefined): string[] {
  const t = bio?.trim()
  if (!t) return []
  const parts = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts : [t]
}

/**
 * Split a block of prose into sentences (period / ? / ! + space + new sentence).
 * Conservative: avoids most false splits on "i.e." by requiring following char to look like start of sentence.
 */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑÜ0-9"(])/)
  return parts.map((s) => s.trim()).filter(Boolean)
}

/**
 * Event/label copy often arrives as one long paragraph. Keeps explicit \\n\\n blocks,
 * then breaks long chunks into 2–3 sentence paragraphs for readable layout (like artist bios).
 */
export function splitProseForDisplay(
  text: string | null | undefined,
  opts?: { minCharsToSplit?: number; maxSentencesPerParagraph?: number },
): string[] {
  const minChars = opts?.minCharsToSplit ?? 200
  const maxS = opts?.maxSentencesPerParagraph ?? 3
  const base = splitBioParagraphs(text)
  const out: string[] = []
  for (const para of base) {
    if (para.length <= minChars) {
      out.push(para)
      continue
    }
    const sents = splitSentences(para)
    if (sents.length <= 1) {
      out.push(para)
      continue
    }
    for (let i = 0; i < sents.length; i += maxS) {
      out.push(sents.slice(i, i + maxS).join(' '))
    }
  }
  return out
}
