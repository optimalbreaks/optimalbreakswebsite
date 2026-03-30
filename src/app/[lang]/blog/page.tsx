// ============================================
// OPTIMAL BREAKS — Blog Page (Supabase)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { BlogPost } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import { staticPageMetadata } from '@/lib/seo'
import CardThumbnail from '@/components/CardThumbnail'

type FallbackPost = {
  category: string
  date_es: string
  date_en: string
  title_es: string
  title_en: string
  excerpt_es: string
  excerpt_en: string
}

const FALLBACK_POSTS: FallbackPost[] = [
  {
    category: 'Historia',
    date_es: 'Serie editorial',
    date_en: 'Editorial series',
    title_es: 'Por que se habla de breakbeat britanico y breakbeat americano',
    title_en: 'Why people talk about British and American breakbeat',
    excerpt_es: 'Un articulo para explicar la divergencia entre ambos ecosistemas sin falsear el origen comun del break.',
    excerpt_en: 'An article explaining the split between both ecosystems without falsifying the break’s shared origin.',
  },
  {
    category: 'Andalucia',
    date_es: 'Especial',
    date_en: 'Feature',
    title_es: 'Break Nation y el caso andaluz: cuando el breakbeat fue cultura de masas',
    title_en: 'Break Nation and Andalusia: when breakbeat became mass culture',
    excerpt_es: 'La escena andaluza merece articulo propio: radios, macrofiestas, Martin Carpena, latencia y memoria.',
    excerpt_en: 'The Andalusian scene deserves its own article: radio, mega-parties, Martin Carpena, latency and memory.',
  },
  {
    category: 'Escena',
    date_es: 'Larga lectura',
    date_en: 'Long read',
    title_es: 'Mas que desaparecer, el breakbeat dejo de ocupar el centro',
    title_en: 'Rather than disappear, breakbeat left the centre',
    excerpt_es: 'Caida global, desplazamiento hacia otros sonidos bass y supervivencia en nichos, cabinas y comunidades.',
    excerpt_en: 'Global decline, displacement toward other bass sounds and survival in niches, booths and communities.',
  },
  {
    category: 'Infraestructura',
    date_es: 'Archivo',
    date_en: 'Archive',
    title_es: 'White labels, Camden y pirate radio: como se descubria breakbeat antes de Beatport',
    title_en: 'White labels, Camden and pirate radio: how people found breakbeat before Beatport',
    excerpt_es: 'Tiendas, promos, dubplates y radios como sistema nervioso de la escena londinense.',
    excerpt_en: 'Shops, promos, dubplates and radio as the nervous system of the London scene.',
  },
  {
    category: 'Digital',
    date_es: 'Presente',
    date_en: 'Present',
    title_es: 'Beatport, YouTube y Mixcloud: quienes mantuvieron viva la llama',
    title_en: 'Beatport, YouTube and Mixcloud: who kept the flame alive',
    excerpt_es: 'De Krafty Kuts a Lady Waks: continuidad de sesiones, charts y comunidad cuando el genero salio del foco.',
    excerpt_en: 'From Krafty Kuts to Lady Waks: continuity of mixes, charts and community after the genre left the spotlight.',
  },
  {
    category: 'Memoria',
    date_es: 'Ensayo',
    date_en: 'Essay',
    title_es: 'Comprar breaks en Londres a finales de los 90',
    title_en: 'Buying breaks in London in the late 90s',
    excerpt_es: 'Destiny, Finger Lickin, Bar Vinyl y la memoria de viaje como parte de la historia real del genero.',
    excerpt_en: 'Destiny, Finger Lickin, Bar Vinyl and travel memory as part of the genre’s real history.',
  },
]

type BlogListRow = Pick<
  BlogPost,
  | 'slug'
  | 'title_en'
  | 'title_es'
  | 'excerpt_en'
  | 'excerpt_es'
  | 'category'
  | 'published_at'
  | 'tags'
  | 'author'
  | 'image_url'
  | 'is_featured'
>

