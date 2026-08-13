/**
 * Modelo editorial por defecto (GPT-5.6 Terra) + web_search nativo.
 * Usado por agentes CLI (blog, artista, sello, evento, red, fotos).
 */

export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-terra'

export function resolveOpenAiModel(...envKeys) {
  for (const k of envKeys) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
}

export function isGpt5Family(model) {
  return /^gpt-5/i.test(String(model || ''))
}

/** Body para /v1/chat/completions: gpt-5 no admite temperature custom. */
export function openAiChatCompletionsBody({
  model,
  messages,
  responseFormat,
  maxCompletionTokens = 16_000,
  temperature,
}) {
  const body = { model, messages }
  if (responseFormat) body.response_format = responseFormat
  if (isGpt5Family(model)) {
    body.max_completion_tokens = maxCompletionTokens
  } else {
    if (temperature != null) body.temperature = temperature
    body.max_tokens = maxCompletionTokens
  }
  return body
}

function extractResponsesText(data) {
  let text = ''
  if (typeof data?.output_text === 'string') text = data.output_text
  else if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (
            (c?.type === 'output_text' || c?.type === 'text') &&
            typeof c.text === 'string'
          ) {
            text += c.text + '\n'
          }
        }
      }
    }
  }
  return text.trim()
}

function defaultSearchPrompt(query) {
  return `Investiga en la web (música electrónica / breakbeat): ${query}

Devuelve SOLO un resumen factual en texto plano (sin markdown) con datos verificables: nombres, fechas, lugares, sellos, discografía, line-up, URLs oficiales.
Incluye la URL de la fuente junto a cada dato clave. Si algo no aparece, no lo inventes.`
}

/** Búsqueda web nativa OpenAI (Responses API, tool web_search). */
export async function fetchOpenAIWebSearchContext(query, opts = {}) {
  const apiKey = opts.apiKey || process.env.OPENAI_API_KEY?.trim()
  const q = String(query || '').trim()
  if (!apiKey || !q) return ''
  const model =
    opts.model ||
    process.env.OPENAI_SEARCH_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL
  const prompt = opts.prompt || defaultSearchPrompt(q)
  const logPrefix = opts.logPrefix || '[openai-web-search]'
  const maxChars = opts.maxChars || 14_000

  for (const toolType of ['web_search', 'web_search_preview']) {
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          tools: [{ type: toolType }],
          tool_choice: 'auto',
          input: prompt,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs || 120_000),
      })
      if (!res.ok) {
        if (res.status === 400) continue
        const err = await res.text()
        console.warn(`${logPrefix} OpenAI web_search ${res.status}:`, err.slice(0, 200))
        continue
      }
      const text = extractResponsesText(await res.json()).slice(0, maxChars)
      if (text) {
        console.log(`${logPrefix} Contexto web OpenAI (${toolType}, ${model}): ${text.length} chars`)
        return text
      }
    } catch (e) {
      console.warn(`${logPrefix} OpenAI web_search error:`, e.message)
    }
  }
  return ''
}

export async function fetchSerpContext(query, apiKey, opts = {}) {
  if (!apiKey) return ''
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', String(opts.num || 10))
  url.searchParams.set('hl', opts.hl || 'es')
  if (opts.gl) url.searchParams.set('gl', opts.gl)
  url.searchParams.set('api_key', apiKey)
  try {
    const res = await fetch(url.toString())
    if (!res.ok) return ''
    const data = await res.json()
    const bits = []
    if (Array.isArray(data.organic_results)) {
      for (const r of data.organic_results.slice(0, opts.maxResults || 8)) {
        if (r.title) bits.push(`Título: ${r.title}`)
        if (r.snippet) bits.push(`Resumen: ${r.snippet}`)
        if (r.link) bits.push(`URL: ${r.link}`)
        bits.push('---')
      }
    }
    if (data.answer_box?.answer) bits.push(`Answer: ${data.answer_box.answer}`)
    return bits.join('\n').slice(0, opts.maxChars || 12_000)
  } catch (e) {
    console.warn('[serp] error:', e.message)
    return ''
  }
}

/**
 * OpenAI web_search primero; SerpAPI solo como respaldo.
 * (SerpAPI sigue siendo necesario aparte para Google Imágenes.)
 */
export async function fetchWebResearchContext(query, opts = {}) {
  const q = String(query || '').trim()
  if (!q) return { context: '', source: 'none' }
  const openaiKey = opts.apiKey || process.env.OPENAI_API_KEY?.trim()
  if (openaiKey) {
    const ctx = await fetchOpenAIWebSearchContext(q, { ...opts, apiKey: openaiKey })
    if (ctx) return { context: ctx, source: 'openai' }
  }
  const serpKey = opts.serpKey || process.env.SERPAPI_API_KEY?.trim()
  if (serpKey) {
    const ctx = await fetchSerpContext(q, serpKey, opts)
    if (ctx) return { context: ctx, source: 'serpapi' }
  }
  return { context: '', source: 'none' }
}
