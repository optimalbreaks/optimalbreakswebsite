-- Si se verifica una ficha a una cuenta, las demás solicitudes pendientes
-- de esa misma ficha no siguen «en revisión» ni se pueden cancelar.
ALTER TABLE public.artist_claims
  DROP CONSTRAINT artist_claims_status_check;

ALTER TABLE public.artist_claims
  ADD CONSTRAINT artist_claims_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'revoked', 'superseded'));

COMMENT ON CONSTRAINT artist_claims_status_check ON public.artist_claims IS
  'superseded = otra cuenta se verificó como ese artista; el solicitante ya no puede cancelar.';

UPDATE public.artist_claims AS c
SET
  status = 'superseded',
  admin_notes = CASE
    WHEN coalesce(btrim(c.admin_notes), '') = '' THEN 'Cancelada: la ficha ya está verificada por otra cuenta.'
    ELSE c.admin_notes
  END,
  resolved_at = COALESCE(c.resolved_at, now())
FROM public.artists AS a
WHERE c.artist_id = a.id
  AND c.status = 'pending'
  AND a.claimed_by IS NOT NULL
  AND a.claimed_by IS DISTINCT FROM c.user_id;
