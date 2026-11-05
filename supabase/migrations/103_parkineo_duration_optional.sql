-- Parkineo: si no se puede leer la duración, la sesión entra en la cola.
-- El corte de 15 min–3 h solo aplica cuando hay un número. Al publicar se
-- intenta leer otra vez; si sigue en blanco, la ficha no enseña minutos.

alter table public.parkineo_sessions
  alter column duration_minutes drop not null;

alter table public.parkineo_sessions
  drop constraint if exists parkineo_sessions_duration_check;

alter table public.parkineo_sessions
  add constraint parkineo_sessions_duration_check
  check (duration_minutes is null or (duration_minutes > 15 and duration_minutes <= 180));
