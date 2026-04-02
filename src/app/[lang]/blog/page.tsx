// ============================================
// OPTIMAL BREAKS — Blog Page (Supabase)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { BlogPost } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import { sectionOgImageAlt, sectionOgImagePath } from '@/lib/og-section-images'
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

const BLOG_PAGE_SIZE = 12

function blogPaginationHref(lang: Locale, page: number): string {
  if (page <= 1) return `/${lang}/blog`
  return `/${lang}/blog?page=${page}`
}

function BlogPagination({
  lang,
  currentPage,
  totalPages,
  prevLabel,
  nextLabel,
  pageLabel,
}: {
  lang: Locale
  currentPage: number
  totalPages: number
  prevLabel: string
  nextLabel: string
  pageLabel: string
}) {
  if (totalPages <= 1) return null
  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages
  return (
    <nav
      className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-4 border-[var(--ink)] p-4 sm:p-5"
      aria-label={lang === 'es' ? 'Paginación del blog' : 'Blog pagination'}
    >
      <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'var(--dim)' }}>
        {pageLabel.replace('{current}', String(currentPage)).replace('{total}', String(totalPages))}
      </span>
      <div className="flex flex-wrap gap-2">
        {canPrev ? (
          <Link
            href={blogPaginationHref(lang, currentPage - 1)}
            className="inline-flex items-center justify-center px-4 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] no-underline font-bold uppercase tracking-wide transition-colors duration-150 hover:bg-[var(--yellow)]"
            style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '12px' }}
          >
            ← {prevLabel}
          </Link>
        ) : (
          <span
            className="inline-flex items-center justify-center px-4 py-2 border-[3px] border-[var(--ink)] opacity-35 cursor-not-allowed"
            style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '12px' }}
            aria-disabled="true"
          >
            ← {prevLabel}
          </span>
        )}
        {canNext ? (
          <Link
            href={blogPaginationHref(lang, currentPage + 1)}
            className="inline-flex items-center justify-center px-4 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] no-underline font-bold uppercase tracking-wide transition-colors duration-150 hover:bg-[var(--yellow)]"
            style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '12px' }}
          >
            {nextLabel} →
          </Link>
        ) : (
          <span
            className="inline-flex items-center justify-center px-4 py-2 border-[3px] border-[var(--ink)] opacity-35 cursor-not-allowed"
            style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '12px' }}
            aria-disabled="true"
          >
            {nextLabel} →
          </span>
        )}
      </div>
    </nav>
  )
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
  return staticPageMetadata(lang, '/blog', 'blog', {
    ogImagePath: sectionOgImagePath('blog'),
    ogImageAlt: sectionOgImageAlt('blog', lang),
  })
}

const BLOG_SELECT =
  'slug, title_en, title_es, excerpt_en, excerpt_es, category, published_at, tags, author, image_url, is_featured'

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Locale }>
  searchParams?: Promise<{ page?: string | string[] }>
}) {
  const { lang } = await params
  const sp = await (searchParams ?? Promise.resolve({} as { page?: string | string[] }))
  const rawPage = Array.isArray(sp.page) ? sp.page[0] : sp.page
  const parsed = parseInt(rawPage || '1', 10)
  const dict = await getDictionary(lang)
  const supabase = createServerSupabase()

  const { count: publishedCount } = await supabase
    .from('blog_posts')
    .select('*', { count: 'exact', head: true })
    .eq('is_published', true)

  const { count: restTotal } = await supabase
    .from('blog_posts')
    .select('*', { count: 'exact', head: true })
    .eq('is_published', true)
    .eq('is_featured', false)

  const totalRest = restTotal ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRest / BLOG_PAGE_SIZE))
  let currentPage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
  if (currentPage > totalPages) currentPage = totalPages

  let featured: BlogListRow[] = []
  let restPage: BlogListRow[] = []

  if (currentPage === 1) {
    const [{ data: feat }, { data: rest }] = await Promise.all([
      supabase
        .from('blog_posts')
        .select(BLOG_SELECT)
        .eq('is_published', true)
        .eq('is_featured', true)
        .order('published_at', { ascending: false }),
      supabase
        .from('blog_posts')
        .select(BLOG_SELECT)
        .eq('is_published', true)
        .eq('is_featured', false)
        .order('published_at', { ascending: false })
        .range(0, BLOG_PAGE_SIZE - 1),
    ])
    featured = (feat || []) as BlogListRow[]
    restPage = (rest || []) as BlogListRow[]
  } else {
    const offset = (currentPage - 1) * BLOG_PAGE_SIZE
    const { data: rest } = await supabase
      .from('blog_posts')
      .select(BLOG_SELECT)
      .eq('is_published', true)
      .eq('is_featured', false)
      .order('published_at', { ascending: false })
      .range(offset, offset + BLOG_PAGE_SIZE - 1)
    restPage = (rest || []) as BlogListRow[]
  }

  const hasAnyPost = (publishedCount ?? 0) > 0

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 pt-10 pb-10 sm:pt-16 sm:pb-12 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">BLOG</div>
        <h1 className="sec-title">{dict.blog.title}<br /><span className="hl">{lang === 'es' ? 'ARTÍCULOS' : 'ARTICLES'}</span></h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>{dict.blog.subtitle}</p>
      </section>
      <section className="px-4 sm:px-6 py-10 sm:py-12">
        {hasAnyPost ? (
          <div>
            {currentPage === 1 && featured.length > 0 ? (
              <div className="mb-10 sm:mb-12">
                <h2 className="sec-tag mb-4 sm:mb-5">{dict.blog.featured_heading}</h2>
                <div className="space-y-0 border-4 border-[var(--ink)]">
                  {featured.map((p) => (
                    <BlogIndexRow key={p.slug} p={p} lang={lang} />
                  ))}
                </div>
              </div>
            ) : null}
            {restPage.length > 0 ? (
              <div>
                {currentPage === 1 && featured.length > 0 ? (
                  <h2 className="sec-tag mb-4 sm:mb-5">{dict.blog.more_articles}</h2>
                ) : null}
                <div className="space-y-0 border-4 border-[var(--ink)]">
                  {restPage.map((p) => (
                    <BlogIndexRow key={p.slug} p={p} lang={lang} />
                  ))}
                </div>
              </div>
            ) : null}
            <BlogPagination
              lang={lang}
              currentPage={currentPage}
              totalPages={totalPages}
              prevLabel={dict.blog.pagination_prev}
              nextLabel={dict.blog.pagination_next}
              pageLabel={dict.blog.pagination_page}
            />
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
