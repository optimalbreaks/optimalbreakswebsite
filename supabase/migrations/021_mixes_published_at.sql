-- Fecha de publicación del vídeo (YouTube u otra fuente) para ordenar /mixes de más reciente a más antigua.
ALTER TABLE public.mixes ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

COMMENT ON COLUMN public.mixes.published_at IS 'Fecha de publicación en la plataforma (p. ej. YouTube); prioritaria para ordenación.';
