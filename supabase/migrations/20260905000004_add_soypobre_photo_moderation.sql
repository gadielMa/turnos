-- Una foto nunca se publica sin la aprobación explícita del equipo.
-- Las fotos históricas se consideran aprobadas para no ocultar perfiles ya revisados.
alter table public.soypobre_requests
  add column if not exists photo_status text not null default 'approved';

alter table public.soypobre_requests
  drop constraint if exists soypobre_requests_photo_status_check;

alter table public.soypobre_requests
  add constraint soypobre_requests_photo_status_check
  check (photo_status in ('pending', 'approved', 'rejected'));

create index if not exists soypobre_requests_pending_photo_idx
  on public.soypobre_requests (created_at desc)
  where photo_status = 'pending';

-- El navegador nunca puede publicar una foto por su cuenta. Si cambia la
-- referencia de una imagen, el trigger la devuelve a pending. La revisión
-- hecha desde el dashboard (postgres) o desde un backend con service_role sí
-- puede marcarla como approved o rejected.
create or replace function public.enforce_soypobre_photo_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and (new.photo_url is not null or new.photo_path is not null) then
      new.photo_status := 'pending';
    elsif tg_op = 'UPDATE' then
      if new.photo_url is distinct from old.photo_url
        or new.photo_path is distinct from old.photo_path
        or new.photo_public_id is distinct from old.photo_public_id then
        new.photo_status := 'pending';
      elsif new.photo_status is distinct from old.photo_status then
        raise exception 'Solo la moderación puede cambiar el estado de una foto';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_soypobre_photo_moderation on public.soypobre_requests;
create trigger enforce_soypobre_photo_moderation
  before insert or update on public.soypobre_requests
  for each row execute function public.enforce_soypobre_photo_moderation();

comment on column public.soypobre_requests.photo_status is
  'Las fotos nuevas quedan pending. Aprobarlas desde Supabase Table Editor cambiando el valor a approved.';
