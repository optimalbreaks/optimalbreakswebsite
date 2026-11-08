-- Escuchas de Parkineo (8 nov 2026). Solo las lee el admin.
-- Una fila cada vez que alguien da al play en la web pública
-- (sesión de YouTube, SoundCloud o Mixcloud, o tema MP3).
-- El panel no cuenta. No se enseña en /parkineo.
-- El corazón (favorite_parkineo) y la marca (parkineo_track_votes) siguen aparte.

create table if not exists public.parkineo_play_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  session_id uuid references public.parkineo_sessions(id) on delete cascade,
  track_id uuid references public.parkineo_tracks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint parkineo_play_events_kind_check check (kind in ('session', 'track')),
  constraint parkineo_play_events_target_check check (
    (kind = 'session' and session_id is not null and track_id is null)
    or (kind = 'track' and track_id is not null and session_id is null)
  )
);

create index if not exists parkineo_play_events_session_idx
  on public.parkineo_play_events (session_id, created_at desc);

create index if not exists parkineo_play_events_track_idx
  on public.parkineo_play_events (track_id, created_at desc);

alter table public.parkineo_play_events enable row level security;
revoke all on table public.parkineo_play_events from anon, authenticated;

comment on table public.parkineo_play_events is
  'Escucha de una sesión o un tema de Parkineo en la web pública. Una por pestaña. No se enseña en /parkineo.';
