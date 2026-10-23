-- Corazón de las sesiones de Parkineo.
-- No es un save de tema ni un mix. Cada cuenta marca la sesión una vez.
-- La página pública no enseña el recuento: las filas quedan para un top posterior.
-- Solo el dueño lee, inserta y borra las suyas. El service role puede contarlas.

create table if not exists public.favorite_parkineo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.parkineo_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorite_parkineo_user_session_key unique (user_id, session_id)
);

create index if not exists favorite_parkineo_session_idx
  on public.favorite_parkineo (session_id);

alter table public.favorite_parkineo enable row level security;

drop policy if exists favorite_parkineo_own_read on public.favorite_parkineo;
create policy favorite_parkineo_own_read
  on public.favorite_parkineo
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists favorite_parkineo_own_insert on public.favorite_parkineo;
create policy favorite_parkineo_own_insert
  on public.favorite_parkineo
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists favorite_parkineo_own_delete on public.favorite_parkineo;
create policy favorite_parkineo_own_delete
  on public.favorite_parkineo
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on table public.favorite_parkineo to authenticated;
revoke all on table public.favorite_parkineo from anon;

comment on table public.favorite_parkineo is
  'Corazón de una sesión de Parkineo. Un usuario, una fila. Sin recuento público en /parkineo.';
