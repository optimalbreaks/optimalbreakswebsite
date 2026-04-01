import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { i18n, type Locale } from '@/lib/i18n-config'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ lang: string }> }
) {
  const { lang: raw } = await context.params
  const lang = i18n.locales.includes(raw as Locale) ? raw : i18n.defaultLocale

  const { searchParams, origin } = request.nextUrl
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? `/${lang}/login`

  if (token_hash && type) {
    const supabase = createServerSupabase()
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })

    if (!error) {
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/${lang}/reset-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/${lang}/login?auth_error=true`)
}
