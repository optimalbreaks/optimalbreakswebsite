-- Diagnóstico temporal del reproductor (25 oct 2026): por qué la lista se para
-- en segundo plano / pantalla bloqueada en algunos móviles. Anónimo: sin
-- user_id, sin IP, sin cookies. `session_id` es aleatorio por pestaña
-- (sessionStorage) y solo sirve para ordenar las líneas de una misma escucha.
-- Escribe solo el servidor (service role); anon/authenticated no ven nada.
-- Se borra entera cuando acabe la investigación.

create table if not exists public.player_diagnostics (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  session_id text not null check (char_length(session_id) between 8 and 64),
  seq integer not null,
  client_ts timestamptz not null,
  event text not null check (char_length(event) between 1 and 40),
  platform text not null check (platform in ('ios', 'android', 'desktop', 'other')),
  standalone boolean not null default false,
  hidden boolean not null default false,
  ua text check (ua is null or char_length(ua) <= 300),
  data jsonb not null default '{}'::jsonb
);

create index if not exists player_diagnostics_session_idx
  on public.player_diagnostics (session_id, seq);
create index if not exists player_diagnostics_received_idx
  on public.player_diagnostics (received_at desc);

alter table public.player_diagnostics enable row level security;
revoke all on table public.player_diagnostics from anon, authenticated;

comment on table public.player_diagnostics is
  'Temporal. Eventos anónimos del reproductor (cambio de pista, play, watchdog, página oculta). Sin datos personales. Se borra al cerrar la investigación de oct 2026.';

-- Retención: 30 días (pg_cron ya está activo, migración 090).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'player-diagnostics-retention';
    perform cron.schedule(
      'player-diagnostics-retention',
      '17 4 * * *',
      $cron$delete from public.player_diagnostics where received_at < now() - interval '30 days'$cron$
    );
  end if;
end $$;
