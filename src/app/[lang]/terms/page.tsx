// ============================================
// OPTIMAL BREAKS — Terms of Use
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms of Use' }

export default async function TermsPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const es = lang === 'es'

  const sections = es ? [
    { t: '1. Aceptación de los términos', p: 'Al acceder y utilizar Optimal Breaks (optimalbreaks.com), aceptas estos términos de uso. Si no estás de acuerdo, por favor no utilices este sitio web.' },
    { t: '2. Descripción del servicio', p: 'Optimal Breaks es una plataforma informativa y cultural dedicada a la historia, artistas, sellos, eventos y cultura del breakbeat. El contenido se ofrece con fines informativos y de entretenimiento.' },
    { t: '3. Propiedad intelectual', p: 'Todo el contenido original de Optimal Breaks (textos, diseño, código, logotipos) es propiedad de Optimal Breaks o se utiliza con los permisos correspondientes. Las marcas, nombres de artistas y sellos pertenecen a sus respectivos propietarios.' },
    { t: '4. Uso permitido', p: 'Puedes navegar, leer y compartir enlaces al contenido del sitio. Queda prohibida la reproducción, distribución o modificación del contenido sin autorización previa por escrito.' },
    { t: '5. Contenido de terceros', p: 'Optimal Breaks puede incluir enlaces a sitios web de terceros (Beatport, SoundCloud, YouTube, etc.). No somos responsables del contenido, políticas de privacidad o prácticas de estos sitios.' },
    { t: '6. Música y audio', p: 'Los archivos de audio incluidos en el sitio son originales o se utilizan con licencia. La reproducción mediante el DJ deck del sitio es únicamente para uso personal y demostración.' },
    { t: '7. Envíos de usuarios', p: 'Si envías sugerencias de artistas, eventos o contenido, concedes a Optimal Breaks una licencia no exclusiva para utilizar esa información en el contexto del sitio.' },
    { t: '8. Limitación de responsabilidad', p: 'Optimal Breaks se proporciona "tal cual". No garantizamos la exactitud, integridad o actualidad de toda la información publicada. No nos hacemos responsables de daños derivados del uso del sitio.' },
    { t: '9. Modificaciones', p: 'Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán efectivos desde su publicación en esta página.' },
    { t: '10. Legislación aplicable', p: 'Estos términos se rigen por la legislación española y europea. Cualquier disputa se someterá a los tribunales de Murcia, España.' },
  ] : [
    { t: '1. Acceptance of Terms', p: 'By accessing and using Optimal Breaks (optimalbreaks.com), you agree to these terms of use. If you disagree, please do not use this website.' },
    { t: '2. Service Description', p: 'Optimal Breaks is an informational and cultural platform dedicated to the history, artists, labels, events, and culture of breakbeat. Content is provided for informational and entertainment purposes.' },
    { t: '3. Intellectual Property', p: 'All original content on Optimal Breaks (text, design, code, logos) is owned by Optimal Breaks or used with appropriate permissions. Trademarks, artist names, and labels belong to their respective owners.' },
    { t: '4. Permitted Use', p: 'You may browse, read, and share links to site content. Reproduction, distribution, or modification of content without prior written authorization is prohibited.' },
    { t: '5. Third-Party Content', p: 'Optimal Breaks may include links to third-party websites (Beatport, SoundCloud, YouTube, etc.). We are not responsible for the content, privacy policies, or practices of these sites.' },
    { t: '6. Music and Audio', p: 'Audio files on the site are original or used under license. Playback through the site\'s DJ deck is for personal use and demonstration only.' },
    { t: '7. User Submissions', p: 'If you submit artist, event, or content suggestions, you grant Optimal Breaks a non-exclusive license to use that information in the context of the site.' },
    { t: '8. Limitation of Liability', p: 'Optimal Breaks is provided "as is." We do not guarantee the accuracy, completeness, or timeliness of all published information. We are not liable for damages arising from use of the site.' },
    { t: '9. Modifications', p: 'We reserve the right to modify these terms at any time. Changes will be effective upon publication on this page.' },
    { t: '10. Governing Law', p: 'These terms are governed by Spanish and European law. Any dispute shall be submitted to the courts of Murcia, Spain.' },
  ]

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20 max-w-[800px] mx-auto">
      <div className="sec-tag">LEGAL</div>
      <h1 className="sec-title text-[clamp(28px,5vw,50px)]">
        <span className="hl">{es ? 'TÉRMINOS DE USO' : 'TERMS OF USE'}</span>
      </h1>
      <p className="mb-8" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'var(--dim)' }}>
        {es ? 'Última actualización: Marzo 2026' : 'Last updated: March 2026'}
      </p>
      <div className="space-y-8" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8 }}>
        {sections.map((s, i) => (
          <section key={i}>
            <h2 className="mb-3" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '16px', textTransform: 'uppercase' }}>{s.t}</h2>
            <p>{s.p}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
