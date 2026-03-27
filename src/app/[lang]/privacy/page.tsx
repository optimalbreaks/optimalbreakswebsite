// ============================================
// OPTIMAL BREAKS — Privacy Policy
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Privacy Policy' }

export default async function PrivacyPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const es = lang === 'es'

  const sections = es ? [
    { t: '1. Responsable del tratamiento', p: 'Optimal Breaks es un proyecto independiente con sede en Murcia, España. Correo de contacto: info@optimalbreaks.com.' },
    { t: '2. Datos que recopilamos', p: 'Recopilamos únicamente datos técnicos de navegación (dirección IP, tipo de navegador, páginas visitadas) mediante cookies analíticas. No recopilamos datos personales identificables salvo que el usuario los proporcione voluntariamente a través de formularios de contacto.' },
    { t: '3. Finalidad del tratamiento', p: 'Los datos se utilizan para mejorar la experiencia del usuario, analizar el tráfico web y responder a consultas enviadas a través de formularios.' },
    { t: '4. Base legal', p: 'El tratamiento se basa en el consentimiento del usuario (cookies analíticas) y en el interés legítimo del responsable (funcionamiento técnico del sitio). Cumplimos con el Reglamento General de Protección de Datos (RGPD) de la Unión Europea.' },
    { t: '5. Cookies', p: 'Utilizamos cookies técnicas necesarias para el funcionamiento del sitio y cookies analíticas para comprender cómo se utiliza la web. Puedes gestionar tus preferencias de cookies en cualquier momento desde el banner de cookies o la configuración de tu navegador.' },
    { t: '6. Derechos del usuario', p: 'Tienes derecho a acceder, rectificar, suprimir, limitar el tratamiento, portabilidad y oposición al tratamiento de tus datos personales. Puedes ejercer estos derechos enviando un correo a info@optimalbreaks.com.' },
    { t: '7. Retención de datos', p: 'Los datos analíticos se conservan durante un máximo de 26 meses. Los datos de contacto se conservan mientras sea necesario para resolver la consulta y, en todo caso, durante los plazos legales aplicables.' },
    { t: '8. Contacto', p: 'Para cualquier consulta relacionada con la privacidad, contacta con nosotros en info@optimalbreaks.com.' },
  ] : [
    { t: '1. Data Controller', p: 'Optimal Breaks is an independent project based in Murcia, Spain. Contact email: info@optimalbreaks.com.' },
    { t: '2. Data We Collect', p: 'We only collect technical browsing data (IP address, browser type, pages visited) through analytics cookies. We do not collect personally identifiable data unless voluntarily provided by the user through contact forms.' },
    { t: '3. Purpose of Processing', p: 'Data is used to improve user experience, analyze web traffic, and respond to inquiries sent through forms.' },
    { t: '4. Legal Basis', p: 'Processing is based on user consent (analytics cookies) and the legitimate interest of the controller (technical operation of the site). We comply with the General Data Protection Regulation (GDPR) of the European Union.' },
    { t: '5. Cookies', p: 'We use necessary technical cookies for site operation and analytics cookies to understand how the website is used. You can manage your cookie preferences at any time from the cookie banner or your browser settings.' },
    { t: '6. User Rights', p: 'You have the right to access, rectify, delete, restrict processing, portability, and object to the processing of your personal data. You can exercise these rights by sending an email to info@optimalbreaks.com.' },
    { t: '7. Data Retention', p: 'Analytics data is retained for a maximum of 26 months. Contact data is retained as long as necessary to resolve the inquiry and, in any case, for the applicable legal periods.' },
    { t: '8. Contact', p: 'For any privacy-related inquiries, contact us at info@optimalbreaks.com.' },
  ]

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20 max-w-[800px] mx-auto">
      <div className="sec-tag">LEGAL</div>
      <h1 className="sec-title text-[clamp(28px,5vw,50px)]">
        <span className="hl">{es ? 'POLÍTICA DE PRIVACIDAD' : 'PRIVACY POLICY'}</span>
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
