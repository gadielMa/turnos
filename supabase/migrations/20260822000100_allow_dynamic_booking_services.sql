-- Los servicios son configurables por negocio desde public_profile;
-- la antigua lista fija era exclusiva de masajes y bloqueaba reservas de barbería.
alter table public.bookings drop constraint if exists bookings_service_check;
alter table public.bookings
  add constraint bookings_service_check
  check (char_length(trim(service)) between 1 and 120);
