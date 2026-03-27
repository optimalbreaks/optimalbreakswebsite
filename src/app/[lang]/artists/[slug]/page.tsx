// ============================================
// OPTIMAL BREAKS — Artist Detail Page
// + ShareButtons + FanCounter
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { detailPageMetadata, siteNameForLang } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'
import type { Artist } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import FanCounter from '@/components/FanCounter'

type Props = { params: { lang: Locale; slug: string } }
type ArtistSeoRow = Pick<Artist, 'name' | 'bio_en' | 'bio_es'>

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: raw } = await supabase.from('artists').select('name, bio_en, bio_es').eq('slug', slug).single()
  const meta = raw as ArtistSeoRow | null
  if (!meta?.name) return { title: lang === 'es' ? 'Artista no encontrado' : 'Artist not found', robots: { index: false, follow: true } }
  const siteName = await siteNameForLang(lang)
  const description = (lang === 'es' ? meta.bio_es : meta.bio_en)?.slice(0, 160)
  return detailPageMetadata(lang, `/artists/${slug}`, siteName, meta.name, description, 'profile')
}

export default async function ArtistDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: rawArtist } = await supabase.from('artists').select('*').eq('slug', slug).single()
  const artist = rawArtist as Artist | null

  if (!artist) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
        <Link href={`/${lang}/artists`} className="cutout outline no-underline mb-6 inline-block">← {lang === 'es' ? 'Volver a Artistas' : 'Back to Artists'}</Link>
        <div className="sec-tag">ARTIST</div>
        <h1 className="sec-title"><span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-4 sm:p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}</div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>{lang === 'es' ? 'La ficha de este artista se está preparando.' : 'This artist profile is being prepared.'}</p>
        </div>
      </div>
    )
  }

  const bio = lang === 'es' ? artist.bio_es : artist.bio_en

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
      <Link href={`/${lang}/artists`} className="cutout outline no-underline mb-6 inline-block">← {lang === 'es' ? 'Volver a Artistas' : 'Back to Artists'}</Link>
      <div className="sec-tag">{artist.category?.toUpperCase().replace('_', ' ') || 'ARTIST'}</div>
      <h1 className="sec-title"><span className="hl">{artist.name_display || artist.name}</span></h1>

      {/* Share + Fan counter row */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <FanCounter type="artist" entityId={artist.id} lang={lang} />
        <ShareButtons url={`/${lang}/artists/${slug}`} title={`${artist.name} | Optimal Breaks`} lang={lang} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-0 border-4 border-[var(--ink)]">
        {/* Bio */}
        <div className="p-6 sm:p-8 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]">
          <div className="flex flex-wrap gap-2 mb-4">
            {artist.styles?.map((s: string, i: number) => <span key={i} className="cutout red">{s}</span>)}
            <span className="cutout fill">{artist.country}</span>
            <span className="cutout outline">{artist.era}</span>
          </div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>{bio}</p>
        </div>

        {/* Sidebar */}
        <div className="p-6 sm:p-8 bg-[var(--ink)] text-[var(--paper)]">
          {artist.essential_tracks?.length > 0 && (
            <div className="mb-6">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>{lang === 'es' ? 'TRACKS ESENCIALES' : 'ESSENTIAL TRACKS'}</div>
              {artist.essential_tracks.map((t: string, i: number) => (
                <div key={i} className="py-1 border-b border-dashed border-white/10" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'rgba(232,220,200,0.6)' }}>{t}</div>
              ))}
            </div>
          )}
          {artist.socials && Object.keys(artist.socials).length > 0 && (
            <div>
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>LINKS</div>
              {Object.entries(artist.socials).map(([key, url]) => (
                <a key={key} href={url as string} target="_blank" rel="noopener noreferrer" className="block py-1 text-[var(--cyan)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>{key} →</a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
