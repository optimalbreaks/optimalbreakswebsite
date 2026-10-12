-- El cron de GitHub Actions llega horas tarde (9–11 oct 2026).
-- Este aviso, a las 12:05 de Madrid, arranca el mismo workflow (sin --force).
-- 5 10 UTC = 12:05 en verano; 5 11 UTC = 12:05 en invierno.
-- El otro horario ve el pase del día ya hecho y no escribe fila.
-- Cerrado el 12 oct 2026: 10:05 UTC, trigger cron, 527 vistos / 5 publicados / 32 pendientes.
-- El secreto github_actions_dispatch vive en vault y no va en este archivo.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.kick_beatport_daily()
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
    url := 'https://api.github.com/repos/optimalbreaks/optimalbreakswebsite/actions/workflows/beatport-daily.yml/dispatches',
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

revoke all on function private.kick_beatport_daily() from public;

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname in ('beatport-daily-kick-summer', 'beatport-daily-kick-winter')
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule('beatport-daily-kick-summer', '5 10 * * *', $$select private.kick_beatport_daily()$$);
select cron.schedule('beatport-daily-kick-winter', '5 11 * * *', $$select private.kick_beatport_daily()$$);
