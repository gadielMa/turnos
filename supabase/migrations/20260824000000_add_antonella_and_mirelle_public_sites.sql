-- Mirelle's page is intentionally created without services or availability.
-- She can configure both from her administration panel before opening bookings.
insert into public.businesses (name, slug, public_profile)
values (
  'Mirelle',
  'mirelle',
  jsonb_build_object(
    'locale', 'pt-BR',
    'category', 'Psicóloga',
    'headline', 'Um espaço seguro para se escutar.',
    'description', 'Psicoterapia com escuta atenta, acolhimento e respeito ao seu tempo.',
    'location', 'Atendimento online e presencial',
    'accent', '#5d4b7b',
    'slot_minutes', 60,
    'services', jsonb_build_array()
  )
)
on conflict (slug) do update
set name = excluded.name,
    public_profile = public.businesses.public_profile || excluded.public_profile;
