-- =============================================
-- events.updated_at + trigger — versión del cartel para OG / CDN
--
-- El cartel de un evento vive SIEMPRE en la misma ruta de Storage
-- (media/events/<slug>/poster.*), así que su URL no cambia al reemplazarlo.
-- Las cachés (Data Cache de Vercel, CDN de Supabase, scraper de Facebook)
-- necesitan un sello que cambie con cada edición de la fila: `updated_at`
-- se usa como `?v=` en la URL del og:image y del cartel.
-- =============================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill: las filas existentes toman su fecha de creación como versión inicial.
UPDATE public.events
SET updated_at = created_at
WHERE created_at IS NOT NULL;

DROP TRIGGER IF EXISTS events_updated_at ON public.events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
