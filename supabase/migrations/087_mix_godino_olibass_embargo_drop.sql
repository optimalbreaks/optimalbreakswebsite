-- El embargo de Godino vs Paket (Open Air) cumplió las 00:01 del 3 oct 2026.
-- Se retira la política para que la sesión no vuelva a depender de esa hora.

DROP POLICY IF EXISTS mixes_embargo_godino_olibass_2026 ON public.mixes;
