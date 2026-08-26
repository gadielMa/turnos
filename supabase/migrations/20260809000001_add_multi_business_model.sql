-- Modelo multi-negocio para poder crear cuentas de profesionales desde un panel central.
-- Mantiene datos históricos dentro de un negocio legado.

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('platform_owner', 'admin', 'client'));

insert into public.businesses (name, slug)
values ('Legacy business', 'legacy-business')
on conflict (slug) do nothing;

alter table public.business_hours add column if not exists business_id uuid;

update public.business_hours
set business_id = (select id from public.businesses where slug = 'legacy-business')
where business_id is null;

alter table public.business_hours drop constraint if exists business_hours_pkey;
alter table public.business_hours
  alter column business_id set not null,
  add constraint business_hours_business_id_fkey
    foreign key (business_id) references public.businesses(id) on delete cascade,
  add constraint business_hours_pkey primary key (business_id, weekday);

alter table public.bookings add column if not exists business_id uuid;

update public.bookings
set business_id = (select id from public.businesses where slug = 'legacy-business')
where business_id is null;

alter table public.bookings
  alter column business_id set not null,
  add constraint bookings_business_id_fkey
    foreign key (business_id) references public.businesses(id) on delete restrict;

drop index if exists public.bookings_active_slot_idx;
create unique index bookings_active_business_slot_idx
  on public.bookings (business_id, booking_date, booking_time)
  where status in ('pending', 'confirmed');

create index if not exists bookings_business_date_idx
  on public.bookings (business_id, booking_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'platform_owner'
  );
$$;

create or replace function public.is_business_admin(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.business_members
      where business_id = target_business_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    );
$$;

-- Los administradores que ya existían quedan asociados al negocio inicial.
insert into public.business_members (business_id, user_id, role)
select b.id, p.id, 'owner'
from public.businesses b
cross join public.profiles p
where b.slug = 'legacy-business' and p.role = 'admin'
on conflict (business_id, user_id) do nothing;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

drop policy if exists "members can read their businesses" on public.businesses;
create policy "members can read their businesses"
on public.businesses for select
to authenticated
using (
  public.is_platform_owner()
  or exists (
    select 1 from public.business_members
    where business_id = businesses.id and user_id = auth.uid()
  )
);

drop policy if exists "platform owners can manage businesses" on public.businesses;
create policy "platform owners can manage businesses"
on public.businesses for all
to authenticated
using (public.is_platform_owner())
with check (public.is_platform_owner());

drop policy if exists "members can read memberships" on public.business_members;
create policy "members can read memberships"
on public.business_members for select
to authenticated
using (user_id = auth.uid() or public.is_platform_owner());

drop policy if exists "platform owners can manage memberships" on public.business_members;
create policy "platform owners can manage memberships"
on public.business_members for all
to authenticated
using (public.is_platform_owner())
with check (public.is_platform_owner());

drop policy if exists "authenticated users can read business hours" on public.business_hours;
create policy "members can read business hours"
on public.business_hours for select
to authenticated
using (public.is_business_admin(business_id));

drop policy if exists "admins can manage business hours" on public.business_hours;
create policy "admins can manage business hours"
on public.business_hours for all
to authenticated
using (public.is_business_admin(business_id))
with check (public.is_business_admin(business_id));

grant select on public.businesses, public.business_members to authenticated;
grant insert, update, delete on public.businesses, public.business_members to authenticated;
grant execute on function public.is_platform_owner() to authenticated;
grant execute on function public.is_business_admin(uuid) to authenticated;
