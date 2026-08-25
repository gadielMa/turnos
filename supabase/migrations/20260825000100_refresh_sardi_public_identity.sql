-- Public profile data used by Sardi Estudio's dedicated booking page.
update public.businesses
set public_profile = coalesce(public_profile, '{}'::jsonb) || jsonb_build_object(
  'category', 'Abogado · Asesor inmobiliario',
  'headline', 'Respaldo legal para decisiones importantes.',
  'description', 'Sardi Estudio brinda asesoramiento jurídico, inmobiliario y notarial con atención personalizada, claridad y compromiso profesional.',
  'location', 'Llavalol 2732, CABA · Gestiones judiciales en Buenos Aires y Mendoza',
  'contact_whatsapp', '5491156166994',
  'contact_email', 'sea.abogado@gmail.com',
  'instagram', 'https://www.instagram.com/sardi.estudiojuridico/',
  'accent', '#173e70'
)
where slug = 'sardi';
