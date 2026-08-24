insert into public.businesses (name, slug, public_profile)
values (
  'Sardi Estudio',
  'sardi',
  jsonb_build_object(
    'locale', 'es-AR',
    'category', 'Abogado · Asesor inmobiliario',
    'headline', 'Asesoramiento jurídico e inmobiliario con mirada estratégica.',
    'description', 'Sardi Estudio acompaña consultas y gestiones con atención personalizada, claridad y compromiso profesional.',
    'location', 'Gestiones judiciales en Buenos Aires y Mendoza',
    'accent', '#273a5f',
    'contact_whatsapp', '5491156166994',
    'instagram', 'https://www.instagram.com/sardi.estudiojuridico/',
    'slot_minutes', 60,
    'services', jsonb_build_array(),
    'practice_areas', jsonb_build_array(
      jsonb_build_object('id', 'sucesiones', 'name', 'Sucesiones', 'description', 'Orientación y acompañamiento en procesos sucesorios.'),
      jsonb_build_object('id', 'inmobiliario-notarial', 'name', 'Asesoramiento inmobiliario y notarial', 'description', 'Consultas vinculadas a operaciones, documentación y actos notariales.'),
      jsonb_build_object('id', 'derechos-reales', 'name', 'Derechos reales', 'description', 'Análisis y asesoramiento sobre derechos vinculados a bienes.'),
      jsonb_build_object('id', 'marcas', 'name', 'Registro de marcas', 'description', 'Acompañamiento para proteger y registrar marcas.'),
      jsonb_build_object('id', 'sociedades', 'name', 'Sociedades comerciales', 'description', 'Asesoramiento para la constitución y gestión societaria.'),
      jsonb_build_object('id', 'contratos', 'name', 'Contratos', 'description', 'Redacción, revisión y análisis de contratos.')
    )
  )
)
on conflict (slug) do update
set name = excluded.name,
    public_profile = public.businesses.public_profile || excluded.public_profile;
