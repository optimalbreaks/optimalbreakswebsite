-- Congelar un artículo suelto (7 nov 2026).
-- El del mes (`mes-breakbeat-*`) se publica en directo y no lleva las 72 h
-- automáticas. Cuando Godino graba ese artículo, se abre una fila aquí:
-- solo ese artículo (ficha, tarjeta y home) enseña la foto. El Top 100 sigue
-- en directo. `until` lo pone el script (hoy + 72 h desde mañana).

create table if not exists public.article_freezes (
  id bigint generated always as identity primary key,
  slug text not null check (char_length(slug) between 3 and 200),
  frozen_at timestamptz not null default now(),
  until timestamptz not null,
  ended_at timestamptz,
  note text check (note is null or char_length(note) <= 300),
  check (until > frozen_at)
);

create index if not exists article_freezes_open_idx
  on public.article_freezes (slug, until desc) where ended_at is null;

alter table public.article_freezes enable row level security;
revoke all on table public.article_freezes from anon, authenticated;

comment on table public.article_freezes is
  'Congelación de un artículo concreto (reel). Activa = ended_at null y now() < until. No para el Top 100.';
