// ============================================
// OPTIMAL BREAKS — Privacy Policy
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { staticPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/privacy', 'privacy')
}

export default async function PrivacyPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const es = lang === 'es'

  const sections = es ? [
    { t: '1. Responsable del tratamiento', p: 'El responsable del tratamiento de los datos personales recabados a través de www.optimalbreaks.com es ESTUDIO TLBDECORADORES, S.L., NIF B73825648, con domicilio social en Calle Enrique Villar Bas, 15, 5º C, 30008 Murcia (España), inscrita en el Registro Mercantil de Murcia, Tomo 3017, Folio 93, Hoja MU-83123. Optimal Breaks es una marca comercial de dicha sociedad. Correo de contacto: info@optimalbreaks.com.' },
    { t: '2. Datos que recopilamos', p: 'Recopilamos únicamente datos técnicos de navegación (dirección IP, tipo de navegador, páginas visitadas) mediante cookies analíticas. No recopilamos datos personales identificables salvo que el usuario los proporcione voluntariamente a través de formularios de contacto.' },
    { t: '3. Finalidad del tratamiento', p: 'Los datos se utilizan para mejorar la experiencia del usuario, analizar el tráfico web y responder a consultas enviadas a través de formularios.' },
    { t: '4. Base legal', p: 'El tratamiento se basa en el consentimiento del usuario (cookies analíticas) y en el interés legítimo del responsable (funcionamiento técnico del sitio). Cumplimos con el Reglamento General de Protección de Datos (RGPD) de la Unión Europea.' },
    { t: '5. Cookies', p: 'Utilizamos cookies técnicas necesarias para el funcionamiento del sitio y cookies analíticas para comprender cómo se utiliza la web. Puedes gestionar tus preferencias de cookies en cualquier momento desde el banner de cookies o la configuración de tu navegador.' },
    { t: '6. Derechos del usuario', p: 'Tienes derecho a acceder, rectificar, suprimir, limitar el tratamiento, portabilidad y oposición al tratamiento de tus datos personales. Puedes ejercer estos derechos enviando un correo a info@optimalbreaks.com o por correo postal al domicilio social indicado, acreditando tu identidad. Si consideras que no se han atendido correctamente, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).' },
    { t: '7. Retención de datos', p: 'Los datos analíticos se conservan durante un máximo de 26 meses. Los datos de contacto se conservan mientras sea necesario para resolver la consulta y, en todo caso, durante los plazos legales aplicables. Para corregir fallos del reproductor de audio registramos eventos técnicos anónimos (cambio de tema, inicio de reproducción, página en segundo plano, tipo de dispositivo y navegador), sin cuenta, sin IP y sin cookies; se borran a los 30 días.' },
    { t: '8. Contacto', p: 'Para cualquier consulta relacionada con la privacidad, contacta con nosotros en info@optimalbreaks.com.' },
    { t: '9. Cuentas, bookings y red de artistas', p: 'Si creas una cuenta, tratamos el email, el nombre de perfil y la actividad de la cuenta (favoritos, temas guardados, solicitudes de booking). Si mandas un tema a Parkineo, guardamos el MP3, el nombre y el título que escribas para escucharlo y, si se publica, emitirlo en esa página: el archivo no es público por URL directa. Si verificas una ficha de artista, los mensajes de la red interna de artistas se alojan en nuestros servidores en claro: el hilo no es público para otros artistas, pero el operador de Optimal Breaks puede acceder a él para moderación, seguridad y funcionamiento del servicio. No es mensajería cifrada de extremo a extremo. Puedes ejercer tus derechos RGPD en info@optimalbreaks.com.' },
  ] : [
    { t: '1. Data Controller', p: 'The controller of personal data collected through www.optimalbreaks.com is ESTUDIO TLBDECORADORES, S.L., Spanish tax ID (NIF) B73825648, registered office at Calle Enrique Villar Bas, 15, 5º C, 30008 Murcia (Spain), registered in the Murcia Commercial Registry, Volume 3017, Folio 93, Sheet MU-83123. Optimal Breaks is a trade name of that company. Contact email: info@optimalbreaks.com.' },
    { t: '2. Data We Collect', p: 'We only collect technical browsing data (IP address, browser type, pages visited) through analytics cookies. We do not collect personally identifiable data unless voluntarily provided by the user through contact forms.' },
    { t: '3. Purpose of Processing', p: 'Data is used to improve user experience, analyze web traffic, and respond to inquiries sent through forms.' },
    { t: '4. Legal Basis', p: 'Processing is based on user consent (analytics cookies) and the legitimate interest of the controller (technical operation of the site). We comply with the General Data Protection Regulation (GDPR) of the European Union.' },
    { t: '5. Cookies', p: 'We use necessary technical cookies for site operation and analytics cookies to understand how the website is used. You can manage your cookie preferences at any time from the cookie banner or your browser settings.' },
    { t: '6. User Rights', p: 'You have the right to access, rectify, delete, restrict processing, portability, and object to the processing of your personal data. You can exercise these rights by emailing info@optimalbreaks.com or by post to the registered office above, proving your identity. If you believe your request has not been properly handled, you may lodge a complaint with the Spanish Data Protection Agency (www.aepd.es).' },
    { t: '7. Data Retention', p: 'Analytics data is retained for a maximum of 26 months. Contact data is retained as long as necessary to resolve the inquiry and, in any case, for the applicable legal periods. To fix audio player issues we log anonymous technical events (track change, playback start, page in background, device and browser type), with no account, no IP and no cookies; they are deleted after 30 days.' },
    { t: '8. Contact', p: 'For any privacy-related inquiries, contact us at info@optimalbreaks.com.' },
    { t: '9. Accounts, bookings and artist network', p: 'If you create an account, we process your email, profile name and account activity (favorites, saved tracks, booking requests). If you send a track to Parkineo, we store the MP3 and the name and title you write so we can listen to it and, if it is published, stream it on that page: the file is not public by a direct URL. If you verify an artist profile, messages in the internal artist network are stored on our servers in plaintext: a thread is not public to other artists, but the Optimal Breaks operator may access it for moderation, safety and operation of the service. This is not end-to-end encrypted messaging. You may exercise your GDPR rights at info@optimalbreaks.com.' },
  ]

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20 max-w-[800px] mx-auto">
      <div className="sec-tag">LEGAL</div>
      <h1 className="sec-title text-[clamp(28px,5vw,50px)]">
        <span className="hl">{es ? 'POLÍTICA DE PRIVACIDAD' : 'PRIVACY POLICY'}</span>
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
