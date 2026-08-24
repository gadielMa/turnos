update public.businesses
set public_profile = coalesce(public_profile, '{}'::jsonb)
  || jsonb_build_object('booking_without_payment', true)
where slug = 'mirelle';

alter table public.bookings
  drop constraint if exists bookings_payment_method_check;

alter table public.bookings
  add constraint bookings_payment_method_check
  check (payment_method in ('mercadopago', 'cash', 'no_payment'));
