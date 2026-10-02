-- Godino pidió que su set del Open Air no esté en la web hasta las 00:01
-- del sábado 3 oct 2026 (Madrid). Política RESTRICTIVE: se suma a
-- «Public read mixes» y solo afecta a este slug. A partir de esa hora
-- la fila vuelve a leerse sola. El service role (admin) no pasa por RLS.

CREATE POLICY mixes_embargo_godino_olibass_2026
  ON public.mixes
  AS RESTRICTIVE
  FOR SELECT
  TO public
  USING (
    slug IS DISTINCT FROM 'godino-vs-paket-dohiser-mc-olibass-open-air-2026'
    OR now() >= timestamptz '2026-10-03 00:01:00+02'
  );
