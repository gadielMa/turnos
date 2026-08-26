-- Datos exclusivamente públicos usados por la página /turnos/:slug.
alter table public.businesses
  add column if not exists public_profile jsonb not null default '{}'::jsonb;

-- Primer negocio de barbería publicado en Induliru.
insert into public.businesses (name, slug, public_profile)
values (
  'BrianBarber',
  'brian',
  jsonb_build_object(
    'category', 'Barbería',
    'headline', 'Tu estilo, bien cuidado.',
    'description', 'Cortes y barba con atención personalizada para que salgas sintiéndote vos mismo.',
    'location', 'Consultá la ubicación al reservar',
    'accent', '#214b42',
    'slot_minutes', 30,
    'services', jsonb_build_array(
      jsonb_build_object('id', 'corte', 'name', 'Corte', 'price', 15000, 'description', 'Corte personalizado de 30 minutos.'),
      jsonb_build_object('id', 'corte-y-barba', 'name', 'Corte y barba', 'price', 18000, 'description', 'Corte y arreglo de barba en una sesión.'),
      jsonb_build_object('id', 'barba', 'name', 'Barba', 'price', 8000, 'description', 'Perfilado y arreglo de barba.')
    )
  )
)
on conflict (slug) do update
set name = excluded.name,
    public_profile = excluded.public_profile;

insert into public.business_hours (business_id, weekday, start_time, end_time, slot_minutes, active)
select business.id, weekday, '14:00', '19:00', 30, true
from public.businesses business
cross join unnest(array[1, 2, 3, 4, 5]::smallint[]) as weekday
where business.slug = 'brian'
on conflict (business_id, weekday) do update
set start_time = excluded.start_time,
    end_time = excluded.end_time,
    slot_minutes = excluded.slot_minutes,
    active = excluded.active;
