-- Admin puede sentarse en la red de artistas sin ficha reclamada (artist_id NULL).
ALTER TABLE public.artist_network_members
  ALTER COLUMN artist_id DROP NOT NULL;

COMMENT ON COLUMN public.artist_network_members.artist_id IS
  'Ficha reclamada con la que se sienta este usuario. NULL = staff Optimal Breaks (admin).';
