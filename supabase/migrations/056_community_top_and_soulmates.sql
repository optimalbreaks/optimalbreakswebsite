-- ============================================
-- OPTIMAL BREAKS — Top mensual de la comunidad y Almas Gemelas
-- ============================================
-- Esta migración da soporte a dos features:
--
--   1. **Top mensual**: ranking de los temas más añadidos a "Mis Tracks" en
--      un mes calendario concreto. Se calcula on-demand en el endpoint
--      `/api/public/charts/community-monthly` filtrando `created_at` por
--      mes; añadimos un índice descendente para que la consulta sea barata.
--
--   2. **Almas Gemelas**: cruce de los saves del usuario actual con los del
--      resto, calculando similitud Jaccard sobre `canonical_url`. Para
--      respetar la privacidad introducimos `profiles.is_tracks_public`:
--      si está a `false`, los saves del usuario NO se utilizan en el
--      cómputo y su lista queda excluida del top de afinidad.
--
-- El cálculo lo hace el servidor con `service_role`, por lo que NO añadimos
-- nuevas políticas RLS sobre `saved_chart_tracks` (siguen siendo privadas
-- a nivel de tabla; el endpoint hace la verificación de `is_tracks_public`).
-- ============================================

-- 1) Visibilidad de la lista para "Almas Gemelas"
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_tracks_public BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.profiles.is_tracks_public IS
  'Si TRUE, los saves de saved_chart_tracks se usan al calcular Almas Gemelas. La lista pública /u/<id>/tracks ya es accesible vía link directo, este flag controla solo el ranking de afinidad.';

-- 2) Índice por created_at descendente para el Top mensual.
--    Un BRIN sería más compacto, pero el ranking se filtra por meses
--    concretos (cardinalidad baja) y un B-tree clásico responde mejor.
CREATE INDEX IF NOT EXISTS idx_sct_created
  ON public.saved_chart_tracks (created_at DESC);
