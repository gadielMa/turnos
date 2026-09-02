-- La consulta de Óptica Miró se abona online antes de confirmar el turno.
update public.businesses
set public_profile = coalesce(public_profile, '{}'::jsonb) - 'booking_without_payment'
where slug = 'miro';
