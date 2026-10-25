// ============================================
// OPTIMAL BREAKS — Botones R / F (vídeo para Instagram / Facebook)
//
// Solo admins (el que lo monta decide). Genérico: recibe cómo generar el vídeo
// y cómo escribir el texto del post, y se encarga del estado, el progreso, el
// portapapeles y el compartir/descargar:
//  · R → vídeo vertical 1080×1920. En móvil, si el render termina sin gesto del
//    usuario, queda «↗ R» y el segundo toque comparte y copia el texto (iOS lo exige).
//  · F → vídeo horizontal 1920×1080: se descarga y copia el texto con el enlace.
// El texto (GPT‑5.6, con plantilla de respaldo) se pide a la vez que se dibuja el vídeo.
// Lo usan las sesiones y el blog (ShareButtons), el Top 100 y cada semana de New Releases.
// Con `audio` (resumen de /topreleases), R y F abren antes el selector de fragmento
// (`AudioSegmentPicker`), como los temas, y el vídeo sale con ese audio.
// ============================================

'use client'

import { useState } from 'react'
import { copyShareLink } from '@/lib/share-track'
import type { ReelFormat, ReelResult } from '@/lib/reel-renderer'
import type { SharePlatform } from '@/lib/share-caption'
import type { ShareAudioSegment } from '@/lib/share-audio'
import type { Locale } from '@/lib/i18n-config'
import AudioSegmentPicker from './AudioSegmentPicker'

type VideoState = 'idle' | 'busy' | 'ready' | 'done' | 'error'

export interface VideoShareButtonsProps {
  lang: string
  /** Título para `navigator.share`. */
  title: string
  /** Prefijo del archivo descargado: `optimal-breaks-<fileBase>-reel.mp4`. */
  fileBase: string
  /** Qué se comparte, para los tooltips («del Top 100», «de esta semana»…). */
  what: { es: string; en: string }
  makeVideo: (format: ReelFormat, onProgress: (ratio: number) => void, audio: ShareAudioSegment | null) => Promise<ReelResult>
  makeCaption: (platform: SharePlatform) => Promise<string>
  /** Tema que suena (URL del mismo origen). Se eligen 30 s, como en los temas; si el vídeo dura más, sigue el tema. */
  audio?: { src: string; key: string; label: string } | null
  /** `light` = sobre papel claro (borde de tinta). Por defecto, botón oscuro como el resto de compartir. */
  tone?: 'dark' | 'light'
}

