export type ShareInboxPayload = {
  title: string
  text: string
  url: string
  files: File[]
  createdAt: number
}

/** Lee y vacía el inbox del Share Target (Cache API, escrito por el Service Worker). */
export async function consumeShareInbox(): Promise<ShareInboxPayload | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null
  try {
    const cache = await caches.open('ob-share-inbox')
    const metaRes = await cache.match('/__share_payload__')
    if (!metaRes) return null
    const meta = (await metaRes.json()) as {
      title?: string
      text?: string
      url?: string
      fileCount?: number
      createdAt?: number
    }
    const files: File[] = []
    const count = Number(meta.fileCount || 0)
    for (let i = 0; i < count; i++) {
      const fr = await cache.match(`/__share_file_${i}__`)
      if (!fr) continue
      const blob = await fr.blob()
      const subtype = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      const name = fr.headers.get('x-filename') || `captura-${i + 1}.${subtype}`
      files.push(new File([blob], name, { type: blob.type || 'image/jpeg' }))
    }
    await cache.delete('/__share_payload__')
    for (let i = 0; i < count; i++) await cache.delete(`/__share_file_${i}__`)
    return {
      title: String(meta.title || ''),
      text: String(meta.text || ''),
      url: String(meta.url || ''),
      files,
      createdAt: Number(meta.createdAt || 0),
    }
  } catch {
    return null
  }
}
