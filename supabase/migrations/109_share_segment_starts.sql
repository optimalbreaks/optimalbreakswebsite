-- Fragmento de audio elegido para los vídeos IG / R / F (11 nov 2026).
-- Antes vivía solo en el localStorage de cada navegador: el iPhone y el PC
-- generaban el mismo vídeo con trozos distintos de cada tema.
-- Clave = la de `AudioSegmentPicker` (`segmentKey`). Solo la usa el servidor.

create table if not exists public.share_segment_starts (
  key text primary key,
  start_sec real not null check (start_sec >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.share_segment_starts enable row level security;
revoke all on table public.share_segment_starts from anon, authenticated;

comment on table public.share_segment_starts is
  'Arranque (s) del fragmento de audio elegido por tema/vídeo. Lo comparten todos los dispositivos de los admins.';
