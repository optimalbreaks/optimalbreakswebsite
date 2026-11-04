'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  GIFT_IG_ARTIST,
  GIFT_IG_SITE,
  GIFT_SLUG,
  giftInstagramUrl,
} from '@/lib/gift-download'

type Status = 'none' | 'pending' | 'approved' | 'rejected'

const MONO = { fontFamily: "'Courier Prime', monospace" } as const

function loadShot(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    img.src = url
  })
}

/** Dos PNG de iPhone se pasan de los 4,5 MB que admite el servidor y Safari corta el envío. */
async function shrinkShot(file: File): Promise<File> {
  let source: CanvasImageSource
  let width = 0
  let height = 0
  let close: (() => void) | null = null
  try {
    const bmp = await createImageBitmap(file)
    source = bmp
    width = bmp.width
    height = bmp.height
    close = () => bmp.close()
  } catch {
    const img = await loadShot(file)
    source = img
    width = img.naturalWidth
    height = img.naturalHeight
  }
  try {
    const scale = Math.min(1, 1600 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    if (!blob) return file
    return new File([blob], 'captura.jpg', { type: 'image/jpeg' })
  } finally {
    close?.()
  }
}

export default function GiftDownloadBox({ lang }: { lang: 'es' | 'en' }) {
  const es = lang === 'es'
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [status, setStatus] = useState<Status>('none')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/gifts/${GIFT_SLUG}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        setLoggedIn(Boolean(json.loggedIn))
        setStatus(json.status === 'pending' || json.status === 'approved' || json.status === 'rejected' ? json.status : 'none')
        setNote(typeof json.note === 'string' ? json.note : null)
      })
      .catch(() => {
        if (!cancelled) setError(es ? 'No se ha podido comprobar la cuenta' : 'Could not check the account')
      })
    return () => {
      cancelled = true
    }
  }, [es])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const site = (form.elements.namedItem('site') as HTMLInputElement | null)?.files?.[0]
    const artist = (form.elements.namedItem('artist') as HTMLInputElement | null)?.files?.[0]
    if (!site || !artist) {
      setError(es ? 'Faltan las dos capturas' : 'Both screenshots are missing')
      return
    }
    setBusy(true)
    try {
      const data = new FormData()
      data.append('site', await shrinkShot(site))
      data.append('artist', await shrinkShot(artist))
      const res = await fetch(`/api/gifts/${GIFT_SLUG}`, { method: 'POST', body: data })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json.error === 'string' && json.error ? json.error : (es ? 'No se ha enviado' : 'Not sent'))
        return
      }
      setStatus('pending')
      setNote(null)
    } catch {
      setError(es ? 'No se ha podido preparar las capturas. Prueba otra vez.' : 'Could not prepare the screenshots. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const loginHref = `/${lang}/login?next=/${lang}/blog/woter-regala-gone-gone-gone`

  return (
    <section className="mt-10 border-4 border-[var(--ink)] bg-[var(--yellow)] p-5 sm:p-6 shadow-[6px_6px_0_var(--ink)]">
      <h2 className="mb-3 text-[22px] leading-none" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900 }}>
        {es ? 'DESCARGAR EL REGALO' : 'DOWNLOAD THE GIFT'}
      </h2>
      <p className="mb-4 text-[15px] leading-snug" style={MONO}>
        {es
          ? 'Entra con tu cuenta y sube dos capturas del móvil: una en la que se vea que sigues a @optimalbreaks y otra en la que se vea que sigues a @woter_dj. Las miramos. Si las dos se leen, aquí aparece Descargar. Una foto cualquiera no lo abre.'
          : 'Sign in and upload two phone screenshots: one showing you follow @optimalbreaks, and one showing you follow @woter_dj. We look at them. When both are clear, Download shows up here. A random photo does not unlock it.'}
      </p>
      <p className="mb-4 flex flex-wrap gap-3 text-[13px]" style={MONO}>
        <a href={giftInstagramUrl(GIFT_IG_SITE)} target="_blank" rel="noopener noreferrer" className="underline">
          @{GIFT_IG_SITE}
        </a>
        <a href={giftInstagramUrl(GIFT_IG_ARTIST)} target="_blank" rel="noopener noreferrer" className="underline">
          @{GIFT_IG_ARTIST}
        </a>
      </p>

      {loggedIn === null && (
        <p style={MONO}>{es ? 'Cargando…' : 'Loading…'}</p>
      )}

      {loggedIn === false && (
        <Link
          href={loginHref}
          className="inline-block border-4 border-[var(--ink)] bg-[var(--red)] px-5 py-3 text-white shadow-[4px_4px_0_var(--ink)]"
          style={{ ...MONO, fontWeight: 700 }}
        >
          {es ? 'ENTRAR PARA PEDIRLO' : 'SIGN IN TO REQUEST IT'}
        </Link>
      )}

      {loggedIn && status === 'approved' && (
        <a
          href={`/api/gifts/${GIFT_SLUG}/file`}
          className="inline-block border-4 border-[var(--ink)] bg-[var(--red)] px-5 py-3 text-white shadow-[4px_4px_0_var(--ink)]"
          style={{ ...MONO, fontWeight: 700 }}
        >
          {es ? 'DESCARGAR MP3' : 'DOWNLOAD MP3'}
        </a>
      )}

      {loggedIn && status === 'pending' && (
        <p className="border-4 border-[var(--ink)] bg-[var(--paper)] p-4 text-[15px]" style={MONO}>
          {es
            ? 'Recibido. Cuando hayamos mirado las dos capturas, esta misma página enseña el botón. Puedes volver más tarde con la misma cuenta.'
            : 'Received. Once we have looked at both screenshots, this same page shows the button. Come back later with the same account.'}
        </p>
      )}

      {loggedIn && (status === 'none' || status === 'rejected') && (
        <form onSubmit={onSubmit} className="space-y-4">
          {status === 'rejected' && (
            <p className="border-4 border-[var(--ink)] bg-[var(--paper)] p-4 text-[15px]" style={MONO}>
              {es ? 'No ha valido. ' : 'That one did not count. '}
              {note || (es ? 'Sube otras dos capturas.' : 'Upload two other screenshots.')}
            </p>
          )}
          <label className="block text-[13px]" style={MONO}>
            {es ? 'Captura: sigues a @optimalbreaks' : 'Screenshot: you follow @optimalbreaks'}
            <input name="site" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full text-[14px]" />
          </label>
          <label className="block text-[13px]" style={MONO}>
            {es ? 'Captura: sigues a @woter_dj' : 'Screenshot: you follow @woter_dj'}
            <input name="artist" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full text-[14px]" />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="border-4 border-[var(--ink)] bg-[var(--ink)] px-5 py-3 text-white disabled:opacity-60"
            style={{ ...MONO, fontWeight: 700 }}
          >
            {busy ? (es ? 'ENVIANDO…' : 'SENDING…') : es ? 'ENVIAR CAPTURAS' : 'SEND SCREENSHOTS'}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-3 text-[14px] text-[var(--red)]" style={MONO}>{error}</p>
      )}
    </section>
  )
}
