import type { Metadata } from 'next'
import type { Locale } from '@/lib/i18n-config'
import { createCachedSupabase } from '@/lib/supabase-server'
import { fetchAllPages } from '@/lib/supabase-paginate'
import { staticPageMetadata } from '@/lib/seo'
import { PUBLIC_PARKINEO_CACHE_TAG } from '@/lib/revalidate-public'
import { PARKINEO_PUBLIC_COLUMNS } from '@/lib/parkineo'
import ParkineoBoard, { type ParkineoListItem } from '@/components/ParkineoBoard'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/parkineo', 'parkineo')
}

export default async function ParkineoPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const es = lang === 'es'
  const supabase = createCachedSupabase(300, [PUBLIC_PARKINEO_CACHE_TAG])
  const sessions = await fetchAllPages<ParkineoListItem>((from, to) =>
    supabase
      .from('parkineo_sessions')
      .select(PARKINEO_PUBLIC_COLUMNS)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  ).catch(() => [] as ParkineoListItem[])

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 pt-10 pb-10 sm:pt-16 sm:pb-12 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">PARKINEO</div>
        <h1 className="sec-title">
          {es ? 'SESIONES DE' : 'SESSIONS FROM'}
          <br />
          <span className="hl">{es ? 'QUIEN EMPIEZA' : 'PEOPLE STARTING OUT'}</span>
        </h1>
        <div className="max-w-[740px]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, color: 'var(--dim)' }}>
          <p>
            {es
              ? 'Si pinchas break y todavía no estás en la web, aquí se puede escuchar tu sesión. La lista es pública. Para mandarla entras con tu cuenta, la misma de guardar temas. No hace falta ser artista.'
              : 'If you play breaks and you are not on the site yet, this is where your session can be heard. The list is public. Sending one means signing in with the same account you use to save tracks. You do not need an artist page.'}
          </p>
          <p>
            {es
              ? 'En el break es normal: gente que empieza, se pincha una sesión y acaba sonando en el parkineo, en la puerta de la fiesta, en el grupo. Esto es el sitio para eso.'
              : 'In breaks this is normal: someone starts out, records a session, and it ends up playing in the car park, at the door, in the group chat. This is the place for that.'}
          </p>
          <p className="mb-0">
            {es
              ? 'Cuélgala en SoundCloud, YouTube o Mixcloud (puede ser oculta) y pega el enlace. Más de 15 minutos y como mucho 3 horas: un tema suelto no es una sesión, y el archivo no se sube aquí. La escuchamos. Si entra, sale en la lista con el nombre que has escrito.'
              : 'Put it on SoundCloud, YouTube or Mixcloud (it can be hidden) and paste the link. Longer than 15 minutes and three hours at most: a single track is not a session, and the file is not uploaded here. We listen. If it goes in, it shows up under the name you wrote.'}
          </p>
        </div>
      </section>
      <ParkineoBoard lang={lang} sessions={sessions} />
    </div>
  )
}
