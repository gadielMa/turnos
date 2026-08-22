update public.businesses
set public_profile = public_profile || jsonb_build_object(
  'location', 'Atendido por Brian Melgar · Cuenca 2838 · WhatsApp: +54 9 11 3356-2753'
)
where slug = 'brian';
