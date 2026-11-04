import { openAiChatCompletionsBody, resolveOpenAiModel } from '@/lib/openai-editorial'
import { GIFT_IG_ARTIST, GIFT_IG_SITE } from '@/lib/gift-download'

export type GiftFollowVerdict = {
  siteFollows: boolean
  artistFollows: boolean
  confident: boolean
  note: string
}

function dataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * Lee las dos capturas como el chat lee un cartel y como Furgocasa lee un DNI.
 * Aprueba sola solo si en las dos se lee que ya sigue (Siguiendo / Following).
 */
export async function checkGiftFollows(input: {
  site: Buffer
  siteMime: string
  artist: Buffer
  artistMime: string
}): Promise<GiftFollowVerdict | null> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null
  const model = resolveOpenAiModel('OPENAI_VISION_MODEL', 'OPENAI_CHAT_MODEL')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(
      openAiChatCompletionsBody({
        model,
        maxCompletionTokens: 800,
        temperature: 0.1,
        responseFormat: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  'Miras dos capturas de Instagram de un móvil. Da igual el orden.',
                  `Hay que ver si esa persona YA sigue a @${GIFT_IG_SITE} (con el punto) y si YA sigue a @${GIFT_IG_ARTIST}.`,
                  'El punto importa: @optimalbreaks sin punto es otra cuenta y no cuenta como la web. El perfil bueno se llama Optimal Breaks | Breakbeat Bible y enlaza www.optimalbreaks.com.',
                  'Vale «Siguiendo» o «Following». No vale «Seguir», «Follow» ni «Follow back»: eso es que aún no sigue.',
                  'El handle y el botón tienen que leerse. Si el botón no se lee, confident=false.',
                  'Una story, un reel o un post sin el botón del perfil no demuestra el follow.',
                  'Responde solo JSON: {"site_follows":boolean,"artist_follows":boolean,"confident":boolean,"note":"una frase en español"}',
                ].join(' '),
              },
              { type: 'image_url', image_url: { url: dataUrl(input.site, input.siteMime), detail: 'high' } },
              { type: 'image_url', image_url: { url: dataUrl(input.artist, input.artistMime), detail: 'high' } },
            ],
          },
        ],
      }),
    ),
  })
  if (!res.ok) return null
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) return null
  try {
    const parsed = JSON.parse(content.replace(/^```json\s*|```$/g, '').trim()) as {
      site_follows?: boolean
      artist_follows?: boolean
      confident?: boolean
      note?: string
    }
    return {
      siteFollows: parsed.site_follows === true,
      artistFollows: parsed.artist_follows === true,
      confident: parsed.confident === true,
      note: String(parsed.note || '').trim().slice(0, 400),
    }
  } catch {
    return null
  }
}
