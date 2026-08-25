-- Correct the public address shown on Sardi Estudio's booking page.
update businesses
set public_profile = coalesce(public_profile, '{}'::jsonb) || jsonb_build_object(
  'location', 'Chivilcoy 1441, CABA · Gestiones judiciales en Buenos Aires y Mendoza'
)
where slug = 'sardi';
