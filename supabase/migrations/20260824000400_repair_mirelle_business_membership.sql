-- La cuenta de Mirelle puede autenticarse, pero necesita una membresía para
-- abrir su agenda y sus datos. Se conserva su usuario y contraseña actuales.
update public.profiles
set full_name = 'Mirelle', role = 'admin'
where id = (
  select id from auth.users
  where lower(email) = 'mirelle@induliru.com'
  limit 1
);

insert into public.business_members (business_id, user_id, role)
select business.id, account.id, 'owner'
from public.businesses business
join auth.users account on lower(account.email) = 'mirelle@induliru.com'
where business.slug = 'mirelle'
on conflict (business_id, user_id) do update set role = 'owner';
