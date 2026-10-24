-- Móvil de contacto de la sesión (solo admin) y aviso por correo al publicar.

alter table public.parkineo_sessions
  add column if not exists contact_phone text;

alter table public.parkineo_sessions
  drop constraint if exists parkineo_sessions_phone_len;

alter table public.parkineo_sessions
  add constraint parkineo_sessions_phone_len
  check (contact_phone is null or char_length(contact_phone) between 9 and 40);

comment on column public.parkineo_sessions.contact_phone is
  'Móvil para WhatsApp. No se selecciona en /parkineo. Nulo en las sesiones anteriores a pedirlo.';

-- El GRANT de tabla incluía user_id y, a partir de esta columna, el móvil.
-- La policy sigue pudiendo leer user_id; el cliente anónimo no.
revoke select on table public.parkineo_sessions from anon, authenticated;

grant select (
  id,
  created_at,
  updated_at,
  dj_name,
  city,
  title,
  source_url,
  source_key,
  platform,
  embed_url,
  video_url,
  image_url,
  duration_minutes,
  slug,
  status,
  reject_reason,
  published_at,
  decided_at,
  decided_by
) on table public.parkineo_sessions to anon, authenticated;

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'mail_dispatches'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%claim_approved%';
  if cname is not null then
    execute format('alter table public.mail_dispatches drop constraint %I', cname);
  end if;
end $$;

alter table public.mail_dispatches
  add constraint mail_dispatches_kind_check
  check (kind in ('claim_approved', 'booking_new', 'parkineo_published'));
