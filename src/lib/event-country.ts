// ============================================
// OPTIMAL BREAKS — País canónico de un evento
// ----------------------------------------------
// `events.country` es texto libre y llegó a tener 11 variantes para 5 países
// (`Spain` / `España` / `ES`, `United Kingdom` / `UK` / `GB` / `Reino Unido`,
// `United States` / `US`): el filtro «País» de /events salía triplicado
// (28 sep 2026). Forma canónica = nombre en inglés (la mayoritaria en BD).
// Se aplica al ESCRIBIR (chat admin, formularios admin) y al LEER (filtro).
// Un valor desconocido se devuelve tal cual, solo recortado.
// ============================================

const ALIASES: Record<string, string> = {
  // España
  es: 'Spain', esp: 'Spain', spain: 'Spain', 'españa': 'Spain', espana: 'Spain',
  // Reino Unido
  uk: 'United Kingdom', gb: 'United Kingdom', gbr: 'United Kingdom', 'united kingdom': 'United Kingdom',
  'reino unido': 'United Kingdom', england: 'United Kingdom', inglaterra: 'United Kingdom',
  'great britain': 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom',
  // Estados Unidos
  us: 'United States', usa: 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States',
  'united states': 'United States', 'united states of america': 'United States',
  'estados unidos': 'United States', eeuu: 'United States', 'ee.uu.': 'United States',
  // Otros con nombre en castellano habitual en carteles
  au: 'Australia', aus: 'Australia', australia: 'Australia',
  hu: 'Hungary', hungary: 'Hungary', 'hungría': 'Hungary', hungria: 'Hungary',
  de: 'Germany', germany: 'Germany', alemania: 'Germany', deutschland: 'Germany',
  fr: 'France', france: 'France', francia: 'France',
  pt: 'Portugal', portugal: 'Portugal',
  it: 'Italy', italy: 'Italy', italia: 'Italy',
  nl: 'Netherlands', netherlands: 'Netherlands', 'países bajos': 'Netherlands', holanda: 'Netherlands', holland: 'Netherlands',
  be: 'Belgium', belgium: 'Belgium', 'bélgica': 'Belgium', belgica: 'Belgium',
  mx: 'Mexico', mexico: 'Mexico', 'méxico': 'Mexico',
  ar: 'Argentina', argentina: 'Argentina',
  br: 'Brazil', brazil: 'Brazil', brasil: 'Brazil',
  ca: 'Canada', canada: 'Canada', 'canadá': 'Canada',
  ie: 'Ireland', ireland: 'Ireland', irlanda: 'Ireland',
  ch: 'Switzerland', switzerland: 'Switzerland', suiza: 'Switzerland',
  at: 'Austria', austria: 'Austria',
  pl: 'Poland', poland: 'Poland', polonia: 'Poland',
  cz: 'Czechia', czechia: 'Czechia', 'czech republic': 'Czechia', 'república checa': 'Czechia',
  jp: 'Japan', japan: 'Japan', 'japón': 'Japan', japon: 'Japan',
  nz: 'New Zealand', 'new zealand': 'New Zealand', 'nueva zelanda': 'New Zealand',
  za: 'South Africa', 'south africa': 'South Africa', 'sudáfrica': 'South Africa', sudafrica: 'South Africa',
}

/** Nombre canónico (inglés) del país; desconocido → texto recortado; vacío → ''. */
export function normalizeEventCountry(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const key = raw.toLowerCase().replace(/\s+/g, ' ')
  return ALIASES[key] ?? raw
}

/** País por defecto cuando el cartel no lo dice (escena principal de la web). */
export const DEFAULT_EVENT_COUNTRY = 'Spain'
