// ============================================
// OPTIMAL BREAKS — Track Share Button (compact)
// Un solo botón por fila de chart / saved track / beatport top. Prioriza
// `navigator.share` (móvil nativo) y cae a `clipboard` con feedback "✓".
// Para páginas de detalle (artista/sello/mix) seguimos usando el bloque
// grande X/WA/FB: `src/components/ShareButtons.tsx`.
//
// Tres modos de uso:
//  1) Charts (40 Breaks / New Releases): `source` + `trackId` + `weekDate`.
//  2) Top Beatport en ficha (artista/sello) o cualquier link interno ya
//     construido: `path` directo (p.ej. `/es/artists/prodigy?play=beatport:123456`).
//  3) URL absoluta externa (beatport_top sin contexto OB interno): `externalUrl`.
//     Vinilos y chart/featured usan path en optimalbreaks.com vía `path`.
//     Beatport Top también genera story IG (`play=beatport:<id>` + snapshot).
//
// Admins y artistas con ficha reclamada ven además «IG» (Story), «R» (reel
// vertical MP4 para Instagram) y «F» (vídeo horizontal 16:9 para Facebook,
// solo descarga). Si el tema tiene preview, los tres llevan su audio: antes
// de generar se elige el fragmento de 30 s en `AudioSegmentPicker` (el mismo
// para los tres). Sin preview: Story en imagen con aviso y vídeos mudos.
// Los vídeos se renderizan en el navegador con `src/lib/reel-renderer.ts`.
// ============================================

'use client'

