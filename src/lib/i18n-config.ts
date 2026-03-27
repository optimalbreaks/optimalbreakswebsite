// ============================================
// OPTIMAL BREAKS — i18n Configuration
// ============================================

export const i18n = {
  defaultLocale: 'en' as const,
  locales: ['es', 'en'] as const,
}

export type Locale = (typeof i18n)['locales'][number]