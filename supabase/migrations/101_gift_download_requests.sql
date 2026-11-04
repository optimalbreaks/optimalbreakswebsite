-- Descarga de un regalo (Woter, Gone Gone Gone). La fila la escribe el
-- service role. El visitante no lee la tabla: las capturas son datos personales
-- y el MP3 solo sale por la API, con la sesión de quien está aprobado.

create table if not exists public.gift_download_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  gift_slug text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  shot_site_path text not null default '',
  shot_artist_path text not null default '',
  note text,
  decided_at timestamptz,
  decided_by uuid,
  unique (gift_slug, user_id)
);

alter table public.gift_download_requests enable row level security;
revoke all on table public.gift_download_requests from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-proofs',
  'gift-proofs',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
