-- Enlaces de Beatport que el chat editorial deja para el pase de las 12.
-- El chat corre en Vercel y Cloudflare le tapa la ficha. El pase corre en
-- GitHub, con Chrome, y es el que lee estas filas. No es la cola de Por aprobar:
-- ahí la ficha ya está leída y alguien la escucha. Aquí solo está el enlace.

create table if not exists public.chart_import_links (
  id uuid primary key default gen_random_uuid(),
  link_url text not null,
  beatport_id text not null,
  kind text not null,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint chart_import_links_link_url_key unique (link_url),
  constraint chart_import_links_kind_check check (kind in ('track', 'release')),
  constraint chart_import_links_status_check check (status in ('pending', 'done'))
);

create index if not exists chart_import_links_pending_idx
  on public.chart_import_links (created_at)
  where status = 'pending';

alter table public.chart_import_links enable row level security;
