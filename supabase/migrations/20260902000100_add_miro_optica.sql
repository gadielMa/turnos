-- Óptica Miró: turnos de consulta óptica sin pago online.
insert into public.businesses (name, slug, public_profile)
values (
  'Óptica Miró',
  'miro',
  jsonb_build_object(
    'category', 'Óptica',
    'headline', 'Cuidamos tu mirada con atención personalizada.',
    'description', 'Consulta óptica individual para evaluar tu visión y orientarte en la elección de tus lentes.',
    'location', 'Av. Francisco Beiró 3268 · Villa del Parque, CABA',
    'accent', '#c51f24',
    'slot_minutes', 30,
    'contact_whatsapp', '5491166046476',
    'contact_email', 'miro@induliru.com',
    'services', jsonb_build_array(jsonb_build_object(
      'id', 'consulta-optica',
      'name', 'Consulta óptica',
      'price', 5000,
      'description', 'Evaluación y asesoramiento óptico personalizado.'
    ))
  )
)
on conflict (slug) do update
set name = excluded.name,
    public_profile = excluded.public_profile,
    status = 'active';

-- Horario de compatibilidad para instalaciones que aún leen business_hours.
insert into public.business_hours (business_id, weekday, start_time, end_time, slot_minutes, active)
select business.id, weekday, '09:00', '18:00', 30, true
from public.businesses business
cross join unnest(array[1, 2, 3, 4, 5]::smallint[]) as weekday
where business.slug = 'miro'
on conflict (business_id, weekday) do update
set start_time = excluded.start_time,
    end_time = excluded.end_time,
    slot_minutes = excluded.slot_minutes,
    active = excluded.active;

-- Horarios reales, incluyendo la pausa del mediodía.
delete from public.availability_rules
where business_id = (select id from public.businesses where slug = 'miro');

insert into public.availability_rules
  (business_id, title, start_date, start_time, end_time, frequency, weekdays, active)
select business.id, schedule.title, current_date, schedule.start_time, schedule.end_time,
       'weekly', schedule.weekdays, true
from public.businesses business
cross join (values
  ('Mañana lunes y martes'::text, '09:00'::time, '13:00'::time, array[1,2]::smallint[]),
  ('Tarde lunes y martes'::text, '16:00'::time, '19:30'::time, array[1,2]::smallint[]),
  ('Miércoles'::text, '16:00'::time, '19:30'::time, array[3]::smallint[]),
  ('Mañana jueves y viernes'::text, '09:00'::time, '13:00'::time, array[4,5]::smallint[]),
  ('Tarde jueves y viernes'::text, '16:00'::time, '19:30'::time, array[4,5]::smallint[]),
  ('Sábado'::text, '10:00'::time, '13:30'::time, array[6]::smallint[])
) as schedule(title, start_time, end_time, weekdays)
where business.slug = 'miro';

-- Cuando exista la cuenta, la deja asociada como administradora del negocio.
insert into public.business_members (business_id, user_id, role)
select business.id, account.id, 'owner'
from public.businesses business
join auth.users account on lower(account.email) = 'miro@induliru.com'
where business.slug = 'miro'
on conflict (business_id, user_id) do update set role = 'owner';
