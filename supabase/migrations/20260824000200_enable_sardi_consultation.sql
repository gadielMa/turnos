-- Activa la primera consulta de Sardi Estudio. El importe publicado es el
-- valor de la consulta; durante el lanzamiento se cobra una reserva de $1.
update public.businesses
set public_profile = jsonb_set(
  coalesce(public_profile, '{}'::jsonb),
  '{services}',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'consulta',
      'name', 'Consulta',
      'description', 'Consulta jurídica e inmobiliaria personalizada.',
      'price', 15000
    )
  ),
  true
) || jsonb_build_object('reservation_amount', 1)
where slug = 'sardi';

-- Reafirma la asociación del usuario creado para Enrique; esto evita que una
-- sesión existente quede sin acceso al panel por una membresía incompleta.
update public.profiles
set full_name = 'Enrique Sardi', role = 'admin'
where id = (
  select id from auth.users
  where lower(email) = 'q.sardi@gmail.com'
  limit 1
);

insert into public.business_members (business_id, user_id, role)
select business.id, account.id, 'owner'
from public.businesses business
join auth.users account on lower(account.email) = 'q.sardi@gmail.com'
where business.slug = 'sardi'
on conflict (business_id, user_id) do update set role = 'owner';
