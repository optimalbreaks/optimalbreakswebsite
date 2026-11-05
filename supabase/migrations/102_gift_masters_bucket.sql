-- Máster WAV del regalo (Woter, Gone Gone Gone). Bucket privado.
-- El tope real del proyecto es 50 MB y el WAV pesa 54, así que va en dos
-- trozos (wav.1 y wav.2). La ruta los junta. No hay policy pública.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-masters',
  'gift-masters',
  false,
  50000000,
  array['audio/wav', 'audio/x-wav', 'audio/wave']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
