-- Parkineo: temas propios (cajón distinto de las sesiones).
-- El MP3 vive en el bucket privado parkineo-tracks. La página pública
-- solo lee status = published y no selecciona user_id ni storage_path.
-- Una fila en cola por cuenta. El corazón (parkineo_track_votes) no es
-- un «+» de charts y no entra en el Top 100. El recuento no se pinta
-- en /parkineo: lo ve el admin para el premio del semestre.

create table if not exists public.parkineo_tracks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  artist_name text not null,
  title text not null,
  storage_path text not null,
  duration_seconds integer not null,
  slug text not null,
  status text not null default 'pending',
  reject_reason text,
  published_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  cycle text,
  constraint parkineo_tracks_status_check check (status in ('pending', 'published', 'rejected')),
  constraint parkineo_tracks_artist_len check (char_length(artist_name) between 2 and 60),
  constraint parkineo_tracks_title_len check (char_length(title) between 2 and 120),
  constraint parkineo_tracks_duration_check check (duration_seconds >= 60 and duration_seconds <= 900),
  constraint parkineo_tracks_slug_key unique (slug),
  constraint parkineo_tracks_path_key unique (storage_path)
);

create index if not exists parkineo_tracks_user_idx
  on public.parkineo_tracks (user_id, created_at desc);

create index if not exists parkineo_tracks_published_idx
  on public.parkineo_tracks (published_at desc, id)
  where status = 'published';

create unique index if not exists parkineo_tracks_one_pending_per_user
  on public.parkineo_tracks (user_id)
  where status = 'pending';

drop trigger if exists parkineo_tracks_updated_at on public.parkineo_tracks;
create trigger parkineo_tracks_updated_at
  before update on public.parkineo_tracks
  for each row execute function public.update_updated_at();

alter table public.parkineo_tracks enable row level security;

drop policy if exists parkineo_tracks_published_read on public.parkineo_tracks;
create policy parkineo_tracks_published_read
  on public.parkineo_tracks
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists parkineo_tracks_owner_read on public.parkineo_tracks;
create policy parkineo_tracks_owner_read
  on public.parkineo_tracks
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on table public.parkineo_tracks to anon, authenticated;
revoke insert, update, delete on table public.parkineo_tracks from anon, authenticated;

comment on table public.parkineo_tracks is
  'Temas propios mandados a Parkineo. Público solo si status = published. El MP3 está en el bucket privado parkineo-tracks.';

create table if not exists public.parkineo_track_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  track_id uuid not null references public.parkineo_tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint parkineo_track_votes_user_track_key unique (user_id, track_id)
);

create index if not exists parkineo_track_votes_track_idx
  on public.parkineo_track_votes (track_id);

alter table public.parkineo_track_votes enable row level security;

drop policy if exists parkineo_track_votes_own_read on public.parkineo_track_votes;
create policy parkineo_track_votes_own_read
  on public.parkineo_track_votes
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists parkineo_track_votes_own_insert on public.parkineo_track_votes;
create policy parkineo_track_votes_own_insert
  on public.parkineo_track_votes
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.parkineo_tracks t
      where t.id = track_id and t.status = 'published'
    )
  );

drop policy if exists parkineo_track_votes_own_delete on public.parkineo_track_votes;
create policy parkineo_track_votes_own_delete
  on public.parkineo_track_votes
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on table public.parkineo_track_votes to authenticated;
revoke all on table public.parkineo_track_votes from anon;

comment on table public.parkineo_track_votes is
  'Marca de un tema de Parkineo. Un usuario, una fila. Sin recuento en la página pública y sin efecto en el Top 100.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'parkineo-tracks',
  'parkineo-tracks',
  false,
  26214400,
  array['audio/mpeg', 'audio/mp3', 'application/octet-stream']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
