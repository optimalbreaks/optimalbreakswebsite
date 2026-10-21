import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import ParkineoMine from '@/components/user/ParkineoMine'

export const metadata: Metadata = {
  title: 'Parkineo',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="parkineo">
      <ParkineoMine lang={lang} />
    </UserSectionShell>
  )
}
