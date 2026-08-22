-- El calendario administrativo usa availability_rules, mientras que la
-- reserva pública mantiene business_hours como compatibilidad. Los negocios
-- creados antes del editor visual necesitan esta conversión inicial.
--
-- Solo se insertan reglas para negocios que todavía no tienen ninguna,
-- por lo que nunca se pisan horarios ajustados desde el panel.
insert into public.availability_rules
  (business_id, title, start_date, start_time, end_time, frequency, interval_count, weekdays, active)
select
  hours.business_id,
  'Disponible',
  current_date - (extract(isodow from current_date)::int - 1),
  hours.start_time,
  hours.end_time,
  'weekly',
  1,
  array[hours.weekday]::smallint[],
  hours.active
from public.business_hours as hours
where not exists (
  select 1
  from public.availability_rules as rules
  where rules.business_id = hours.business_id
)
on conflict do nothing;
