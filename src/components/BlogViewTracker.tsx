'use client'

import { useEffect } from 'react'
import { logBlogViewOncePerBrowserSession } from '@/lib/blog-view-session-log'

export default function BlogViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    logBlogViewOncePerBrowserSession(slug)
  }, [slug])
  return null
}
