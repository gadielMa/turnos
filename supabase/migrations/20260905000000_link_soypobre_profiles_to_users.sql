-- El perfil de Soy Pobre pertenece a la cuenta autenticada que lo administra.
-- Las solicitudes históricas anónimas se conservan sin user_id.
alter table public.soypobre_requests
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists soypobre_requests_user_id_key
  on public.soypobre_requests (user_id);

grant select, insert, update on public.soypobre_requests to authenticated;

drop policy if exists "users can read their own soypobre profile" on public.soypobre_requests;
create policy "users can read their own soypobre profile"
  on public.soypobre_requests for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users can create their own soypobre profile" on public.soypobre_requests;
create policy "users can create their own soypobre profile"
  on public.soypobre_requests for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users can update their own soypobre profile" on public.soypobre_requests;
create policy "users can update their own soypobre profile"
  on public.soypobre_requests for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "users can upload their own soypobre images" on storage.objects;
create policy "users can upload their own soypobre images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'soypobre-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can read their own soypobre images" on storage.objects;
create policy "users can read their own soypobre images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'soypobre-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
