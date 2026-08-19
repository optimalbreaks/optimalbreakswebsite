-- ============================================
-- OPTIMAL BREAKS — Datos de contacto en las reclamaciones de artista
-- ============================================
-- Para verificar la identidad, admin necesita poder LLAMAR al solicitante.
-- Añadimos teléfono (obligatorio en la API) y un email de contacto opcional
-- (por si difiere del email de la cuenta) a artist_claims.
-- Ver docs/GUIA_IMPLEMENTACION_BOOKINGS.md.
-- ============================================

ALTER TABLE public.artist_claims
  ADD COLUMN IF NOT EXISTS contact_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT '';

COMMENT ON COLUMN public.artist_claims.contact_phone IS
  'Teléfono de contacto del solicitante para la verificación por llamada. Solo admin (service role) lo lee.';
COMMENT ON COLUMN public.artist_claims.contact_email IS
  'Email de contacto opcional del solicitante (si difiere del email de la cuenta).';