function formatBlogListDate(publishedAt: string | null | undefined, lang: Locale): string {
  if (!publishedAt) return ''
  try {
    const d = new Date(publishedAt)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function BlogIndexRow({ p, lang }: { p: BlogListRow; lang: Locale }) {
  const title = lang === 'es' ? p.title_es : p.title_en
  const dateStr = formatBlogListDate(p.published_at, lang)
  return (
    <Link
      href={`/${lang}/blog/${p.slug}`}
      className="group flex flex-col sm:flex-row border-b-[3px] border-[var(--ink)] last:border-b-0 transition-all duration-150 hover:bg-[var(--yellow)] no-underline text-[var(--ink)] overflow-hidden"
    >
      <div className="w-full shrink-0 sm:w-[min(240px,32vw)] sm:max-w-[260px] border-b-[3px] sm:border-b-0 sm:border-r-[3px] border-[var(--ink)]">
        <CardThumbnail
          src={p.image_url}
          alt={title}
          aspectClass="aspect-[16/9] sm:aspect-[4/3]"
          frameClass="border-0"
        />
      </div>
      <div className="flex flex-col justify-center p-6 sm:p-8 sm:pl-10 flex-grow min-w-0 transition-[padding] duration-150 sm:group-hover:pl-12">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="cutout red" style={{ margin: 0 }}>
            {p.category}
          </span>
          {dateStr ? (
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
              {dateStr}
            </span>
          ) : null}
        </div>
        <div
          className="mt-3"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(16px, 3vw, 22px)',
            textTransform: 'uppercase',
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <p
          className="mt-2"
          style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--dim)', lineHeight: 1.5 }}
        >
          {lang === 'es' ? p.excerpt_es : p.excerpt_en}
        </p>
      </div>
    </Link>
  )
}

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/blog', 'blog')
}

export default async function BlogPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const supabase = createServerSupabase()
  const { data: posts } = await supabase
    .from('blog_posts')
    .select(
      'slug, title_en, title_es, excerpt_en, excerpt_es, category, published_at, tags, author, image_url, is_featured',
    )
    .eq('is_published', true)
    .order('published_at', { ascending: false })

  const list = (posts || []) as BlogListRow[]
  const featured = list.filter((p) => p.is_featured)
  const rest = list.filter((p) => !p.is_featured)

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 pt-10 pb-10 sm:pt-16 sm:pb-12 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">BLOG</div>
        <h1 className="sec-title">{dict.blog.title}<br /><span className="hl">{lang === 'es' ? 'ARTÍCULOS' : 'ARTICLES'}</span></h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>{dict.blog.subtitle}</p>
      </section>
      <section className="px-4 sm:px-6 py-10 sm:py-12">
        {list.length > 0 ? (
          <div>
            {featured.length > 0 ? (
              <div className="mb-10 sm:mb-12">
                <h2 className="sec-tag mb-4 sm:mb-5">{dict.blog.featured_heading}</h2>
                <div className="space-y-0 border-4 border-[var(--ink)]">
                  {featured.map((p) => (
                    <BlogIndexRow key={p.slug} p={p} lang={lang} />
                  ))}
                </div>
              </div>
            ) : null}
            {rest.length > 0 ? (
              <div>
                {featured.length > 0 ? (
                  <h2 className="sec-tag mb-4 sm:mb-5">{dict.blog.more_articles}</h2>
                ) : null}
                <div className="space-y-0 border-4 border-[var(--ink)]">
                  {rest.map((p) => (
                    <BlogIndexRow key={p.slug} p={p} lang={lang} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-0 border-4 border-[var(--ink)]">
            {FALLBACK_POSTS.map((post, index) => (
              <article
                key={post.title_en}
                className="block p-6 sm:p-8 border-b-[3px] border-[var(--ink)] last:border-b-0 transition-all duration-150 hover:bg-[var(--yellow)]"
              >
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className={`cutout ${index % 2 === 0 ? 'red' : 'fill'}`} style={{ margin: 0 }}>
                    {post.category}
                  </span>
                  <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                    {lang === 'es' ? post.date_es : post.date_en}
                  </span>
                </div>
                <div className="mt-3" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(16px, 3vw, 22px)', textTransform: 'uppercase', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  {lang === 'es' ? post.title_es : post.title_en}
                </div>
                <p className="mt-2" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--dim)', lineHeight: 1.5 }}>
                  {lang === 'es' ? post.excerpt_es : post.excerpt_en}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
