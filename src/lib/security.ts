// ============================================
// OPTIMAL BREAKS — Security Utilities
// ============================================

/**
 * Sanitize HTML to prevent XSS attacks.
 * Allows only safe formatting tags, strips everything else.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''

  // Allowed tags (formatting only, no scripts/iframes/forms)
  const allowedTags = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'mark', 's', 'del', 'strike',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'hr',
    'a', 'span',
    'img',
  ])

  // Allowed attributes per tag
  const allowedAttrs: Record<string, Set<string>> = {
    a: new Set(['href', 'target', 'rel']),
    img: new Set(['src', 'alt', 'width', 'height']),
    span: new Set(['class']),
  }

  // Strip script tags and their content first
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

  // Strip event handlers (onclick, onerror, onload, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '')

  // Strip javascript: protocol in href/src
  clean = clean.replace(/(?:href|src)\s*=\s*["']?\s*javascript\s*:/gi, 'href="')

  // Strip data: protocol in src (except images)
  clean = clean.replace(/src\s*=\s*["']?\s*data\s*:(?!image\/)/gi, 'src="')

  // Strip style attributes (can contain expressions)
  clean = clean.replace(/\s+style\s*=\s*["'][^"']*["']/gi, '')

  // Strip iframe, object, embed, form, input, textarea
  clean = clean.replace(/<\/?(?:iframe|object|embed|form|input|textarea|select|button)\b[^>]*>/gi, '')

  // Strip any remaining tags that aren't in allowlist
  clean = clean.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
    const lower = tag.toLowerCase()
    if (allowedTags.has(lower)) {
      // For allowed tags, strip non-allowed attributes
      if (match.startsWith('</')) return match // closing tags are fine
      const attrs = allowedAttrs[lower]
      if (!attrs) {
        // Strip all attributes
        return match.replace(/\s+[a-z-]+\s*=\s*["'][^"']*["']/gi, '')
                     .replace(/\s+[a-z-]+\s*=\s*[^\s>]*/gi, '')
      }
      return match
    }
    return '' // Strip non-allowed tags entirely
  })

  // Force rel="noopener noreferrer" on all links
  clean = clean.replace(/<a\s/gi, '<a rel="noopener noreferrer" ')

  return clean
}

/**
 * Validate and sanitize a URL slug.
 * Only allows lowercase alphanumeric, hyphens, and underscores.
 */
export function sanitizeSlug(slug: string): string {
  if (!slug) return ''
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '')
    .slice(0, 200) // Max length
}

/**
 * Validate locale parameter.
 * Returns the locale if valid, or 'en' as fallback.
 */
export function validateLocale(lang: string): 'es' | 'en' {
  if (lang === 'es' || lang === 'en') return lang
  return 'en'
}

/**
 * Escape string for use in HTML text content (not innerHTML).
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
