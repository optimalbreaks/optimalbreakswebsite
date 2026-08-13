/** Modelo editorial por defecto: GPT-5.6 Terra (web_search nativo + visión). */
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-terra'

export function resolveOpenAiModel(...envKeys: string[]): string {
  for (const k of envKeys) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
}

export function isGpt5Family(model: string): boolean {
  return /^gpt-5/i.test(model)
}

/** Body para /v1/chat/completions: gpt-5 no admite temperature custom. */
export function openAiChatCompletionsBody(opts: {
  model: string
  messages: unknown
  responseFormat?: { type: string }
  maxCompletionTokens?: number
  temperature?: number
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  }
  if (opts.responseFormat) body.response_format = opts.responseFormat
  if (isGpt5Family(opts.model)) {
    body.max_completion_tokens = opts.maxCompletionTokens ?? 16_000
  } else {
    if (opts.temperature != null) body.temperature = opts.temperature
    body.max_tokens = opts.maxCompletionTokens ?? 16_000
  }
  return body
}
