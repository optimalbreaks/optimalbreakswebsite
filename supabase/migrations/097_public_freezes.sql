-- Congelación de rankings públicos (25 oct 2026).
--
-- Para que un reel de Instagram no contradiga a la web:
--   · Artículo de quincena/trimestre: 72 h desde `published_at`, solo. No usa
--     `top_freezes`; la foto va a `public_freeze_snapshots` con clave
--     `article:<slug>`.
--   · «Congela los tops»: una fila en `top_freezes` (72 h por defecto). Congela
--     Top 100 de temas, top de artistas, países, Top 10 de la home, quincena de
--     la home, tarjetas de /topreleases y los números de las fichas de artista.
--     Clave `page:<id>`.
-- La primera petición tras congelar calcula en directo y guarda la foto; las
-- demás leen la misma. Al pasar `until` (o con `ended_at`) todo vuelve a vivo,
-- con los votos y escuchas de esos días incluidos.
-- Escribe solo el servidor (service role). Script: `scripts/top-freeze.mjs`.

create table if not exists public.top_freezes (
  id bigint generated always as identity primary key,
  frozen_at timestamptz not null default now(),
  until timestamptz not null,
  ended_at timestamptz,
  note text check (note is null or char_length(note) <= 300),
  check (until > frozen_at)
);

create index if not exists top_freezes_open_idx
  on public.top_freezes (until desc) where ended_at is null;

create table if not exists public.public_freeze_snapshots (
  freeze_key text not null check (char_length(freeze_key) between 3 and 200),
  item_key text not null check (char_length(item_key) between 1 and 200),
  data jsonb not null,
  captured_at timestamptz not null default now(),
  primary key (freeze_key, item_key)
);

alter table public.top_freezes enable row level security;
alter table public.public_freeze_snapshots enable row level security;
revoke all on table public.top_freezes from anon, authenticated;
revoke all on table public.public_freeze_snapshots from anon, authenticated;

comment on table public.top_freezes is
  'Congelaciones de los tops públicos pedidas por el editor («congela los tops»). Activa = ended_at null y now() < until.';
comment on table public.public_freeze_snapshots is
  'Fotos fijas de rankings durante una congelación (page:<id>) o las 72 h de un artículo (article:<slug>).';

-- Las fotos solo sirven mientras dura su congelación (72 h). Se borran a los 14 días.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'public-freeze-snapshots-retention';
    perform cron.schedule(
      'public-freeze-snapshots-retention',
      '23 4 * * *',
      $cron$delete from public.public_freeze_snapshots where captured_at < now() - interval '14 days'$cron$
    );
  end if;
end $$;