export default function VideoShareButtons({ lang, title, fileBase, what, makeVideo, makeCaption, audio, tone = 'dark' }: VideoShareButtonsProps) {
  const es = lang === 'es'
  const [picker, setPicker] = useState<'reel' | 'fb' | null>(null)
  const [reelState, setReelState] = useState<VideoState>('idle')
  const [reelPct, setReelPct] = useState(0)
  const [reelFile, setReelFile] = useState<File | null>(null)
  const [reelCaption, setReelCaption] = useState<string | null>(null)
  const [fbState, setFbState] = useState<VideoState>('idle')
  const [fbPct, setFbPct] = useState(0)
  const busy = reelState === 'busy' || fbState === 'busy' || picker != null
  const whatTxt = es ? what.es : what.en
  const audioTxt = audio ? (es ? 'con el audio que elijas' : 'with the audio you pick') : es ? 'sin audio' : 'no audio'

  /** Aviso si el vídeo salió mudo. Después de compartir: el cuadro se come el gesto. */
  const warnIfMuted = (muted?: boolean) => {
    if (!muted) return
    window.alert(
      es
        ? 'Este navegador no ha podido meter el audio en el vídeo: sale mudo. Prueba en Chrome o desde el ordenador.'
        : 'This browser could not add the audio to the video: it is silent. Try Chrome or a computer.',
    )
  }

  const shareOrDownload = async (file: File, text?: string | null) => {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title, ...(text ? { text } : {}) })
      } catch {
        /* cancelado */
      }
      return
    }
    download(file)
  }

  const download = (file: Blob & { name?: string }, name?: string) => {
    const href = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = href
    a.download = name || (file as File).name || 'optimal-breaks-video.mp4'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 4000)
  }

  const finish = (set: (s: VideoState) => void) => {
    set('done')
    setTimeout(() => set('idle'), 2200)
  }
  const fail = (set: (s: VideoState) => void, err: unknown, tag: string) => {
    console.error(`[${tag}]`, err)
    set('error')
    setTimeout(() => set('idle'), 2500)
  }

  const onReel = async () => {
    if (busy && reelState !== 'ready') return
    if (reelState === 'ready' && reelFile) {
      // Toque nuevo (gesto del usuario): copiar y compartir funciona también en iOS.
      if (reelCaption) await copyShareLink(reelCaption)
      await shareOrDownload(reelFile, reelCaption)
      setReelFile(null)
      finish(setReelState)
      return
    }
    if (audio) return setPicker('reel')
    await renderReel(null)
  }

  const renderReel = async (segment: ShareAudioSegment | null) => {
    setReelState('busy')
    setReelPct(0)
    try {
      const captionP = makeCaption('instagram')
      const video = await makeVideo('vertical', (r) => setReelPct(Math.min(99, Math.round(r * 100))), segment)
      const caption = await captionP
      setReelCaption(caption)
      const file = new File([video.blob], `optimal-breaks-${fileBase}-reel.${video.ext}`, { type: video.mime })
      const nav = navigator as Navigator & { userActivation?: { isActive: boolean } }
      if (nav.canShare?.({ files: [file] }) && !nav.userActivation?.isActive) {
        setReelFile(file)
        setReelState('ready')
        warnIfMuted(video.audioMissing)
        return
      }
      await copyShareLink(caption)
      await shareOrDownload(file, caption)
      finish(setReelState)
      warnIfMuted(video.audioMissing)
    } catch (err) {
      fail(setReelState, err, `${fileBase} reel`)
    }
  }

  const onFacebook = async () => {
    if (busy) return
    if (audio) return setPicker('fb')
    await renderFacebook(null)
  }

  const renderFacebook = async (segment: ShareAudioSegment | null) => {
    setFbState('busy')
    setFbPct(0)
    try {
      const captionP = makeCaption('facebook')
      const video = await makeVideo('horizontal', (r) => setFbPct(Math.min(99, Math.round(r * 100))), segment)
      const caption = await captionP
      download(video.blob, `optimal-breaks-${fileBase}-facebook.${video.ext}`)
      await copyShareLink(caption)
      finish(setFbState)
      warnIfMuted(video.audioMissing)
    } catch (err) {
      fail(setFbState, err, `${fileBase} facebook`)
    }
  }

  /** «Generar» en el selector: sigue el botón que lo abrió, con ese fragmento. */
  const onPickerConfirm = (segment: ShareAudioSegment | null) => {
    const kind = picker
    setPicker(null)
    if (kind === 'reel') void renderReel(segment)
    else if (kind === 'fb') void renderFacebook(segment)
  }

  const cls = (st: VideoState) =>
    `inline-flex items-center justify-center h-9 min-w-9 px-3 border-2 transition-all duration-150 cursor-pointer disabled:cursor-wait ${
      st === 'done' || st === 'ready'
        ? 'bg-[var(--acid)] border-[var(--acid)] text-white'
        : st === 'error'
          ? 'bg-[var(--red)] border-[var(--red)] text-white'
          : tone === 'light'
            ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:border-[var(--red)] hover:text-white'
            : 'border-white/30 bg-[var(--ink)] text-white/80 hover:border-white hover:text-white'
    }`
  const style = {
    fontFamily: "'Courier Prime', monospace",
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '1px',
  } as const

  return (
    <>
      <button
        type="button"
        onClick={onReel}
        disabled={busy && reelState !== 'ready'}
        className={cls(reelState)}
        style={style}
        title={
          reelState === 'done'
            ? es
              ? 'Reel listo · texto del post copiado: pégalo en Instagram'
              : 'Reel ready · post text copied: paste it in Instagram'
            : reelState === 'ready'
              ? es
                ? 'Reel listo: toca para compartir (se copia el texto del post)'
                : 'Reel ready: tap to share (post text gets copied)'
              : reelState === 'error'
                ? es
                  ? 'No se pudo generar el reel'
                  : 'Could not generate the reel'
                : es
                  ? `Reel de Instagram ${whatTxt} (${audioTxt}): genera el vídeo y copia el texto del post`
                  : `Instagram Reel ${whatTxt} (${audioTxt}): generate video and copy the post text`
        }
        aria-label={es ? 'Reel de Instagram' : 'Instagram Reel'}
      >
        {reelState === 'busy' ? `${reelPct}%` : reelState === 'ready' ? '↗ R' : reelState === 'done' ? '✓ R' : reelState === 'error' ? '✕' : 'R'}
      </button>
      <button
        type="button"
        onClick={onFacebook}
        disabled={busy}
        className={cls(fbState)}
        style={style}
        title={
          fbState === 'done'
            ? es
              ? 'Vídeo descargado · texto del post copiado: pégalo en Facebook'
              : 'Video downloaded · post text copied: paste it in Facebook'
            : fbState === 'error'
              ? es
                ? 'No se pudo generar el vídeo'
                : 'Could not generate the video'
              : es
                ? `Vídeo horizontal ${whatTxt} para Facebook (${audioTxt}): descarga el MP4 y copia el texto del post`
                : `Horizontal video ${whatTxt} for Facebook (${audioTxt}): download MP4 and copy the post text`
        }
        aria-label={es ? 'Vídeo para Facebook' : 'Facebook video'}
      >
        {fbState === 'busy' ? `${fbPct}%` : fbState === 'done' ? '✓ F' : fbState === 'error' ? '✕' : 'F'}
      </button>
      {picker && audio ? (
        <AudioSegmentPicker
          lang={(es ? 'es' : 'en') as Locale}
          audioUrl={audio.src}
          segmentKey={audio.key}
          trackTitle={audio.label}
          confirmLabel={picker === 'reel' ? (es ? 'Generar reel' : 'Generate reel') : es ? 'Generar vídeo' : 'Generate video'}
          onConfirm={onPickerConfirm}
          onCancel={() => setPicker(null)}
        />
      ) : null}
    </>
  )
}
