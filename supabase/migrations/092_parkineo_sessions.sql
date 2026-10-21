-- Parkineo: sesiones de DJs que aún no tienen ficha.
-- La lista pública solo enseña status = published. El envío y la decisión
-- pasan por la API con service role (una en cola por cuenta; el enlace no
-- se repite mientras esté en cola o publicada). No es un mix ni un artista.

create table if not exists public.parkineo_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dj_name text not null,
  city text not null,
  title text not null,
  source_url text not null,
  source_key text not null,
  platform text not null,
  embed_url text,
  video_url text,
  image_url text,
  duration_minutes integer not null,
  slug text not null,
  status text not null default 'pending',
  reject_reason text,
  published_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  constraint parkineo_sessions_platform_check check (platform in ('soundcloud', 'youtube', 'mixcloud')),
  constraint parkineo_sessions_status_check check (status in ('pending', 'published', 'rejected')),
  constraint parkineo_sessions_dj_name_len check (char_length(dj_name) between 2 and 60),
  constraint parkineo_sessions_city_len check (char_length(city) between 2 and 60),
  constraint parkineo_sessions_title_len check (char_length(title) between 2 and 120),
  constraint parkineo_sessions_duration_check check (duration_minutes > 15 and duration_minutes <= 180),
  constraint parkineo_sessions_slug_key unique (slug)
);

create index if not exists parkineo_sessions_user_idx
  on public.parkineo_sessions (user_id, created_at desc);

create index if not exists parkineo_sessions_published_idx
  on public.parkineo_sessions (published_at desc, id)
  where status = 'published';

create unique index if not exists parkineo_one_pending_per_user
  on public.parkineo_sessions (user_id)
  where status = 'pending';

create unique index if not exists parkineo_source_key_live
  on public.parkineo_sessions (source_key)
  where status in ('pending', 'published');

drop trigger if exists parkineo_sessions_updated_at on public.parkineo_sessions;
create trigger parkineo_sessions_updated_at
  before update on public.parkineo_sessions
  for each row execute function public.update_updated_at();

alter table public.parkineo_sessions enable row level security;

drop policy if exists parkineo_published_read on public.parkineo_sessions;
create policy parkineo_published_read
  on public.parkineo_sessions
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists parkineo_owner_read on public.parkineo_sessions;
create policy parkineo_owner_read
  on public.parkineo_sessions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on table public.parkineo_sessions to anon, authenticated;
revoke insert, update, delete on table public.parkineo_sessions from anon, authenticated;

comment on table public.parkineo_sessions is
  'Sesiones de DJs sin ficha. Pública solo si status = published. El user_id no se selecciona en /parkineo.';
