-- Asocia la cuenta administradora de Miró creada después de la migración inicial.
update public.profiles
set full_name = 'Óptica Miró', role = 'admin'
where id = (select id from auth.users where lower(email) = 'miro@induliru.com' limit 1);

insert into public.business_members (business_id, user_id, role)
select business.id, account.id, 'owner'
from public.businesses business
join auth.users account on lower(account.email) = 'miro@induliru.com'
where business.slug = 'miro'
on conflict (business_id, user_id) do update set role = 'owner';
