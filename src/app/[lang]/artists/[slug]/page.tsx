// ============================================
// OPTIMAL BREAKS — Artist Detail Page
// Loads from Supabase, full SEO metadata
// ============================================

import { createServerSupabase } from '@/lib/supabase'
import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'

type Props = { params: { lang: Locale; slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data } = await supabase.from('artists').select('name, bio_en, bio_es').eq('slug', slug).single()

  if (!data) return { title: 'Artist Not Found' }

  return {
    title: data.name,
    description: lang === 'es' ? data.bio_es?.slice(0, 160) : data.bio_en?.slice(0, 160),
    openGraph: {
      title: `${data.name} | Optimal Breaks`,
      description: lang === 'es' ? data.bio_es?.slice(0, 160) : data.bio_en?.slice(0, 160),
      type: 'profile',
    },
  }
}

export default async function ArtistDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: artist } = await supabase.from('artists').select('*').eq('slug', slug).single()

  // If no DB yet or artist not found, show placeholder
  if (!artist) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
        <Link href={`/${lang}/artists`} className="cutout outline no-underline mb-6 inline-block">
          ← {lang === 'es' ? 'Volver a Artistas' : 'Back to Artists'}
        </Link>
        <div className="sec-tag">ARTIST</div>
        <h1 className="sec-title">
          <span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span>
        </h1>
        <div className="mt-6 p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>
            {lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}
          </div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>
            {lang === 'es'
              ? 'La ficha de este artista se está preparando. Pronto estará disponible con biografía completa, tracks esenciales, mixes recomendados y más.'
              : 'This artist profile is being prepared. It will soon be available with full biography, essential tracks, recommended mixes and more.'}
          </p>
        </div>
      </div>
    )
  }

  const bio = lang === 'es' ? artist.bio_es : artist.bio_en

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
      <Link href={`/${lang}/artists`} className="cutout outline no-underline mb-6 inline-block">
        ← {lang === 'es' ? 'Volver a Artistas' : 'Back to Artists'}
      </Link>
      <div className="sec-tag">{artist.category?.toUpperCase().replace('_', ' ') || 'ARTIST'}</div>
      <h1 className="sec-title">
        <span className="hl">{artist.name_display || artist.name}</span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-0 mt-8 border-4 border-[var(--ink)]">
        {/* Bio */}
        <div className="p-6 sm:p-8 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]">
          <div className="flex flex-wrap gap-2 mb-4">
            {artist.styles?.map((s: string, i: number) => (
              <span key={i} className="cutout red">{s}</span>
            ))}
            <span className="cutout fill">{artist.country}</span>
            <span className="cutout outline">{artist.era}</span>
          </div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>
            {bio}
          </p>
        </div>

        {/* Sidebar */}
        <div className="p-6 sm:p-8 bg-[var(--ink)] text-[var(--paper)]">
          {artist.essential_tracks?.length > 0 && (
            <div className="mb-6">
              <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>
                {lang === 'es' ? 'TRACKS ESENCIALES' : 'ESSENTIAL TRACKS'}
              </div>
              {artist.essential_tracks.map((t: string, i: number) => (
                <div key={i} className="py-1 border-b border-dashed border-white/10" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'rgba(232,220,200,0.6)' }}>
                  {t}
                </div>
              ))}
            </div>
          )}

          {artist.socials && Object.keys(artist.socials).length > 0 && (
            <div>
              <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '16px', color: 'var(--yellow)', marginBottom: '8px' }}>
                LINKS
              </div>
              {Object.entries(artist.socials).map(([key, url]) => (
                <a
                  key={key}
                  href={url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-1 text-[var(--cyan)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}
                >
                  {key} →
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
