// ============================================
// OPTIMAL BREAKS — Correos transaccionales (SMTP OVH)
// Solo servidor. No importar desde componentes cliente.
// Diseño: docs/GUIA_MAILS.md (fanzine / Outlook-first).
// ============================================

import nodemailer from 'nodemailer'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { SITE_URL } from '@/lib/seo'

type BookingNotice = {
  claimedByUserId: string
  artistName: string
  city: string
  eventDate: string | null
}

function smtpReady(): boolean {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim())
}

function createTransport() {
  const host = process.env.SMTP_HOST || 'ssl0.ovh.net'
  const port = Number(process.env.SMTP_PORT || 465)
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465 || process.env.SMTP_SECURE === '1',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' },
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function bookingNoticeHtml(opts: {
  artistName: string
  city: string
  eventDate: string | null
  draft?: boolean
}) {
  const name = escapeHtml(opts.artistName)
  const city = escapeHtml(opts.city)
  const dateLine = opts.eventDate
    ? ` · ${escapeHtml(opts.eventDate)}`
    : ''
  const inboxEs = `${SITE_URL}/es/mi-cuenta/artista`
  const inboxEn = `${SITE_URL}/en/mi-cuenta/artista`
  const draftBar = opts.draft
    ? `<tr><td bgcolor="#f7e733" style="padding:10px 16px;border-bottom:3px solid #1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1a1a1a;">
        <strong>BORRADOR</strong> — mismo mail que iría al artista. Solo va a contacto@optimalbreaks.com.
      </td></tr>`
    : ''

  // Outlook no tiene Unbounded / Special Elite. Misma pila que campañas y Auth:
  // Arial Black en marca y botones, Arial en el cuerpo, Courier New en metadatos.
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Optimal Breaks</title>
</head>
<body style="margin:0;padding:0;background:#d4c9b8;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#d4c9b8">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" bgcolor="#e8dcc8" style="max-width:600px;border:4px solid #1a1a1a;">
          ${draftBar}
          <tr>
            <td bgcolor="#1a1a1a" style="padding:12px 16px;">
              <span style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;letter-spacing:1px;color:#ffffff;">OPTIMAL</span>
              <span style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;letter-spacing:1px;color:#d62828;">BREAKS</span>
            </td>
          </tr>
          <tr>
            <td bgcolor="#f7e733" style="padding:8px 16px;border-top:3px solid #1a1a1a;border-bottom:3px solid #1a1a1a;">
              <span style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:1.5px;color:#1a1a1a;text-transform:uppercase;">Nueva solicitud de booking</span>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 20px 8px 20px;" id="mail-es">
              <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;">
                Hola, <strong>${name}</strong>. Tienes una solicitud nueva en tu bandeja.
              </p>
              <p style="margin:0 0 16px 0;font-family:Courier New,Courier,monospace;font-size:13px;line-height:1.5;color:#4a4238;">
                ${city}${dateLine}. El detalle y el contacto están en Mi cuenta → Artista — no respondas a este correo.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td bgcolor="#d62828" style="border:3px solid #1a1a1a;">
                    <a href="${inboxEs}" style="display:inline-block;padding:12px 18px;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:1px;color:#ffffff;text-decoration:none;text-transform:uppercase;">Abrir bandeja</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#ddd3c2" style="padding:18px 20px 22px 20px;border-top:3px solid #1a1a1a;" id="mail-en">
              <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;">
                Hi, <strong>${name}</strong>. You have a new booking request in your inbox.
              </p>
              <p style="margin:0 0 16px 0;font-family:Courier New,Courier,monospace;font-size:13px;line-height:1.5;color:#4a4238;">
                ${city}${dateLine}. Details and contact live in My account → Artist — don’t reply to this email.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td bgcolor="#1a1a1a" style="border:3px solid #1a1a1a;">
                    <a href="${inboxEn}" style="display:inline-block;padding:12px 18px;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:1px;color:#f7e733;text-decoration:none;text-transform:uppercase;">Open inbox</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Aviso al artista verificado: hay una solicitud nueva.
 * No incluye el mensaje ni el contacto del remitente (la bandeja es el registro).
 * Si falta SMTP o el envío falla, no tira la creación de la solicitud.
 */
export async function notifyArtistOfNewBooking(opts: BookingNotice): Promise<void> {
  if (!smtpReady()) {
    console.warn('[mail] SMTP no configurado: aviso de booking no enviado')
    return
  }

  const svc = createServiceSupabase()
  const { data, error } = await svc.auth.admin.getUserById(opts.claimedByUserId)
  if (error || !data.user?.email) {
    console.warn('[mail] Sin email de cuenta para aviso de booking', error?.message)
    return
  }
  if (!data.user.email_confirmed_at) {
    console.warn('[mail] Email de artista sin confirmar: aviso no enviado')
    return
  }

  const to = data.user.email
  const html = bookingNoticeHtml(opts)
  const dateBit = opts.eventDate ? ` · ${opts.eventDate}` : ''
  const transport = createTransport()
  await transport.sendMail({
    from: process.env.SMTP_FROM || `Optimal Breaks <${process.env.SMTP_USER}>`,
    to,
    replyTo: process.env.SMTP_USER,
    subject: `Nueva solicitud de booking / New booking request — ${opts.artistName}`,
    html,
    text: [
      `Hola, ${opts.artistName}. Tienes una solicitud nueva (${opts.city}${dateBit}).`,
      `Bandeja: ${SITE_URL}/es/mi-cuenta/artista`,
      '',
      `Hi, ${opts.artistName}. You have a new booking request (${opts.city}${dateBit}).`,
      `Inbox: ${SITE_URL}/en/mi-cuenta/artista`,
    ].join('\n'),
  })
}