import { aiShareCaption } from '@/lib/share-caption'
import { useRef, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import AudioSegmentPicker from '@/components/AudioSegmentPicker'
import { SHARE_SEGMENT_SEC, type ShareAudioSegment } from '@/lib/share-audio'
import type { Locale } from '@/lib/i18n-config'
import {
  appendTrackStoryMeta,
  buildAbsoluteShareUrl,
  buildVideoCaption,
  buildTrackSharePath,
  copyShareLink,
  extractBeatportTrackId,
  parsePlayParam,
  releaseBadge,
  storyFromSharePath,
  type TrackStoryMeta,
} from '@/lib/share-track'

interface BaseProps {
  lang: Locale
  /** Texto que se muestra en el prompt nativo (móvil). Típicamente "Título — Artistas". */
  shareTitle: string
  /** `lg` = botón cuadrado del mini reproductor (mismo tacto que play/pause). */
  size?: 'sm' | 'lg'
  /** Fallback de la story IG para Beatport Top (snapshot) si el Top 10 ya rotó. */
  storyMeta?: TrackStoryMeta
}

interface ChartModeProps extends BaseProps {
  source: 'chart' | 'featured'
  trackId: string
  /** Fecha ISO (YYYY-MM-DD) de la edición del chart a la que pertenece. */
  weekDate: string
  path?: never
  externalUrl?: never
}

interface PathModeProps extends BaseProps {
  /** Path relativo ya listo (empezando por '/'). */
  path: string
  source?: never
  trackId?: never
  weekDate?: never
  externalUrl?: never
}

interface ExternalUrlModeProps extends BaseProps {
  /** URL absoluta (http(s)://…). Se copia/comparte tal cual sin prefijar SITE_URL. */
  externalUrl: string
  source?: never
  trackId?: never
  weekDate?: never
  path?: never
}

type Props = ChartModeProps | PathModeProps | ExternalUrlModeProps

/** Datos del tema de `/api/og/story?format=json` (los usan los tres vídeos). */
type VideoData = {
  title: string
  artists: string
  meta: string
  kicker: string
  artwork: string | null
  bpm?: number
  releaseDate?: string | null
  label?: string | null
  musicKey?: string | null
  year?: number | null
  /** URL del mismo origen del audio del tema; null = sin preview (vídeo mudo). */
  audio?: string | null
  lang: 'en'
}

function resolveFullUrl(props: Props): string {
  if ('externalUrl' in props && props.externalUrl) {
    return buildAbsoluteShareUrl(props.externalUrl)
  }
  if ('path' in props && props.path) {
    return buildAbsoluteShareUrl(props.path)
  }
  return buildAbsoluteShareUrl(
    buildTrackSharePath(props.lang, props.source!, props.trackId!, props.weekDate!),
  )
}

/**
 * Valor `play=` (chart:<id> / featured:<id> / vinyl:<id> / beatport:<id>)
 * para pedir la imagen de Story a `/api/og/story`. Beatport Top resuelve
 * por ficha (`from=artists|labels/slug`) o por `storyMeta` (snapshot).
 */
function resolveStoryPlayParam(props: Props): string | null {
  if ('source' in props && props.source && props.trackId) {
    return `${props.source}:${props.trackId}`
  }
  if ('path' in props && props.path) {
    const query = props.path.split('?')[1]
    if (!query) return null
    const parsed = parsePlayParam(new URLSearchParams(query).get('play'))
    if (parsed?.kind === 'track') return `${parsed.source}:${parsed.id}`
    if (parsed?.kind === 'vinyl') return `vinyl:${parsed.id}`
    if (parsed?.kind === 'beatport') return `beatport:${parsed.id}`
  }
  if ('externalUrl' in props && props.externalUrl) {
    const bpId = extractBeatportTrackId(props.externalUrl)
    if (bpId) return `beatport:${bpId}`
  }
  return null
}

export default function TrackShareButton(props: Props) {
  const [copied, setCopied] = useState(false)
  const [storyState, setStoryState] = useState<'idle' | 'busy' | 'ready' | 'done'>('idle')
  const [storyPct, setStoryPct] = useState(0)
  /** Story ya generada a la espera del 2.º toque (ver `shareNeedsSecondTap`). */
  const [storyFile, setStoryFile] = useState<File | null>(null)
  /** Selector de fragmento abierto: qué botón lo pidió y con qué datos. */
  const [picker, setPicker] = useState<{ kind: 'story' | 'reel' | 'fb'; data: VideoData; audioUrl: string } | null>(null)
  const videoDataRef = useRef<{ play: string; p: Promise<VideoData> } | null>(null)
  const [reelState, setReelState] = useState<'idle' | 'busy' | 'ready' | 'done' | 'error'>('idle')
  const [reelPct, setReelPct] = useState(0)
  // Render de ~10 s: al terminar, el gesto del clic ya caducó y el navegador
  // rechaza `navigator.share`. Guardamos el vídeo y pedimos un 2.º toque.
  const [reelFile, setReelFile] = useState<File | null>(null)
  /** Texto del post del reel (se copia al compartir; ver `buildVideoCaption`). */
  const [reelCaption, setReelCaption] = useState<string | null>(null)
  const [fbState, setFbState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [fbPct, setFbPct] = useState(0)
  // Un solo render a la vez (el renderer usa un lienzo por formato).
  const videoBusy = reelState === 'busy' || fbState === 'busy'
  const anyBusy = videoBusy || storyState === 'busy' || picker != null
  const { isAdmin, isClaimedArtist } = useAuth()
  const es = props.lang === 'es'
  const fullUrl = resolveFullUrl(props)
  // IG, R y F: admin o artista con ficha reclamada. El resto de la web no los ve.
  const storyPlay = isAdmin || isClaimedArtist ? resolveStoryPlayParam(props) : null

  /** Query común de `/api/og/story` (Story PNG y datos del reel). */
  function storyParams(play: string): URLSearchParams {
    const params = new URLSearchParams({ play, lang: props.lang })
    const from = 'path' in props ? storyFromSharePath(props.path) : null
    if (from) params.set('from', from)
    appendTrackStoryMeta(params, props.storyMeta)
    return params
  }

  /** Comparte un archivo (móvil → Instagram) o lo descarga (escritorio). */
  async function shareOrDownload(file: File, text?: string | null) {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav?.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: props.shareTitle, ...(text ? { text } : {}) })
      } catch {
        // Cancelación del usuario: no es un error.
      }
      return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  /** Datos del tema para los vídeos (siempre en inglés: público internacional). */
  async function fetchVideoData(play: string) {
    const params = storyParams(play)
    params.set('format', 'json')
    params.set('lang', 'en')
    const res = await fetch(`/api/og/story?${params.toString()}`)
    if (!res.ok) throw new Error(`reel data ${res.status}`)
    return { ...(await res.json()), lang: 'en' as const } as VideoData
  }

  /** Una sola petición de datos por tema: IG, R y F la comparten. */
  function getVideoData(play: string): Promise<VideoData> {
    const hit = videoDataRef.current
    if (hit && hit.play === play) return hit.p
    const p = fetchVideoData(play)
    p.catch(() => {
      if (videoDataRef.current?.p === p) videoDataRef.current = null
    })
    videoDataRef.current = { play, p }
    return p
  }

  /** Texto del post: GPT‑5.6 (`/api/admin/share-caption`) con la plantilla de respaldo. */
  function videoCaption(data: VideoData, platform: 'instagram' | 'facebook') {
    const status = releaseBadge(data.releaseDate, data.year)
    return aiShareCaption({
      kind: 'track',
      platform,
      lang: props.lang,
      url: fullUrl,
      fallback: buildVideoCaption(data, { lang: props.lang, url: fullUrl, platform }),
      context: {
        title: data.title,
        artists: data.artists,
        label: data.label,
        releaseDate: data.releaseDate,
        year: data.year,
        bpm: data.bpm,
        key: data.musicKey,
        section: data.kicker,
        releaseStatus: status
          ? { soon: 'coming_soon', new: 'new_release', archive: 'archive_pick' }[status.tone]
          : null,
        daysSinceRelease: status?.days ?? null,
        videoSticker: status ? `${status.word} · ${status.sub}` : null,
      },
    })
  }

  /**
   * Tras un render largo, el gesto del clic ya caducó y el navegador rechaza
   * `navigator.share`: en ese caso guardamos el archivo y pedimos un 2.º toque.
   */
  /** Aviso si el vídeo se abrió y no tenía audio. No llamarlo antes de `navigator.share`: el cuadro se come el gesto. */
  function warnIfMuted(muted: boolean) {
    if (!muted) return
    window.alert(
      es
        ? 'Este navegador no ha podido meter el audio en el vídeo: sale mudo. Prueba en Chrome o desde el ordenador.'
        : 'This browser could not add the audio to the video: it is silent. Try Chrome or a computer.',
    )
  }

  function canShareFile(file: File): boolean {
    try {
      return !!navigator.canShare?.({ files: [file] })
    } catch {
      return false
    }
  }

  function shareNeedsSecondTap(file: File): boolean {
    const nav = navigator as Navigator & { userActivation?: { isActive: boolean } }
    return !!nav.canShare?.({ files: [file] }) && !nav.userActivation?.isActive
  }

  /**
   * Botón "IG": Story de Instagram. Si el tema tiene audio (preview o audio
   * alojado), se elige el fragmento en `AudioSegmentPicker` y sale un MP4
   * 1080×1920 con el diseño de la Story (`/api/og/story?audio=1`, sin aviso)
   * y ese audio. Sin audio, la imagen PNG de siempre, con el aviso de que el
   * sticker de música de Instagram no es el tema. Antes se copia el enlace del
   * tema para pegarlo en el sticker de enlace. En escritorio se descarga.
   */
  async function onStoryClick() {
    if (!storyPlay) return
    if (storyState === 'ready' && storyFile) {
      await shareOrDownload(storyFile)
      setStoryFile(null)
      setStoryState('done')
      setTimeout(() => setStoryState('idle'), 1800)
      return
    }
    if (anyBusy) return
    setStoryState('busy')
    setStoryPct(0)
    try {
      await copyShareLink(fullUrl)
      const data = await getVideoData(storyPlay)
      if (data.audio) {
        setStoryState('idle')
        setPicker({ kind: 'story', data, audioUrl: data.audio })
        return
      }
      await renderStory(null)
    } catch (err) {
      console.error('[story]', err)
      setStoryState('idle')
    }
  }

  async function renderStory(segment: ShareAudioSegment | null) {
    if (!storyPlay) return
    setStoryState('busy')
    setStoryPct(0)
    try {
      const params = storyParams(storyPlay)
      if (segment) params.set('audio', '1')
      const res = await fetch(`/api/og/story?${params.toString()}`)
      if (!res.ok) throw new Error(`story ${res.status}`)
      const png = await res.blob()
      let file: File
      let muted = false
      if (segment) {
        const image = await createImageBitmap(png)
        const { renderStillVideo } = await import('@/lib/reel-renderer')
        const video = await renderStillVideo(image, 1080, 1920, {
          durationSec: SHARE_SEGMENT_SEC,
          audio: segment,
          onProgress: (r) => setStoryPct(Math.min(99, Math.round(r * 100))),
        })
        image.close()
        file = new File([video.blob], `optimal-breaks-story.${video.ext}`, { type: video.mime })
        muted = !!video.audioMissing
        // Con audio confirmado en silencio y menú de compartir: el aviso va ahora
        // y el archivo espera un segundo toque. Así el cuadro no se come el gesto.
        if (muted && canShareFile(file)) {
          setStoryFile(file)
          setStoryState('ready')
          warnIfMuted(true)
          return
        }
      } else {
        file = new File([png], 'optimal-breaks-story.png', { type: 'image/png' })
      }
      if (shareNeedsSecondTap(file)) {
        setStoryFile(file)
        setStoryState('ready')
        return
      }
      await shareOrDownload(file)
      setStoryState('done')
      setTimeout(() => setStoryState('idle'), 1800)
      warnIfMuted(muted)
    } catch (err) {
      console.error('[story]', err)
      setStoryState('idle')
    }
  }

  /**
   * Botón "R": reel 1080×1920 (30 s). Pide los datos del tema a
   * `/api/og/story?format=json`; si hay audio, primero el selector de
   * fragmento. Dibuja y codifica el MP4 en el navegador (WebCodecs; el módulo
   * se carga solo al pulsar) con ese audio y lo comparte/descarga. Copia el
   * texto del post (tema, artistas, sello, fecha) para pegarlo en Instagram.
   */
  async function onReelClick() {
    if (!storyPlay) return
    if (reelState === 'ready' && reelFile) {
      // Toque nuevo = gesto del usuario: copiar el texto aquí funciona también en iOS.
      if (reelCaption) await copyShareLink(reelCaption)
      await shareOrDownload(reelFile, reelCaption)
      setReelFile(null)
      setReelState('done')
      setTimeout(() => setReelState('idle'), 2200)
      return
    }
    if (anyBusy) return
    setReelState('busy')
    setReelPct(0)
    try {
      await copyShareLink(fullUrl)
      const data = await getVideoData(storyPlay)
      if (data.audio) {
        setReelState('idle')
        setPicker({ kind: 'reel', data, audioUrl: data.audio })
        return
      }
      await renderReelVideo(data, null)
    } catch (err) {
      console.error('[reel]', err)
      setReelState('error')
      setTimeout(() => setReelState('idle'), 2500)
    }
  }

  async function renderReelVideo(data: VideoData, segment: ShareAudioSegment | null) {
    setReelState('busy')
    setReelPct(0)
    try {
      // Texto con GPT‑5.6 en paralelo al render (plantilla si falla).
      const captionP = videoCaption(data, 'instagram')
      const { renderReel } = await import('@/lib/reel-renderer')
      const reel = await renderReel(data, {
        format: 'vertical',
        durationSec: SHARE_SEGMENT_SEC,
        audio: segment,
        onProgress: (r) => setReelPct(Math.min(99, Math.round(r * 100))),
      })
      const caption = await captionP
      setReelCaption(caption)
      const file = new File([reel.blob], `optimal-breaks-reel.${reel.ext}`, { type: reel.mime })
      if (reel.audioMissing && canShareFile(file)) {
        setReelFile(file)
        setReelState('ready')
        warnIfMuted(true)
        return
      }
      if (shareNeedsSecondTap(file)) {
        setReelFile(file)
        setReelState('ready')
        return
      }
      await copyShareLink(caption)
      await shareOrDownload(file, caption)
      setReelState('done')
      setTimeout(() => setReelState('idle'), 2200)
      warnIfMuted(!!reel.audioMissing)
    } catch (err) {
      console.error('[reel]', err)
      setReelState('error')
      setTimeout(() => setReelState('idle'), 2500)
    }
  }

  /**
   * Botón "F": vídeo horizontal 1920×1080 para Facebook. Mismo diseño que el
   * reel, reorganizado en 16:9, y mismo audio (el fragmento ya elegido para el
   * tema sale preseleccionado). Siempre se descarga (también en móvil, sin
   * menú de compartir) y copia el texto del post con el enlace del tema.
   */
  async function onFacebookClick() {
    if (!storyPlay || anyBusy) return
    setFbState('busy')
    setFbPct(0)
    try {
      await copyShareLink(fullUrl)
      const data = await getVideoData(storyPlay)
      if (data.audio) {
        setFbState('idle')
        setPicker({ kind: 'fb', data, audioUrl: data.audio })
        return
      }
      await renderFacebookVideo(data, null)
    } catch (err) {
      console.error('[facebook video]', err)
      setFbState('error')
      setTimeout(() => setFbState('idle'), 2500)
    }
  }

  async function renderFacebookVideo(data: VideoData, segment: ShareAudioSegment | null) {
    setFbState('busy')
    setFbPct(0)
    try {
      const captionP = videoCaption(data, 'facebook')
      const { renderReel } = await import('@/lib/reel-renderer')
      const video = await renderReel(data, {
        format: 'horizontal',
        durationSec: SHARE_SEGMENT_SEC,
        audio: segment,
        onProgress: (r) => setFbPct(Math.min(99, Math.round(r * 100))),
      })
      const caption = await captionP
      const url = URL.createObjectURL(video.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `optimal-breaks-facebook.${video.ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      await copyShareLink(caption)
      setFbState('done')
      setTimeout(() => setFbState('idle'), 2200)
      warnIfMuted(!!video.audioMissing)
    } catch (err) {
      console.error('[facebook video]', err)
      setFbState('error')
      setTimeout(() => setFbState('idle'), 2500)
    }
  }

  /** «Generar» en el selector: cada botón sigue con su render y ese fragmento. */
  function onPickerConfirm(segment: ShareAudioSegment | null) {
    const p = picker
    setPicker(null)
    if (!p) return
    if (p.kind === 'story') void renderStory(segment)
    else if (p.kind === 'reel') void renderReelVideo(p.data, segment)
    else void renderFacebookVideo(p.data, segment)
  }

  async function onClick() {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ title: props.shareTitle, url: fullUrl })
        return
      } catch {
        // Cancelación del usuario: silencio. Si es error real, cae al copy.
      }
    }
    const ok = await copyShareLink(fullUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  const size = props.size ?? 'sm'
  const base =
    size === 'lg'
      ? 'w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center text-base sm:text-sm font-black border-2 transition-all touch-manipulation cursor-pointer shrink-0'
      : 'inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 transition-all no-underline touch-manipulation whitespace-nowrap cursor-pointer'
  const stateCls = copied
    ? 'border-[var(--ink)] bg-[var(--acid)] text-white'
    : 'border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'

  const label = copied ? '✓' : '🔗'
  const title = copied
    ? (es ? 'Enlace copiado' : 'Link copied')
    : (es ? 'Copiar / compartir enlace' : 'Copy / share link')

  const storyStateCls = storyState === 'done' || storyState === 'ready'
    ? 'border-[var(--ink)] bg-[var(--acid)] text-white'
    : 'border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'
  const storyLabel = storyState === 'done'
    ? '✓'
    : storyState === 'ready'
      ? '↗'
      : storyState === 'busy'
        ? (storyPct > 0 ? `${storyPct}%` : '…')
        : 'IG'
  const storyTitle = storyState === 'done'
    ? (es ? 'Story lista · enlace copiado' : 'Story ready · link copied')
    : storyState === 'ready'
      ? (es ? 'Story lista: toca para compartir' : 'Story ready: tap to share')
      : (es
          ? 'Story de Instagram: con audio del tema si tiene preview (eliges el fragmento); copia el enlace'
          : 'Instagram Story: with the track audio if there is a preview (you pick the fragment); copies the link')

  const reelStateCls = reelState === 'done' || reelState === 'ready'
    ? 'border-[var(--ink)] bg-[var(--acid)] text-white'
    : reelState === 'error'
      ? 'border-[var(--ink)] bg-[var(--red)] text-white'
      : 'border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'
  const reelLabel = reelState === 'done'
    ? '✓'
    : reelState === 'ready'
      ? '↗'
    : reelState === 'error'
      ? '✕'
      : reelState === 'busy'
        ? `${reelPct}%`
        : 'R'
  const reelTitle = reelState === 'done'
    ? (es ? 'Reel listo · texto del post copiado: pégalo en Instagram' : 'Reel ready · post text copied: paste it in Instagram')
    : reelState === 'ready'
      ? (es ? 'Reel listo: toca para compartir (se copia el texto del post)' : 'Reel ready: tap to share (post text gets copied)')
    : reelState === 'error'
      ? (es ? 'No se pudo generar el reel' : 'Could not generate the reel')
      : (es
          ? 'Reel de Instagram con audio del tema (si tiene preview): genera el vídeo y copia el texto del post'
          : 'Instagram Reel with the track audio (if there is a preview): generate video and copy the post text')

  const fbStateCls = fbState === 'done'
    ? 'border-[var(--ink)] bg-[var(--acid)] text-white'
    : fbState === 'error'
      ? 'border-[var(--ink)] bg-[var(--red)] text-white'
      : 'border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'
  const fbLabel = fbState === 'done'
    ? '✓'
    : fbState === 'error'
      ? '✕'
      : fbState === 'busy'
        ? `${fbPct}%`
        : 'F'
  const fbTitle = fbState === 'done'
    ? (es ? 'Vídeo descargado · texto del post copiado: pégalo en Facebook' : 'Video downloaded · post text copied: paste it in Facebook')
    : fbState === 'error'
      ? (es ? 'No se pudo generar el vídeo' : 'Could not generate the video')
      : (es
          ? 'Vídeo horizontal para Facebook con audio del tema (si tiene preview): descarga el MP4 y copia el texto del post'
          : 'Horizontal video for Facebook with the track audio (if there is a preview): download MP4 and copy the post text')

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick() }}
        className={`${base} ${stateCls}`}
        style={{ fontFamily: "'Courier Prime', monospace" }}
        title={title}
        aria-label={title}
      >
        {label}
      </button>
      {storyPlay ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onStoryClick() }}
          className={`${base} ${storyStateCls}`}
          style={{ fontFamily: "'Courier Prime', monospace" }}
          title={storyTitle}
          aria-label={storyTitle}
          disabled={storyState !== 'ready' && anyBusy}
        >
          {storyLabel}
        </button>
      ) : null}
      {storyPlay ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onReelClick() }}
          className={`${base} ${reelStateCls}`}
          style={{ fontFamily: "'Courier Prime', monospace" }}
          title={reelTitle}
          aria-label={reelTitle}
          disabled={reelState !== 'ready' && anyBusy}
        >
          {reelLabel}
        </button>
      ) : null}
      {storyPlay ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onFacebookClick() }}
          className={`${base} ${fbStateCls}`}
          style={{ fontFamily: "'Courier Prime', monospace" }}
          title={fbTitle}
          aria-label={fbTitle}
          disabled={anyBusy}
        >
          {fbLabel}
        </button>
      ) : null}
      {picker && storyPlay ? (
        <AudioSegmentPicker
          lang={props.lang}
          audioUrl={picker.audioUrl}
          segmentKey={storyPlay}
          trackTitle={props.shareTitle}
          confirmLabel={
            picker.kind === 'story'
              ? (es ? 'Generar story' : 'Generate story')
              : picker.kind === 'reel'
                ? (es ? 'Generar reel' : 'Generate reel')
                : (es ? 'Generar vídeo' : 'Generate video')
          }
          onConfirm={onPickerConfirm}
          onCancel={() => setPicker(null)}
        />
      ) : null}
    </>
  )
}

// ============================================
// Botones de plataforma compartidos (ChartView, BeatportTopTracks,
// ArtistFeaturedTracks). En móvil (<sm) son circulares con el logo de la marca;
// en escritorio, pastilla con texto. Spotify: enlace directo al track si hay
// match verificado (`spotify_url`, rellenado por scripts/spotify-match-charts.mjs);
// si no, búsqueda en Spotify con artista + título.
// ============================================

/** Logo oficial Spotify (simple-icons, viewBox 24). Sobre verde va en negro (branding oficial). */
const SPOTIFY_ICON_PATH = 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z'

/** Logo oficial Beatport «b» (simple-icons, viewBox 24). */
const BEATPORT_ICON_PATH = 'M21.429 17.055a7.114 7.114 0 0 1-.794 3.246 6.917 6.917 0 0 1-2.181 2.492 6.698 6.698 0 0 1-3.063 1.163 6.653 6.653 0 0 1-3.239-.434 6.796 6.796 0 0 1-2.668-1.932 7.03 7.03 0 0 1-1.481-2.983 7.124 7.124 0 0 1 .049-3.345 7.015 7.015 0 0 1 1.566-2.937l-4.626 4.73-2.421-2.479 5.201-5.265a3.791 3.791 0 0 0 1.066-2.675V0h3.41v6.613a7.172 7.172 0 0 1-.519 2.794 7.02 7.02 0 0 1-1.559 2.353l-.153.156a6.768 6.768 0 0 1 3.49-1.725 6.687 6.687 0 0 1 3.845.5 6.873 6.873 0 0 1 2.959 2.564 7.118 7.118 0 0 1 1.118 3.8Zm-3.089 0a3.89 3.89 0 0 0-.611-2.133 3.752 3.752 0 0 0-1.666-1.424 3.65 3.65 0 0 0-2.158-.233 3.704 3.704 0 0 0-1.92 1.037 3.852 3.852 0 0 0-1.031 1.955 3.908 3.908 0 0 0 .205 2.213c.282.7.76 1.299 1.374 1.721a3.672 3.672 0 0 0 2.076.647 3.637 3.637 0 0 0 2.635-1.096c.347-.351.622-.77.81-1.231.188-.461.285-.956.286-1.456Z'

/** Botón circular con logo de marca (móvil y escritorio; tooltip = nombre del servicio). */
const PLATFORM_BTN_BASE =
  'inline-flex items-center justify-center shrink-0 h-[34px] w-[34px] sm:h-[30px] sm:w-[30px] rounded-full p-0 border-2 border-[var(--ink)] transition-all no-underline touch-manipulation'

const PLATFORM_ICON_CLS = 'w-[18px] h-[18px] sm:w-[16px] sm:h-[16px]'

export function SpotifyLinkButton({ url, title, artists, dict, lang }: {
  url?: string | null
  title: string
  artists: Array<{ name?: string } | string>
  /** Diccionario i18n con bloque `charts` (ChartView); opcional fuera de /charts. */
  dict?: { charts?: Record<string, string> }
  lang?: Locale
}) {
  const c = dict?.charts
  const es = lang === 'es'
  const direct = (url || '').trim()
  const names = (Array.isArray(artists) ? artists : [])
    .map((a) => (a && typeof a === 'object' ? a.name : a))
    .filter(Boolean)
    .join(' ')
  const href = direct || `https://open.spotify.com/search/${encodeURIComponent(`${names} ${title}`.trim())}`
  const tooltip = direct
    ? c?.open_spotify || (es ? 'Abrir en Spotify' : 'Open on Spotify')
    : c?.search_spotify || (es ? 'Buscar en Spotify' : 'Search on Spotify')
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      className={`${PLATFORM_BTN_BASE} bg-[#1ED760] text-[var(--ink)] hover:bg-[#1DB954] active:bg-[#1DB954]`}
      title={tooltip}
      aria-label={tooltip}
    >
      <svg viewBox="0 0 24 24" className={PLATFORM_ICON_CLS} fill="currentColor" aria-hidden="true"><path d={SPOTIFY_ICON_PATH} /></svg>
    </a>
  )
}

/** Logo oficial TIDAL (simple-icons, viewBox 24). */
const TIDAL_ICON_PATH = 'M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996 4.004 12l4.004-4.004L12.012 12l-4.004 4.004 4.004 4.004 4.004-4.004L12.012 12l4.004-4.004-4.004-4.004zM16.042 7.996l3.979-3.979L24 7.996l-3.979 3.979z'

/**
 * TIDAL solo se muestra con enlace verificado (`tidal_url`): su catálogo de
 * breaks es más limitado y no queremos un botón de búsqueda casi siempre vacío.
 */
export function TidalLinkButton({ url, lang }: { url?: string | null; lang?: Locale }) {
  const direct = (url || '').trim()
  if (!direct) return null
  const tooltip = lang === 'es' ? 'Abrir en TIDAL' : 'Open on TIDAL'
  return (
    <a
      href={direct} target="_blank" rel="noopener noreferrer"
      className={`${PLATFORM_BTN_BASE} bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-white active:bg-[var(--ink)] active:text-white`}
      title={tooltip}
      aria-label={tooltip}
    >
      <svg viewBox="0 0 24 24" className={PLATFORM_ICON_CLS} fill="currentColor" aria-hidden="true"><path d={TIDAL_ICON_PATH} /></svg>
    </a>
  )
}

export function BeatportLinkButton({ url, lang, dict }: {
  url: string
  lang?: Locale
  dict?: { charts?: Record<string, string> }
}) {
  const tooltip = dict?.charts?.open_beatport || (lang === 'es' ? 'Ver en Beatport' : 'View on Beatport')
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      className={`${PLATFORM_BTN_BASE} bg-[var(--ink)] text-[#01FF95] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] active:text-white`}
      title={tooltip}
      aria-label={tooltip}
    >
      <svg viewBox="0 0 24 24" className={PLATFORM_ICON_CLS} fill="currentColor" aria-hidden="true"><path d={BEATPORT_ICON_PATH} /></svg>
    </a>
  )
}
