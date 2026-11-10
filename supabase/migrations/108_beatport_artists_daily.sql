-- Las fichas de los 140 se leen cada día a las 13:00 de Madrid (10 nov 2026).
-- El pase de las 12:05 sigue siendo el listado de Breaks y los enlaces del chat.
-- 0 11 UTC = 13:00 en verano; 0 12 UTC = 13:00 en invierno.
-- El otro horario ve el pase de fichas del día ya hecho y no escribe fila.
-- scope distingue los dos pases: uno no tapa al otro cuando el repuesto llega tarde.
-- El secreto github_actions_dispatch vive en vault y no va en este archivo.

alter table public.chart_import_runs
  add column if not exists scope text;

alter table public.chart_import_runs
  drop constraint if exists chart_import_runs_scope_check;

alter table public.chart_import_runs
  add constraint chart_import_runs_scope_check
  check (scope is null or scope in ('breaks', 'artists', 'full'));

comment on column public.chart_import_runs.scope is
  'breaks = listado de las 12:05; artists = fichas de los 140 a las 13:00; full = las dos (a mano). Null = pase anterior a esta columna.';

create or replace function private.kick_beatport_artists()
returns bigint
language plpgsql
security definer
set search_path = private, net, vault, extensions
as $$
declare
  tok text;
  req bigint;
begin
  select decrypted_secret into tok
  from vault.decrypted_secrets
  where name = 'github_actions_dispatch'
  limit 1;
  if tok is null or length(tok) < 20 then
    raise exception 'falta el secreto github_actions_dispatch';
  end if;
  select net.http_post(
    url := 'https://api.github.com/repos/optimalbreaks/optimalbreakswebsite/actions/workflows/beatport-artists.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'User-Agent', 'optimalbreaks-beatport-kick',
      'Content-Type', 'application/json',
      'X-GitHub-Api-Version', '2022-11-28'
    ),
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', jsonb_build_object('force', 'false')
    ),
    timeout_milliseconds := 10000
  ) into req;
  return req;
end;
$$;

revoke all on function private.kick_beatport_artists() from public;

do $$
declare
  r record;
begin
  for r in
    select jobid from cron.job
    where jobname in ('beatport-artists-kick-summer', 'beatport-artists-kick-winter')
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'beatport-artists-kick-summer',
  '0 11 * * *',
  $$select private.kick_beatport_artists()$$
);

select cron.schedule(
  'beatport-artists-kick-winter',
  '0 12 * * *',
  $$select private.kick_beatport_artists()$$
);
