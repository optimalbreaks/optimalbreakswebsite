-- Un usuario = una solicitud viva (pendiente o aprobada).
-- El historial rejected / cancelled / revoked / superseded se conserva.
-- El índice uniq_pending_claim_per_user (068) sigue cubriendo solo pending.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_claim_per_user
  ON public.artist_claims(user_id)
  WHERE status IN ('pending', 'approved');
