'use client'

import { useParams } from 'next/navigation'
import MailingDesk from '@/components/admin/MailingDesk'

export default function AdminMailingCampaignPage() {
  const { id } = useParams<{ id: string }>()
  return <MailingDesk campaignId={id} />
}
