update public.businesses
set name = 'Mirelle Santiago',
    public_profile = coalesce(public_profile, '{}'::jsonb) || jsonb_build_object(
      'category', 'Psicóloga clínica · CRP 05/74679',
      'headline', 'Um espaço para você se escutar com calma.',
      'description', 'Psicoterapia com acolhimento, ética e respeito ao seu tempo.',
      'location', 'Atendimento presencial e on-line · Rio de Janeiro',
      'contact_email', 'mirellesantiago.psi@gmail.com',
      'instagram', 'https://www.instagram.com/mirellesantiago.psi/',
      'contact_whatsapp_url', 'https://api.whatsapp.com/message/L3VCCOPOI7BLF1?autoload=1&app_absent=0&utm_source=ig'
    )
where slug = 'mirelle';
