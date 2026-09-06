-- Repara instalaciones donde la migración inicial quedó registrada pero
-- PostgREST no recargó la columna usada por las reservas y el panel.
alter table public.clients
  add column if not exists deleted_at timestamptz;

create index if not exists clients_active_business_idx
  on public.clients (business_id, name)
  where deleted_at is null;

notify pgrst, 'reload schema';
