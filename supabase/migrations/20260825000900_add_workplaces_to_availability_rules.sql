-- Workplaces are configurable per business. Existing schedules begin at the
-- office, using blue so current professionals preserve a clear default.
alter table public.availability_rules
  add column if not exists workplace_id text not null default 'office';

update public.availability_rules
set workplace_id = 'office'
where workplace_id is null or btrim(workplace_id) = '';

update public.businesses
set public_profile = coalesce(public_profile, '{}'::jsonb) || jsonb_build_object(
  'workplaces', jsonb_build_array(
    jsonb_build_object('id', 'office', 'name', 'Oficina', 'color', '#2563eb'),
    jsonb_build_object('id', 'virtual', 'name', 'Virtual', 'color', '#7c3aed')
  )
)
where not (coalesce(public_profile, '{}'::jsonb) ? 'workplaces');
