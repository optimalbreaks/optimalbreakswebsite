/** True if copy likely contains HTML (TinyMCE, migraciones, etc.); si no, se muestra como párrafos de texto plano. */
export function descriptionLooksLikeHtml(text: string | null | undefined): boolean {
  const t = text?.trim()
  if (!t) return false
  return /<\/?[a-z][\s/>]/i.test(t)
}

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

export type FestivalDescSection = { title: string; body: string }

/**
 * Trocea descripciones tipo comunicado de festival (Raveart, etc.) en bloques con título.
 * Si no encaja el patrón, devuelve null y la página usa splitProseForDisplay.
 */
export function splitFestivalDescriptionSections(
  text: string | null | undefined,
  lang: 'es' | 'en',
): FestivalDescSection[] | null {
  const t = text?.trim()
  if (!t) return null

  const markers: { at: RegExp; test: RegExp; title: string }[] =
    lang === 'es'
      ? [
          { at: /Horario de apertura/i, test: /^Horario de apertura/i, title: 'Horario' },
          { at: /Primera tanda/i, test: /^Primera tanda/i, title: 'Primera confirmación' },
          { at: /Segunda tanda/i, test: /^Segunda tanda/i, title: 'Segunda confirmación' },
          { at: /Entrada general/i, test: /^Entrada general/i, title: 'Entrada general' },
          { at: /Entrada VIP/i, test: /^Entrada VIP/i, title: 'Entrada VIP' },
          { at: /Venta de entradas/i, test: /^Venta de entradas/i, title: 'Entradas e info' },
        ]
      : [
          { at: /\bDoors \d/i, test: /^Doors \d/i, title: 'Hours' },
          { at: /First wave/i, test: /^First wave/i, title: 'First wave' },
          { at: /Second wave/i, test: /^Second wave/i, title: 'Second wave' },
          { at: /General admission/i, test: /^General admission/i, title: 'General admission' },
          { at: /VIP adds/i, test: /^VIP adds/i, title: 'VIP' },
          { at: /Tickets and/i, test: /^Tickets and/i, title: 'Tickets & info' },
        ]

  const inner = markers.map((m) => m.at.source).join('|')
  const pattern = new RegExp(`(?=${inner})`, 'gi')
  const chunks = t.split(pattern).map((s) => s.trim()).filter(Boolean)
  if (chunks.length < 2) return null

  const sections: FestivalDescSection[] = []
  for (const chunk of chunks) {
    let title = lang === 'es' ? 'En resumen' : 'The brief'
    for (const m of markers) {
      if (m.test.test(chunk)) {
        title = m.title
        break
      }
    }
    sections.push({ title, body: chunk })
  }
  return sections
}
