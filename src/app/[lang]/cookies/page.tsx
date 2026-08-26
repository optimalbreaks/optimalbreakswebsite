// ============================================
// OPTIMAL BREAKS — Cookie Policy (GDPR / ePrivacy)
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { staticPageMetadata } from '@/lib/seo'
import ManageConsentButton from '@/components/ManageConsentButton'

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/cookies', 'cookies')
}

export default async function CookiesPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  const es = lang === 'es'

  const sections = es ? [
    {
      t: '1. ¿Qué son las cookies?',
      p: 'Las cookies son pequeños archivos de texto que los sitios web almacenan en tu dispositivo para recordar información sobre tu visita. Son fundamentales para el funcionamiento básico de la web y, con tu consentimiento, también nos ayudan a mejorar el servicio.',
    },
    {
      t: '2. Base legal',
      p: 'El uso de cookies en este sitio se rige por el Reglamento General de Protección de Datos (RGPD/GDPR — Reglamento UE 2016/679), la Directiva ePrivacy (2002/58/CE) y la Ley Orgánica de Protección de Datos y Garantía de Derechos Digitales (LOPDGDD — Ley Orgánica 3/2018). Las cookies estrictamente necesarias se basan en el interés legítimo del responsable; las demás requieren tu consentimiento previo, libre, específico, informado e inequívoco.',
    },
    {
      t: '3. Categorías de cookies',
      html: `<div class="space-y-4">
        <div><strong>A) Estrictamente necesarias</strong> (siempre activas)<br/>Imprescindibles para el funcionamiento del sitio: sesión, idioma preferido, almacenamiento del consentimiento de cookies. No se pueden desactivar. No recopilan datos personales.</div>
        <div><strong>B) Analíticas</strong> (requieren consentimiento)<br/>Utilizamos Google Analytics 4 (propiedad de Google LLC) para recopilar información anónima y agregada sobre cómo se utiliza el sitio: páginas visitadas, tiempo de permanencia, origen del tráfico. La dirección IP se anonimiza. Estos datos nos ayudan a mejorar el contenido y la experiencia de usuario. Solo se activan si aceptas esta categoría en el banner de cookies.</div>
      </div>`,
    },
    {
      t: '4. Tabla de cookies',
      html: `<table class="w-full text-[13px] border-collapse" style="font-family: 'Courier Prime', monospace;">
        <thead><tr class="border-b-2 border-[var(--ink)]"><th class="text-left py-2 pr-4">Cookie</th><th class="text-left py-2 pr-4">Categoría</th><th class="text-left py-2 pr-4">Duración</th><th class="text-left py-2">Finalidad</th></tr></thead>
        <tbody>
          <tr class="border-b border-[var(--dim)]"><td class="py-2 pr-4">ob_consent</td><td class="py-2 pr-4">Necesaria</td><td class="py-2 pr-4">13 meses</td><td class="py-2">Almacena tus preferencias de consentimiento</td></tr>
          <tr class="border-b border-[var(--dim)]"><td class="py-2 pr-4">_ga</td><td class="py-2 pr-4">Analítica</td><td class="py-2 pr-4">2 años</td><td class="py-2">Identifica usuarios únicos (Google Analytics)</td></tr>
          <tr class="border-b border-[var(--dim)]"><td class="py-2 pr-4">_ga_*</td><td class="py-2 pr-4">Analítica</td><td class="py-2 pr-4">2 años</td><td class="py-2">Mantiene el estado de sesión (Google Analytics)</td></tr>
        </tbody>
      </table>`,
    },
    {
      t: '5. Cookies de terceros',
      p: 'Si incluimos contenido embebido (YouTube, SoundCloud, Mixcloud), estos servicios pueden establecer sus propias cookies según sus respectivas políticas de privacidad. No tenemos control sobre esas cookies.',
    },
    {
      t: '6. Gestión de cookies',
      p: 'Puedes modificar tus preferencias de cookies en cualquier momento a través del botón que aparece a continuación. También puedes configurar tu navegador para bloquear o eliminar cookies. Ten en cuenta que desactivar ciertas cookies puede afectar al funcionamiento del sitio.',
      hasButton: true,
    },
    {
      t: '7. Duración y conservación',
      p: 'Las cookies de sesión se eliminan al cerrar el navegador. Las cookies persistentes se conservan durante un máximo de 13 meses conforme a la normativa europea (directriz CNIL y recomendaciones del CEPD/EDPB).',
    },
    {
      t: '8. Transferencias internacionales',
      p: 'Google Analytics puede transferir datos a servidores ubicados en Estados Unidos. Google LLC se adhiere al EU–US Data Privacy Framework. Puedes consultar más información en la política de privacidad de Google: https://policies.google.com/privacy.',
    },
    {
      t: '9. Contacto',
      p: 'Para cualquier consulta sobre cookies o protección de datos, contacta con nosotros en info@optimalbreaks.com.',
    },
  ] : [
    {
      t: '1. What Are Cookies?',
      p: 'Cookies are small text files that websites store on your device to remember information about your visit. They are essential for basic website functionality and, with your consent, also help us improve our service.',
    },
    {
      t: '2. Legal Basis',
      p: 'The use of cookies on this site is governed by the General Data Protection Regulation (GDPR — EU Regulation 2016/679) and the ePrivacy Directive (2002/58/EC). Strictly necessary cookies are based on the legitimate interest of the data controller; all others require your prior, free, specific, informed, and unambiguous consent.',
    },
    {
      t: '3. Cookie Categories',
      html: `<div class="space-y-4">
        <div><strong>A) Strictly Necessary</strong> (always active)<br/>Essential for site operation: session, preferred language, cookie consent storage. Cannot be disabled. They do not collect personal data.</div>
        <div><strong>B) Analytics</strong> (require consent)<br/>We use Google Analytics 4 (owned by Google LLC) to collect anonymous, aggregated information about how the site is used: pages visited, time spent, traffic sources. IP addresses are anonymized. This data helps us improve content and user experience. Only activated if you accept this category in the cookie banner.</div>
      </div>`,
    },
    {
      t: '4. Cookie Table',
      html: `<table class="w-full text-[13px] border-collapse" style="font-family: 'Courier Prime', monospace;">
        <thead><tr class="border-b-2 border-[var(--ink)]"><th class="text-left py-2 pr-4">Cookie</th><th class="text-left py-2 pr-4">Category</th><th class="text-left py-2 pr-4">Duration</th><th class="text-left py-2">Purpose</th></tr></thead>
        <tbody>
          <tr class="border-b border-[var(--dim)]"><td class="py-2 pr-4">ob_consent</td><td class="py-2 pr-4">Necessary</td><td class="py-2 pr-4">13 months</td><td class="py-2">Stores your consent preferences</td></tr>
          <tr class="border-b border-[var(--dim)]"><td class="py-2 pr-4">_ga</td><td class="py-2 pr-4">Analytics</td><td class="py-2 pr-4">2 years</td><td class="py-2">Identifies unique users (Google Analytics)</td></tr>
          <tr class="border-b border-[var(--dim)]"><td class="py-2 pr-4">_ga_*</td><td class="py-2 pr-4">Analytics</td><td class="py-2 pr-4">2 years</td><td class="py-2">Maintains session state (Google Analytics)</td></tr>
        </tbody>
      </table>`,
    },
    {
      t: '5. Third-Party Cookies',
      p: 'If we include embedded content (YouTube, SoundCloud, Mixcloud), these services may set their own cookies according to their respective privacy policies. We have no control over these cookies.',
    },
    {
      t: '6. Cookie Management',
      p: 'You can change your cookie preferences at any time using the button below. You can also configure your browser to block or delete cookies. Note that disabling certain cookies may affect site functionality.',
      hasButton: true,
    },
    {
      t: '7. Duration & Retention',
      p: 'Session cookies are deleted when you close the browser. Persistent cookies are retained for a maximum of 13 months in accordance with European regulations (CNIL guidelines and EDPB recommendations).',
    },
    {
      t: '8. International Transfers',
      p: 'Google Analytics may transfer data to servers located in the United States. Google LLC adheres to the EU–US Data Privacy Framework. For more information, see Google\'s privacy policy: https://policies.google.com/privacy.',
    },
    {
      t: '9. Contact',
      p: 'For any cookie or data protection inquiries, contact us at info@optimalbreaks.com.',
    },
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
            <h2 className="mb-3" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '16px', textTransform: 'uppercase' }}>
              {s.t}
            </h2>
            {'html' in s && s.html ? (
              <div dangerouslySetInnerHTML={{ __html: s.html }} />
            ) : (
              <p>{s.p}</p>
            )}
            {'hasButton' in s && s.hasButton && (
              <div className="mt-4">
                <ManageConsentButton
                  label={es ? '⚙ Configurar cookies' : '⚙ Manage cookies'}
                  className="inline-block px-5 py-2.5 border-[3px] border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors"
                />
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
