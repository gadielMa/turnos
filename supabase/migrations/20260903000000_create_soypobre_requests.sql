-- Soy Pobre usa objetos propios y no tiene relaciones con el sistema de turnos.
create table if not exists public.soypobre_requests (
  id uuid primary key default gen_random_uuid(),
  cbu text,
  alias text,
  story text,
  photo_path text,
  created_at timestamptz not null default now(),
  constraint soypobre_requests_payment_method_check check (cbu is not null or alias is not null),
  constraint soypobre_requests_cbu_check check (cbu is null or cbu ~ '^[0-9]{22}$'),
  constraint soypobre_requests_alias_check check (alias is null or char_length(alias) between 1 and 50),
  constraint soypobre_requests_story_check check (story is null or char_length(story) <= 1000)
);

alter table public.soypobre_requests enable row level security;
revoke all on public.soypobre_requests from anon, authenticated;
grant insert on public.soypobre_requests to anon;
drop policy if exists "public can create soypobre requests" on public.soypobre_requests;
create policy "public can create soypobre requests"
  on public.soypobre_requests for insert to anon
  with check (true);

insert into storage.buckets (id, name, public)
values ('soypobre-images', 'soypobre-images', false)
on conflict (id) do nothing;

drop policy if exists "public can upload soypobre images" on storage.objects;
create policy "public can upload soypobre images"
  on storage.objects for insert to anon
  with check (bucket_id = 'soypobre-images');
