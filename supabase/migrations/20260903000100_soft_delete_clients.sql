-- Los clientes se ocultan del panel sin borrar sus datos ni reservas históricas.
alter table public.clients
  add column if not exists deleted_at timestamptz;

create index if not exists clients_active_business_idx
  on public.clients (business_id, name)
  where deleted_at is null;
