-- La plataforma también recibe CPF brasileño (11 dígitos), además de DNI
-- argentino (7 u 8 dígitos), tanto al crear el turno como al crear el cliente.
alter table public.bookings drop constraint if exists bookings_dni_check;
alter table public.bookings add constraint bookings_dni_check
  check (dni ~ '^[0-9]{7,11}$');

alter table public.clients drop constraint if exists clients_dni_check;
alter table public.clients add constraint clients_dni_check
  check (dni ~ '^[0-9]{7,11}$');
