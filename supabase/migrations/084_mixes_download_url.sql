-- MP3 descargable de una sesión, cedido por el artista o la promotora.
-- Vive fuera del repo y de Vercel (release `sesiones-descarga` de GitHub).
-- /mixes/<slug> pinta el botón «Descargar MP3» solo si hay URL.
-- No es `audio_url`: ese activa el reproductor nativo en las tarjetas.
ALTER TABLE public.mixes
  ADD COLUMN IF NOT EXISTS download_url text;
