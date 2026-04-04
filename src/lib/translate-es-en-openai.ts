/**
 * Traducción ES → inglés neutro (OpenAI). Prompt: scripts/prompts/translate-es-en-neutral-system.txt
 * Usado por API admin y por scripts/traducir-bd-en.ts (tsx).
 */

import { readFileSync } from 'fs'
import { join } from 'path'

let systemPromptCache: string | null = null

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache
  const path = join(process.cwd(), 'scripts/prompts/translate-es-en-neutral-system.txt')
  systemPromptCache = readFileSync(path, 'utf8').trim()
  return systemPromptCache
}

function openAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
}

export type TranslateSceneInput = {
  name_es: string
  description_es: string
}

export type TranslateSceneOutput = {
  name_en: string
  description_en: string
}

export async function translateSceneRowEsToEn(input: TranslateSceneInput): Promise<TranslateSceneOutput> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')

  const nameEs = (input.name_es ?? '').trim()
  const descriptionEs = (input.description_es ?? '').trim()
  if (!nameEs && !descriptionEs) {
    throw new Error('name_es y description_es están vacíos')
  }

  const system = loadSystemPrompt()
  const hasHtml = /<\/?[a-z][\s/>]/i.test(descriptionEs)

  const user = `Translate these scene fields from Spanish to neutral International English.

Return ONLY this JSON shape (no other keys):
{"name_en":"...","description_en":"..."}

Rules for this row:
- name_en: translation of the scene title (from name_es). If name_es is empty, set name_en to "".
- description_en: translation of description_es. ${
    hasHtml
      ? 'The description is HTML: preserve every tag and attribute; translate only visible text.'
      : 'Plain text only in the output unless the source contains HTML.'
  }

Source JSON:
${JSON.stringify({ name_es: nameEs, description_es: descriptionEs })}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: openAiModel(),
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI ${res.status}: ${err}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Respuesta vacía de OpenAI')
  }

  let raw = content.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }

  const parsed = JSON.parse(raw) as { name_en?: string; description_en?: string }
  const name_en = typeof parsed.name_en === 'string' ? parsed.name_en : ''
  const description_en = typeof parsed.description_en === 'string' ? parsed.description_en : ''

  return { name_en, description_en }
}

/**
 * Un solo campo (blog, history_entries, etc. en el futuro).
 */
export async function translateFieldEsToEn(
  textSpanish: string,
  opts?: { asHtml?: boolean; context?: string },
): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const system = loadSystemPrompt()
  const asHtml = Boolean(opts?.asHtml)
  const context = (opts?.context ?? '').trim()

  const user = `Translate the following Spanish text to neutral International English.
${context ? `Context: ${context}\n` : ''}
${asHtml ? 'The text is HTML: preserve all tags and attributes exactly; translate only human-readable text.\n' : ''}
Return ONLY a JSON object: {"text_en":"..."}

Spanish source:
${textSpanish}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: openAiModel(),
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI ${res.status}: ${err}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  let raw = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  const parsed = JSON.parse(raw) as { text_en?: string }
  return typeof parsed.text_en === 'string' ? parsed.text_en : ''
}
