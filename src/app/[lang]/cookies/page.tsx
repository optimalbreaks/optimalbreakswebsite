// ============================================
// OPTIMAL BREAKS — Cookie Policy
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cookie Policy' }

export default async function CookiesPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const es = lang === 'es'

  const sections = es ? [
    { t: '1. ¿Qué son las cookies?', p: 'Las cookies son pequeños archivos de texto que los sitios web almacenan en tu dispositivo para recordar información sobre tu visita.' },
    { t: '2. Cookies que utilizamos', p: 'Cookies técnicas necesarias: imprescindibles para el funcionamiento del sitio (sesión, idioma preferido). Cookies analíticas: nos ayudan a entender cómo se utiliza el sitio (páginas visitadas, tiempo de permanencia). Estas cookies son anónimas y no identifican al usuario de forma personal.' },
    { t: '3. Cookies de terceros', p: 'Si incluimos contenido embebido (YouTube, SoundCloud, Mixcloud), estos servicios pueden establecer sus propias cookies según sus políticas de privacidad.' },
    { t: '4. Gestión de cookies', p: 'Puedes aceptar o rechazar las cookies no esenciales a través de nuestro banner de cookies. También puedes configurar tu navegador para bloquear o eliminar cookies. Ten en cuenta que desactivar ciertas cookies puede afectar al funcionamiento del sitio.' },
    { t: '5. Duración', p: 'Las cookies de sesión se eliminan al cerrar el navegador. Las cookies persistentes se conservan durante un máximo de 13 meses conforme a la normativa europea.' },
    { t: '6. Más información', p: 'Para cualquier consulta sobre cookies, contacta con nosotros en info@optimalbreaks.com.' },
  ] : [
    { t: '1. What Are Cookies?', p: 'Cookies are small text files that websites store on your device to remember information about your visit.' },
    { t: '2. Cookies We Use', p: 'Necessary technical cookies: essential for site operation (session, preferred language). Analytics cookies: help us understand how the site is used (pages visited, time spent). These cookies are anonymous and do not personally identify the user.' },
    { t: '3. Third-Party Cookies', p: 'If we include embedded content (YouTube, SoundCloud, Mixcloud), these services may set their own cookies according to their privacy policies.' },
    { t: '4. Cookie Management', p: 'You can accept or reject non-essential cookies through our cookie banner. You can also configure your browser to block or delete cookies. Note that disabling certain cookies may affect site functionality.' },
    { t: '5. Duration', p: 'Session cookies are deleted when you close the browser. Persistent cookies are retained for a maximum of 13 months in accordance with European regulations.' },
    { t: '6. More Information', p: 'For any cookie-related inquiries, contact us at info@optimalbreaks.com.' },
  ]

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20 max-w-[800px] mx-auto">
      <div className="sec-tag">LEGAL</div>
      <h1 className="sec-title text-[clamp(28px,5vw,50px)]">
        <span className="hl">{es ? 'POLÍTICA DE COOKIES' : 'COOKIE POLICY'}</span>
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
