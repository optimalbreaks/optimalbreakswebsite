-- Campañas de mailing del admin (/administrator/mailing).
-- La clave anónima no lee estas tablas. El envío usa service role.

create table if not exists public.mail_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  preset text not null default 'libre'
    check (preset in ('top10', 'octubre', 'montar', 'funciones', 'libre')),
  subject text not null,
  briefing text not null default '',
  html_content text not null default '',
  audience text not null default 'confirmed'
    check (audience in ('confirmed', 'sin_lista', 'lista_corta', 'con_lista')),
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'archived')),
  is_paused boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.mail_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mail_campaigns(id) on delete cascade,
  user_id uuid,
  email text not null,
  display_name text not null default '',
  save_count integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create index if not exists mail_campaign_recipients_campaign_status
  on public.mail_campaign_recipients (campaign_id, status);

create table if not exists public.mail_suppressions (
  email text primary key,
  reason text not null default '',
  created_at timestamptz not null default now()
);

alter table public.mail_campaigns enable row level security;
alter table public.mail_campaign_recipients enable row level security;
alter table public.mail_suppressions enable row level security;

revoke all on table public.mail_campaigns from anon, authenticated;
revoke all on table public.mail_campaign_recipients from anon, authenticated;
revoke all on table public.mail_suppressions from anon, authenticated;
