// ============================================
// OPTIMAL BREAKS — Terms of Use
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { staticPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/terms', 'terms')
}

export default async function TermsPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const es = lang === 'es'

  const sections = es ? [
    { t: '1. Datos identificativos del titular', p: 'En cumplimiento del artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de que el titular del sitio web www.optimalbreaks.com es ESTUDIO TLBDECORADORES, S.L., NIF B73825648, con domicilio social en Calle Enrique Villar Bas, 15, 5º C, 30008 Murcia (España), inscrita en el Registro Mercantil de Murcia, Tomo 3017, Folio 93, Hoja MU-83123. Optimal Breaks es una marca comercial de dicha sociedad. Correo electrónico de contacto: info@optimalbreaks.com.' },
    { t: '2. Aceptación de los términos', p: 'Al acceder y utilizar Optimal Breaks (www.optimalbreaks.com), aceptas estos términos de uso. Si no estás de acuerdo, por favor no utilices este sitio web.' },
    { t: '3. Descripción del servicio', p: 'Optimal Breaks es una plataforma informativa y cultural dedicada a la historia, artistas, sellos, eventos y cultura del breakbeat. El contenido se ofrece con fines informativos y de entretenimiento.' },
    { t: '4. Propiedad intelectual', p: 'Todo el contenido original de Optimal Breaks (textos, diseño, código, logotipos) es propiedad de ESTUDIO TLBDECORADORES, S.L. o se utiliza con los permisos correspondientes. Las marcas, nombres de artistas y sellos pertenecen a sus respectivos propietarios.' },
    { t: '5. Uso permitido', p: 'Puedes navegar, leer y compartir enlaces al contenido del sitio. Queda prohibida la reproducción, distribución o modificación del contenido sin autorización previa por escrito.' },
    { t: '6. Contenido de terceros', p: 'Optimal Breaks puede incluir enlaces a sitios web de terceros (Beatport, SoundCloud, YouTube, etc.). No somos responsables del contenido, políticas de privacidad o prácticas de estos sitios.' },
    { t: '7. Música y audio', p: 'Los archivos de audio incluidos en el sitio son originales o se utilizan con licencia. La reproducción mediante el DJ deck del sitio es únicamente para uso personal y demostración.' },
    { t: '8. Envíos de usuarios', p: 'Si envías sugerencias de artistas, eventos o contenido, concedes a Optimal Breaks una licencia no exclusiva para utilizar esa información en el contexto del sitio.' },
    { t: '9. Red de artistas', p: 'Los artistas con ficha verificada pueden enviarse mensajes privados a través de la red interna. Esos mensajes se alojan en Optimal Breaks (no son secretos frente al operador) y se usan para prestar el servicio y moderarlo. El uso abusivo puede conllevar la revocación de la verificación.' },
    { t: '10. Limitación de responsabilidad', p: 'Optimal Breaks se proporciona "tal cual". No garantizamos la exactitud, integridad o actualidad de toda la información publicada. No nos hacemos responsables de daños derivados del uso del sitio.' },
    { t: '11. Modificaciones', p: 'Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán efectivos desde su publicación en esta página.' },
    { t: '12. Legislación aplicable', p: 'Estos términos se rigen por la legislación española y europea. Cualquier disputa se someterá a los tribunales de Murcia, España.' },
  ] : [
    { t: '1. Site Owner Identification', p: 'Pursuant to Article 10 of Spanish Law 34/2002 on Information Society Services and Electronic Commerce (LSSI-CE), the owner of the website www.optimalbreaks.com is ESTUDIO TLBDECORADORES, S.L., Spanish tax ID (NIF) B73825648, registered office at Calle Enrique Villar Bas, 15, 5º C, 30008 Murcia (Spain), registered in the Murcia Commercial Registry, Volume 3017, Folio 93, Sheet MU-83123. Optimal Breaks is a trade name of that company. Contact email: info@optimalbreaks.com.' },
    { t: '2. Acceptance of Terms', p: 'By accessing and using Optimal Breaks (www.optimalbreaks.com), you agree to these terms of use. If you disagree, please do not use this website.' },
    { t: '3. Service Description', p: 'Optimal Breaks is an informational and cultural platform dedicated to the history, artists, labels, events, and culture of breakbeat. Content is provided for informational and entertainment purposes.' },
    { t: '4. Intellectual Property', p: 'All original content on Optimal Breaks (text, design, code, logos) is owned by ESTUDIO TLBDECORADORES, S.L. or used with appropriate permissions. Trademarks, artist names, and labels belong to their respective owners.' },
    { t: '5. Permitted Use', p: 'You may browse, read, and share links to site content. Reproduction, distribution, or modification of content without prior written authorization is prohibited.' },
    { t: '6. Third-Party Content', p: 'Optimal Breaks may include links to third-party websites (Beatport, SoundCloud, YouTube, etc.). We are not responsible for the content, privacy policies, or practices of these sites.' },
    { t: '7. Music and Audio', p: 'Audio files on the site are original or used under license. Playback through the site\'s DJ deck is for personal use and demonstration only.' },
    { t: '8. User Submissions', p: 'If you submit artist, event, or content suggestions, you grant Optimal Breaks a non-exclusive license to use that information in the context of the site.' },
    { t: '9. Artist network', p: 'Artists with a verified profile may send each other private messages through the internal network. Those messages are hosted by Optimal Breaks (they are not secret from the operator) and are used to provide and moderate the service. Abuse may lead to revocation of verification.' },
    { t: '10. Limitation of Liability', p: 'Optimal Breaks is provided "as is." We do not guarantee the accuracy, completeness, or timeliness of all published information. We are not liable for damages arising from use of the site.' },
    { t: '11. Modifications', p: 'We reserve the right to modify these terms at any time. Changes will be effective upon publication on this page.' },
    { t: '12. Governing Law', p: 'These terms are governed by Spanish and European law. Any dispute shall be submitted to the courts of Murcia, Spain.' },
  ]

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20 max-w-[800px] mx-auto">
      <div className="sec-tag">LEGAL</div>
      <h1 className="sec-title text-[clamp(28px,5vw,50px)]">
        <span className="hl">{es ? 'AVISO LEGAL Y TÉRMINOS DE USO' : 'LEGAL NOTICE AND TERMS OF USE'}</span>
      </h1>
      <p className="mb-8" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'var(--dim)' }}>
        {es ? 'Última actualización: Octubre 2026' : 'Last updated: October 2026'}
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
