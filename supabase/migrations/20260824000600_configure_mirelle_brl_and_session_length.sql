-- Mirelle atende em sessões de 50 minutos e trabalha em reais.
-- O calendário público calcula os horários usando esta duração, que deve
-- coincidir com os blocos de disponibilidade criados no painel.
update public.businesses
set public_profile = coalesce(public_profile, '{}'::jsonb)
  || jsonb_build_object('currency', 'BRL', 'slot_minutes', 50)
where slug = 'mirelle';
