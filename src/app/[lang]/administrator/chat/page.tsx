'use client'

import { useParams } from 'next/navigation'
import AgentChat from '@/components/admin/AgentChat'

export default function AdminChatCapturePage() {
  const params = useParams()
  const lang = (params.lang as string) || 'es'
  return <AgentChat lang={lang} mode="capture" />
}
