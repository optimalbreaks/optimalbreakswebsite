-- Cola de New Releases de Beatport (género breaks) pendientes de oído.
-- Lo aprobado pasa a chart_featured_tracks. Lo descartado se queda aquí
-- para no volver a traerlo al día siguiente. Sin políticas: solo service role.

create table if not exists public.chart_import_queue (
  id uuid primary key default gen_random_uuid(),
  beatport_track_id text not null,
  link_url text not null,
  title text not null,
  mix_name text not null default '',
  artists jsonb not null default '[]'::jsonb,
  label text not null default '',
  artwork_url text,
  sample_url text,
  bpm integer,
  music_key text not null default '',
  release_date date,
  release_year integer,
  status text not null default 'pending',
  via text,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz not null default now(),
  constraint chart_import_queue_beatport_track_id_key unique (beatport_track_id),
  constraint chart_import_queue_status_check check (status in ('pending', 'approved', 'discarded')),
  constraint chart_import_queue_via_check check (via is null or via in ('auto_top100', 'admin'))
);

create index if not exists chart_import_queue_pending_idx
  on public.chart_import_queue (release_date desc, created_at desc)
  where status = 'pending';

alter table public.chart_import_queue enable row level security;

create table if not exists public.chart_import_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null default 'cron',
  ok boolean not null default false,
  seen integer not null default 0,
  queued integer not null default 0,
  auto_approved integer not null default 0,
  skipped_known integer not null default 0,
  error text
);

create index if not exists chart_import_runs_started_idx
  on public.chart_import_runs (started_at desc);

alter table public.chart_import_runs enable row level security;
