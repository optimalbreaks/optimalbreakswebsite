import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { tokenMatches } from '@/lib/mailing/campaigns'

export const dynamic = 'force-dynamic'

function page(title: string, text: string) {
  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#d4c9b8;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:48px 16px;">
      <table role="presentation" width="480" style="background:#e8dcc8;border:4px solid #1a1a1a;"><tr><td style="padding:28px;">
        <p style="margin:0 0 8px;font-weight:900;letter-spacing:2px;">OPTIMAL <span style="color:#d62828;">BREAKS</span></p>
        <h1 style="margin:0 0 12px;font-size:22px;">${title}</h1>
        <p style="margin:0;line-height:1.5;">${text}</p>
      </td></tr></table>
    </td></tr></table></body></html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function unsubscribe(request: NextRequest) {
  const url = new URL(request.url)
  let email = (url.searchParams.get('e') || '').trim().toLowerCase()
  let token = (url.searchParams.get('t') || '').trim()
  if (request.method === 'POST' && !email) {
    const form = await request.formData().catch(() => null)
    email = String(form?.get('e') || email).trim().toLowerCase()
    token = String(form?.get('t') || token).trim()
  }
  if (!email.includes('@') || !tokenMatches(email, token)) {
    return page('Enlace no válido', 'Este enlace de baja no cuadra. Escribe a contacto@optimalbreaks.com y te damos de baja a mano.')
  }
  const svc = createServiceSupabase()
  const { error } = await svc.from('mail_suppressions').upsert({
    email,
    reason: 'unsubscribe',
  }, { onConflict: 'email' })
  if (error) {
    return page('No se ha podido guardar', 'Escríbenos a contacto@optimalbreaks.com y lo cerramos nosotros.')
  }
  return page('Baja hecha', `${email} no recibirá más campañas de Optimal Breaks. Los avisos de una reserva o de una ficha siguen llegando: no son publicidad.`)
}

export function GET(request: NextRequest) {
  return unsubscribe(request)
}

export function POST(request: NextRequest) {
  return unsubscribe(request)
}
