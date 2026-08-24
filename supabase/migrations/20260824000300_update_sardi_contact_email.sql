update public.businesses
set public_profile = coalesce(public_profile, '{}'::jsonb)
  || jsonb_build_object('contact_email', 'sea.abogado@gmail.com')
where slug = 'sardi';
