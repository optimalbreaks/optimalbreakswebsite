// ============================================
// OPTIMAL BREAKS — Correos transaccionales (SMTP OVH)
// Solo servidor. No importar desde componentes cliente.
// Diseño: docs/GUIA_MAILS.md (fanzine / Outlook-first).
// ============================================

import nodemailer from 'nodemailer'
import { createServiceSupabase } from './supabase-admin'

const SITE_URL = 'https://www.optimalbreaks.com'

type BookingNotice = {
  claimedByUserId: string
  artistName: string
  city: string
  eventDate: string | null
}

type ClaimApprovedNotice = {
  userId: string
  artistName: string
  artistSlug: string
  /** Solo a contacto@, con barra BORRADOR. No manda al artista. */
  draft?: boolean
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

function draftBarHtml() {
  return `<tr><td bgcolor="#f7e733" style="padding:10px 16px;border-bottom:3px solid #1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1a1a1a;">
        <strong>BORRADOR</strong> — mismo mail que iría al artista. Solo va a contacto@optimalbreaks.com.
      </td></tr>`
}

async function confirmedAccountEmail(userId: string): Promise<string | null> {
  const svc = createServiceSupabase()
  const { data, error } = await svc.auth.admin.getUserById(userId)
  if (error || !data.user?.email) {
    console.warn('[mail] Sin email de cuenta', error?.message)
    return null
  }
  if (!data.user.email_confirmed_at) {
    console.warn('[mail] Email de artista sin confirmar: aviso no enviado')
    return null
  }
  return data.user.email
}

async function sendTransactional(opts: {
  to: string
  subject: string
  html: string
  text: string
}) {
  const transport = createTransport()
  const cc = editorialCopy(opts.to)
  await transport.sendMail({
    from: process.env.SMTP_FROM || `Optimal Breaks <${process.env.SMTP_USER}>`,
    to: opts.to,
    cc,
    replyTo: process.env.SMTP_USER,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  })
}

/** Copia a contacto@ en todo mail a un usuario. Si el To ya es contacto, no duplicar. */
export function editorialCopy(to: string): string | undefined {
  const cc = (process.env.SMTP_USER || 'contacto@optimalbreaks.com').trim()
  if (!cc) return undefined
  if (to.trim().toLowerCase() === cc.toLowerCase()) return undefined
  return cc
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
  const draftBar = opts.draft ? draftBarHtml() : ''

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

  const to = await confirmedAccountEmail(opts.claimedByUserId)
  if (!to) return

  const html = bookingNoticeHtml(opts)
  const dateBit = opts.eventDate ? ` · ${opts.eventDate}` : ''
  await sendTransactional({
    to,
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

function claimApprovedHtml(opts: {
  artistName: string
  artistSlug: string
  draft?: boolean
}) {
  const name = escapeHtml(opts.artistName)
  const slug = encodeURIComponent(opts.artistSlug).replace(/%2F/gi, '/')
  const inboxEs = `${SITE_URL}/es/mi-cuenta/artista`
  const inboxEn = `${SITE_URL}/en/mi-cuenta/artista`
  const pageEs = `${SITE_URL}/es/artists/${slug}`
  const pageEn = `${SITE_URL}/en/artists/${slug}`
  const draftBar = opts.draft ? draftBarHtml() : ''

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
              <span style="font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:1.5px;color:#1a1a1a;text-transform:uppercase;">Ficha verificada</span>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 20px 8px 20px;" id="mail-es">
              <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;">
                Hola, <strong>${name}</strong>. Ya hemos verificado tu ficha.
              </p>
              <p style="margin:0 0 16px 0;font-family:Courier New,Courier,monospace;font-size:13px;line-height:1.5;color:#4a4238;">
                A partir de ahora puedes recibir solicitudes de booking. El interruptor nace cerrado: en Mi cuenta → Artista enciende «Abierto» cuando quieras que el botón salga en tu página. Cada solicitud llega a tu bandeja (y te avisamos por correo). No respondas a este mensaje.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td bgcolor="#d62828" style="border:3px solid #1a1a1a;">
                    <a href="${inboxEs}" style="display:inline-block;padding:12px 18px;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:1px;color:#ffffff;text-decoration:none;text-transform:uppercase;">Abrir Mi cuenta</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-family:Courier New,Courier,monospace;font-size:12px;line-height:1.5;color:#4a4238;">
                Tu ficha: <a href="${pageEs}" style="color:#d62828;">${pageEs}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#ddd3c2" style="padding:18px 20px 22px 20px;border-top:3px solid #1a1a1a;" id="mail-en">
              <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;">
                Hi, <strong>${name}</strong>. Your profile is verified.
              </p>
              <p style="margin:0 0 16px 0;font-family:Courier New,Courier,monospace;font-size:13px;line-height:1.5;color:#4a4238;">
                You can now receive booking requests. The switch starts off: in My account → Artist turn on «Open» when you want the button on your page. Each request lands in your inbox (we email you too). Don’t reply to this message.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td bgcolor="#1a1a1a" style="border:3px solid #1a1a1a;">
                    <a href="${inboxEn}" style="display:inline-block;padding:12px 18px;font-family:Arial Black,Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:1px;color:#f7e733;text-decoration:none;text-transform:uppercase;">Open My account</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font-family:Courier New,Courier,monospace;font-size:12px;line-height:1.5;color:#4a4238;">
                Your page: <a href="${pageEn}" style="color:#d62828;">${pageEn}</a>
              </p>
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
 * Aviso al aprobar un claim: ficha verificada, bookings con interruptor (nace cerrado).
 * `draft: true` manda solo a contacto@ con barra BORRADOR.
 */
export async function notifyArtistOfClaimApproved(opts: ClaimApprovedNotice): Promise<void> {
  if (!smtpReady()) {
    console.warn('[mail] SMTP no configurado: aviso de ficha verificada no enviado')
    return
  }

  const to = opts.draft
    ? (process.env.SMTP_USER || '').trim()
    : await confirmedAccountEmail(opts.userId)
  if (!to) {
    if (opts.draft) console.warn('[mail] SMTP_USER vacío: no hay destino para el borrador')
    return
  }

  const html = claimApprovedHtml(opts)
  const prefix = opts.draft ? '[BORRADOR] ' : ''
  await sendTransactional({
    to,
    subject: `${prefix}Ficha verificada / Profile verified — ${opts.artistName}`,
    html,
    text: [
      `Hola, ${opts.artistName}. Ya hemos verificado tu ficha.`,
      `Puedes recibir solicitudes de booking. Enciende «Abierto» en Mi cuenta → Artista.`,
      `Mi cuenta: ${SITE_URL}/es/mi-cuenta/artista`,
      `Ficha: ${SITE_URL}/es/artists/${opts.artistSlug}`,
      '',
      `Hi, ${opts.artistName}. Your profile is verified.`,
      `You can receive booking requests. Turn on «Open» in My account → Artist.`,
      `My account: ${SITE_URL}/en/mi-cuenta/artista`,
      `Page: ${SITE_URL}/en/artists/${opts.artistSlug}`,
    ].join('\n'),
  })
}

/** HTML del mail de ficha verificada (preview en disco / tests). */
export function renderClaimApprovedHtml(opts: {
  artistName: string
  artistSlug: string
  draft?: boolean
}) {
  return claimApprovedHtml(opts)
}
