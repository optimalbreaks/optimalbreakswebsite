// ============================================
// OPTIMAL BREAKS — Labels Page (Supabase)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { Label } from '@/types/database'
import type { Metadata } from 'next'
import { sectionOgImageAlt, sectionOgImagePath } from '@/lib/og-section-images'
import { staticPageMetadata } from '@/lib/seo'
import CardThumbnail from '@/components/CardThumbnail'
import LabelsExplorer from '@/components/LabelsExplorer'

type FallbackLabel = {
  founded: string
  name: string
  country: string
  active: boolean
  desc_es: string
  desc_en: string
}

const FALLBACK_LABELS: FallbackLabel[] = [
  {
    founded: '1990',
    name: 'REINFORCED RECORDS',
    country: 'UK',
    active: false,
    desc_es: 'Entorno clave para entender la mutacion de hardcore a jungle y las zonas mas avanzadas del break britanico.',
    desc_en: 'A key environment for understanding the mutation from hardcore to jungle and the more advanced edges of British break culture.',
  },
  {
    founded: '1998',
    name: 'FINGER LICKIN’',
    country: 'UK',
    active: false,
    desc_es: 'Uno de los sellos-faro del nu skool breaks londinense y del ecosistema Camden / Soul of Man.',
    desc_en: 'One of the lighthouse labels of London nu skool breaks and the Camden / Soul of Man ecosystem.',
  },
  {
    founded: '1998',
    name: 'MARINE PARADE',
    country: 'UK',
    active: false,
    desc_es: 'La via mas elegante y expansiva del breaks de los 2000, muy asociada a Adam Freeland.',
    desc_en: 'The most elegant and expansive 2000s breaks path, strongly associated with Adam Freeland.',
  },
  {
    founded: '1996',
    name: 'BOTCHIT & SCARPER',
    country: 'UK',
    active: false,
    desc_es: 'Parte de la infraestructura que dio forma industrial y de pista al auge del breaks britanico.',
    desc_en: 'Part of the infrastructure that gave industrial and dancefloor form to the rise of British breaks.',
  },
  {
    founded: '1999',
    name: 'TCR',
    country: 'UK',
    active: false,
    desc_es: 'Sello recurrente cuando se habla de la edad dorada del nu skool y del ecosistema Breakspoll.',
    desc_en: 'A recurring label whenever the nu skool golden age and the Breakspoll ecosystem are discussed.',
  },
  {
    founded: '1997',
    name: 'SKINT',
    country: 'UK',
    active: true,
    desc_es: 'Fundamental para la expansion mainstream del big beat con Fatboy Slim y el cruce con la cultura pop.',
    desc_en: 'Fundamental for the mainstream expansion of big beat with Fatboy Slim and its crossover with pop culture.',
  },
]

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/labels', 'labels', {
    ogImagePath: sectionOgImagePath('labels'),
    ogImageAlt: sectionOgImageAlt('labels', lang),
  })
}

export default async function LabelsPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const supabase = createServerSupabase()
  const { data: labels } = await supabase.from('labels').select('*').order('name', { ascending: true })
  const list = (labels || []) as Label[]

  return (
    <div className="lined min-h-screen">
      <section className="px-4 sm:px-6 pt-10 pb-10 sm:pt-16 sm:pb-12 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">LABELS</div>
        <h1 className="sec-title">{dict.labels.title}<br /><span className="hl">{lang === 'es' ? 'DISCOGRÁFICOS' : 'RECORDS'}</span></h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>{dict.labels.subtitle}</p>
      </section>
      <section className="px-4 sm:px-6 py-10 sm:py-12">
        {list.length > 0 ? (
          <LabelsExplorer labels={list} dict={dict.labels} lang={lang} />
        ) : (
          <div className="space-y-8">
            <div className="max-w-[860px] p-5 sm:p-7 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>
                {lang === 'es' ? 'SELLOS COMO COLUMNA VERTEBRAL' : 'LABELS AS BACKBONE'}
              </div>
              <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.72)' }}>
                {lang === 'es'
                  ? 'Los sellos no son solo catalogos: son filtro, estetica, infraestructura y memoria de escena. Aqui vive buena parte del ADN real del break.'
                  : 'Labels are not just catalogues: they are filters, aesthetics, infrastructure and scene memory. Much of breakbeat’s real DNA lives here.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
              {FALLBACK_LABELS.map((label) => (
                <div key={label.name} className="border-r-[3px] border-b-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] text-[var(--ink)] max-md:!border-r-0 flex flex-col overflow-hidden group min-h-0">
                  <CardThumbnail src={null} alt={label.name} aspectClass="aspect-[21/9] sm:aspect-[3/2]" />
                  <div className="p-6 sm:p-8">
                  <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--red)' }}>Est. {label.founded}</div>
                  <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                    {label.name}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <span className="cutout fill" style={{ margin: 0 }}>{label.country}</span>
                    <span className={`cutout ${label.active ? 'acid' : 'outline'}`} style={{ margin: 0 }}>{label.active ? 'ACTIVE' : 'ARCHIVE'}</span>
                  </div>
                  <p className="mt-4" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.7, color: 'var(--dim)' }}>
                    {lang === 'es' ? label.desc_es : label.desc_en}
                  </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
